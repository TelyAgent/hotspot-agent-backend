import { Inject, Injectable } from '@nestjs/common';
import { CONTENT_REPOSITORY } from '../content/content.tokens';
import { ContentRepository } from '../content/content.repository';
import { PublicationMetricRecord, PublicationRecord } from '../content/content.types';

export type InsightsRange = '7d' | '30d' | '1y';

export interface InsightsResponse {
  range: InsightsRange;
  stats: {
    trackingPosts: number;
    wellPerformingRate: number;
    avgInteractionRate: number;
    totalLikes: number;
    totalReplies: number;
    totalReposts: number;
    totalQuotes?: number;
    totalViews?: number;
    trackingErrorPosts: number;
  };
  accounts: Array<{
    accountId: string;
    name: string;
    publishedPosts: number;
    avgViews?: number;
    avgLikes: number;
    avgReplies: number;
    avgReposts: number;
    wellPerformingRate: number;
  }>;
  trackingIssues: Array<{
    publicationRecordId: string;
    taskId: string;
    eventId: string;
    accountId: string;
    accountName: string;
    url: string;
    trackingStatus: string;
    lastTrackingError: string;
    lastTrackingErrorAt: string;
    trackingFailureCount: number;
  }>;
}

@Injectable()
export class InsightsService {
  constructor(@Inject(CONTENT_REPOSITORY) private readonly contentRepository: ContentRepository) {}

  async getInsights(range: string, now = new Date().toISOString()): Promise<InsightsResponse> {
    const normalizedRange = normalizeRange(range);
    const [publications, metrics, accounts] = await Promise.all([
      this.contentRepository.listPublicationRecords(),
      this.contentRepository.listPublicationMetrics(),
      this.contentRepository.listOperationAccounts(),
    ]);
    const accountById = new Map(accounts.map((account) => [account.id, account]));
    const rangeStart = new Date(new Date(now).getTime() - rangeToMs(normalizedRange)).getTime();
    const scopedPublications = publications.filter((publication) => new Date(publication.publishedAt).getTime() >= rangeStart);
    const latestMetricByPublicationId = latestMetrics(metrics);
    const currentMetrics = scopedPublications
      .map((publication) => latestMetricByPublicationId.get(publication.id))
      .filter((metric): metric is PublicationMetricRecord => Boolean(metric));

    const totalLikes = sum(currentMetrics, (metric) => metric.likes);
    const totalReplies = sum(currentMetrics, (metric) => metric.replies);
    const totalReposts = sum(currentMetrics, (metric) => metric.reposts);
    const totalQuotesValue = sumDefined(currentMetrics, (metric) => metric.quotes);
    const totalViewsValue = sumDefined(currentMetrics, (metric) => metric.views);
    const interactionMetrics = currentMetrics.filter((metric) => metric.views !== undefined && metric.views > 0);
    const totalInteractionForViewed = sum(interactionMetrics, (metric) =>
      metric.likes + metric.replies + metric.reposts + (metric.quotes ?? 0),
    );
    const totalViewsForInteraction = sum(interactionMetrics, (metric) => metric.views ?? 0);
    const trackingIssues = scopedPublications
      .filter((publication) => publication.trackingStatus === 'tracking_error')
      .map((publication) => ({
        publicationRecordId: publication.id,
        taskId: publication.taskId,
        eventId: publication.eventId,
        accountId: publication.accountId,
        accountName: accountById.get(publication.accountId)?.name ?? publication.accountId,
        url: publication.url,
        trackingStatus: publication.trackingStatus,
        lastTrackingError: publication.lastTrackingError ?? '追踪接口异常',
        lastTrackingErrorAt: publication.lastTrackingErrorAt ?? '',
        trackingFailureCount: publication.trackingFailureCount,
      }));

    return {
      range: normalizedRange,
      stats: {
        trackingPosts: scopedPublications.filter((publication) =>
          publication.trackingStatus === 'tracking' || publication.trackingStatus === 'tracking_error',
        ).length,
        wellPerformingRate: rate(scopedPublications.filter((publication) => publication.wellPerforming).length, scopedPublications.length),
        avgInteractionRate: totalViewsForInteraction ? round(totalInteractionForViewed / totalViewsForInteraction) : 0,
        totalLikes,
        totalReplies,
        totalReposts,
        totalQuotes: totalQuotesValue.count ? totalQuotesValue.total : undefined,
        totalViews: totalViewsValue.count ? totalViewsValue.total : undefined,
        trackingErrorPosts: trackingIssues.length,
      },
      accounts: accountRows(scopedPublications, latestMetricByPublicationId, accountById),
      trackingIssues,
    };
  }
}

function normalizeRange(range: string): InsightsRange {
  return range === '30d' || range === '1y' ? range : '7d';
}

function rangeToMs(range: InsightsRange) {
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

function accountRows(
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
      const views = metrics.filter((metric) => metric.views !== undefined).map((metric) => metric.views ?? 0);
      return {
        accountId,
        name: accountById.get(accountId)?.name ?? accountId,
        publishedPosts: accountPublications.length,
        avgViews: views.length ? Math.round(sumNumbers(views) / views.length) : undefined,
        avgLikes: average(metrics, (metric) => metric.likes),
        avgReplies: average(metrics, (metric) => metric.replies),
        avgReposts: average(metrics, (metric) => metric.reposts),
        wellPerformingRate: rate(
          accountPublications.filter((publication) => publication.wellPerforming).length,
          accountPublications.length,
        ),
      };
    })
    .sort((a, b) => b.publishedPosts - a.publishedPosts || a.accountId.localeCompare(b.accountId));
}

function sum<T>(items: T[], pick: (item: T) => number) {
  return items.reduce((total, item) => total + pick(item), 0);
}

function sumDefined<T>(items: T[], pick: (item: T) => number | undefined) {
  return items.reduce(
    (result, item) => {
      const value = pick(item);
      return value === undefined ? result : { total: result.total + value, count: result.count + 1 };
    },
    { total: 0, count: 0 },
  );
}

function sumNumbers(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function average<T>(items: T[], pick: (item: T) => number) {
  return items.length ? round(sum(items, pick) / items.length) : 0;
}

function rate(numerator: number, denominator: number) {
  return denominator ? round(numerator / denominator) : 0;
}

function round(value: number) {
  return Math.round(value * 10000) / 10000;
}
