import { Module } from '@nestjs/common';
import { AssistantModule } from './assistant/assistant.module';
import { CollectionModule } from './collection/collection.module';
import { EventModule } from './event/event.module';
import { WorkflowModule } from './workflow/workflow.module';

@Module({
  imports: [CollectionModule, WorkflowModule, AssistantModule, EventModule],
})
export class AppModule {}
