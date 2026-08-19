import { FutureEventsService } from '../../src/future-events/future-events.service';

describe('FutureEventsService source defaults', () => {
  it('seeds the five first-release future event sources on module init', async () => {
    const prisma = {
      futureSourceConfig: {
        upsert: jest.fn().mockResolvedValue({}),
      },
    };
    const service = new FutureEventsService(prisma as never);

    await service.onModuleInit();

    expect(prisma.futureSourceConfig.upsert).toHaveBeenCalledTimes(5);
    expect(prisma.futureSourceConfig.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { sourceType: 'bls' },
        create: expect.objectContaining({
          sourceType: 'bls',
          displayName: 'BLS 发布日历',
          connectorId: 'future.bls.fetchIcs',
          enabled: true,
        }),
      }),
    );
    expect(prisma.futureSourceConfig.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { sourceType: 'manual' },
        create: expect.objectContaining({
          sourceType: 'manual',
          connectorId: 'future.manual.import',
        }),
      }),
    );
  });
});
