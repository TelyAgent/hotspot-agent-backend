import { Inject, Injectable, Optional } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { XSearchPostsToolOutput } from '../collection/collection.types';
import { ToolRegistry } from '../connectors/tool-registry';
import { CONTENT_RESPONSE_STARTER } from '../content/content.tokens';
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

export interface ContentResponseStarter {
  startForEvent(input: {
    eventId: string;
    workflowRunId: string;
    workflowCommandId: string;
    triggerReason: string;
    now?: string;
  }): Promise<unknown>;
}

@Injectable()
export class EventCommandExecutor {
  constructor(
    @Inject(WORKFLOW_REPOSITORY) private readonly workflowRepository: WorkflowRepository,
    @Optional() @Inject(CONTENT_RESPONSE_STARTER) private readonly contentResponseStarter?: ContentResponseStarter,
    @Optional() @Inject(ToolRegistry) private readonly tools?: Pick<ToolRegistry, 'invoke'>,
  ) {}

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
        return this.executeCreateEvent(input.workflowRunId, input.workflowCommandId, input.command, input.now);
      case 'update_event_context':
        return this.executeUpdateEventContext(input.workflowRunId, input.command);
      case 'ignore':
        await this.executeIgnore(input.workflowRunId, input.command, input.now ?? new Date().toISOString());
        return undefined;
    }
  }

  private async executeCreateEvent(
    workflowRunId: string,
    workflowCommandId: string,
    command: CreateEventCommand,
    now?: string,
  ) {
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
    await this.saveEventSourceContext(workflowRunId, event.id, command.eventIntake.entryMode, command.sourceContext);
    await this.saveEvidenceRecords(workflowRunId, event.id, command.evidenceRecords);
    await this.enrichXTrendEvidence(workflowRunId, event.id, command, now);
    if (command.startResponsePipeline) {
      await this.contentResponseStarter?.startForEvent({
        eventId: event.id,
        workflowRunId,
        workflowCommandId,
        triggerReason: command.trigger.reason,
        now,
      });
    }
    return event.id;
  }

  private async executeUpdateEventContext(workflowRunId: string, command: UpdateEventContextCommand) {
    const targetEventId = await this.resolveTargetEventId(command.targetEventId);
    const sourceType =
      command.evidenceRecords?.some((record) => record.sourceType === 'x_topic_circle') ? 'x_topic_circle' : 'x_trend';
    await this.saveEventSourceContext(workflowRunId, targetEventId, sourceType, command.sourceContextPatch);
    await this.saveEvidenceRecords(workflowRunId, targetEventId, command.evidenceRecords ?? []);
    await this.enrichXTrendEvidence(workflowRunId, targetEventId, command, new Date().toISOString());
    return targetEventId;
  }

  private async resolveTargetEventId(targetEventId: string) {
    const event = await this.workflowRepository.findEventByNormalizedKey(targetEventId);
    return event?.id ?? targetEventId;
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

  private async enrichXTrendEvidence(
    workflowRunId: string,
    eventId: string,
    command: CreateEventCommand | UpdateEventContextCommand,
    now?: string,
  ) {
    if (!this.tools) return;
    const context = command.type === 'create_event' ? command.sourceContext : command.sourceContextPatch;
    if (!this.isXTrendContext(context)) return;

    const query = this.resolveTrendEvidenceQuery(command);
    if (!query) return;

    try {
      const output = await this.tools.invoke<XSearchPostsToolOutput>('x.searchPosts', {
        query,
        queryType: 'Top',
        limit: 3,
        now: now ?? new Date().toISOString(),
      });
      await Promise.all(
        output.posts.map((post) =>
          this.workflowRepository.saveEventEvidence({
            id: `event_evidence_${randomUUID()}`,
            eventId,
            workflowRunId,
            sourceType: 'x_post',
            url: post.url,
            claim: `${post.authorHandle} 发布了与「${query}」相关的代表帖。`,
            payload: {
              query,
              postId: post.postId,
              authorHandle: post.authorHandle,
              authorName: post.authorName,
              text: post.text,
              postType: post.postType,
              publishedAt: post.publishedAt,
              metrics: post.metrics,
            },
          }),
        ),
      );
    } catch (error) {
      await this.workflowRepository.saveEventEvidence({
        id: `event_evidence_${randomUUID()}`,
        eventId,
        workflowRunId,
        sourceType: 'x_trend',
        claim: `代表帖追溯失败：${error instanceof Error ? error.message : String(error)}`,
        payload: {
          query,
          error: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }

  private isXTrendContext(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const record = value as Record<string, unknown>;
    return Array.isArray(record.regions);
  }

  private resolveTrendEvidenceQuery(command: CreateEventCommand | UpdateEventContextCommand) {
    const context = command.type === 'create_event' ? command.sourceContext : command.sourceContextPatch;
    const contextQuery = this.findStringField(context, 'query') ?? this.findStringField(context, 'title');
    if (contextQuery) return contextQuery;
    return command.type === 'create_event' ? command.eventCandidate.title : undefined;
  }

  private findStringField(value: unknown, field: string): string | undefined {
    if (!value || typeof value !== 'object') return undefined;
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = this.findStringField(item, field);
        if (found) return found;
      }
      return undefined;
    }
    const record = value as Record<string, unknown>;
    const direct = record[field];
    if (typeof direct === 'string' && direct.trim().length > 0) return direct.trim();
    for (const item of Object.values(record)) {
      const found = this.findStringField(item, field);
      if (found) return found;
    }
    return undefined;
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
