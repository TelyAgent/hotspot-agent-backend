import { createDefaultCollectionState } from '../../src/collection/default-collection-state';
import { InMemoryCollectionRepository } from '../../src/collection/in-memory-collection.repository';
import { CollectionSchedulerService } from '../../src/collection/collection-scheduler.service';

describe('CollectionSchedulerService', () => {
  it('executes the default X trending job when no successful run exists', async () => {
    const repository = new InMemoryCollectionRepository(createDefaultCollectionState());
    const twitterCollection = {
      runTrendingJob: jest.fn().mockResolvedValue({
        fetchRun: { id: 'run_test', status: 'success', itemCount: 0 },
        toolInput: {},
        snapshots: [],
        signals: [],
      }),
    };
    const scheduler = new CollectionSchedulerService(repository, twitterCollection as any);

    await scheduler.handleCronTick();

    expect(twitterCollection.runTrendingJob).toHaveBeenCalledWith({
      platformConfig: expect.objectContaining({ platform: 'x' }),
      jobConfig: expect.objectContaining({ id: 'x-trending-default' }),
      now: expect.any(String),
    });
  });

  it('skips enabled X trending jobs before the two-hour interval is due', async () => {
    const repository = new InMemoryCollectionRepository(createDefaultCollectionState());
    repository.saveFetchRun({
      id: 'run_recent',
      platform: 'x',
      connectorId: 'x-twitterapi-io',
      toolName: 'x.getTrending',
      sourceType: 'trend',
      status: 'success',
      input: {},
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      itemCount: 1,
    });
    const twitterCollection = {
      runTrendingJob: jest.fn().mockResolvedValue({
        fetchRun: { id: 'run_test', status: 'success', itemCount: 0 },
        toolInput: {},
        snapshots: [],
        signals: [],
      }),
    };
    const scheduler = new CollectionSchedulerService(repository, twitterCollection as any);

    await scheduler.handleCronTick();

    expect(twitterCollection.runTrendingJob).not.toHaveBeenCalled();
  });

  it('treats recent partial_success with persisted items as a collection update', async () => {
    const repository = new InMemoryCollectionRepository(createDefaultCollectionState());
    repository.saveFetchRun({
      id: 'run_recent_partial',
      platform: 'x',
      connectorId: 'x-twitterapi-io',
      toolName: 'x.getTrending',
      sourceType: 'trend',
      status: 'partial_success',
      input: {},
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      itemCount: 150,
    });
    const twitterCollection = {
      runTrendingJob: jest.fn().mockResolvedValue({
        fetchRun: { id: 'run_test', status: 'success', itemCount: 0 },
        toolInput: {},
        snapshots: [],
        signals: [],
      }),
    };
    const scheduler = new CollectionSchedulerService(repository, twitterCollection as any);

    await scheduler.handleCronTick();

    expect(twitterCollection.runTrendingJob).not.toHaveBeenCalled();
  });

  it('does not throttle on a recent failed run without persisted items', async () => {
    const repository = new InMemoryCollectionRepository(createDefaultCollectionState());
    repository.saveFetchRun({
      id: 'run_recent_failed',
      platform: 'x',
      connectorId: 'x-twitterapi-io',
      toolName: 'x.getTrending',
      sourceType: 'trend',
      status: 'failed',
      input: {},
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      itemCount: 0,
    });
    const twitterCollection = {
      runTrendingJob: jest.fn().mockResolvedValue({
        fetchRun: { id: 'run_test', status: 'success', itemCount: 0 },
        toolInput: {},
        snapshots: [],
        signals: [],
      }),
    };
    const scheduler = new CollectionSchedulerService(repository, twitterCollection as any);

    await scheduler.handleCronTick();

    expect(twitterCollection.runTrendingJob).toHaveBeenCalled();
  });

  it('executes enabled X trending jobs after the two-hour interval is due', async () => {
    const repository = new InMemoryCollectionRepository(createDefaultCollectionState());
    const old = new Date(Date.now() - 2 * 60 * 60 * 1000 - 1000).toISOString();
    repository.saveFetchRun({
      id: 'run_old',
      platform: 'x',
      connectorId: 'x-twitterapi-io',
      toolName: 'x.getTrending',
      sourceType: 'trend',
      status: 'success',
      input: {},
      startedAt: old,
      finishedAt: old,
      itemCount: 1,
    });
    const twitterCollection = {
      runTrendingJob: jest.fn().mockResolvedValue({
        fetchRun: { id: 'run_test', status: 'success', itemCount: 0 },
        toolInput: {},
        snapshots: [],
        signals: [],
      }),
    };
    const scheduler = new CollectionSchedulerService(repository, twitterCollection as any);

    await scheduler.handleCronTick();

    expect(twitterCollection.runTrendingJob).toHaveBeenCalled();
  });

  it('marks stale running fetch runs as failed before scheduling jobs', async () => {
    const repository = new InMemoryCollectionRepository(createDefaultCollectionState());
    const stale = new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString();
    const recent = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    repository.saveFetchRun({
      id: 'run_stale',
      platform: 'x',
      connectorId: 'x-twitterapi-io',
      toolName: 'x.getTrending',
      sourceType: 'trend',
      status: 'running',
      input: {},
      startedAt: stale,
      itemCount: 0,
    });
    repository.saveFetchRun({
      id: 'run_recent',
      platform: 'x',
      connectorId: 'x-twitterapi-io',
      toolName: 'x.getTrending',
      sourceType: 'trend',
      status: 'running',
      input: {},
      startedAt: recent,
      itemCount: 0,
    });
    const twitterCollection = {
      runTrendingJob: jest.fn().mockResolvedValue({
        fetchRun: { id: 'run_test', status: 'success', itemCount: 0 },
        toolInput: {},
        snapshots: [],
        signals: [],
      }),
    };
    const scheduler = new CollectionSchedulerService(repository, twitterCollection as any);

    await scheduler.handleCronTick();

    expect(repository.fetchRuns.find((run) => run.id === 'run_stale')).toEqual(
      expect.objectContaining({
        status: 'failed',
        error: 'stale_running_fetch_run_timeout',
      }),
    );
    const recentRun = repository.fetchRuns.find((run) => run.id === 'run_recent');
    expect(recentRun).toEqual(expect.objectContaining({ status: 'running' }));
    expect(recentRun?.error).toBeUndefined();
  });
});
