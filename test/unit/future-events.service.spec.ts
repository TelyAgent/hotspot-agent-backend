import { FutureEventsService } from '../../src/future-events/future-events.service';
import { BlsIcsConnector } from '../../src/future-events/connectors/bls-ics.connector';

describe('FutureEventsService', () => {
  it('lists future events by UTC month and maps them for Schedule.tsx', async () => {
    const prisma = {
      futureEvent: {
        findMany: jest.fn().mockResolvedValue([
          {
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
            evidence: [],
            windows: [],
            heatQueries: [],
            heatBuckets: [],
            scoreVersions: [],
          },
        ]),
      },
      futureSourceConfig: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const service = new FutureEventsService(prisma as never);

    const result = await service.list({ month: '2026-09' });

    expect(prisma.futureEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          factTime: {
            gte: new Date('2026-09-01T00:00:00.000Z'),
            lt: new Date('2026-10-01T00:00:00.000Z'),
          },
        },
      }),
    );
    expect(result).toEqual([
      expect.objectContaining({
        id: 'future_1',
        title: '美国 CPI 数据发布',
        factTime: '2026-09-10T12:30:00.000Z',
      }),
    ]);
  });

  it('filters future events by evidence source type', async () => {
    const prisma = {
      futureEvent: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      futureSourceConfig: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const service = new FutureEventsService(prisma as never);

    await service.list({ sourceType: 'bls' });

    expect(prisma.futureEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          evidence: {
            some: { sourceType: 'bls' },
          },
        },
      }),
    );
  });

  it('fetches BLS source items and stores future events when resyncing BLS', async () => {
    const prisma = {
      futureSourceConfig: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'future-source-bls',
          sourceType: 'bls',
          enabled: true,
          connectorId: 'future.bls.fetchIcs',
          variables: {
            url: 'https://www.bls.gov/schedule/news_release/bls.ics',
            includeReleaseTypes: ['Consumer Price Index'],
          },
        }),
      },
      futureSourceRun: {
        create: jest.fn().mockResolvedValue({ id: 'fsrun_1' }),
        update: jest.fn().mockResolvedValue({ id: 'fsrun_1' }),
      },
      futureSourceItem: {
        upsert: jest.fn().mockResolvedValue({ id: 'fsitem_1' }),
      },
      futureEvent: {
        upsert: jest.fn().mockResolvedValue({ id: 'future_1' }),
        update: jest.fn().mockResolvedValue({ id: 'future_1' }),
      },
      futureEventEvidence: {
        upsert: jest.fn().mockResolvedValue({ id: 'evidence_1' }),
      },
      workflowDefinition: {
        upsert: jest.fn().mockResolvedValue({ id: 'wdef_future_event_window_score_v1' }),
      },
      workflowRun: {
        create: jest.fn().mockResolvedValue({ id: 'wrun_1' }),
      },
      futureEventWindow: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest.fn().mockResolvedValue({ id: 'window_1' }),
      },
      futureEventHeatQuery: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest.fn().mockResolvedValue({ id: 'heat_query_1' }),
      },
      futureEventScoreVersion: {
        create: jest.fn().mockResolvedValue({ id: 'score_1' }),
      },
    };
    const bls = {
      fetch: jest.fn().mockResolvedValue([
        {
          sourceType: 'bls',
          sourceItemId: 'bls-cpi-2026-09',
          sourceUrl: 'https://www.bls.gov/news.release/cpi.nr0.htm',
          retrievedAt: '2026-08-19T00:00:00.000Z',
          title: 'Consumer Price Index',
          description: 'CPI release',
          startTime: '2026-09-10T12:30:00.000Z',
          endTime: null,
          timezone: 'UTC',
          raw: {},
        },
      ]),
    };
    const service = new FutureEventsService(prisma as never, bls as unknown as BlsIcsConnector);

    const result = await service.resyncSource('bls');

    expect(prisma.futureSourceRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sourceConfigId: 'future-source-bls',
          sourceType: 'bls',
          status: 'running',
        }),
      }),
    );
    expect(prisma.futureSourceItem.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { sourceType_sourceItemId: { sourceType: 'bls', sourceItemId: 'bls-cpi-2026-09' } },
      }),
    );
    expect(prisma.futureEvent.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          title: 'Consumer Price Index',
          confirmationLevel: 'confirmed',
          expressionBoundary: 'factual',
        }),
      }),
    );
    expect(prisma.futureSourceRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'success', itemCount: 1 }),
      }),
    );
    expect(result).toEqual({ status: 'success', source: 'bls', itemCount: 1 });
  });

  it('fetches BEA source items through the configured connector', async () => {
    const prisma = {
      futureSourceConfig: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'future-source-bea',
          sourceType: 'bea',
          enabled: true,
          connectorId: 'future.bea.fetchSchedule',
          variables: { url: 'https://www.bea.gov/news/schedule' },
        }),
      },
      futureSourceRun: {
        create: jest.fn().mockResolvedValue({ id: 'fsrun_1' }),
        update: jest.fn().mockResolvedValue({ id: 'fsrun_1' }),
      },
      futureSourceItem: {
        upsert: jest.fn().mockResolvedValue({ id: 'fsitem_1' }),
      },
      futureEvent: {
        upsert: jest.fn().mockResolvedValue({ id: 'future_1' }),
        update: jest.fn().mockResolvedValue({ id: 'future_1' }),
      },
      futureEventEvidence: {
        upsert: jest.fn().mockResolvedValue({ id: 'evidence_1' }),
      },
      workflowDefinition: {
        upsert: jest.fn().mockResolvedValue({ id: 'wdef_future_event_window_score_v1' }),
      },
      workflowRun: {
        create: jest.fn().mockResolvedValue({ id: 'wrun_1' }),
      },
      futureEventWindow: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest.fn().mockResolvedValue({ id: 'window_1' }),
      },
      futureEventHeatQuery: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest.fn().mockResolvedValue({ id: 'heat_query_1' }),
      },
      futureEventScoreVersion: {
        create: jest.fn().mockResolvedValue({ id: 'score_1' }),
      },
    };
    const bea = {
      fetch: jest.fn().mockResolvedValue([
        {
          sourceType: 'bea',
          sourceItemId: 'bea:2026-09-03:trade',
          sourceUrl: 'https://www.bea.gov/news/schedule',
          retrievedAt: '2026-08-19T00:00:00.000Z',
          title: 'U.S. International Trade in Goods and Services, July 2026',
          description: 'News',
          startTime: '2026-09-03T12:30:00.000Z',
          endTime: null,
          timezone: 'America/New_York',
          raw: {},
        },
      ]),
    };
    const service = new FutureEventsService(prisma as never, {} as never, bea as never);

    const result = await service.resyncSource('bea');

    expect(bea.fetch).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceType: 'bea',
        variables: { url: 'https://www.bea.gov/news/schedule' },
      }),
    );
    expect(prisma.futureEvent.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          subject: 'BEA',
          eventType: '经济数据发布',
          schedulePrecision: 'exact_time',
        }),
      }),
    );
    expect(result).toEqual({ status: 'success', source: 'bea', itemCount: 1 });
  });
});
