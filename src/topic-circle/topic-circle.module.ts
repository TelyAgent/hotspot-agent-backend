import { Module } from '@nestjs/common';
import { CollectionModule } from '../collection/collection.module';
import { PrismaModule } from '../prisma/prisma.module';
import { WorkflowModule } from '../workflow/workflow.module';
import { TopicCircleController } from './topic-circle.controller';
import { TopicCircleClusteringWorkflowRunner } from './topic-circle-clustering.runner';
import { TopicCircleSchedulerService } from './topic-circle-scheduler.service';
import { TopicCircleService } from './topic-circle.service';

@Module({
  imports: [PrismaModule, CollectionModule, WorkflowModule],
  controllers: [TopicCircleController],
  providers: [TopicCircleService, TopicCircleSchedulerService, TopicCircleClusteringWorkflowRunner],
  exports: [TopicCircleService],
})
export class TopicCircleModule {}
