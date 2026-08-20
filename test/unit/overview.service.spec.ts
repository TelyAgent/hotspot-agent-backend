import { InMemoryContentRepository } from '../../src/content/in-memory-content.repository';
import { OverviewService } from '../../src/overview/overview.service';

describe('OverviewService', () => {
  it('aggregates real operation overview data for the selected range', async () => {
    const repository = new InMemoryContentRepository();
    repository.operationAccounts.push(
      {
        id: 'account_flash',
        key: 'flash',
        name: '快讯号',
        enabled: true,
        fields: {},
      },
      {
        id: 'account_product',
        key: 'product',
        name: '产品号',
        enabled: true,
        fields: {},
      },
    );
    repository.eventTimings.push(
      {
        id: 'event_alpha',
        title: 'OpenAI 发布新模型',
        formedAt: '2026-08-20T00:00:00.000Z',
      },
      {
        id: 'event_beta',
        title: '美国 CPI 公布',
        formedAt: '2026-08-19T00:00:00.000Z',
      },
    );
    repository.contentTasks.push(
      task('task_alpha_flash', 'event_alpha', 'account_flash', 'tracking', '2026-08-20T03:00:00.000Z'),
      task('task_alpha_product', 'event_alpha', 'account_product', 'ready_for_publish', '2026-08-20T02:00:00.000Z'),
      task('task_beta_flash', 'event_beta', 'account_flash', 'generation_failed', '2026-08-20T01:00:00.000Z'),
      task('task_beta_product', 'event_beta', 'account_product', 'precheck_blocked', '2026-08-20T00:30:00.000Z'),
    );
    repository.publicationRecords.push(
      publication('publication_alpha', 'task_alpha_flash', 'event_alpha', 'account_flash', {
        wellPerforming: true,
        firstPublishLatencyMs: 30 * 60 * 1000,
      }),
      publication('publication_beta', 'task_beta_flash', 'event_beta', 'account_flash', {
        trackingStatus: 'tracking_error',
        lastTrackingError: '目标帖子未找到',
        lastTrackingErrorAt: '2026-08-20T02:00:00.000Z',
        trackingFailureCount: 2,
      }),
    );
    repository.publicationMetrics.push(
      metric('metric_alpha_old', 'publication_alpha', '2026-08-20T01:00:00.000Z', {
        likes: 1,
        replies: 1,
        reposts: 1,
        views: 100,
      }),
      metric('metric_alpha_latest', 'publication_alpha', '2026-08-20T03:00:00.000Z', {
        likes: 10,
        replies: 5,
        reposts: 5,
        quotes: 2,
        views: 1000,
      }),
      metric('metric_beta_latest', 'publication_beta', '2026-08-20T03:00:00.000Z', {
        likes: 2,
        replies: 1,
        reposts: 1,
      }),
    );
    const service = new OverviewService(repository);

    const result = await service.getOverview('7d', '2026-08-20T12:00:00.000Z');

    expect(result.stats).toEqual({
      wellPerformingRate: 0.5,
      wellPerformingCount: 1,
      publishedCount: 2,
      totalViews: 1000,
      totalInteractions: 26,
      publishedAccounts: 1,
      avgFirstPublishLatencyMs: 30 * 60 * 1000,
    });
    expect(result.accountPerformance).toEqual([
      expect.objectContaining({
        accountId: 'account_flash',
        name: '快讯号',
        wellPerformingRate: 0.5,
        avgViews: 1000,
        publishedCount: 2,
      }),
    ]);
    expect(result.manualItems).toEqual([
      expect.objectContaining({
        severity: 'critical',
        title: '美国 CPI 公布',
        description: '候选生成失败',
        taskId: 'task_beta_flash',
        eventId: 'event_beta',
        actionPage: 'tasks',
      }),
      expect.objectContaining({
        severity: 'critical',
        description: '风险预检阻断',
      }),
      expect.objectContaining({
        severity: 'warning',
        title: 'OpenAI 发布新模型',
        description: '候选待运营发布',
      }),
    ]);
    expect(result.anomalies).toEqual([
      {
        severity: 'critical',
        type: '内容生成异常',
        count: 1,
        description: '候选生成失败，需要重新运行或人工介入',
        actionPage: 'tasks',
      },
      {
        severity: 'critical',
        type: '风险预检阻断',
        count: 1,
        description: '候选内容未通过风险预检',
        actionPage: 'tasks',
      },
      {
        severity: 'warning',
        type: '数据追踪异常',
        count: 1,
        description: '发布完成，不影响发布状态',
        actionPage: 'insights',
      },
    ]);
    expect(result.taskGroups).toEqual([
      {
        eventId: 'event_alpha',
        eventTitle: 'OpenAI 发布新模型',
        taskCount: 2,
        completedCount: 1,
        progressPercent: 50,
        statusLabel: '1/2完成',
      },
      {
        eventId: 'event_beta',
        eventTitle: '美国 CPI 公布',
        taskCount: 2,
        completedCount: 0,
        progressPercent: 0,
        statusLabel: '0/2完成',
      },
    ]);
    expect(result.trend).toHaveLength(7);
    expect(result.trend[result.trend.length - 1]).toEqual({
      date: '2026-08-20',
      views: 1000,
      interactions: 26,
      publishedCount: 2,
    });
  });
});

function task(id: string, eventId: string, accountId: string, status: string, updatedAt: string) {
  return {
    id,
    eventId,
    accountId,
    status: status as never,
    priority: 'normal' as const,
    skill: 'respond-with-breaking-brief',
    skillVersion: '1.0.0',
    assignmentReason: 'Base pipeline.',
    riskStatus: status === 'precheck_blocked' ? 'high' : 'low',
    createdAt: '2026-08-20T00:00:00.000Z',
    updatedAt,
  };
}

function publication(
  id: string,
  taskId: string,
  eventId: string,
  accountId: string,
  patch: Record<string, unknown> = {},
) {
  return {
    id,
    taskId,
    candidateId: `candidate_${id}`,
    eventId,
    accountId,
    url: `https://x.com/${accountId}/status/${id}`,
    status: 'published',
    publishedAt: '2026-08-20T02:00:00.000Z',
    trackingStatus: 'tracking',
    trackingEndsAt: '2026-08-27T02:00:00.000Z',
    wellPerforming: false,
    trackingRuleVersion: 'publication-tracking-v1',
    trackingFailureCount: 0,
    createdAt: '2026-08-20T02:00:00.000Z',
    ...patch,
  };
}

function metric(
  id: string,
  publicationRecordId: string,
  capturedAt: string,
  patch: Record<string, unknown> = {},
) {
  return {
    id,
    publicationRecordId,
    capturedAt,
    likes: 0,
    replies: 0,
    reposts: 0,
    createdAt: capturedAt,
    ...patch,
  };
}
