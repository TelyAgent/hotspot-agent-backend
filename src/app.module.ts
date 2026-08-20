import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AssistantModule } from './assistant/assistant.module';
import { CollectionModule } from './collection/collection.module';
import { ContentModule } from './content/content.module';
import { EventModule } from './event/event.module';
import { FutureEventsModule } from './future-events/future-events.module';
import { SettingsModule } from './settings/settings.module';
import { TopicCircleModule } from './topic-circle/topic-circle.module';
import { WorkflowModule } from './workflow/workflow.module';

@Module({
  imports: [ScheduleModule.forRoot(), CollectionModule, WorkflowModule, AssistantModule, EventModule, FutureEventsModule, SettingsModule, TopicCircleModule, ContentModule],
})
export class AppModule {}
