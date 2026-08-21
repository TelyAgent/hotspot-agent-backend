import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { YoutubeService } from './youtube.service';

@Injectable()
export class YoutubeScheduler {
  private readonly logger = new Logger(YoutubeScheduler.name);

  constructor(private readonly youtube: YoutubeService) {}

  @Cron(process.env.YOUTUBE_DAILY_CRON ?? '0 8 * * *', { timeZone: 'Asia/Shanghai' })
  async runDaily() {
    const result = await this.youtube.runDailyCollection(new Date());
    this.logger.log(`YouTube 每日采集完成: ${result.status}`);
  }
}
