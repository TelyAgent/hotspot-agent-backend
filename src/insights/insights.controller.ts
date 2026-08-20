import { Controller, Get, Query } from '@nestjs/common';
import { InsightsService } from './insights.service';

@Controller('insights')
export class InsightsController {
  constructor(private readonly insightsService: InsightsService) {}

  @Get()
  getInsights(@Query('range') range = '7d') {
    return this.insightsService.getInsights(range);
  }
}
