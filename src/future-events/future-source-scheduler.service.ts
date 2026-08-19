import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { FutureEventsService } from './future-events.service';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const SUPPORTED_AUTOMATIC_SOURCES = new Set(['bls', 'bea', 'opm', 'fomc']);

@Injectable()
export class FutureSourceSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(FutureSourceSchedulerService.name);
  private readonly runningSources = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly futureEvents: FutureEventsService,
  ) {}

  async onModuleInit() {
    await this.handleCronTick(true);
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async handleCronTick(startup = false) {
    const configs = await this.prisma.futureSourceConfig.findMany({
      where: { enabled: true },
      include: {
        runs: {
          where: { status: 'success' },
          orderBy: { startedAt: 'desc' },
          take: 1,
        },
      },
    });

    for (const config of configs) {
      if (!SUPPORTED_AUTOMATIC_SOURCES.has(config.sourceType)) {
        continue;
      }
      if (!this.resolveIntervalMs(config.schedule)) {
        this.logger.warn(`Future source ${config.sourceType} has unsupported schedule: ${JSON.stringify(config.schedule)}`);
        continue;
      }

      if (this.shouldRun(config, startup)) {
        await this.runSource(config.sourceType);
      }
    }
  }

  async runSource(sourceType: string) {
    if (this.runningSources.has(sourceType)) {
      this.logger.warn(`Future source ${sourceType} is still running, skip this tick`);
      return;
    }

    this.runningSources.add(sourceType);
    try {
      await this.futureEvents.resyncSource(sourceType);
    } catch (error) {
      this.logger.error(`Future source ${sourceType} sync failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.runningSources.delete(sourceType);
    }
  }

  private resolveIntervalMs(schedule: unknown) {
    const record = schedule && typeof schedule === 'object' && !Array.isArray(schedule) ? (schedule as Record<string, unknown>) : {};
    if (record.type === 'interval') {
      const milliseconds = Number.parseInt(String(record.value ?? ''), 10);
      return Number.isFinite(milliseconds) && milliseconds > 0 ? milliseconds : undefined;
    }
    if (record.type === 'cron' && record.value === '0 4 * * *') {
      return ONE_DAY_MS;
    }
    if (record.type === 'annual' && record.value === '0 3 1 1 *') {
      return ONE_DAY_MS;
    }
    return undefined;
  }

  private shouldRun(config: { schedule: unknown; runs: { startedAt: Date | string }[] }, startup: boolean) {
    if (config.runs.length === 0) {
      return true;
    }
    const record = config.schedule && typeof config.schedule === 'object' && !Array.isArray(config.schedule) ? (config.schedule as Record<string, unknown>) : {};
    if (record.type === 'annual') {
      return this.isAnnualDue(config.runs[0].startedAt);
    }
    if (startup) {
      return false;
    }
    const intervalMs = this.resolveIntervalMs(config.schedule);
    return intervalMs ? Date.now() - new Date(config.runs[0].startedAt).getTime() >= intervalMs : false;
  }

  private isAnnualDue(latestStartedAt: Date | string) {
    const latest = new Date(latestStartedAt);
    const now = new Date();
    return latest.getUTCFullYear() < now.getUTCFullYear();
  }
}
