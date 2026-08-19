import { FutureEventsService } from '../../src/future-events/future-events.service';
import { BlsIcsConnector } from '../../src/future-events/connectors/bls-ics.connector';

describe('FutureEventsService scoring workflow', () => {
  it('stores windows, heat query, and score version after official source intake', async () => {
    const prisma = {
      futureSourceConfig: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'future-source-bls',
          sourceType: 'bls',
          enabled: true,
          connectorId: 'future.bls.fetchIcs',
          variables: { url: 'https://www.bls.gov/schedule/news_release/bls.ics' },
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

    await service.resyncSource('bls');

    expect(prisma.workflowDefinition.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          workflowId: 'future-event-window-score',
          markdownPath: 'workflows/future-events/future-event-window-score/WORKFLOW.md',
        }),
      }),
    );
    expect(prisma.futureEventWindow.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { futureEventId: 'future_1', windowType: 'monitoring' },
      }),
    );
    expect(prisma.futureEventWindow.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ futureEventId: 'future_1', windowType: 'monitoring' }),
      }),
    );
    expect(prisma.futureEventHeatQuery.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ futureEventId: 'future_1', query: 'US CPI', active: true }),
      }),
    );
    expect(prisma.futureEventScoreVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          futureEventId: 'future_1',
          evidence: 20,
          heatMomentum: 0,
          version: 'future-event-window-score@v1',
        }),
      }),
    );
    expect(prisma.futureEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'future_1' },
        data: expect.objectContaining({ currentScoreBand: expect.any(String), ruleVersion: 'future-event-window-score@v1' }),
      }),
    );
  });

  it('backfills score data for existing official events without score versions on startup', async () => {
    const prisma = {
      futureSourceConfig: {
        upsert: jest.fn().mockResolvedValue({}),
      },
      futureEvent: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'future_existing_bls',
            title: 'Consumer Price Index',
            subject: 'BLS',
            eventType: '经济数据发布',
            factTime: new Date('2026-09-10T12:30:00.000Z'),
            factEndTime: null,
            timezone: 'UTC',
            evidence: [
              {
                sourceType: 'bls',
                url: 'https://www.bls.gov/news.release/cpi.nr0.htm',
                verifiedAt: new Date('2026-08-19T00:00:00.000Z'),
                sourceItem: {
                  sourceType: 'bls',
                  sourceItemId: 'bls-cpi-2026-09',
                  sourceUrl: 'https://www.bls.gov/news.release/cpi.nr0.htm',
                  retrievedAt: new Date('2026-08-19T00:00:00.000Z'),
                  title: 'Consumer Price Index',
                  description: 'CPI release',
                  startTime: new Date('2026-09-10T12:30:00.000Z'),
                  endTime: null,
                  timezone: 'UTC',
                  raw: {},
                },
              },
            ],
          },
        ]),
        update: jest.fn().mockResolvedValue({ id: 'future_existing_bls' }),
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
    const service = new FutureEventsService(prisma as never);

    await service.onModuleInit();

    expect(prisma.futureEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          currentScore: 0,
          scoreVersions: { none: {} },
        }),
      }),
    );
    expect(prisma.futureEventScoreVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          futureEventId: 'future_existing_bls',
          total: expect.any(Number),
          version: 'future-event-window-score@v1',
        }),
      }),
    );
    expect(prisma.futureEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'future_existing_bls' },
        data: expect.objectContaining({ currentScore: expect.any(Number) }),
      }),
    );
  });
});
