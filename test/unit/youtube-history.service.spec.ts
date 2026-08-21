import {
  computeBoardVisibleUntil,
  computeConsecutiveHotDays,
  computeReappearanceGapDays,
  mergeDiscoveryLabels,
  toDateKey,
} from '../../src/youtube/youtube-history.service';

describe('YoutubeHistoryService date rules', () => {
  it('increments consecutive days only on next natural day', () => {
    expect(
      computeConsecutiveHotDays({
        previousLastSeen: new Date('2026-08-20T00:00:00Z'),
        currentDate: new Date('2026-08-21T00:00:00Z'),
        previousValue: 2,
      }),
    ).toBe(3);

    expect(
      computeConsecutiveHotDays({
        previousLastSeen: new Date('2026-08-18T00:00:00Z'),
        currentDate: new Date('2026-08-21T00:00:00Z'),
        previousValue: 2,
      }),
    ).toBe(1);
  });

  it('computes board visible until as current date plus six days', () => {
    expect(computeBoardVisibleUntil(new Date('2026-08-21T00:00:00Z')).toISOString()).toBe(
      '2026-08-27T00:00:00.000Z',
    );
  });

  it('computes reappearance gap only after interrupted days', () => {
    expect(
      computeReappearanceGapDays({
        previousLastSeen: new Date('2026-08-20T00:00:00Z'),
        currentDate: new Date('2026-08-21T00:00:00Z'),
      }),
    ).toBeNull();
    expect(
      computeReappearanceGapDays({
        previousLastSeen: new Date('2026-08-18T00:00:00Z'),
        currentDate: new Date('2026-08-21T00:00:00Z'),
      }),
    ).toBe(3);
  });

  it('merges same-day discovery labels with reappearance labels without duplicates', () => {
    expect(mergeDiscoveryLabels(['多关键词命中'], 3)).toEqual(['多关键词命中', '3天后再次上榜']);
    expect(mergeDiscoveryLabels(['多关键词命中', '3天后再次上榜'], 3)).toEqual([
      '多关键词命中',
      '3天后再次上榜',
    ]);
  });

  it('normalizes date keys to UTC natural days', () => {
    expect(toDateKey(new Date('2026-08-21T15:30:00Z'))).toBe('2026-08-21');
  });
});
