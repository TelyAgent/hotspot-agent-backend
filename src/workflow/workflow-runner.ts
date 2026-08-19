import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  EVENT_COMMAND_EXECUTOR,
  WORKFLOW_LOADER,
  WORKFLOW_MODEL_ADAPTER,
  WORKFLOW_REPOSITORY,
} from './workflow.tokens';
import { EventCommandExecutor } from './event-command.executor';
import { LoadedWorkflow, WorkflowLoader } from './workflow-loader';
import { WorkflowModelAdapter, WorkflowModelContext } from './workflow-model.adapter';
import { WorkflowOutputValidator } from './workflow-output-validator';
import { WorkflowRepository } from './workflow.repository';
import {
  WorkflowCommandExecutionRecord,
  WorkflowCommandRecord,
  WorkflowRunRecord,
  WorkflowRunStatus,
} from './workflow.types';
import { XTrendContextBuilder } from './x-trend-context.builder';

export interface RunXTrendEventFormationInput {
  observedAt?: string;
  regions: string[];
}

export interface WorkflowRunResult {
  run: WorkflowRunRecord;
  commands: WorkflowCommandRecord[];
  executions: WorkflowCommandExecutionRecord[];
}

@Injectable()
export class WorkflowRunner {
  constructor(
    @Inject(WORKFLOW_REPOSITORY) private readonly workflowRepository: WorkflowRepository,
    @Inject(WORKFLOW_LOADER) private readonly workflowLoader: WorkflowLoader,
    private readonly xTrendContextBuilder: XTrendContextBuilder,
    @Inject(WORKFLOW_MODEL_ADAPTER) private readonly modelAdapter: WorkflowModelAdapter,
    private readonly outputValidator: WorkflowOutputValidator,
    @Inject(EVENT_COMMAND_EXECUTOR) private readonly eventCommandExecutor: EventCommandExecutor,
  ) {}

  async runXTrendEventFormation(input: RunXTrendEventFormationInput): Promise<WorkflowRunResult> {
    const loadedWorkflow = await this.workflowLoader.load('x-trend-event-formation');
    const workflowDefinition = await this.workflowRepository.saveWorkflowDefinition(loadedWorkflow.definition);
    const observedAt = input.observedAt ?? new Date().toISOString();
    const workflowRunId = `wrun_${randomUUID()}`;
    const context = await this.xTrendContextBuilder.build({
      workflowRunId,
      observedAt,
      platform: 'x',
      sourceType: 'trend',
      regions: input.regions,
    });
    await this.workflowRepository.createWorkflowRun({
      id: workflowRunId,
      workflowDefinitionId: workflowDefinition.id,
      status: 'running',
      startedAt: observedAt,
      input: context,
    });

    try {
      return await this.runLoadedWorkflow(loadedWorkflow, workflowRunId, context);
    } catch (error) {
      const failedRun = await this.workflowRepository.finishWorkflowRun(workflowRunId, {
        status: 'failed',
        finishedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
      });
      return { run: failedRun, commands: [], executions: [] };
    }
  }

  private async runLoadedWorkflow(
    loadedWorkflow: LoadedWorkflow,
    workflowRunId: string,
    context: object,
  ) {
    const modelOutput = await this.modelAdapter.generateCommands({
      workflowId: loadedWorkflow.definition.workflowId,
      workflowVersion: loadedWorkflow.definition.version,
      workflowMarkdown: loadedWorkflow.markdown,
      outputSchema: loadedWorkflow.outputSchema,
      context: context as WorkflowModelContext,
    });
    const output = this.outputValidator.validate(modelOutput);
    const commands = await this.workflowRepository.saveWorkflowCommands(
      output.commands.map((command): WorkflowCommandRecord => ({
        id: `cmd_${randomUUID()}`,
        workflowRunId,
        type: command.type,
        idempotencyKey: command.idempotencyKey,
        payload: command,
        createdAt: new Date().toISOString(),
      })),
    );
    const executions = await Promise.all(
      commands.map((command) =>
        this.eventCommandExecutor.execute({
          workflowRunId,
          workflowCommandId: command.id,
          command: command.payload,
        }),
      ),
    );
    const run = await this.workflowRepository.finishWorkflowRun(workflowRunId, {
      status: this.resolveRunStatus(executions),
      finishedAt: new Date().toISOString(),
      output,
    });
    return { run, commands, executions };
  }

  private resolveRunStatus(executions: WorkflowCommandExecutionRecord[]): WorkflowRunStatus {
    if (executions.length === 0) {
      return 'success';
    }
    const failedCount = executions.filter((execution) => execution.status === 'failed').length;
    if (failedCount === 0) {
      return 'success';
    }
    return failedCount === executions.length ? 'failed' : 'partial_success';
  }
}
