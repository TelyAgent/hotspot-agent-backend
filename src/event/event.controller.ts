import { Controller, Get, Post, Query } from '@nestjs/common';
import { EventEvidenceEnrichmentService } from './event-evidence-enrichment.service';
import { EventListService } from './event-list.service';

@Controller('event')
export class EventController {
  constructor(
    private readonly eventList: EventListService,
    private readonly evidenceEnrichment: EventEvidenceEnrichmentService,
  ) {}

  @Get()
  list(@Query('page') page?: string, @Query('pageSize') pageSize?: string, @Query('status') status?: string, @Query('q') q?: string) {
    return this.eventList.list({ page, pageSize, status, q });
  }

  @Post('enrich-trend-evidence')
  enrichTrendEvidence(@Query('limit') limit?: string) {
    return this.evidenceEnrichment.enrichTrendEvents(limit ? Number(limit) : undefined);
  }
}
