import { InMemoryCollectionRepository } from '../../src/collection/in-memory-collection.repository';
import { XTrendContextBuilder } from '../../src/workflow/x-trend-context.builder';

describe('XTrendContextBuilder', () => {
  it('builds model context from latest snapshots, previous snapshots, and diffs without applying rules', async () => {
    const repository = new InMemoryCollectionRepository();
    const builder = new XTrendContextBuilder(repository);

    await repository.saveSourceSnapshot({
      id: 'snapshot_us_old',
      platform: 'x',
      platformSnapshotId: 'x_us_old',
      sourceType: 'trend',
      region: 'United States',
      collectedAt: '2026-08-18T00:00:00.000Z',
      fetchRunId: 'fetch_old',
      itemCount: 1,
    });
    await repository.saveSourceSnapshot({
      id: 'snapshot_us_new',
      platform: 'x',
      platformSnapshotId: 'x_us_new',
      sourceType: 'trend',
      region: 'United States',
      collectedAt: '2026-08-18T02:00:00.000Z',
      fetchRunId: 'fetch_new',
      itemCount: 1,
    });
    await repository.saveSourceSnapshotItems([
      {
        id: 'item_us_old_ai',
        sourceSnapshotId: 'snapshot_us_old',
        platform: 'x',
        platformItemId: 'old_ai',
        sourceType: 'trend',
        region: 'United States',
        rank: 15,
        title: 'AI',
        normalizedKey: 'ai',
      },
      {
        id: 'item_us_new_ai',
        sourceSnapshotId: 'snapshot_us_new',
        platform: 'x',
        platformItemId: 'new_ai',
        sourceType: 'trend',
        region: 'United States',
        rank: 4,
        title: 'AI',
        normalizedKey: 'ai',
      },
    ]);
    await repository.saveSourceSnapshotDiff({
      id: 'diff_us_new',
      platform: 'x',
      region: 'United States',
      currentSnapshotId: 'snapshot_us_new',
      previousSnapshotId: 'snapshot_us_old',
      entered: [],
      exited: [],
      rankUp: [{ normalizedKey: 'ai', name: 'AI', previousRank: 15, currentRank: 4, rankDelta: 11 }],
      rankDown: [],
      unchanged: [],
    });

    const context = await builder.build({
      workflowRunId: 'wrun_test',
      observedAt: '2026-08-18T02:05:00.000Z',
      platform: 'x',
      sourceType: 'trend',
      regions: ['United States', 'Japan'],
    });

    expect(context).toMatchObject({
      schemaVersion: 'x_trend_event_context_v1',
      workflowRunId: 'wrun_test',
      currentBatch: {
        batchId: 'x:trend:2026-08-18T02:05:00.000Z',
        collectedAt: '2026-08-18T02:00:00.000Z',
        successfulRegions: [
          {
            region: 'United States',
            snapshotId: 'snapshot_us_new',
            items: [{ rank: 4, title: 'AI', normalizedKey: 'ai' }],
          },
        ],
        failedRegions: [{ region: 'Japan', error: 'latest_snapshot_not_found' }],
      },
      previousSuccessfulSnapshots: {
        byRegion: {
          'United States': {
            snapshotId: 'snapshot_us_old',
            items: [{ rank: 15, title: 'AI', normalizedKey: 'ai' }],
          },
        },
      },
      configuredTopics: [],
      eventCandidates: [],
      recentEventHistory: [],
    });
    expect(context.snapshotDiffs).toEqual([expect.objectContaining({ id: 'diff_us_new' })]);
  });
});
