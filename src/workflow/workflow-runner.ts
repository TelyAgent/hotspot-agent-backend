import { Inject, Injectable, Logger } from '@nestjs/common';
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
  EventWorkflowCommandsV1,
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

export interface RunTopicCircleEventFormationInput {
  observedAt?: string;
  context: Record<string, unknown>;
}

export interface WorkflowRunResult {
  run: WorkflowRunRecord;
  commands: WorkflowCommandRecord[];
  executions: WorkflowCommandExecutionRecord[];
}

@Injectable()
export class WorkflowRunner {
  private readonly logger = new Logger(WorkflowRunner.name);

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

  async runTopicCircleEventFormation(input: RunTopicCircleEventFormationInput): Promise<WorkflowRunResult> {
    const loadedWorkflow = await this.workflowLoader.load('event-formation', 'topic-circle');
    const workflowDefinition = await this.workflowRepository.saveWorkflowDefinition(loadedWorkflow.definition);
    const observedAt = input.observedAt ?? new Date().toISOString();
    const workflowRunId = `wrun_${randomUUID()}`;
    const context = {
      ...input.context,
      workflowRunId,
      observedAt,
    };
    await this.workflowRepository.createWorkflowRun({
      id: workflowRunId,
      workflowDefinitionId: workflowDefinition.id,
      status: 'running',
      startedAt: observedAt,
      input: context,
    });
    this.logTopicCircleModelInput(loadedWorkflow, workflowRunId, context);

    try {
      return await this.runLoadedWorkflow(loadedWorkflow, workflowRunId, context, { logModelIO: true });
    } catch (error) {
      this.logger.error(
        `[TopicCircleModelError] workflowId=${loadedWorkflow.definition.workflowId} runId=${workflowRunId} error=${error instanceof Error ? error.message : String(error)}`,
      );
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
    options: { logModelIO?: boolean } = {},
  ) {
    const modelOutput = await this.modelAdapter.generateStructuredOutput({
      workflowId: loadedWorkflow.definition.workflowId,
      workflowVersion: loadedWorkflow.definition.version,
      workflowMarkdown: loadedWorkflow.markdown,
      outputSchema: loadedWorkflow.outputSchema,
      context: context as WorkflowModelContext,
    });
    if (options.logModelIO) {
      this.logger.log(
        `[TopicCircleModelOutput] workflowId=${loadedWorkflow.definition.workflowId} runId=${workflowRunId} output=${this.compactJson(modelOutput)}`,
      );
    }
    const output = this.outputValidator.validate(modelOutput);
    if (options.logModelIO) {
      this.logger.log(
        `[TopicCircleValidatedOutput] workflowId=${loadedWorkflow.definition.workflowId} runId=${workflowRunId} commandCount=${output.commands.length} output=${this.compactJson(output)}`,
      );
    }
    return this.executeWorkflowOutput(workflowRunId, output);
  }

  private async executeWorkflowOutput(
    workflowRunId: string,
    output: EventWorkflowCommandsV1,
    now?: string,
    model?: string,
  ) {
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
          now,
        }),
      ),
    );
    const run = await this.workflowRepository.finishWorkflowRun(workflowRunId, {
      status: this.resolveRunStatus(executions),
      finishedAt: new Date().toISOString(),
      model,
      output,
    });
    return { run, commands, executions };
  }

  private logTopicCircleModelInput(loadedWorkflow: LoadedWorkflow, workflowRunId: string, context: object) {
    this.logger.log(
      `[TopicCircleModelInput] workflowId=${loadedWorkflow.definition.workflowId} version=${loadedWorkflow.definition.version} runId=${workflowRunId} context=${this.compactJson(context)}`,
    );
  }

  private compactJson(value: unknown) {
    const text = JSON.stringify(value);
    const limit = 8000;
    if (!text || text.length <= limit) {
      return text;
    }
    return `${text.slice(0, limit)}...<truncated ${text.length - limit} chars>`;
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
