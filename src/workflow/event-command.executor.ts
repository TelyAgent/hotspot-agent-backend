import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { WORKFLOW_REPOSITORY } from './workflow.tokens';
import { WorkflowRepository } from './workflow.repository';
import {
  CreateEventCommand,
  EventCommand,
  IgnoreSignalCommand,
  UpdateEventContextCommand,
  WorkflowCommandExecutionRecord,
} from './workflow.types';

export interface ExecuteEventCommandInput {
  workflowRunId: string;
  workflowCommandId: string;
  command: EventCommand;
  now?: string;
}

@Injectable()
export class EventCommandExecutor {
  constructor(@Inject(WORKFLOW_REPOSITORY) private readonly workflowRepository: WorkflowRepository) {}

  async execute(input: ExecuteEventCommandInput): Promise<WorkflowCommandExecutionRecord> {
    const existingExecution = await this.workflowRepository.findCommandExecutionByIdempotencyKey(
      input.command.idempotencyKey,
    );
    if (existingExecution) {
      return this.saveExecution(input, {
        status: 'skipped',
        targetEventId: existingExecution.targetEventId,
      });
    }

    try {
      const targetEventId = await this.executeCommand(input);
      return this.saveExecution(input, { status: 'success', targetEventId });
    } catch (error) {
      return this.saveExecution(input, {
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async executeCommand(input: ExecuteEventCommandInput): Promise<string | undefined> {
    switch (input.command.type) {
      case 'create_event':
        return this.executeCreateEvent(input.workflowRunId, input.command);
      case 'update_event_context':
        return this.executeUpdateEventContext(input.workflowRunId, input.command);
      case 'ignore':
        await this.executeIgnore(input.workflowRunId, input.command, input.now ?? new Date().toISOString());
        return undefined;
    }
  }

  private async executeCreateEvent(workflowRunId: string, command: CreateEventCommand) {
    const event =
      (await this.workflowRepository.findEventByNormalizedKey(command.eventCandidate.normalizedEventKey)) ??
      (await this.workflowRepository.createEvent({
        id: `event_${randomUUID()}`,
        title: command.eventCandidate.title,
        normalizedEventKey: command.eventCandidate.normalizedEventKey,
        status: command.startResponsePipeline ? 'responding' : 'active',
        confidence: command.eventCandidate.confidence,
        formedAt: command.trigger.t0,
      }));

    await this.saveEventIntake(workflowRunId, event.id, command);
    await this.saveEventSourceContext(workflowRunId, event.id, 'x_trend', command.sourceContext);
    await this.saveEvidenceRecords(workflowRunId, event.id, command.evidenceRecords);
    return event.id;
  }

  private async executeUpdateEventContext(workflowRunId: string, command: UpdateEventContextCommand) {
    await this.saveEventSourceContext(workflowRunId, command.targetEventId, 'x_trend', command.sourceContextPatch);
    await this.saveEvidenceRecords(workflowRunId, command.targetEventId, command.evidenceRecords ?? []);
    return command.targetEventId;
  }

  private async executeIgnore(workflowRunId: string, command: IgnoreSignalCommand, now: string) {
    await this.workflowRepository.saveIgnoredSignal({
      id: `ignored_${randomUUID()}`,
      workflowRunId,
      reason: command.reason,
      sourceRefs: command.sourceRefs,
      createdAt: now,
    });
  }

  private async saveEventIntake(workflowRunId: string, eventId: string, command: CreateEventCommand) {
    const intake = command.eventIntake;
    await this.workflowRepository.saveEventIntake({
      id: `event_intake_${randomUUID()}`,
      eventId,
      workflowRunId,
      entryMode: intake.entryMode,
      observedAt: intake.observedAt,
      t0: intake.t0,
      title: intake.title,
      oneLineSummary: intake.oneLineSummary,
      confirmationLevel: intake.confirmationLevel,
      expressionBoundary: intake.expressionBoundary,
      payload: intake,
      dedupeKey: intake.dedupeKey,
    });
  }

  private async saveEventSourceContext(
    workflowRunId: string,
    eventId: string,
    sourceType: string,
    payload: unknown,
  ) {
    await this.workflowRepository.saveEventSourceContext({
      id: `event_source_context_${randomUUID()}`,
      eventId,
      workflowRunId,
      sourceType,
      payload,
    });
  }

  private async saveEvidenceRecords(
    workflowRunId: string,
    eventId: string,
    records: CreateEventCommand['evidenceRecords'],
  ) {
    await Promise.all(
      records.map((record) =>
        this.workflowRepository.saveEventEvidence({
          id: `event_evidence_${randomUUID()}`,
          eventId,
          workflowRunId,
          sourceType: record.sourceType,
          url: record.url,
          claim: record.claim,
          payload: record.payload ?? {},
        }),
      ),
    );
  }

  private async saveExecution(
    input: ExecuteEventCommandInput,
    patch: Pick<WorkflowCommandExecutionRecord, 'status'> &
      Partial<Pick<WorkflowCommandExecutionRecord, 'targetEventId' | 'error'>>,
  ) {
    const execution: WorkflowCommandExecutionRecord = {
      id: `cmd_exec_${randomUUID()}`,
      workflowCommandId: input.workflowCommandId,
      workflowRunId: input.workflowRunId,
      commandType: input.command.type,
      idempotencyKey: input.command.idempotencyKey,
      status: patch.status,
      targetEventId: patch.targetEventId,
      error: patch.error,
      createdAt: input.now ?? new Date().toISOString(),
    };
    return this.workflowRepository.saveCommandExecution(execution);
  }
}
