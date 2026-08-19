import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { FutureEventsService } from './future-events.service';

@Controller('future-events')
export class FutureEventsController {
  constructor(private readonly service: FutureEventsService) {}

  @Get()
  list(@Query() query: { month?: string; unassigned?: string; confirmationLevel?: string; sourceType?: string; actionScoreMin?: string }) {
    return this.service.list({
      month: query.month,
      unassigned: query.unassigned === 'true',
      confirmationLevel: query.confirmationLevel,
      sourceType: query.sourceType,
      actionScoreMin: query.actionScoreMin,
    });
  }

  @Get('sources/status')
  sourceStatus() {
    return this.service.sourceStatus();
  }

  @Post('import')
  import(@Body() body: { csv?: string }) {
    return this.service.importCsv(body.csv ?? '');
  }

  @Post('sources/:source/resync')
  resync(@Param('source') source: string) {
    return this.service.resyncSource(source);
  }

  @Post(':id/respond')
  respond(@Param('id') id: string, @Body() body: { kind?: string }) {
    return this.service.respond(id, body.kind ?? 'content');
  }

  @Get(':id/heat')
  heat(@Param('id') id: string) {
    return this.service.heat(id);
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.service.detail(id);
  }

  @Post()
  create(@Body() body: unknown) {
    return this.service.createManual(body);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() body: unknown) {
    return this.service.updateManual(id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
