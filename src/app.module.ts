import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AssistantModule } from './assistant/assistant.module';
import { CollectionModule } from './collection/collection.module';
import { EventModule } from './event/event.module';
import { FutureEventsModule } from './future-events/future-events.module';
import { WorkflowModule } from './workflow/workflow.module';

@Module({
  imports: [ScheduleModule.forRoot(), CollectionModule, WorkflowModule, AssistantModule, EventModule, FutureEventsModule],
})
export class AppModule {}
