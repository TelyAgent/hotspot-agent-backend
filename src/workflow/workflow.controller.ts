import { Body, Controller, Inject, Post } from '@nestjs/common';
import { CollectionRepository } from '../collection/collection.repository';
import { COLLECTION_REPOSITORY } from '../collection/collection.tokens';
import { WorkflowRunner } from './workflow-runner';

interface RunXTrendWorkflowBody {
  observedAt?: string;
  regions?: string[];
}

@Controller('workflows')
export class WorkflowController {
  constructor(
    private readonly workflowRunner: WorkflowRunner,
    @Inject(COLLECTION_REPOSITORY)
    private readonly collectionRepository: CollectionRepository,
  ) {}

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
