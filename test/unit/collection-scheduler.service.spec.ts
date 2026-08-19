import { createDefaultCollectionState } from '../../src/collection/default-collection-state';
import { InMemoryCollectionRepository } from '../../src/collection/in-memory-collection.repository';
import { CollectionSchedulerService } from '../../src/collection/collection-scheduler.service';

describe('CollectionSchedulerService', () => {
  it('registers the default X trending job to run every two hours', async () => {
    const repository = new InMemoryCollectionRepository(createDefaultCollectionState());
    const twitterCollection = {
      runTrendingJob: jest.fn().mockResolvedValue({
        fetchRun: { id: 'run_test', status: 'success', itemCount: 0 },
        toolInput: {},
        snapshots: [],
        signals: [],
      }),
    };
    const timers = {
      setInterval: jest.fn().mockReturnValue('timer_x_trending'),
      clearInterval: jest.fn(),
    };
    const scheduler = new CollectionSchedulerService(repository, twitterCollection as any, timers);

    await scheduler.onModuleInit();

    expect(timers.setInterval).toHaveBeenCalledWith(expect.any(Function), 2 * 60 * 60 * 1000);
  });

  it('executes enabled X trending jobs when the timer fires', async () => {
    const repository = new InMemoryCollectionRepository(createDefaultCollectionState());
    const twitterCollection = {
      runTrendingJob: jest.fn().mockResolvedValue({
        fetchRun: { id: 'run_test', status: 'success', itemCount: 0 },
        toolInput: {},
        snapshots: [],
        signals: [],
      }),
    };
    let scheduledCallback: (() => void | Promise<void>) | undefined;
    const timers = {
      setInterval: jest.fn((callback) => {
        scheduledCallback = callback;
        return 'timer_x_trending';
      }),
      clearInterval: jest.fn(),
    };
    const scheduler = new CollectionSchedulerService(repository, twitterCollection as any, timers);

    await scheduler.onModuleInit();
    await scheduledCallback?.();

    expect(twitterCollection.runTrendingJob).toHaveBeenCalledWith({
      platformConfig: expect.objectContaining({ platform: 'x' }),
      jobConfig: expect.objectContaining({ id: 'x-trending-default' }),
      now: expect.any(String),
    });
  });

  it('clears registered timers on module destroy', async () => {
    const repository = new InMemoryCollectionRepository(createDefaultCollectionState());
    const twitterCollection = { runTrendingJob: jest.fn() };
    const timers = {
      setInterval: jest.fn().mockReturnValue('timer_x_trending'),
      clearInterval: jest.fn(),
    };
    const scheduler = new CollectionSchedulerService(repository, twitterCollection as any, timers);

    await scheduler.onModuleInit();
    scheduler.onModuleDestroy();

    expect(timers.clearInterval).toHaveBeenCalledWith('timer_x_trending');
  });
});
