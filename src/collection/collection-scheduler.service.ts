import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { CollectionRepository } from './collection.repository';
import { COLLECTION_REPOSITORY } from './collection.tokens';
import { CollectionJobConfig } from './collection.types';
import { TwitterCollectionService } from './twitter-collection.service';

type TimerHandle = unknown;

interface SchedulerTimers {
  setInterval(callback: () => void | Promise<void>, milliseconds: number): TimerHandle;
  clearInterval(handle: TimerHandle): void;
}

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

@Injectable()
export class CollectionSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CollectionSchedulerService.name);
  private readonly timers: SchedulerTimers;
  private readonly handles: TimerHandle[] = [];
  private readonly runningJobs = new Set<string>();

  constructor(
    @Inject(COLLECTION_REPOSITORY)
    private readonly repository: CollectionRepository,
    private readonly twitterCollection: TwitterCollectionService,
    @Optional() timers?: SchedulerTimers,
  ) {
    this.timers = timers ?? {
      setInterval: (callback, milliseconds) => setInterval(callback, milliseconds),
      clearInterval: (handle) => clearInterval(handle as ReturnType<typeof setInterval>),
    };
  }

  async onModuleInit() {
    const jobs = await this.repository.listJobConfigs('x');
    for (const job of jobs.filter((candidate) => candidate.enabled)) {
      const intervalMs = this.resolveIntervalMs(job);
      if (!intervalMs) {
        this.logger.warn(`Collection job ${job.id} has unsupported schedule: ${JSON.stringify(job.schedule)}`);
        continue;
      }

      const handle = this.timers.setInterval(() => this.runJob(job.id), intervalMs);
      this.handles.push(handle);
      this.logger.log(`Scheduled collection job ${job.id} every ${intervalMs}ms`);
    }
  }

  onModuleDestroy() {
    for (const handle of this.handles) {
      this.timers.clearInterval(handle);
    }
    this.handles.length = 0;
  }

  async runJob(jobId: string) {
    if (this.runningJobs.has(jobId)) {
      this.logger.warn(`Collection job ${jobId} is still running, skip this tick`);
      return;
    }

    this.runningJobs.add(jobId);
    try {
      const jobConfig = await this.repository.findJobConfig(jobId);
      if (!jobConfig || !jobConfig.enabled) {
        return;
      }
      const platformConfig = await this.repository.findPlatformConfig(jobConfig.platform);
      if (!platformConfig || !platformConfig.enabled) {
        return;
      }

      await this.twitterCollection.runTrendingJob({
        platformConfig,
        jobConfig,
        now: new Date().toISOString(),
      });
    } catch (error) {
      this.logger.error(
        `Collection job ${jobId} failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.runningJobs.delete(jobId);
    }
  }

  private resolveIntervalMs(job: CollectionJobConfig) {
    if (job.schedule.type === 'interval') {
      const milliseconds = Number.parseInt(job.schedule.value, 10);
      return Number.isFinite(milliseconds) && milliseconds > 0 ? milliseconds : undefined;
    }

    if (job.schedule.type === 'cron' && job.schedule.value === '0 */2 * * *') {
      return TWO_HOURS_MS;
    }

    return undefined;
  }
}
