import {
  AccountResponseTaskRecord,
  ContentCommandExecutionRecord,
  ContentCandidateBatchRecord,
  ContentCandidateRecord,
  CreateContentCandidateBatchInput,
  CreateContentCandidateInput,
  CreatePublicationMetricInput,
  CreatePublicationRecordInput,
  EventContextPackRecord,
  OperationAccountRecord,
  PublicationMetricRecord,
  PublicationRecord,
} from './content.types';
import { ContentRepository, CreateAccountResponseTaskInput } from './content.repository';

export class InMemoryContentRepository implements ContentRepository {
  readonly commandExecutions: ContentCommandExecutionRecord[] = [];
  readonly accountResponseTasks: AccountResponseTaskRecord[] = [];
  readonly contentCandidateBatches: ContentCandidateBatchRecord[] = [];
  readonly contentCandidates: ContentCandidateRecord[] = [];
  readonly publicationRecords: PublicationRecord[] = [];
  readonly publicationMetrics: PublicationMetricRecord[] = [];
  readonly operationAccounts: OperationAccountRecord[] = [];
  readonly events: EventContextPackRecord[] = [];

  findCommandExecutionByIdempotencyKey(idempotencyKey: string): ContentCommandExecutionRecord | undefined {
    return this.commandExecutions.find(
      (execution) => execution.idempotencyKey === idempotencyKey && execution.status === 'success',
    );
  }

  saveCommandExecution(execution: ContentCommandExecutionRecord): ContentCommandExecutionRecord {
    this.commandExecutions.push(execution);
    return execution;
  }

  findAccountResponseTaskByEventAndAccount(
    eventId: string,
    accountId: string,
  ): AccountResponseTaskRecord | undefined {
    return this.accountResponseTasks.find((task) => task.eventId === eventId && task.accountId === accountId);
  }

  createAccountResponseTask(input: CreateAccountResponseTaskInput): AccountResponseTaskRecord {
    const existing = this.findAccountResponseTaskByEventAndAccount(input.eventId, input.accountId);
    if (existing) {
      return existing;
    }
    const task = { ...input };
    this.accountResponseTasks.push(task);
    return task;
  }

  updateAccountResponseTask(
    id: string,
    patch: Partial<AccountResponseTaskRecord>,
  ): AccountResponseTaskRecord {
    const task = this.findAccountResponseTaskById(id);
    if (!task) {
      throw new Error(`Account response task not found: ${id}`);
    }
    Object.assign(task, patch);
    return task;
  }

  listAccountResponseTasks(): AccountResponseTaskRecord[] {
    return [...this.accountResponseTasks];
  }

  findAccountResponseTaskById(id: string): AccountResponseTaskRecord | undefined {
    return this.accountResponseTasks.find((task) => task.id === id);
  }

  listOperationAccounts(): OperationAccountRecord[] {
    return [...this.operationAccounts];
  }

  findOperationAccountById(id: string): OperationAccountRecord | undefined {
    return this.operationAccounts.find((account) => account.id === id);
  }

  findEventContextPackById(id: string): EventContextPackRecord | undefined {
    return this.events.find((event) => event.eventId === id);
  }

  createContentCandidateBatch(input: CreateContentCandidateBatchInput): ContentCandidateBatchRecord {
    this.contentCandidateBatches.push(input);
    return input;
  }

  createContentCandidates(input: CreateContentCandidateInput[]): ContentCandidateRecord[] {
    this.contentCandidates.push(...input);
    return input;
  }

  findContentCandidateById(id: string): ContentCandidateRecord | undefined {
    return this.contentCandidates.find((candidate) => candidate.id === id);
  }

  updateContentCandidate(
    id: string,
    patch: Partial<ContentCandidateRecord>,
  ): ContentCandidateRecord {
    const candidate = this.findContentCandidateById(id);
    if (!candidate) {
      throw new Error(`Content candidate not found: ${id}`);
    }
    Object.assign(candidate, patch);
    return candidate;
  }

  listContentCandidateBatches(taskId?: string): ContentCandidateBatchRecord[] {
    return this.contentCandidateBatches.filter((batch) => !taskId || batch.taskId === taskId);
  }

  listContentCandidates(taskId?: string): ContentCandidateRecord[] {
    return this.contentCandidates.filter((candidate) => !taskId || candidate.taskId === taskId);
  }

  findPublicationRecordByUrl(url: string): PublicationRecord | undefined {
    return this.publicationRecords.find((record) => record.url === url);
  }

  findPublicationRecordById(id: string): PublicationRecord | undefined {
    return this.publicationRecords.find((record) => record.id === id);
  }

  listPublicationRecords(): PublicationRecord[] {
    return [...this.publicationRecords];
  }

  updatePublicationRecord(id: string, patch: Partial<PublicationRecord>): PublicationRecord {
    const record = this.findPublicationRecordById(id);
    if (!record) {
      throw new Error(`Publication record not found: ${id}`);
    }
    Object.assign(record, patch);
    return record;
  }

  createPublicationRecord(input: CreatePublicationRecordInput): PublicationRecord {
    this.publicationRecords.push(input);
    return input;
  }

  createPublicationMetric(input: CreatePublicationMetricInput): PublicationMetricRecord {
    this.publicationMetrics.push(input);
    return input;
  }

  findLatestPublicationMetric(publicationRecordId: string): PublicationMetricRecord | undefined {
    return this.publicationMetrics
      .filter((metric) => metric.publicationRecordId === publicationRecordId)
      .sort((a, b) => new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime())[0];
  }
}
