import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { EventController } from './event.controller';
import { EventListService } from './event-list.service';

@Module({
  imports: [PrismaModule],
  controllers: [EventController],
  providers: [EventListService],
})
export class EventModule {}
