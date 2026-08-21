import { EventListService } from '../../src/event/event-list.service';

describe('EventListService', () => {
  it('returns paginated frontend event items with trigger context', async () => {
    const prisma = {
      event: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'event_1',
            title: 'AI enters top trends',
            normalizedEventKey: 'ai-enters-top-trends',
            status: 'responding',
            confidence: 'high',
            formedAt: new Date('2026-08-18T02:05:00.000Z'),
            updatedAt: new Date('2026-08-18T02:06:00.000Z'),
            intakes: [
              {
                oneLineSummary: 'AI entered the United States X trend top five.',
                confirmationLevel: 'unconfirmed',
                payload: {
                  trigger: {
                    ruleId: 'TR-01',
                    reason: 'Ranked #4 in United States.',
                  },
                },
              },
            ],
            sourceContexts: [
              {
                sourceType: 'x_trend',
                payload: {
                  regions: [
                    { region: 'United States', rank: 4 },
                    { region: 'Japan', rank: 8 },
                  ],
                  matchedRules: [
                    { ruleId: 'TR-01', reason: 'First entered top five.' },
                    { ruleId: 'TR-04', reason: 'Appeared in two regions.' },
                  ],
                },
              },
            ],
            evidence: [
              {
                sourceType: 'x_trend',
                url: 'https://x.com/search?q=AI',
                claim: 'AI ranked #4 on United States trends',
                payload: {},
              },
            ],
          },
        ]),
      },
    };
    const service = new EventListService(prisma as never);

    const result = await service.list({ page: '1', pageSize: '20' });

    expect(result).toEqual({
      items: [
        expect.objectContaining({
          id: 'event_1',
          title: 'AI enters top trends',
          summary: 'AI entered the United States X trend top five.',
          status: '内容生成中',
          verify: '待核验',
          regions: 'United States、Japan',
          trigger: 'TR-01：Ranked #4 in United States.',
          urls: ['https://x.com/search?q=AI'],
          evidence: [
            {
              sourceType: 'x_trend',
              url: 'https://x.com/search?q=AI',
              claim: 'AI ranked #4 on United States trends',
            },
          ],
          related: [],
          confidence: 'high',
          normalizedEventKey: 'ai-enters-top-trends',
          matchedRules: [
            { ruleId: 'TR-01', reason: 'First entered top five.' },
            { ruleId: 'TR-04', reason: 'Appeared in two regions.' },
          ],
        }),
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    });
  });

  it('falls back to trend source context as evidence when no evidence urls exist', async () => {
    const prisma = {
      event: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'event_2',
            title: 'AI rises in X trends',
            normalizedEventKey: 'ai-rises',
            status: 'responding',
            confidence: 'medium',
            formedAt: new Date('2026-08-18T02:05:00.000Z'),
            updatedAt: new Date('2026-08-18T02:06:00.000Z'),
            intakes: [],
            sourceContexts: [
              {
                sourceType: 'x_trend',
                payload: {
                  regions: [
                    { region: 'United States', rank: 4, previousRank: 18, snapshotId: 'snapshot_us' },
                    { region: 'Japan', rank: 9, snapshotId: 'snapshot_jp' },
                  ],
                  matchedRules: [{ ruleId: 'TR-02', reason: 'Rank rose by 14.' }],
                },
              },
            ],
            evidence: [],
          },
        ]),
      },
    };
    const service = new EventListService(prisma as never);

    const result = await service.list();

    expect(result.items[0]).toEqual(
      expect.objectContaining({
        urls: [],
        evidence: [
          {
            sourceType: 'x_trend',
            claim: 'United States 热搜榜排名 #4，较上次成功快照上升 14 位（snapshot_us）',
          },
          {
            sourceType: 'x_trend',
            claim: 'Japan 热搜榜排名 #9（snapshot_jp）',
          },
        ],
      }),
    );
  });
});
