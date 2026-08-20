import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CollectionRepository } from './collection.repository';
import { COLLECTION_REPOSITORY } from './collection.tokens';
import { CollectionJobConfig } from './collection.types';
import { TwitterCollectionService } from './twitter-collection.service';

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
const STALE_RUNNING_FETCH_RUN_MS = 6 * 60 * 60 * 1000;

@Injectable()
export class CollectionSchedulerService {
  private readonly logger = new Logger(CollectionSchedulerService.name);
  private readonly runningJobs = new Set<string>();

  constructor(
    @Inject(COLLECTION_REPOSITORY)
    private readonly repository: CollectionRepository,
    private readonly twitterCollection: TwitterCollectionService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async handleCronTick() {
    await this.markStaleRunningFetchRuns();
    const jobs = await this.repository.listJobConfigs('x');
    for (const job of jobs.filter((candidate) => candidate.enabled)) {
      if (!this.resolveIntervalMs(job)) {
        this.logger.warn(`Collection job ${job.id} has unsupported schedule: ${JSON.stringify(job.schedule)}`);
        continue;
      }
      if (await this.isJobDue(job)) {
        this.logger.log(`Collection job ${job.id} is due, start running`);
        await this.runJob(job.id);
      }
    }
  }

  private async markStaleRunningFetchRuns() {
    if (!this.repository.markStaleRunningFetchRunsFailed) {
      return;
    }

    const now = new Date();
    const markedCount = await this.repository.markStaleRunningFetchRunsFailed({
      platform: 'x',
      olderThan: new Date(now.getTime() - STALE_RUNNING_FETCH_RUN_MS).toISOString(),
      finishedAt: now.toISOString(),
      error: 'stale_running_fetch_run_timeout',
    });
    if (markedCount > 0) {
      this.logger.warn(`Marked ${markedCount} stale running X collection fetch run(s) as failed`);
    }
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
      this.logger.log(`Collection job ${jobId} finished`);
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

  private async isJobDue(job: CollectionJobConfig) {
    const intervalMs = this.resolveIntervalMs(job);
    if (!intervalMs) return false;
    const latest = await this.repository.findLatestFetchRun({
      platform: job.platform,
      toolName: job.toolName,
      sourceType: job.sourceType,
      status: ['success', 'partial_success'],
    });
    if (!latest) return true;
    return Date.now() - new Date(latest.startedAt).getTime() >= intervalMs;
  }
}
