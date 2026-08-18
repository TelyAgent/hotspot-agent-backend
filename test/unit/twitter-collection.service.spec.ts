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
});
