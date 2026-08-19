import { Controller, Get, Query } from '@nestjs/common';
import { EventListService } from './event-list.service';

@Controller('event')
export class EventController {
  constructor(private readonly eventList: EventListService) {}

  @Get()
  list(@Query('page') page?: string, @Query('pageSize') pageSize?: string, @Query('status') status?: string, @Query('q') q?: string) {
    return this.eventList.list({ page, pageSize, status, q });
  }
}
