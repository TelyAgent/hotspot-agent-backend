import { createDefaultCollectionState } from '../../src/collection/default-collection-state';
import { InMemoryCollectionRepository } from '../../src/collection/in-memory-collection.repository';
import { TwitterCollectionService } from '../../src/collection/twitter-collection.service';
import { createMockTwitterTools } from '../../src/connectors/x/mock-twitter.tools';
import { ToolRegistry } from '../../src/connectors/tool-registry';
import { MonitorController } from '../../src/monitor/monitor.controller';

describe('MonitorController', () => {
  it('returns the latest collected ranking in the frontend-compatible shape', async () => {
    const repository = new InMemoryCollectionRepository(createDefaultCollectionState());
    const tools = new ToolRegistry();
    createMockTwitterTools().forEach((tool) => tools.register(tool));
    const twitterCollection = new TwitterCollectionService(repository, tools);
    const controller = new MonitorController(repository, twitterCollection);

    await controller.refresh();
    const response = await controller.getTrending('global', '2');

    expect(response).toEqual({
      region: 'global',
      collectedAt: '2026-08-18T00:00:00.000Z',
      source: 'mock',
      items: [
        {
          rank: 1,
          name: 'OpenAI global',
          query: 'OpenAI global',
          url: 'https://x.com/search?q=OpenAI%20global',
          heat: '1000',
        },
        {
          rank: 2,
          name: 'global trend 2',
          query: 'global trend 2',
          url: 'https://x.com/search?q=global%20trend%202',
          heat: '990',
        },
      ],
    });
  });

  it('maps the frontend Worldwide region to the stored global snapshot', async () => {
    const repository = new InMemoryCollectionRepository(createDefaultCollectionState());
    const tools = new ToolRegistry();
    createMockTwitterTools().forEach((tool) => tools.register(tool));
    const twitterCollection = new TwitterCollectionService(repository, tools);
    const controller = new MonitorController(repository, twitterCollection);

    await controller.refresh();
    const response = await controller.getTrending('Worldwide', '1');

    expect(response.region).toBe('Worldwide');
    expect(response.items).toEqual([
      expect.objectContaining({
        rank: 1,
        name: 'OpenAI global',
      }),
    ]);
  });

  it('returns failed refresh status with error details instead of throwing', async () => {
    const repository = new InMemoryCollectionRepository(createDefaultCollectionState());
    const twitterCollection = {
      runTrendingJob: jest.fn().mockResolvedValue({
        fetchRun: {
          id: 'run_failed',
          status: 'failed',
          itemCount: 0,
          error: 'twitterapi.io x.getTrending failed for all regions: global: 402 Payment Required',
        },
        toolInput: {},
        snapshots: [],
        signals: [],
      }),
    };
    const controller = new MonitorController(repository, twitterCollection as any);

    await expect(controller.refresh()).resolves.toEqual({
      status: 'failed',
      message: '采集失败',
      fetchRunId: 'run_failed',
      itemCount: 0,
      error: 'twitterapi.io x.getTrending failed for all regions: global: 402 Payment Required',
    });
  });
});
