import { Controller, Get, Post, Query } from '@nestjs/common';
import { TopicCircleService } from './topic-circle.service';

@Controller('topic-circle')
export class TopicCircleController {
  constructor(private readonly service: TopicCircleService) {}

  @Get()
  candidates(@Query('circle') circle?: string) {
    return this.service.listCandidates(circle);
  }

  @Post('collect')
  async collect(@Query('circle') circle?: string) {
    const result = await this.service.collectAll(undefined, circle);
    const fetchRun = result.fetchRun;
    return {
      accounts: fetchRun.accountCount,
      collected: fetchRun.itemCount,
      status: fetchRun.status,
      fetchRunId: fetchRun.id,
      error: fetchRun.error,
      analysis: result.analysis ?? null,
    };
  }

  @Get('topics')
  topics() {
    return this.service.listMonitorTopics();
  }

  @Get('status')
  status() {
    return this.service.getPipelineStatus();
  }

  @Post('summarize')
  summarize() {
    return this.service.summarizeTopics();
  }

  @Post('metrics')
  metrics() {
    return this.service.computeMetrics();
  }

  @Post('trigger')
  trigger() {
    return this.service.evaluateTriggers();
  }
}
