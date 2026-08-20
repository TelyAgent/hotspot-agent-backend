import {
  DEFAULT_PUBLICATION_TRACKING_RULE,
  extendedTrackingEndsAt,
  isPublicationMetricDue,
  isPublicationTrackingExpired,
  isWellPerformingMetric,
  resolveTrackingIntervalMs,
} from '../../src/content/publication-tracking-rule';
import { PublicationMetricRecord, PublicationRecord } from '../../src/content/content.types';

describe('publication tracking rule', () => {
  it('uses a 2 hour interval during the first 24 hours and a 5 hour interval afterwards', () => {
    expect(resolveTrackingIntervalMs(publication({ publishedAt: '2026-08-20T00:00:00.000Z' }), '2026-08-20T23:59:00.000Z')).toBe(
      2 * 60 * 60 * 1000,
    );
    expect(resolveTrackingIntervalMs(publication({ publishedAt: '2026-08-20T00:00:00.000Z' }), '2026-08-21T00:00:00.000Z')).toBe(
      5 * 60 * 60 * 1000,
    );
  });

  it('treats metrics as due based on the current tracking interval', () => {
    const pub = publication({ publishedAt: '2026-08-20T00:00:00.000Z' });

    expect(isPublicationMetricDue(pub, undefined, '2026-08-20T00:05:00.000Z')).toBe(true);
    expect(isPublicationMetricDue(pub, metric('2026-08-20T01:00:00.000Z'), '2026-08-20T02:59:00.000Z')).toBe(false);
    expect(isPublicationMetricDue(pub, metric('2026-08-20T01:00:00.000Z'), '2026-08-20T03:00:00.000Z')).toBe(true);
    expect(isPublicationMetricDue(pub, metric('2026-08-21T00:00:00.000Z'), '2026-08-21T04:59:00.000Z')).toBe(false);
    expect(isPublicationMetricDue(pub, metric('2026-08-21T00:00:00.000Z'), '2026-08-21T05:00:00.000Z')).toBe(true);
  });

  it('marks a publication as well performing only when views cross the threshold within 48 hours', () => {
    expect(
      isWellPerformingMetric(
        publication({ publishedAt: '2026-08-20T00:00:00.000Z', wellPerforming: false }),
        { capturedAt: '2026-08-21T23:59:00.000Z', likes: 1, replies: 1, reposts: 1, views: 1000 },
      ),
    ).toBe(true);
    expect(
      isWellPerformingMetric(
        publication({ publishedAt: '2026-08-20T00:00:00.000Z', wellPerforming: false }),
        { capturedAt: '2026-08-22T00:01:00.000Z', likes: 1, replies: 1, reposts: 1, views: 1000 },
      ),
    ).toBe(false);
    expect(
      isWellPerformingMetric(
        publication({ publishedAt: '2026-08-20T00:00:00.000Z', wellPerforming: false }),
        { capturedAt: '2026-08-21T23:59:00.000Z', likes: 1, replies: 1, reposts: 1, views: 999 },
      ),
    ).toBe(false);
  });

  it('calculates expiration and extended tracking windows from the publication time', () => {
    const pub = publication({
      publishedAt: '2026-08-20T00:00:00.000Z',
      trackingEndsAt: '2026-08-27T00:00:00.000Z',
    });

    expect(isPublicationTrackingExpired(pub, '2026-08-26T23:59:59.000Z')).toBe(false);
    expect(isPublicationTrackingExpired(pub, '2026-08-27T00:00:00.000Z')).toBe(true);
    expect(extendedTrackingEndsAt(pub)).toBe('2026-09-03T00:00:00.000Z');
    expect(DEFAULT_PUBLICATION_TRACKING_RULE.version).toBe('publication-tracking-v1');
  });
});

function publication(patch: Partial<PublicationRecord> = {}): PublicationRecord {
  return {
    id: 'publication_1',
    taskId: 'task_1',
    candidateId: 'candidate_1',
    eventId: 'event_1',
    accountId: 'account_1',
    url: 'https://x.com/demo/status/1234567890',
    status: 'published',
    publishedAt: '2026-08-20T00:00:00.000Z',
    trackingStatus: 'tracking',
    trackingEndsAt: '2026-08-27T00:00:00.000Z',
    wellPerforming: false,
    trackingRuleVersion: 'publication-tracking-v1',
    trackingFailureCount: 0,
    createdAt: '2026-08-20T00:00:00.000Z',
    ...patch,
  };
}

function metric(capturedAt: string): PublicationMetricRecord {
  return {
    id: `metric_${capturedAt}`,
    publicationRecordId: 'publication_1',
    capturedAt,
    likes: 1,
    replies: 1,
    reposts: 1,
    createdAt: capturedAt,
  };
}
