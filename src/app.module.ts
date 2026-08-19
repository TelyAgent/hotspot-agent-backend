import { Module } from '@nestjs/common';
import { AssistantModule } from './assistant/assistant.module';
import { CollectionModule } from './collection/collection.module';
import { WorkflowModule } from './workflow/workflow.module';

@Module({
  imports: [CollectionModule, WorkflowModule, AssistantModule],
})
export class AppModule {}
