import { Controller, Get, Post, Query } from '@nestjs/common';

@Controller('topic-circle')
export class TopicCircleCompatController {
  @Get()
  list(@Query('circle') _circle?: string) {
    return [];
  }

  @Post('collect')
  collect() {
    return { accounts: 0, collected: 0 };
  }

  @Post('summarize')
  summarize() {
    return { topics: 0 };
  }

  @Post('metrics')
  metrics() {
    return { computed: 0 };
  }

  @Post('trigger')
  trigger() {
    return { triggered: 0, refreshed: 0 };
  }
}
