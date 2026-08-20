import { Inject, Injectable } from '@nestjs/common';
import { CONTENT_REPOSITORY } from '../content/content.tokens';
import { ContentRepository } from '../content/content.repository';
import { ContentTaskRecord, PublicationMetricRecord, PublicationRecord } from '../content/content.types';

export type OverviewRange = '7d' | '30d' | '1y';

export interface OperationOverviewResponse {
  range: OverviewRange;
  stats: {
    wellPerformingRate: number;
    wellPerformingCount: number;
    publishedCount: number;
    totalViews?: number;
    totalInteractions: number;
    publishedAccounts: number;
    avgFirstPublishLatencyMs?: number;
  };
  trend: Array<{
    date: string;
    views?: number;
    interactions: number;
    publishedCount: number;
  }>;
  accountPerformance: Array<{
    accountId: string;
    name: string;
    wellPerformingRate: number;
    avgViews?: number;
    publishedCount: number;
    score: number;
  }>;
  manualItems: Array<{
    severity: 'normal' | 'warning' | 'critical';
    title: string;
    description: string;
    taskId?: string;
    eventId?: string;
    actionPage: 'tasks' | 'events' | 'insights';
  }>;
  anomalies: Array<{
    severity: 'warning' | 'critical';
    type: string;
    count: number;
    description: string;
    actionPage: 'tasks' | 'insights';
  }>;
  taskGroups: Array<{
    eventId: string;
    eventTitle: string;
    taskCount: number;
    completedCount: number;
    progressPercent: number;
    statusLabel: string;
  }>;
}

@Injectable()
export class OverviewService {
  constructor(@Inject(CONTENT_REPOSITORY) private readonly contentRepository: ContentRepository) {}

  async getOverview(range: string, now = new Date().toISOString()): Promise<OperationOverviewResponse> {
    const normalizedRange = normalizeRange(range);
    const [publications, metrics, accounts, tasks] = await Promise.all([
      this.contentRepository.listPublicationRecords(),
      this.contentRepository.listPublicationMetrics(),
      this.contentRepository.listOperationAccounts(),
      this.contentRepository.listContentTasks(),
    ]);
    const rangeStart = new Date(new Date(now).getTime() - rangeToMs(normalizedRange)).getTime();
    const scopedPublications = publications.filter((publication) => {
      return publication.status === 'published' && new Date(publication.publishedAt).getTime() >= rangeStart;
    });
    const latestMetricByPublicationId = latestMetrics(metrics);
    const accountById = new Map(accounts.map((account) => [account.id, account]));
    const eventTitleById = await this.eventTitles(tasks);

    return {
      range: normalizedRange,
      stats: buildStats(scopedPublications, latestMetricByPublicationId),
      trend: buildTrend(normalizedRange, now, scopedPublications, latestMetricByPublicationId),
      accountPerformance: buildAccountPerformance(scopedPublications, latestMetricByPublicationId, accountById),
      manualItems: buildManualItems(tasks, eventTitleById),
      anomalies: buildAnomalies(tasks, publications),
      taskGroups: buildTaskGroups(tasks, eventTitleById),
    };
  }

  private async eventTitles(tasks: ContentTaskRecord[]) {
    const eventIds = Array.from(new Set(tasks.map((task) => task.eventId)));
    const pairs = await Promise.all(
      eventIds.map(async (eventId) => {
        const timing = await this.contentRepository.findEventTimingById(eventId);
        return [eventId, timing?.title ?? eventId] as const;
      }),
    );
    return new Map(pairs);
  }
}

function buildStats(
  publications: PublicationRecord[],
  latestMetricByPublicationId: Map<string, PublicationMetricRecord>,
) {
  const latestMetricsForPublications = publications
    .map((publication) => latestMetricByPublicationId.get(publication.id))
    .filter((metric): metric is PublicationMetricRecord => Boolean(metric));
  const views = latestMetricsForPublications
    .map((metric) => metric.views)
    .filter((value): value is number => value !== undefined);
  const latencies = publications
    .map((publication) => publication.firstPublishLatencyMs)
    .filter((value): value is number => value !== undefined);
  const wellPerformingCount = publications.filter((publication) => publication.wellPerforming).length;
  return {
    wellPerformingRate: rate(wellPerformingCount, publications.length),
    wellPerformingCount,
    publishedCount: publications.length,
    totalViews: views.length ? sumNumbers(views) : undefined,
    totalInteractions: sum(latestMetricsForPublications, metricInteraction),
    publishedAccounts: new Set(publications.map((publication) => publication.accountId)).size,
    avgFirstPublishLatencyMs: latencies.length ? Math.round(sumNumbers(latencies) / latencies.length) : undefined,
  };
}

function buildTrend(
  range: OverviewRange,
  now: string,
  publications: PublicationRecord[],
  latestMetricByPublicationId: Map<string, PublicationMetricRecord>,
) {
  const dates = recentDates(range, now);
  return dates.map((date) => {
    const dayPublications = publications.filter((publication) => publication.publishedAt.slice(0, 10) === date);
    const dayMetrics = dayPublications
      .map((publication) => latestMetricByPublicationId.get(publication.id))
      .filter((metric): metric is PublicationMetricRecord => Boolean(metric));
    const views = dayMetrics.map((metric) => metric.views).filter((value): value is number => value !== undefined);
    return {
      date,
      views: views.length ? sumNumbers(views) : undefined,
      interactions: sum(dayMetrics, metricInteraction),
      publishedCount: dayPublications.length,
    };
  });
}

function buildAccountPerformance(
  publications: PublicationRecord[],
  latestMetricByPublicationId: Map<string, PublicationMetricRecord>,
  accountById: Map<string, { name: string }>,
) {
  const groups = new Map<string, PublicationRecord[]>();
  for (const publication of publications) {
    groups.set(publication.accountId, [...(groups.get(publication.accountId) ?? []), publication]);
  }
  return Array.from(groups.entries())
    .map(([accountId, accountPublications]) => {
      const metrics = accountPublications
        .map((publication) => latestMetricByPublicationId.get(publication.id))
        .filter((metric): metric is PublicationMetricRecord => Boolean(metric));
      const views = metrics.map((metric) => metric.views).filter((value): value is number => value !== undefined);
      const avgViews = views.length ? Math.round(sumNumbers(views) / views.length) : undefined;
      const wellPerformingRate = rate(
        accountPublications.filter((publication) => publication.wellPerforming).length,
        accountPublications.length,
      );
      return {
        accountId,
        name: accountById.get(accountId)?.name ?? accountId,
        wellPerformingRate,
        avgViews,
        publishedCount: accountPublications.length,
        score: performanceScore(wellPerformingRate, avgViews),
      };
    })
    .sort((a, b) => b.score - a.score || a.accountId.localeCompare(b.accountId))
    .slice(0, 5);
}

function buildManualItems(tasks: ContentTaskRecord[], eventTitleById: Map<string, string>) {
  return tasks
    .map((task) => manualItem(task, eventTitleById.get(task.eventId) ?? task.eventId))
    .filter((item): item is NonNullable<ReturnType<typeof manualItem>> => Boolean(item))
    .sort((a, b) => severityRank(b.severity) - severityRank(a.severity))
    .slice(0, 5);
}

function manualItem(task: ContentTaskRecord, eventTitle: string) {
  if (task.status === 'generation_failed') {
    return {
      severity: 'critical' as const,
      title: eventTitle,
      description: '候选生成失败',
      taskId: task.id,
      eventId: task.eventId,
      actionPage: 'tasks' as const,
    };
  }
  if (task.status === 'precheck_blocked') {
    return {
      severity: 'critical' as const,
      title: eventTitle,
      description: '风险预检阻断',
      taskId: task.id,
      eventId: task.eventId,
      actionPage: 'tasks' as const,
    };
  }
  if (task.status === 'ready_for_publish') {
    return {
      severity: 'warning' as const,
      title: eventTitle,
      description: '候选待运营发布',
      taskId: task.id,
      eventId: task.eventId,
      actionPage: 'tasks' as const,
    };
  }
  if (task.status === 'ready_for_generation') {
    return {
      severity: 'normal' as const,
      title: eventTitle,
      description: '待生成候选',
      taskId: task.id,
      eventId: task.eventId,
      actionPage: 'tasks' as const,
    };
  }
  return undefined;
}

function buildAnomalies(tasks: ContentTaskRecord[], publications: PublicationRecord[]) {
  const anomalies = [
    {
      severity: 'critical' as const,
      type: '内容生成异常',
      count: tasks.filter((task) => task.status === 'generation_failed').length,
      description: '候选生成失败，需要重新运行或人工介入',
      actionPage: 'tasks' as const,
    },
    {
      severity: 'critical' as const,
      type: '风险预检阻断',
      count: tasks.filter((task) => task.status === 'precheck_blocked').length,
      description: '候选内容未通过风险预检',
      actionPage: 'tasks' as const,
    },
    {
      severity: 'warning' as const,
      type: '数据追踪异常',
      count: publications.filter((publication) => publication.trackingStatus === 'tracking_error').length,
      description: '发布完成，不影响发布状态',
      actionPage: 'insights' as const,
    },
  ];
  return anomalies.filter((anomaly) => anomaly.count > 0);
}

function buildTaskGroups(tasks: ContentTaskRecord[], eventTitleById: Map<string, string>) {
  const groups = new Map<string, ContentTaskRecord[]>();
  for (const task of tasks) {
    groups.set(task.eventId, [...(groups.get(task.eventId) ?? []), task]);
  }
  return Array.from(groups.entries())
    .map(([eventId, eventTasks]) => {
      const completedCount = eventTasks.filter((task) => isCompletedTaskStatus(task.status)).length;
      return {
        eventId,
        eventTitle: eventTitleById.get(eventId) ?? eventId,
        taskCount: eventTasks.length,
        completedCount,
        progressPercent: Math.round(rate(completedCount, eventTasks.length) * 100),
        statusLabel: `${completedCount}/${eventTasks.length}完成`,
        updatedAt: Math.max(...eventTasks.map((task) => new Date(task.updatedAt).getTime())),
      };
    })
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 5)
    .map(({ updatedAt: _updatedAt, ...group }) => group);
}

function normalizeRange(range: string): OverviewRange {
  return range === '30d' || range === '1y' ? range : '7d';
}

function rangeToMs(range: OverviewRange) {
  if (range === '30d') return 30 * 24 * 60 * 60 * 1000;
  if (range === '1y') return 365 * 24 * 60 * 60 * 1000;
  return 7 * 24 * 60 * 60 * 1000;
}

function latestMetrics(metrics: PublicationMetricRecord[]) {
  const latest = new Map<string, PublicationMetricRecord>();
  for (const metric of metrics) {
    const current = latest.get(metric.publicationRecordId);
    if (!current || new Date(metric.capturedAt).getTime() > new Date(current.capturedAt).getTime()) {
      latest.set(metric.publicationRecordId, metric);
    }
  }
  return latest;
}

function recentDates(range: OverviewRange, now: string) {
  const days = range === '1y' ? 365 : range === '30d' ? 30 : 7;
  const end = new Date(`${now.slice(0, 10)}T00:00:00.000Z`).getTime();
  return Array.from({ length: days }, (_, index) => {
    const timestamp = end - (days - index - 1) * 24 * 60 * 60 * 1000;
    return new Date(timestamp).toISOString().slice(0, 10);
  });
}

function metricInteraction(metric: PublicationMetricRecord) {
  return metric.likes + metric.replies + metric.reposts + (metric.quotes ?? 0);
}

function performanceScore(wellPerformingRate: number, avgViews?: number) {
  return Math.min(100, Math.round(wellPerformingRate * 70 + Math.log10((avgViews ?? 0) + 1) * 10));
}

function isCompletedTaskStatus(status: ContentTaskRecord['status']) {
  return status === 'published' || status === 'tracking' || status === 'completed' || status === 'abandoned';
}

function severityRank(severity: 'normal' | 'warning' | 'critical') {
  if (severity === 'critical') return 3;
  if (severity === 'warning') return 2;
  return 1;
}

function sum<T>(items: T[], pick: (item: T) => number) {
  return items.reduce((total, item) => total + pick(item), 0);
}

function sumNumbers(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function rate(numerator: number, denominator: number) {
  return denominator ? Math.round((numerator / denominator) * 10000) / 10000 : 0;
}
