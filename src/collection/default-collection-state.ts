import { CollectionState } from './collection.types';

export function createDefaultCollectionState(): CollectionState {
  return {
    platformConfigs: [
      {
        id: 'x-default',
        platform: 'x',
        connectorId: 'x-twitterapi-io',
        displayName: 'X / twitterapi.io',
        enabled: true,
        defaultTimezone: 'Asia/Shanghai',
        defaultRegions: ['global'],
        variables: {
          regions: ['global'],
          regionWoeids: {
            global: 1,
          },
          monitoredAccounts: ['tier10k', 'WatcherGuru', 'lookonchain'],
          topicKeywords: ['OpenAI', 'Bitcoin'],
          topicNegativeKeywords: ['scam'],
          defaultTrendLimit: 50,
          defaultPostLimit: 30,
        },
      },
    ],
    jobConfigs: [
      {
        id: 'x-trending-default',
        platform: 'x',
        name: 'X 目标地区热搜榜',
        toolName: 'x.getTrending',
        sourceType: 'trend',
        enabled: true,
        schedule: { type: 'cron', value: '0 */2 * * *' },
        inputTemplate: {
          regions: '{{platform.variables.regions}}',
          regionWoeids: '{{platform.variables.regionWoeids}}',
          limit: '{{platform.variables.defaultTrendLimit}}',
        },
        variableRefs: [
          'platform.variables.regions',
          'platform.variables.regionWoeids',
          'platform.variables.defaultTrendLimit',
        ],
        outputTarget: {
          platformTables: ['x_trend_snapshot', 'x_trend_snapshot_item'],
          emitSignal: true,
          emitSnapshot: true,
          emitSnapshotDiff: true,
        },
      },
    ],
  };
}
