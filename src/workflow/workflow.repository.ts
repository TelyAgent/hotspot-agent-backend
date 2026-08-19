import {
  EventRecord,
  WorkflowCommandExecutionRecord,
  WorkflowCommandRecord,
  WorkflowDefinitionRecord,
  WorkflowRunRecord,
} from './workflow.types';

type MaybePromise<T> = T | Promise<T>;

export interface WorkflowRepository {
  findEnabledWorkflowDefinition(workflowId: string): MaybePromise<WorkflowDefinitionRecord | undefined>;
  saveWorkflowDefinition(definition: WorkflowDefinitionRecord): MaybePromise<WorkflowDefinitionRecord>;
  createWorkflowRun(run: WorkflowRunRecord): MaybePromise<WorkflowRunRecord>;
  finishWorkflowRun(id: string, patch: Partial<WorkflowRunRecord>): MaybePromise<WorkflowRunRecord>;
  saveWorkflowCommands(commands: WorkflowCommandRecord[]): MaybePromise<WorkflowCommandRecord[]>;
  findCommandExecutionByIdempotencyKey(
    idempotencyKey: string,
  ): MaybePromise<WorkflowCommandExecutionRecord | undefined>;
  saveCommandExecution(execution: WorkflowCommandExecutionRecord): MaybePromise<WorkflowCommandExecutionRecord>;
  findEventByNormalizedKey(normalizedEventKey: string): MaybePromise<EventRecord | undefined>;
  createEvent(input: Omit<EventRecord, 'updatedAt'>): MaybePromise<EventRecord>;
  saveEventIntake(input: {
    id: string;
    eventId?: string;
    workflowRunId: string;
    entryMode: string;
    observedAt: string;
    t0?: string;
    title: string;
    oneLineSummary: string;
    confirmationLevel: string;
    expressionBoundary: string;
    payload: unknown;
    dedupeKey: string;
  }): MaybePromise<void>;
  saveEventSourceContext(input: {
    id: string;
    eventId: string;
    workflowRunId: string;
    sourceType: string;
    payload: unknown;
  }): MaybePromise<void>;
  saveEventEvidence(input: {
    id: string;
    eventId: string;
    workflowRunId: string;
    sourceType: string;
    url?: string;
    claim: string;
    payload: unknown;
  }): MaybePromise<void>;
  saveIgnoredSignal(input: {
    id: string;
    workflowRunId: string;
    reason: string;
    sourceRefs: unknown[];
    createdAt: string;
  }): MaybePromise<void>;
}
