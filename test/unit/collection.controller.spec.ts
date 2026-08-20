import { CollectionController } from '../../src/collection/collection.controller';
import { createDefaultCollectionState } from '../../src/collection/default-collection-state';
import { InMemoryCollectionRepository } from '../../src/collection/in-memory-collection.repository';
import { TwitterCollectionService } from '../../src/collection/twitter-collection.service';
import { ToolRegistry } from '../../src/connectors/tool-registry';
import { createMockTwitterTools } from '../../src/connectors/x/mock-twitter.tools';

describe('CollectionController', () => {
  it('updates X platform variables and runs a configured collection job', async () => {
    const repository = new InMemoryCollectionRepository(createDefaultCollectionState());
    const tools = new ToolRegistry();
    createMockTwitterTools().forEach((tool) => tools.register(tool));
    const service = new TwitterCollectionService(repository, tools);
    const controller = new CollectionController(repository, service);

    const updated = await controller.updatePlatformConfig('x', {
      variables: {
        regions: ['US'],
        defaultTrendLimit: 1,
      },
    });
    const run = await controller.runJob('x-trending-default', {});

    expect(updated.variables.regions).toEqual(['US']);
    expect(run.status).toBe('success');
    expect(run.fetchRunId).toBeDefined();
    expect(repository.xTrendSnapshots).toHaveLength(1);
    expect(repository.signals.filter((signal) => signal.sourceType === 'trend')).toHaveLength(1);
    expect(repository.signals.filter((signal) => signal.sourceType === 'post')).toHaveLength(0);
  });

  it('returns collection job error details when the run fails', async () => {
    const repository = new InMemoryCollectionRepository(createDefaultCollectionState());
    const service = {
      runTrendingJob: jest.fn().mockResolvedValue({
        fetchRun: {
          id: 'run_failed',
          status: 'failed',
          itemCount: 0,
          error: 'twitterapi.io x.getTrending failed for all regions: global: 402 Payment Required',
        },
      }),
    };
    const controller = new CollectionController(repository, service as any);

    await expect(controller.runJob('x-trending-default', {})).resolves.toEqual({
      fetchRunId: 'run_failed',
      status: 'failed',
      itemCount: 0,
      error: 'twitterapi.io x.getTrending failed for all regions: global: 402 Payment Required',
    });
  });

  it('updates collection job schedule from settings', async () => {
    const repository = new InMemoryCollectionRepository(createDefaultCollectionState());
    const tools = new ToolRegistry();
    createMockTwitterTools().forEach((tool) => tools.register(tool));
    const service = new TwitterCollectionService(repository, tools);
    const controller = new CollectionController(repository, service);

    const updated = await controller.updateJobConfig('x-trending-default', {
      schedule: { type: 'cron', value: '0 */2 * * *' },
      enabled: true,
    });

    expect(updated.schedule).toEqual({ type: 'cron', value: '0 */2 * * *' });
    expect(updated.enabled).toBe(true);
  });

  it('saves Twitter settings as one platform config payload and syncs the trend job schedule', async () => {
    const repository = new InMemoryCollectionRepository(createDefaultCollectionState());
    const tools = new ToolRegistry();
    createMockTwitterTools().forEach((tool) => tools.register(tool));
    const service = new TwitterCollectionService(repository, tools);
    const controller = new CollectionController(repository, service);

    const updated = await controller.updatePlatformConfig('x', {
      defaultRegions: ['global', 'Japan'],
      variables: {
        regions: ['global', 'Japan'],
        trendCollectionCron: '0 */4 * * *',
        trendEventWorkflowId: 'custom-trend-workflow',
      },
    });
    const trendJob = await repository.findJobConfig('x-trending-default');

    expect(updated.defaultRegions).toEqual(['global', 'Japan']);
    expect(updated.variables.regions).toEqual(['global', 'Japan']);
    expect(updated.variables.trendCollectionCron).toBe('0 */4 * * *');
    expect(updated.variables.trendEventWorkflowId).toBe('custom-trend-workflow');
    expect(trendJob?.schedule).toEqual({ type: 'cron', value: '0 */4 * * *' });
  });
});
