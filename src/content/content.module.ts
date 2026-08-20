import { Module } from '@nestjs/common';
import { ToolRegistry } from '../connectors/tool-registry';
import { createMockTwitterTools } from '../connectors/x/mock-twitter.tools';
import { createTwitterApiIoTools } from '../connectors/x/twitterapi-io.tools';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaWorkflowRepository } from '../workflow/prisma-workflow.repository';
import { WorkflowLoader } from '../workflow/workflow-loader';
import { createWorkflowModelAdapter } from '../workflow/workflow-model-adapter.factory';
import { WORKFLOW_LOADER, WORKFLOW_MODEL_ADAPTER, WORKFLOW_REPOSITORY } from '../workflow/workflow.tokens';
import { WorkflowContentAssignmentDecider } from './content-assignment-decider';
import { ContentCommandExecutor } from './content-command.executor';
import { ContentAssignmentService } from './content-assignment.service';
import { ContentController } from './content.controller';
import { PrismaContentRepository } from './prisma-content.repository';
import { ContentService } from './content.service';
import { ContentTrackingSchedulerService } from './content-tracking-scheduler.service';
import { WorkflowContentCandidateGenerator } from './content-candidate-generator';
import { WorkflowContentRiskPrechecker } from './content-risk-prechecker';
import { ToolRegistryPublicationMetricsCollector } from './publication-metrics.collector';
import {
  CONTENT_ASSIGNMENT_DECIDER,
  CONTENT_CANDIDATE_GENERATOR,
  CONTENT_PUBLICATION_METRICS_COLLECTOR,
  CONTENT_REPOSITORY,
  CONTENT_RESPONSE_STARTER,
  CONTENT_RISK_PRECHECKER,
} from './content.tokens';

@Module({
  imports: [PrismaModule],
  controllers: [ContentController],
  providers: [
    ContentService,
    ContentAssignmentService,
    ContentTrackingSchedulerService,
    ContentCommandExecutor,
    PrismaContentRepository,
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
    {
      provide: ToolRegistry,
      useFactory: () => {
        const registry = new ToolRegistry();
        const useMock = process.env.TWITTER_USE_MOCK === 'true' || !process.env.TWITTERAPI_IO_KEY;
        const tools = useMock ? createMockTwitterTools() : createTwitterApiIoTools();
        tools.forEach((tool) => registry.register(tool));
        return registry;
      },
    },
    { provide: CONTENT_ASSIGNMENT_DECIDER, useClass: WorkflowContentAssignmentDecider },
    { provide: CONTENT_CANDIDATE_GENERATOR, useClass: WorkflowContentCandidateGenerator },
    { provide: CONTENT_RISK_PRECHECKER, useClass: WorkflowContentRiskPrechecker },
    { provide: CONTENT_PUBLICATION_METRICS_COLLECTOR, useClass: ToolRegistryPublicationMetricsCollector },
    { provide: CONTENT_REPOSITORY, useExisting: PrismaContentRepository },
    { provide: CONTENT_RESPONSE_STARTER, useExisting: ContentAssignmentService },
  ],
  exports: [ContentService, ContentAssignmentService, ContentCommandExecutor, CONTENT_REPOSITORY, CONTENT_RESPONSE_STARTER],
})
export class ContentModule {}
