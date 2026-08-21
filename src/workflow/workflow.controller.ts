import { Body, Controller, Get, Inject, Param, Post, Query } from '@nestjs/common';
import { CollectionRepository } from '../collection/collection.repository';
import { COLLECTION_REPOSITORY } from '../collection/collection.tokens';
import { WorkflowGovernanceService } from './workflow-governance.service';
import { WORKFLOW_LOADER } from './workflow.tokens';
import { WorkflowLoader } from './workflow-loader';
import { WorkflowRunner } from './workflow-runner';

interface RunXTrendWorkflowBody {
  observedAt?: string;
  regions?: string[];
}

interface CreateWorkflowDraftBody {
  instruction?: string;
}

@Controller('workflows')
export class WorkflowController {
  constructor(
    private readonly workflowRunner: WorkflowRunner,
    @Inject(WORKFLOW_LOADER)
    private readonly workflowLoader: WorkflowLoader,
    @Inject(COLLECTION_REPOSITORY)
    private readonly collectionRepository: CollectionRepository,
    private readonly workflowGovernance: WorkflowGovernanceService,
  ) {}

  @Get('event-formation/x-trend/document')
  async getXTrendEventFormationDocument() {
    const loadedWorkflow = await this.workflowLoader.load('x-trend-event-formation', 'event-formation');
    return {
      definition: loadedWorkflow.definition,
      markdown: loadedWorkflow.markdown,
    };
  }

  @Get(':workflowId')
  async getWorkflowDocument(@Param('workflowId') workflowId: string) {
    return this.workflowGovernance.getWorkflowDocument(workflowId, this.resolveWorkflowGroupPath(workflowId));
  }

  @Get(':workflowId/versions')
  async listWorkflowVersions(@Param('workflowId') workflowId: string) {
    return {
      workflowId,
      versions: await this.workflowGovernance.listVersions(workflowId),
    };
  }

  @Get(':workflowId/audit-logs')
  async listWorkflowAuditLogs(@Param('workflowId') workflowId: string) {
    return {
      workflowId,
      logs: await this.workflowGovernance.listAuditLogs(workflowId),
    };
  }

  @Get(':workflowId/versions/:versionId/diff')
  async getWorkflowVersionDiff(
    @Param('versionId') versionId: string,
    @Query('baseVersionId') baseVersionId?: string,
  ) {
    return this.workflowGovernance.getVersionDiff(baseVersionId ?? versionId, versionId);
  }

  @Post(':workflowId/reset')
  async resetWorkflowToSystemDefault(@Param('workflowId') workflowId: string) {
    return this.workflowGovernance.resetToSystemDefault(workflowId, this.resolveWorkflowGroupPath(workflowId), {
      actor: 'operator',
      reason: '重置为系统默认',
    });
  }

  @Post(':workflowId/drafts')
  async createWorkflowDraft(@Param('workflowId') workflowId: string, @Body() body: CreateWorkflowDraftBody) {
    return this.workflowGovernance.createAiDraft(workflowId, this.resolveWorkflowGroupPath(workflowId), {
      instruction: body.instruction ?? '',
      actor: 'operator',
    });
  }

  @Post(':workflowId/versions/:versionId/test')
  async runWorkflowShortTest(@Param('versionId') versionId: string) {
    return this.workflowGovernance.runShortTest(versionId, { actor: 'operator' });
  }

  @Post(':workflowId/versions/:versionId/activate')
  async activateWorkflowVersion(@Param('versionId') versionId: string) {
    return this.workflowGovernance.activateVersion(versionId, {
      actor: 'operator',
      reason: '短流程测试通过后启用',
    });
  }

  @Post(':workflowId/versions/:versionId/repair')
  async repairWorkflowVersion(@Param('versionId') versionId: string) {
    return this.workflowGovernance.repairAiDraft(versionId, { actor: 'operator' });
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

  private resolveWorkflowGroupPath(workflowId: string) {
    if (workflowId === 'event-formation') {
      return 'topic-circle';
    }
    return 'event-formation';
  }
}
