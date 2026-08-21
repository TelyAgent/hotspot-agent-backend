import { Module } from '@nestjs/common';
import { CollectionModule } from '../collection/collection.module';
import { PrismaModule } from '../prisma/prisma.module';
import { EventController } from './event.controller';
import { EventEvidenceEnrichmentService } from './event-evidence-enrichment.service';
import { EventListService } from './event-list.service';

@Module({
  imports: [PrismaModule, CollectionModule],
  controllers: [EventController],
  providers: [EventListService, EventEvidenceEnrichmentService],
})
export class EventModule {}
