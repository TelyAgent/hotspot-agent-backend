import { Module } from '@nestjs/common';
import { CollectionModule } from './collection/collection.module';
import { WorkflowModule } from './workflow/workflow.module';

@Module({
  imports: [CollectionModule, WorkflowModule],
})
export class AppModule {}
