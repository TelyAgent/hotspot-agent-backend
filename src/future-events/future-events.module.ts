import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { BlsIcsConnector } from './connectors/bls-ics.connector';
import { BeaScheduleConnector, FomcCalendarConnector, OpmHolidaysConnector } from './connectors/official-html.connector';
import { FutureEventsController } from './future-events.controller';
import { FutureEventsService } from './future-events.service';
import { FutureSourceSchedulerService } from './future-source-scheduler.service';

@Module({
  imports: [PrismaModule],
  controllers: [FutureEventsController],
  providers: [BlsIcsConnector, BeaScheduleConnector, OpmHolidaysConnector, FomcCalendarConnector, FutureEventsService, FutureSourceSchedulerService],
  exports: [FutureEventsService],
})
export class FutureEventsModule {}
