import { CollectionJobConfig, PlatformCollectionConfig } from '../../src/collection/collection.types';
import { InMemoryCollectionRepository } from '../../src/collection/in-memory-collection.repository';
import { TwitterCollectionService } from '../../src/collection/twitter-collection.service';
import { ToolRegistry } from '../../src/connectors/tool-registry';
import { createMockTwitterTools } from '../../src/connectors/x/mock-twitter.tools';

describe('TwitterCollectionService', () => {
  it('renders platform variables, collects X trending snapshots, and emits signals', async () => {
    const platformConfig: PlatformCollectionConfig = {
      id: 'x-default',
      platform: 'x',
      connectorId: 'x-mock',
      displayName: 'X Mock',
      enabled: true,
      defaultTimezone: 'Asia/Shanghai',
      defaultRegions: ['US', 'JP'],
      variables: {
        regions: ['US', 'JP'],
        monitoredAccounts: ['tier10k'],
        topicKeywords: ['OpenAI'],
        topicNegativeKeywords: ['scam'],
        defaultTrendLimit: 2,
        defaultPostLimit: 10,
      },
    };
    const jobConfig: CollectionJobConfig = {
      id: 'x-trending-default',
      platform: 'x',
      name: 'X trending',
      toolName: 'x.getTrending',
      sourceType: 'trend',
      enabled: true,
      schedule: { type: 'cron', value: '0 */2 * * *' },
      inputTemplate: {
        regions: '{{platform.variables.regions}}',
        limit: '{{platform.variables.defaultTrendLimit}}',
      },
      variableRefs: ['platform.variables.regions', 'platform.variables.defaultTrendLimit'],
      outputTarget: {
        platformTables: ['x_trend_snapshot', 'x_trend_snapshot_item'],
        emitSignal: true,
        emitSnapshot: true,
        emitSnapshotDiff: true,
      },
    };
    const tools = new ToolRegistry();
    createMockTwitterTools().forEach((tool) => tools.register(tool));
    const repository = new InMemoryCollectionRepository();
    const service = new TwitterCollectionService(repository, tools);

    const result = await service.runTrendingJob({
      platformConfig,
      jobConfig,
      now: '2026-08-18T00:00:00.000Z',
    });

    expect(result.fetchRun.status).toBe('success');
    expect(result.toolInput).toEqual({ regions: ['US', 'JP'], limit: 2 });
    expect(repository.xTrendSnapshots).toHaveLength(2);
    expect(repository.xTrendSnapshotItems).toHaveLength(4);
    expect(repository.sourceSnapshots).toHaveLength(2);
    expect(repository.signals).toHaveLength(4);
    expect(repository.signals[0]).toEqual(
      expect.objectContaining({
        platform: 'x',
        sourceType: 'trend',
        region: 'US',
        platformRefTable: 'x_trend_snapshot_item',
      }),
    );
  });

  it('runs the X trend event workflow after trending snapshots are persisted', async () => {
    const platformConfig: PlatformCollectionConfig = {
      id: 'x-default',
      platform: 'x',
      connectorId: 'x-mock',
      displayName: 'X Mock',
      enabled: true,
      defaultTimezone: 'Asia/Shanghai',
      defaultRegions: ['US', 'JP'],
      variables: {
        regions: ['US', 'JP'],
        defaultTrendLimit: 2,
      },
    };
    const jobConfig: CollectionJobConfig = {
      id: 'x-trending-default',
      platform: 'x',
      name: 'X trending',
      toolName: 'x.getTrending',
      sourceType: 'trend',
      enabled: true,
      schedule: { type: 'cron', value: '0 */2 * * *' },
      inputTemplate: {
        regions: '{{platform.variables.regions}}',
        limit: '{{platform.variables.defaultTrendLimit}}',
      },
      variableRefs: ['platform.variables.regions', 'platform.variables.defaultTrendLimit'],
      outputTarget: {
        platformTables: ['x_trend_snapshot', 'x_trend_snapshot_item'],
        emitSignal: true,
        emitSnapshot: true,
        emitSnapshotDiff: true,
      },
    };
    const tools = new ToolRegistry();
    createMockTwitterTools().forEach((tool) => tools.register(tool));
    const repository = new InMemoryCollectionRepository();
    const workflowRunner = {
      runXTrendEventFormation: jest.fn().mockResolvedValue({
        run: { id: 'wrun_test', status: 'success' },
        commands: [],
        executions: [],
      }),
    };
    const service = new TwitterCollectionService(repository, tools, workflowRunner as any);

    const result = await service.runTrendingJob({
      platformConfig,
      jobConfig,
      now: '2026-08-18T00:00:00.000Z',
    });

    expect(result.workflowRun).toEqual({
      id: 'wrun_test',
      status: 'success',
      commandCount: 0,
      executionCount: 0,
    });
    expect(workflowRunner.runXTrendEventFormation).toHaveBeenCalledWith({
      observedAt: '2026-08-18T00:00:00.000Z',
      regions: ['US', 'JP'],
    });
  });

  it('keeps the collection run successful when workflow triggering fails', async () => {
    const platformConfig: PlatformCollectionConfig = {
      id: 'x-default',
      platform: 'x',
      connectorId: 'x-mock',
      displayName: 'X Mock',
      enabled: true,
      defaultTimezone: 'Asia/Shanghai',
      defaultRegions: ['US'],
      variables: {
        regions: ['US'],
        defaultTrendLimit: 1,
      },
    };
    const jobConfig: CollectionJobConfig = {
      id: 'x-trending-default',
      platform: 'x',
      name: 'X trending',
      toolName: 'x.getTrending',
      sourceType: 'trend',
      enabled: true,
      schedule: { type: 'cron', value: '0 */2 * * *' },
      inputTemplate: {
        regions: '{{platform.variables.regions}}',
        limit: '{{platform.variables.defaultTrendLimit}}',
      },
      variableRefs: ['platform.variables.regions', 'platform.variables.defaultTrendLimit'],
      outputTarget: {
        platformTables: ['x_trend_snapshot', 'x_trend_snapshot_item'],
        emitSignal: true,
        emitSnapshot: true,
        emitSnapshotDiff: true,
      },
    };
    const tools = new ToolRegistry();
    createMockTwitterTools().forEach((tool) => tools.register(tool));
    const repository = new InMemoryCollectionRepository();
    const workflowRunner = {
      runXTrendEventFormation: jest.fn().mockRejectedValue(new Error('workflow unavailable')),
    };
    const service = new TwitterCollectionService(repository, tools, workflowRunner as any);

    const result = await service.runTrendingJob({
      platformConfig,
      jobConfig,
      now: '2026-08-18T00:00:00.000Z',
    });

    expect(result.fetchRun.status).toBe('success');
    expect(repository.sourceSnapshots).toHaveLength(1);
  });

  it('returns a failed fetch run when no trend region can be collected', async () => {
    const platformConfig: PlatformCollectionConfig = {
      id: 'x-default',
      platform: 'x',
      connectorId: 'x-mock',
      displayName: 'X Mock',
      enabled: true,
      defaultTimezone: 'Asia/Shanghai',
      defaultRegions: ['US'],
      variables: {
        regions: ['US'],
        defaultTrendLimit: 1,
      },
    };
    const jobConfig: CollectionJobConfig = {
      id: 'x-trending-default',
      platform: 'x',
      name: 'X trending',
      toolName: 'x.getTrending',
      sourceType: 'trend',
      enabled: true,
      schedule: { type: 'cron', value: '0 */2 * * *' },
      inputTemplate: {
        regions: '{{platform.variables.regions}}',
        limit: '{{platform.variables.defaultTrendLimit}}',
      },
      variableRefs: ['platform.variables.regions', 'platform.variables.defaultTrendLimit'],
      outputTarget: {
        platformTables: ['x_trend_snapshot', 'x_trend_snapshot_item'],
        emitSignal: true,
        emitSnapshot: true,
        emitSnapshotDiff: true,
      },
    };
    const tools = new ToolRegistry();
    tools.register({
      name: 'x.getTrending',
      description: 'failing tool',
      invoke: async () => {
        throw new Error('twitterapi.io x.getTrending failed for all regions: US: 402 Payment Required');
      },
    });
    const repository = new InMemoryCollectionRepository();
    const service = new TwitterCollectionService(repository, tools);

    const result = await service.runTrendingJob({
      platformConfig,
      jobConfig,
      now: '2026-08-18T00:00:00.000Z',
    });

    expect(result).toEqual(
      expect.objectContaining({
        fetchRun: expect.objectContaining({ status: 'failed' }),
        snapshots: [],
        signals: [],
      }),
    );
    expect(repository.fetchRuns[0]).toEqual(
      expect.objectContaining({
        status: 'failed',
        finishedAt: '2026-08-18T00:00:00.000Z',
        error: 'twitterapi.io x.getTrending failed for all regions: US: 402 Payment Required',
      }),
    );
  });
});
