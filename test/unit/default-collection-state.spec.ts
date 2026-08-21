import {
  createDefaultCollectionState,
  mergePlatformCollectionConfigDefaults,
} from '../../src/collection/default-collection-state';

describe('mergePlatformCollectionConfigDefaults', () => {
  it('adds new default X trend regions while preserving custom trend limit and variables', () => {
    const defaults = createDefaultCollectionState().platformConfigs[0];
    const merged = mergePlatformCollectionConfigDefaults(
      {
        id: 'x-default',
        platform: 'x',
        connectorId: 'custom-connector',
        displayName: 'Custom X',
        enabled: false,
        defaultTimezone: 'Asia/Shanghai',
        defaultRegions: ['global'],
        variables: {
          regions: ['global'],
          regionWoeids: { global: 1 },
          monitoredAccounts: ['custom'],
          defaultTrendLimit: 10,
        },
      },
      defaults,
    );

    expect(merged.enabled).toBe(false);
    expect(merged.connectorId).toBe('custom-connector');
    expect(merged.variables.monitoredAccounts).toEqual(['custom']);
    expect(merged.variables.defaultTrendLimit).toBe(10);
    expect(merged.defaultRegions).toEqual(['global', 'United States', 'United Kingdom', 'Japan', 'Korea']);
    expect(merged.variables.regions).toEqual(['global', 'United States', 'United Kingdom', 'Japan', 'Korea']);
    expect(merged.variables.regionWoeids).toEqual({
      global: 1,
      'United States': 23424977,
      'United Kingdom': 23424975,
      Japan: 23424856,
      Korea: 23424868,
    });
  });
});
