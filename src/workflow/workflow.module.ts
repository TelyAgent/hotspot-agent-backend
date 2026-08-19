import { Module, forwardRef } from '@nestjs/common';
import { CollectionModule } from '../collection/collection.module';
import { PrismaModule } from '../prisma/prisma.module';
import { EventCommandExecutor } from './event-command.executor';
import { PrismaWorkflowRepository } from './prisma-workflow.repository';
import { WorkflowController } from './workflow.controller';
import { WorkflowLoader } from './workflow-loader';
import { createWorkflowModelAdapter } from './workflow-model-adapter.factory';
import { WorkflowOutputValidator } from './workflow-output-validator';
import { WorkflowRunner } from './workflow-runner';
import {
  EVENT_COMMAND_EXECUTOR,
  WORKFLOW_LOADER,
  WORKFLOW_MODEL_ADAPTER,
  WORKFLOW_REPOSITORY,
} from './workflow.tokens';
import { XTrendContextBuilder } from './x-trend-context.builder';

@Module({
  imports: [PrismaModule, forwardRef(() => CollectionModule)],
  controllers: [WorkflowController],
  providers: [
    PrismaWorkflowRepository,
    {
      provide: WORKFLOW_REPOSITORY,
      useExisting: PrismaWorkflowRepository,
    },
    {
      provide: WORKFLOW_LOADER,
      useFactory: () => new WorkflowLoader(process.cwd()),
    },
    {
      provide: WORKFLOW_MODEL_ADAPTER,
      useFactory: () => createWorkflowModelAdapter(),
    },
    WorkflowOutputValidator,
    XTrendContextBuilder,
    EventCommandExecutor,
    {
      provide: EVENT_COMMAND_EXECUTOR,
      useExisting: EventCommandExecutor,
    },
    WorkflowRunner,
  ],
  exports: [WorkflowRunner],
})
export class WorkflowModule {}
