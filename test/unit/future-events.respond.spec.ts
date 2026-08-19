import { FutureEventsService } from '../../src/future-events/future-events.service';

describe('FutureEventsService respond', () => {
  it('creates a unified event and links the future event for manual response', async () => {
    const futureEvent = {
      id: 'future_1',
      title: '美国 CPI 数据发布',
      subject: '美国劳工统计局',
      eventType: '经济数据发布',
      dedupeKey: 'economic-data:bls:cpi:2026-09-10',
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
      evidence: [
        {
          id: 'future_evidence_1',
          sourceType: 'bls',
          url: 'https://www.bls.gov/schedule/news_release/bls.ics',
          claims: ['BLS lists CPI release time.'],
          verifiedAt: new Date('2026-08-19T00:00:00.000Z'),
        },
      ],
      windows: [],
      heatQueries: [],
      heatBuckets: [],
      scoreVersions: [],
    };
    const prisma = {
      futureEvent: {
        findUnique: jest.fn().mockResolvedValue(futureEvent),
      },
      futureEventResponseLink: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ eventId: 'event_1' }),
      },
      workflowDefinition: {
        upsert: jest.fn().mockResolvedValue({ id: 'wdef_future_manual' }),
      },
      workflowRun: {
        create: jest.fn().mockResolvedValue({ id: 'wrun_future_manual_1' }),
      },
      event: {
        upsert: jest.fn().mockResolvedValue({ id: 'event_1' }),
      },
      eventIntake: {
        create: jest.fn().mockResolvedValue({ id: 'intake_1' }),
      },
      eventSourceContext: {
        create: jest.fn().mockResolvedValue({ id: 'context_1' }),
      },
      eventEvidence: {
        create: jest.fn().mockResolvedValue({ id: 'event_evidence_1' }),
      },
    };
    const service = new FutureEventsService(prisma as never);

    const result = await service.respond('future_1', 'content');

    expect(prisma.event.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          title: '美国 CPI 数据发布',
          status: 'responding',
          confidence: 'high',
        }),
      }),
    );
    expect(prisma.eventIntake.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entryMode: 'scheduled_manual_response',
          title: '美国 CPI 数据发布',
          confirmationLevel: 'confirmed',
        }),
      }),
    );
    expect(prisma.eventSourceContext.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sourceType: 'schedule',
        }),
      }),
    );
    expect(prisma.eventEvidence.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sourceType: 'bls',
          url: 'https://www.bls.gov/schedule/news_release/bls.ics',
        }),
      }),
    );
    expect(prisma.futureEventResponseLink.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          futureEventId: 'future_1',
          eventId: 'event_1',
          entryMode: 'scheduled_manual_response',
        }),
      }),
    );
    expect(result).toEqual({ eventId: 'event_1', next: 'content' });
  });
});
