import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { TopicCircleService } from './topic-circle.service';

@Injectable()
export class TopicCircleSchedulerService {
  private readonly logger = new Logger(TopicCircleSchedulerService.name);
  private running = false;

  constructor(private readonly topicCircleService: TopicCircleService) {}

  @Cron('0 */3 * * *')
  async handleCronTick() {
    if (this.running) {
      this.logger.warn('Topic circle collection is still running, skip this tick');
      return;
    }

    this.running = true;
    try {
      const result = await this.topicCircleService.collectAll();
      this.logger.log(
        `Topic circle collection finished status=${result.fetchRun.status}, itemCount=${result.fetchRun.itemCount}, analysis=${JSON.stringify(result.analysis ?? null)}`,
      );
    } catch (error) {
      this.logger.error(`Topic circle collection failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.running = false;
    }
  }
}
