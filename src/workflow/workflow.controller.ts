import { Body, Controller, Get, Inject, Post } from '@nestjs/common';
import { CollectionRepository } from '../collection/collection.repository';
import { COLLECTION_REPOSITORY } from '../collection/collection.tokens';
import { WORKFLOW_LOADER } from './workflow.tokens';
import { WorkflowLoader } from './workflow-loader';
import { WorkflowRunner } from './workflow-runner';

interface RunXTrendWorkflowBody {
  observedAt?: string;
  regions?: string[];
}

@Controller('workflows')
export class WorkflowController {
  constructor(
    private readonly workflowRunner: WorkflowRunner,
    @Inject(WORKFLOW_LOADER)
    private readonly workflowLoader: WorkflowLoader,
    @Inject(COLLECTION_REPOSITORY)
    private readonly collectionRepository: CollectionRepository,
  ) {}

  @Get('event-formation/x-trend/document')
  async getXTrendEventFormationDocument() {
    const loadedWorkflow = await this.workflowLoader.load('x-trend-event-formation', 'event-formation');
    return {
      definition: loadedWorkflow.definition,
      markdown: loadedWorkflow.markdown,
    };
  }

  @Post('event-formation/x-trend/run')
  async runXTrendEventFormation(@Body() body: RunXTrendWorkflowBody = {}) {
    const regions = body.regions?.length ? body.regions : await this.resolveDefaultRegions();
    const result = await this.workflowRunner.runXTrendEventFormation({
      observedAt: body.observedAt,
      regions,
    });

    return {
      workflowRunId: result.run.id,
      status: result.run.status,
      commandCount: result.commands.length,
      executionCount: result.executions.length,
      eventIds: result.executions.flatMap((execution) => (execution.targetEventId ? [execution.targetEventId] : [])),
      regions,
    };
  }

  private async resolveDefaultRegions() {
    const config = await this.collectionRepository.findPlatformConfig('x');
    return config?.variables.regions?.length ? config.variables.regions : config?.defaultRegions ?? ['global'];
  }
}
