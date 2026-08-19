import { WorkflowRepository } from './workflow.repository';
import {
  EventRecord,
  WorkflowCommandExecutionRecord,
  WorkflowCommandRecord,
  WorkflowDefinitionRecord,
  WorkflowRunRecord,
} from './workflow.types';

export class InMemoryWorkflowRepository implements WorkflowRepository {
  readonly workflowDefinitions: WorkflowDefinitionRecord[] = [];
  readonly workflowRuns: WorkflowRunRecord[] = [];
  readonly workflowCommands: WorkflowCommandRecord[] = [];
  readonly commandExecutions: WorkflowCommandExecutionRecord[] = [];
  readonly events: EventRecord[] = [];
  readonly eventIntakes: unknown[] = [];
  readonly eventSourceContexts: unknown[] = [];
  readonly eventEvidence: unknown[] = [];
  readonly ignoredSignals: unknown[] = [];

  findEnabledWorkflowDefinition(workflowId: string): WorkflowDefinitionRecord | undefined {
    return this.workflowDefinitions.find(
      (definition) => definition.workflowId === workflowId && definition.status === 'enabled',
    );
  }

  saveWorkflowDefinition(definition: WorkflowDefinitionRecord): WorkflowDefinitionRecord {
    const existingIndex = this.workflowDefinitions.findIndex(
      (existing) => existing.workflowId === definition.workflowId && existing.version === definition.version,
    );
    if (existingIndex === -1) {
      this.workflowDefinitions.push(definition);
      return definition;
    }
    this.workflowDefinitions[existingIndex] = definition;
    return definition;
  }

  createWorkflowRun(run: WorkflowRunRecord): WorkflowRunRecord {
    this.workflowRuns.push(run);
    return run;
  }

  finishWorkflowRun(id: string, patch: Partial<WorkflowRunRecord>): WorkflowRunRecord {
    const run = this.workflowRuns.find((existing) => existing.id === id);
    if (!run) {
      throw new Error(`Workflow run not found: ${id}`);
    }
    Object.assign(run, patch);
    return run;
  }

  saveWorkflowCommands(commands: WorkflowCommandRecord[]): WorkflowCommandRecord[] {
    this.workflowCommands.push(...commands);
    return commands;
  }

  findCommandExecutionByIdempotencyKey(idempotencyKey: string): WorkflowCommandExecutionRecord | undefined {
    return this.commandExecutions.find((execution) => execution.idempotencyKey === idempotencyKey);
  }

  saveCommandExecution(execution: WorkflowCommandExecutionRecord): WorkflowCommandExecutionRecord {
    this.commandExecutions.push(execution);
    return execution;
  }

  findEventByNormalizedKey(normalizedEventKey: string): EventRecord | undefined {
    return this.events.find((event) => event.normalizedEventKey === normalizedEventKey);
  }

  createEvent(input: Omit<EventRecord, 'updatedAt'>): EventRecord {
    const event = { ...input, updatedAt: input.formedAt };
    this.events.push(event);
    return event;
  }

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
  }): void {
    this.eventIntakes.push(input);
  }

  saveEventSourceContext(input: {
    id: string;
    eventId: string;
    workflowRunId: string;
    sourceType: string;
    payload: unknown;
  }): void {
    this.eventSourceContexts.push(input);
  }

  saveEventEvidence(input: {
    id: string;
    eventId: string;
    workflowRunId: string;
    sourceType: string;
    url?: string;
    claim: string;
    payload: unknown;
  }): void {
    this.eventEvidence.push(input);
  }

  saveIgnoredSignal(input: {
    id: string;
    workflowRunId: string;
    reason: string;
    sourceRefs: unknown[];
    createdAt: string;
  }): void {
    this.ignoredSignals.push(input);
  }
}
