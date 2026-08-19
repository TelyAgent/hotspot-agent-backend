import { FutureSourceSchedulerService } from '../../src/future-events/future-source-scheduler.service';

describe('FutureSourceSchedulerService', () => {
  it('runs BLS source on startup when no successful run exists', async () => {
    const prisma = {
      futureSourceConfig: {
        findMany: jest.fn().mockResolvedValue([
          {
            sourceType: 'bls',
            enabled: true,
            schedule: { type: 'cron', value: '0 4 * * *' },
            runs: [],
          },
          {
            sourceType: 'manual',
            enabled: true,
            schedule: { type: 'manual', value: 'manual' },
            runs: [],
          },
        ]),
      },
    };
    const futureEvents = {
      resyncSource: jest.fn().mockResolvedValue({ status: 'success', source: 'bls', itemCount: 1 }),
    };
    const scheduler = new FutureSourceSchedulerService(prisma as never, futureEvents as never);

    await scheduler.onModuleInit();

    expect(futureEvents.resyncSource).toHaveBeenCalledWith('bls');
  });

  it('skips annual OPM sources on startup after a current-year success', async () => {
    const prisma = {
      futureSourceConfig: {
        findMany: jest.fn().mockResolvedValue([
          {
            sourceType: 'opm',
            enabled: true,
            schedule: { type: 'annual', value: '0 3 1 1 *' },
            runs: [{ startedAt: new Date('2026-01-01T03:00:00.000Z') }],
          },
        ]),
      },
    };
    const futureEvents = {
      resyncSource: jest.fn().mockResolvedValue({ status: 'success', source: 'opm', itemCount: 1 }),
    };
    const scheduler = new FutureSourceSchedulerService(prisma as never, futureEvents as never);

    await scheduler.onModuleInit();

    expect(futureEvents.resyncSource).not.toHaveBeenCalled();
  });

  it('runs daily sources on cron tick when the latest successful run is older than one day', async () => {
    const prisma = {
      futureSourceConfig: {
        findMany: jest.fn().mockResolvedValue([
          {
            sourceType: 'bea',
            enabled: true,
            schedule: { type: 'cron', value: '0 4 * * *' },
            runs: [{ startedAt: new Date(Date.now() - 24 * 60 * 60 * 1000 - 1000) }],
          },
        ]),
      },
    };
    const futureEvents = {
      resyncSource: jest.fn().mockResolvedValue({ status: 'success', source: 'bea', itemCount: 1 }),
    };
    const scheduler = new FutureSourceSchedulerService(prisma as never, futureEvents as never);

    await scheduler.handleCronTick();

    expect(futureEvents.resyncSource).toHaveBeenCalledWith('bea');
  });

  it('skips daily sources on cron tick before the one-day interval is due', async () => {
    const prisma = {
      futureSourceConfig: {
        findMany: jest.fn().mockResolvedValue([
          {
            sourceType: 'bea',
            enabled: true,
            schedule: { type: 'cron', value: '0 4 * * *' },
            runs: [{ startedAt: new Date() }],
          },
        ]),
      },
    };
    const futureEvents = {
      resyncSource: jest.fn().mockResolvedValue({ status: 'success', source: 'bea', itemCount: 1 }),
    };
    const scheduler = new FutureSourceSchedulerService(prisma as never, futureEvents as never);

    await scheduler.handleCronTick();

    expect(futureEvents.resyncSource).not.toHaveBeenCalled();
  });
});
