import { ContentService } from '../../src/content/content.service';
import { ContentTrackingSchedulerService } from '../../src/content/content-tracking-scheduler.service';
import { InMemoryContentRepository } from '../../src/content/in-memory-content.repository';
import { PublicationMetricsCollector } from '../../src/content/publication-metrics.collector';

describe('ContentTrackingSchedulerService', () => {
  it('collects due publication metrics, skips recent snapshots, and extends well performing posts', async () => {
    const repository = new InMemoryContentRepository();
    repository.accountResponseTasks.push(task('task_due'), task('task_recent'), task('task_normal_recent'));
    repository.publicationRecords.push(
      publication('publication_due', 'task_due', '2026-08-27T01:30:00.000Z'),
      publication('publication_recent', 'task_recent', '2026-08-27T01:30:00.000Z'),
      publication('publication_normal_recent', 'task_normal_recent', '2026-08-27T01:30:00.000Z', {
        publishedAt: '2026-08-18T00:00:00.000Z',
      }),
    );
    repository.publicationMetrics.push({
      id: 'metric_recent',
      publicationRecordId: 'publication_recent',
      capturedAt: '2026-08-20T02:00:00.000Z',
      likes: 1,
      replies: 0,
      reposts: 0,
      createdAt: '2026-08-20T02:00:00.000Z',
    });
    repository.publicationMetrics.push({
      id: 'metric_normal_recent',
      publicationRecordId: 'publication_normal_recent',
      capturedAt: '2026-08-20T00:00:00.000Z',
      likes: 1,
      replies: 0,
      reposts: 0,
      createdAt: '2026-08-20T00:00:00.000Z',
    });
    const collector: PublicationMetricsCollector = {
      collect: jest.fn().mockResolvedValue({
        capturedAt: '2026-08-20T03:30:00.000Z',
        likes: 12,
        replies: 3,
        reposts: 4,
        quotes: 1,
        views: 1200,
      }),
    };
    const service = new ContentService(repository);
    const scheduler = new ContentTrackingSchedulerService(repository, service, collector);

    await expect(scheduler.collectDuePublications('2026-08-20T03:30:00.000Z')).resolves.toEqual({
      collected: 1,
      completed: 0,
    });

    expect(collector.collect).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'publication_due' }),
      '2026-08-20T03:30:00.000Z',
    );
    expect(repository.publicationMetrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          publicationRecordId: 'publication_due',
          likes: 12,
          replies: 3,
          reposts: 4,
        }),
      ]),
    );
    expect(repository.accountResponseTasks.find((item) => item.id === 'task_due')).toEqual(
      expect.objectContaining({ status: 'tracking' }),
    );
    expect(repository.publicationRecords.find((item) => item.id === 'publication_due')).toEqual(
      expect.objectContaining({
        wellPerforming: true,
        trackingEndsAt: '2026-09-03T01:30:00.000Z',
      }),
    );
    expect(collector.collect).not.toHaveBeenCalledWith(
      expect.objectContaining({ id: 'publication_normal_recent' }),
      expect.any(String),
    );
  });

  it('records tracking errors without changing publication status', async () => {
    const repository = new InMemoryContentRepository();
    repository.accountResponseTasks.push(task('task_failed'));
    repository.publicationRecords.push(publication('publication_failed', 'task_failed', '2026-08-27T01:30:00.000Z'));
    const collector: PublicationMetricsCollector = {
      collect: jest.fn().mockRejectedValue(new Error('X API rate limited')),
    };
    const service = new ContentService(repository);
    const scheduler = new ContentTrackingSchedulerService(repository, service, collector);

    await expect(scheduler.collectDuePublications('2026-08-20T03:30:00.000Z')).resolves.toEqual({
      collected: 0,
      completed: 0,
    });

    expect(repository.publicationRecords[0]).toEqual(
      expect.objectContaining({
        status: 'published',
        trackingStatus: 'tracking_error',
        lastTrackingError: 'X API rate limited',
        lastTrackingErrorAt: '2026-08-20T03:30:00.000Z',
        trackingFailureCount: 1,
      }),
    );
    expect(repository.accountResponseTasks[0]).toEqual(expect.objectContaining({ status: 'published' }));
  });

  it('completes expired tracking windows without collecting metrics', async () => {
    const repository = new InMemoryContentRepository();
    repository.accountResponseTasks.push(task('task_expired'));
    repository.publicationRecords.push(publication('publication_expired', 'task_expired', '2026-08-20T03:30:00.000Z'));
    const collector: PublicationMetricsCollector = {
      collect: jest.fn(),
    };
    const service = new ContentService(repository);
    const scheduler = new ContentTrackingSchedulerService(repository, service, collector);

    await expect(scheduler.collectDuePublications('2026-08-20T03:30:00.000Z')).resolves.toEqual({
      collected: 0,
      completed: 1,
    });

    expect(collector.collect).not.toHaveBeenCalled();
    expect(repository.publicationRecords[0]).toEqual(expect.objectContaining({ trackingStatus: 'completed' }));
    expect(repository.accountResponseTasks[0]).toEqual(expect.objectContaining({ status: 'completed' }));
  });
});

function task(id: string) {
  return {
    id,
    eventId: `event_${id}`,
    accountId: `account_${id}`,
    status: 'published' as const,
    priority: 'normal' as const,
    skill: 'respond-with-breaking-brief',
    skillVersion: '1.0.0',
    assignmentReason: 'Base pipeline.',
    riskStatus: 'low',
    createdAt: '2026-08-20T01:00:00.000Z',
    updatedAt: '2026-08-20T01:30:00.000Z',
  };
}

function publication(
  id: string,
  taskId: string,
  trackingEndsAt: string,
  patch: Partial<ReturnType<typeof basePublication>> = {},
) {
  return {
    ...basePublication(id, taskId, trackingEndsAt),
    ...patch,
  };
}

function basePublication(id: string, taskId: string, trackingEndsAt: string) {
  return {
    id,
    taskId,
    candidateId: `candidate_${taskId}`,
    eventId: `event_${taskId}`,
    accountId: `account_${taskId}`,
    url: `https://x.com/account_${taskId}/status/1234567890`,
    status: 'published',
    publishedAt: '2026-08-20T01:30:00.000Z',
    trackingStatus: 'tracking',
    trackingEndsAt,
    wellPerforming: false,
    trackingRuleVersion: 'publication-tracking-v1',
    trackingFailureCount: 0,
    createdAt: '2026-08-20T01:30:00.000Z',
  };
}
