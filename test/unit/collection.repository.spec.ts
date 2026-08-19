import { InMemoryCollectionRepository } from '../../src/collection/in-memory-collection.repository';

describe('CollectionRepository workflow queries', () => {
  it('returns latest source snapshots per region and diffs for current snapshots', async () => {
    const repository = new InMemoryCollectionRepository();

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
    await repository.saveSourceSnapshot({
      id: 'snapshot_jp_new',
      platform: 'x',
      platformSnapshotId: 'x_jp_new',
      sourceType: 'trend',
      region: 'Japan',
      collectedAt: '2026-08-18T02:01:00.000Z',
      fetchRunId: 'fetch_new',
      itemCount: 1,
    });
    await repository.saveSourceSnapshotDiff({
      id: 'diff_us_new',
      platform: 'x',
      region: 'United States',
      currentSnapshotId: 'snapshot_us_new',
      previousSnapshotId: 'snapshot_us_old',
      entered: [],
      exited: [],
      rankUp: [{ normalizedKey: 'btc', name: 'BTC', previousRank: 20, currentRank: 5, rankDelta: 15 }],
      rankDown: [],
      unchanged: [],
    });

    await expect(
      Promise.resolve(
        repository.findLatestSourceSnapshots({
          platform: 'x',
          sourceType: 'trend',
          regions: ['United States', 'Japan', 'Korea'],
        }),
      ),
    ).resolves.toEqual([
      expect.objectContaining({ id: 'snapshot_us_new', region: 'United States' }),
      expect.objectContaining({ id: 'snapshot_jp_new', region: 'Japan' }),
    ]);

    await expect(
      Promise.resolve(repository.findSourceSnapshotDiffs({ currentSnapshotIds: ['snapshot_us_new', 'snapshot_jp_new'] })),
    ).resolves.toEqual([expect.objectContaining({ id: 'diff_us_new' })]);
  });
});
