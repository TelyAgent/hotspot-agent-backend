import { PrismaCollectionRepository } from '../../src/collection/prisma-collection.repository';
import { createDefaultCollectionState } from '../../src/collection/default-collection-state';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('PrismaCollectionRepository', () => {
  let prisma: PrismaService;
  let repository: PrismaCollectionRepository;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.ensureReady();
    repository = new PrismaCollectionRepository(prisma);
  });

  beforeEach(async () => {
    await prisma.clearCollectionData();
    await repository.seedDefaults(createDefaultCollectionState());
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('persists collection config, X trend snapshots, snapshot items, diff, and signals', async () => {
    const platform = await repository.findPlatformConfig('x');
    const job = await repository.findJobConfig('x-trending-default');
    expect(platform?.variables.regions).toEqual(['global']);
    expect(platform?.variables.regionWoeids).toEqual({ global: 1 });
    expect(job?.toolName).toBe('x.getTrending');

    const fetchRun = await repository.saveFetchRun({
      id: 'run_test',
      platform: 'x',
      connectorId: 'x-mock',
      toolName: 'x.getTrending',
      sourceType: 'trend',
      status: 'running',
      input: { regions: ['US'], limit: 1 },
      startedAt: '2026-08-18T00:00:00.000Z',
      itemCount: 0,
    });
    const xSnapshot = await repository.saveXTrendSnapshot({
      id: 'xtrend_test',
      fetchRunId: fetchRun.id,
      region: 'US',
      collectedAt: '2026-08-18T00:00:00.000Z',
      itemCount: 1,
      checksum: '1:OpenAI US',
      raw: { ok: true },
    });
    const [xItem] = await repository.saveXTrendSnapshotItems([
      {
        id: 'xtrend_item_test',
        xTrendSnapshotId: xSnapshot.id,
        rank: 1,
        name: 'OpenAI US',
        normalizedKey: 'openai us',
        raw: { ok: true },
      },
    ]);
    const sourceSnapshot = await repository.saveSourceSnapshot({
      id: 'snap_test',
      platform: 'x',
      platformSnapshotId: xSnapshot.id,
      sourceType: 'trend',
      region: 'US',
      collectedAt: '2026-08-18T00:00:00.000Z',
      fetchRunId: fetchRun.id,
      itemCount: 1,
    });
    await repository.saveSourceSnapshotItems([
      {
        id: 'snap_item_test',
        sourceSnapshotId: sourceSnapshot.id,
        platform: 'x',
        platformItemId: xItem.id,
        sourceType: 'trend',
        region: 'US',
        rank: 1,
        title: 'OpenAI US',
        normalizedKey: 'openai us',
        metrics: { volume: 1000 },
      },
    ]);
    await repository.saveSourceSnapshotDiff({
      id: 'diff_test',
      platform: 'x',
      region: 'US',
      currentSnapshotId: sourceSnapshot.id,
      entered: [{ normalizedKey: 'openai us', name: 'OpenAI US', currentRank: 1 }],
      exited: [],
      rankUp: [],
      rankDown: [],
      unchanged: [],
    });
    await repository.saveSignals([
      {
        id: 'sig_test',
        platformRefTable: 'x_trend_snapshot_item',
        platformRefId: xItem.id,
        snapshotId: sourceSnapshot.id,
        fetchRunId: fetchRun.id,
        platform: 'x',
        sourceType: 'trend',
        sourceItemId: 'x:trend:US:openai us:2026-08-18T00:00:00.000Z',
        title: 'OpenAI US',
        region: 'US',
        rank: 1,
        observedAt: '2026-08-18T00:00:00.000Z',
        normalizedKey: 'openai us',
      },
    ]);
    await repository.updateFetchRun(fetchRun.id, {
      status: 'success',
      finishedAt: '2026-08-18T00:00:01.000Z',
      itemCount: 1,
    });

    expect(await prisma.xTrendSnapshot.count()).toBe(1);
    expect(await prisma.xTrendSnapshotItem.count()).toBe(1);
    expect(await prisma.sourceSnapshot.count()).toBe(1);
    expect(await prisma.sourceSnapshotDiff.count()).toBe(1);
    expect(await prisma.signal.count()).toBe(1);
  });
});
