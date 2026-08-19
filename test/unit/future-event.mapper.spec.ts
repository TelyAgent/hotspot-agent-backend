import { mapFutureEventView } from '../../src/future-events/future-event.mapper';

describe('mapFutureEventView', () => {
  it('maps normalized storage rows to Schedule.tsx compatible fields', () => {
    const view = mapFutureEventView({
      event: {
        id: 'future_1',
        title: '美国 CPI 数据发布',
        subject: '美国劳工统计局',
        eventType: '经济数据发布',
        factTime: new Date('2026-09-10T12:30:00.000Z'),
        factEndTime: null,
        timezone: 'America/New_York',
        schedulePrecision: 'exact_time',
        confirmationLevel: 'confirmed',
        expressionBoundary: 'factual',
        relatedEventId: null,
        entryMode: null,
        ruleVersion: 'future-event-window-score@v1',
        createdAt: new Date('2026-08-19T00:00:00.000Z'),
        updatedAt: new Date('2026-08-19T00:00:00.000Z'),
      },
      evidence: [
        {
          id: 'evidence_1',
          url: 'https://www.bls.gov/schedule/news_release/bls.ics',
          sourceType: 'bls',
          verifiedAt: new Date('2026-08-19T00:00:00.000Z'),
          claims: ['BLS lists CPI release time.'],
          originalId: 'bls-cpi-2026-09',
        },
      ],
      windows: [],
      heatQuery: null,
      heatBuckets: [],
      latestScore: null,
    });

    expect(view).toMatchObject({
      id: 'future_1',
      title: '美国 CPI 数据发布',
      factTime: '2026-09-10T12:30:00.000Z',
      confirmationLevel: 'confirmed',
      expressionBoundary: 'factual',
      evidence: [{ sourceType: 'bls' }],
      actionScore: { total: 0 },
      heat: { buckets: [], cumulative: 0 },
    });
  });
});
