import { PrismaCollectionRepository } from '../../src/collection/prisma-collection.repository';
import { createDefaultCollectionState } from '../../src/collection/default-collection-state';
import { TwitterCollectionService } from '../../src/collection/twitter-collection.service';
import { ToolRegistry } from '../../src/connectors/tool-registry';
import { createMockTwitterTools } from '../../src/connectors/x/mock-twitter.tools';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('TwitterCollectionService with Prisma', () => {
  let prisma: PrismaService;
  let repository: PrismaCollectionRepository;
  let service: TwitterCollectionService;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.ensureReady();
    repository = new PrismaCollectionRepository(prisma);
    const tools = new ToolRegistry();
    createMockTwitterTools().forEach((tool) => tools.register(tool));
    service = new TwitterCollectionService(repository, tools);
  });

  beforeEach(async () => {
    await prisma.clearCollectionData();
    await repository.seedDefaults(createDefaultCollectionState());
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('runs an X trending job and persists platform tables, public snapshots, diffs, and signals', async () => {
    const platformConfig = await repository.findPlatformConfig('x');
    const jobConfig = await repository.findJobConfig('x-trending-default');
    if (!platformConfig || !jobConfig) {
      throw new Error('Default X collection config was not seeded');
    }

    await service.runTrendingJob({
      platformConfig,
      jobConfig,
      now: '2026-08-18T02:00:00.000Z',
      overrideVariables: { regions: ['US'], limit: 2 },
    });

    expect(await prisma.sourceFetchRun.count()).toBe(1);
    expect(await prisma.xTrendSnapshot.count()).toBe(1);
    expect(await prisma.xTrendSnapshotItem.count()).toBe(2);
    expect(await prisma.sourceSnapshot.count()).toBe(1);
    expect(await prisma.sourceSnapshotItem.count()).toBe(2);
    expect(await prisma.sourceSnapshotDiff.count()).toBe(1);
    expect(await prisma.signal.count()).toBe(8);
    expect(await prisma.signal.count({ where: { sourceType: 'trend' } })).toBe(2);
    expect(await prisma.signal.count({ where: { sourceType: 'post' } })).toBe(6);
  });
});
