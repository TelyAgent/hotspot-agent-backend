import { createDefaultCollectionState } from '../../src/collection/default-collection-state';
import { PrismaCollectionRepository } from '../../src/collection/prisma-collection.repository';
import { TwitterCollectionService } from '../../src/collection/twitter-collection.service';
import { createMockTwitterTools } from '../../src/connectors/x/mock-twitter.tools';
import { ToolRegistry } from '../../src/connectors/tool-registry';
import { MonitorController } from '../../src/monitor/monitor.controller';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('Monitor compatibility API with Prisma', () => {
  let prisma: PrismaService;
  let repository: PrismaCollectionRepository;
  let controller: MonitorController;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.ensureReady();
    repository = new PrismaCollectionRepository(prisma);
    const tools = new ToolRegistry();
    createMockTwitterTools().forEach((tool) => tools.register(tool));
    controller = new MonitorController(repository, new TwitterCollectionService(repository, tools));
  });

  beforeEach(async () => {
    await prisma.clearCollectionData();
    await repository.seedDefaults(createDefaultCollectionState());
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('reads the latest persisted global trend snapshot through /monitor/trending shape', async () => {
    await controller.refresh();

    const response = await controller.getTrending('global', '1');

    expect(response.region).toBe('global');
    expect(response.source).toBe('mock');
    expect(response.items).toEqual([
      expect.objectContaining({
        rank: 1,
        name: 'OpenAI global',
      }),
    ]);
  });
});
