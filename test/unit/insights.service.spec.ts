import { InsightsService } from '../../src/insights/insights.service';
import { InMemoryContentRepository } from '../../src/content/in-memory-content.repository';
import { PublicationMetricRecord, PublicationRecord } from '../../src/content/content.types';

describe('InsightsService', () => {
  it('aggregates publication performance and tracking issues for the selected range', async () => {
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
    repository.publicationRecords.push(
      publication({
        id: 'publication_good',
        accountId: 'account_flash',
        publishedAt: '2026-08-19T00:00:00.000Z',
        wellPerforming: true,
      }),
      publication({
        id: 'publication_error',
        accountId: 'account_product',
        publishedAt: '2026-08-18T00:00:00.000Z',
        trackingStatus: 'tracking_error',
        lastTrackingError: '目标帖子未找到',
        lastTrackingErrorAt: '2026-08-20T02:00:00.000Z',
        trackingFailureCount: 2,
      }),
      publication({
        id: 'publication_old',
        accountId: 'account_flash',
        publishedAt: '2026-07-01T00:00:00.000Z',
      }),
    );
    repository.publicationMetrics.push(
      metric({
        id: 'metric_good_old',
        publicationRecordId: 'publication_good',
        capturedAt: '2026-08-19T01:00:00.000Z',
        likes: 1,
        replies: 1,
        reposts: 1,
        quotes: 1,
        views: 100,
      }),
      metric({
        id: 'metric_good_latest',
        publicationRecordId: 'publication_good',
        capturedAt: '2026-08-20T01:00:00.000Z',
        likes: 10,
        replies: 5,
        reposts: 5,
        quotes: 2,
        views: 1000,
      }),
      metric({
        id: 'metric_error_latest',
        publicationRecordId: 'publication_error',
        capturedAt: '2026-08-20T01:00:00.000Z',
        likes: 2,
        replies: 1,
        reposts: 1,
      }),
      metric({
        id: 'metric_old',
        publicationRecordId: 'publication_old',
        capturedAt: '2026-07-02T01:00:00.000Z',
        likes: 100,
        replies: 100,
        reposts: 100,
        views: 10000,
      }),
    );
    const service = new InsightsService(repository);

    await expect(service.getInsights('7d', '2026-08-20T12:00:00.000Z')).resolves.toEqual({
      range: '7d',
      stats: {
        trackingPosts: 2,
        wellPerformingRate: 0.5,
        avgInteractionRate: 0.022,
        totalLikes: 12,
        totalReplies: 6,
        totalReposts: 6,
        totalQuotes: 2,
        totalViews: 1000,
        trackingErrorPosts: 1,
      },
      accounts: [
        {
          accountId: 'account_flash',
          name: '快讯号',
          publishedPosts: 1,
          avgViews: 1000,
          avgLikes: 10,
          avgReplies: 5,
          avgReposts: 5,
          wellPerformingRate: 1,
        },
        {
          accountId: 'account_product',
          name: '产品号',
          publishedPosts: 1,
          avgViews: undefined,
          avgLikes: 2,
          avgReplies: 1,
          avgReposts: 1,
          wellPerformingRate: 0,
        },
      ],
      trackingIssues: [
        {
          publicationRecordId: 'publication_error',
          taskId: 'task_publication_error',
          eventId: 'event_publication_error',
          accountId: 'account_product',
          accountName: '产品号',
          url: 'https://x.com/demo/status/publication_error',
          trackingStatus: 'tracking_error',
          lastTrackingError: '目标帖子未找到',
          lastTrackingErrorAt: '2026-08-20T02:00:00.000Z',
          trackingFailureCount: 2,
        },
      ],
    });
  });
});

function publication(patch: Partial<PublicationRecord>): PublicationRecord {
  const id = patch.id ?? 'publication_1';
  return {
    id,
    taskId: `task_${id}`,
    candidateId: `candidate_${id}`,
    eventId: `event_${id}`,
    accountId: 'account_flash',
    url: `https://x.com/demo/status/${id}`,
    status: 'published',
    publishedAt: '2026-08-19T00:00:00.000Z',
    trackingStatus: 'tracking',
    trackingEndsAt: '2026-08-26T00:00:00.000Z',
    wellPerforming: false,
    trackingRuleVersion: 'publication-tracking-v1',
    trackingFailureCount: 0,
    createdAt: '2026-08-19T00:00:00.000Z',
    ...patch,
  };
}

function metric(patch: Partial<PublicationMetricRecord>): PublicationMetricRecord {
  return {
    id: patch.id ?? 'metric_1',
    publicationRecordId: patch.publicationRecordId ?? 'publication_1',
    capturedAt: patch.capturedAt ?? '2026-08-20T00:00:00.000Z',
    likes: patch.likes ?? 0,
    replies: patch.replies ?? 0,
    reposts: patch.reposts ?? 0,
    quotes: patch.quotes,
    views: patch.views,
    createdAt: patch.capturedAt ?? '2026-08-20T00:00:00.000Z',
  };
}
