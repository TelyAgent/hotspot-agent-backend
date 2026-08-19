import { FutureEventsService } from '../../src/future-events/future-events.service';

describe('FutureEventsService manual import', () => {
  it('rejects manual events without source url', async () => {
    const service = new FutureEventsService({} as never);

    await expect(service.createManual({ title: '行业大会' })).rejects.toThrow('sourceUrl is required');
  });

  it('stores manual input as source item, future event, and evidence', async () => {
    const prisma = createPrismaDouble();
    const service = new FutureEventsService(prisma as never);

    const result = await service.createManual({
      title: '预测市场峰会',
      subject: 'Polymarket',
      eventType: '行业大会',
      factTime: '2026-09-20T00:00:00.000Z',
      timezone: 'UTC',
      sourceUrl: 'https://example.com/summit',
      attentionReason: '官方公布活动日程',
    });

    expect(prisma.futureSourceRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ sourceType: 'manual', status: 'success', itemCount: 1 }),
      }),
    );
    expect(prisma.futureSourceItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sourceType: 'manual',
          sourceUrl: 'https://example.com/summit',
          title: '预测市场峰会',
        }),
      }),
    );
    expect(prisma.futureEvent.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          confirmationLevel: 'needs_verification',
          expressionBoundary: 'internal_only',
          currentScore: 0,
        }),
      }),
    );
    expect(prisma.futureEventEvidence.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sourceType: 'manual',
          url: 'https://example.com/summit',
          claims: ['官方公布活动日程'],
        }),
      }),
    );
    expect(result).toMatchObject({ title: '预测市场峰会', expressionBoundary: 'internal_only' });
  });

  it('imports valid csv rows and skips invalid rows', async () => {
    const prisma = createPrismaDouble();
    const service = new FutureEventsService(prisma as never);

    const result = await service.importCsv(
      [
        'title,subject,eventType,factTime,sourceUrl',
        '预测市场峰会,Polymarket,行业大会,2026-09-20,https://example.com/summit',
        '缺少来源链接,Polymarket,行业大会,2026-09-21,',
      ].join('\n'),
    );

    expect(result).toMatchObject({ imported: 1, skipped: 1 });
  });
});

function createPrismaDouble() {
  const eventRow = {
    id: 'future_manual_1',
    title: '预测市场峰会',
    subject: 'Polymarket',
    eventType: '行业大会',
    factTime: new Date('2026-09-20T00:00:00.000Z'),
    factEndTime: null,
    timezone: 'UTC',
    schedulePrecision: 'date',
    confirmationLevel: 'needs_verification',
    expressionBoundary: 'internal_only',
    relatedEventId: null,
    entryMode: null,
    ruleVersion: 'manual@v1',
    createdAt: new Date('2026-08-19T00:00:00.000Z'),
    updatedAt: new Date('2026-08-19T00:00:00.000Z'),
    evidence: [],
    windows: [],
    heatQueries: [],
    heatBuckets: [],
    scoreVersions: [],
  };
  return {
    futureSourceRun: {
      create: jest.fn().mockResolvedValue({ id: 'fsrun_1' }),
    },
    futureSourceItem: {
      create: jest.fn().mockResolvedValue({ id: 'fsitem_1' }),
    },
    futureEvent: {
      upsert: jest.fn().mockResolvedValue(eventRow),
    },
    futureEventEvidence: {
      create: jest.fn().mockResolvedValue({ id: 'evidence_1' }),
    },
  };
}
