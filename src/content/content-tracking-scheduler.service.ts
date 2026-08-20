import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CONTENT_PUBLICATION_METRICS_COLLECTOR, CONTENT_REPOSITORY } from './content.tokens';
import { ContentRepository } from './content.repository';
import { ContentService } from './content.service';
import { PublicationMetricsCollector } from './publication-metrics.collector';
import { PublicationRecord } from './content.types';

const DEFAULT_TRACKING_INTERVAL_MS = 60 * 60 * 1000;

@Injectable()
export class ContentTrackingSchedulerService {
  private readonly logger = new Logger(ContentTrackingSchedulerService.name);
  private readonly runningPublications = new Set<string>();

  constructor(
    @Inject(CONTENT_REPOSITORY) private readonly contentRepository: ContentRepository,
    private readonly contentService: ContentService,
    @Inject(CONTENT_PUBLICATION_METRICS_COLLECTOR)
    private readonly metricsCollector: PublicationMetricsCollector,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async handleCronTick() {
    await this.collectDuePublications(new Date().toISOString());
  }

  async collectDuePublications(now: string) {
    const publications = await this.contentRepository.listPublicationRecords();
    let collected = 0;
    let completed = 0;
    for (const publication of publications) {
      if (publication.trackingStatus !== 'tracking') {
        continue;
      }
      if (isTrackingExpired(publication, now)) {
        await this.contentService.completeTracking(publication.id, { now });
        completed += 1;
        continue;
      }
      if (!(await this.isMetricDue(publication, now))) {
        continue;
      }
      if (this.runningPublications.has(publication.id)) {
        continue;
      }
      this.runningPublications.add(publication.id);
      try {
        const metrics = await this.metricsCollector.collect(publication, now);
        if (metrics) {
          await this.contentService.recordPublicationMetrics(publication.id, metrics);
          collected += 1;
        }
      } catch (error) {
        this.logger.warn(
          `Publication metrics collection failed for ${publication.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      } finally {
        this.runningPublications.delete(publication.id);
      }
    }
    return { collected, completed };
  }

  private async isMetricDue(publication: PublicationRecord, now: string) {
    const latest = await this.contentRepository.findLatestPublicationMetric(publication.id);
    if (!latest) {
      return true;
    }
    return new Date(now).getTime() - new Date(latest.capturedAt).getTime() >= DEFAULT_TRACKING_INTERVAL_MS;
  }
}

function isTrackingExpired(publication: PublicationRecord, now: string) {
  return publication.trackingEndsAt ? new Date(publication.trackingEndsAt).getTime() <= new Date(now).getTime() : false;
}
