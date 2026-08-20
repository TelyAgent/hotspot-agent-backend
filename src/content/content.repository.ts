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
  MaybePromise,
  OperationAccountRecord,
  PublicationMetricRecord,
  PublicationRecord,
} from './content.types';

export interface CreateAccountResponseTaskInput {
  id: string;
  eventId: string;
  accountId: string;
  workflowRunId?: string;
  assignmentCommandId?: string;
  status: AccountResponseTaskRecord['status'];
  priority: AccountResponseTaskRecord['priority'];
  skill: string;
  skillVersion: string;
  assignmentReason: string;
  riskStatus: string;
  createdAt: string;
  updatedAt: string;
}

export interface ContentRepository {
  findCommandExecutionByIdempotencyKey(
    idempotencyKey: string,
  ): MaybePromise<ContentCommandExecutionRecord | undefined>;
  saveCommandExecution(execution: ContentCommandExecutionRecord): MaybePromise<ContentCommandExecutionRecord>;
  findAccountResponseTaskByEventAndAccount(
    eventId: string,
    accountId: string,
  ): MaybePromise<AccountResponseTaskRecord | undefined>;
  createAccountResponseTask(input: CreateAccountResponseTaskInput): MaybePromise<AccountResponseTaskRecord>;
  updateAccountResponseTask(
    id: string,
    patch: Partial<
      Pick<
        AccountResponseTaskRecord,
        'status' | 'riskStatus' | 'latestCandidateBatchId' | 'updatedAt'
      >
    >,
  ): MaybePromise<AccountResponseTaskRecord>;
  listAccountResponseTasks(): MaybePromise<AccountResponseTaskRecord[]>;
  findAccountResponseTaskById(id: string): MaybePromise<AccountResponseTaskRecord | undefined>;
  listOperationAccounts(): MaybePromise<OperationAccountRecord[]>;
  findOperationAccountById(id: string): MaybePromise<OperationAccountRecord | undefined>;
  findEventContextPackById(id: string): MaybePromise<EventContextPackRecord | undefined>;
  createContentCandidateBatch(input: CreateContentCandidateBatchInput): MaybePromise<ContentCandidateBatchRecord>;
  createContentCandidates(input: CreateContentCandidateInput[]): MaybePromise<ContentCandidateRecord[]>;
  findContentCandidateById(id: string): MaybePromise<ContentCandidateRecord | undefined>;
  updateContentCandidate(
    id: string,
    patch: Partial<Pick<ContentCandidateRecord, 'status' | 'riskStatus' | 'precheckPayload'>>,
  ): MaybePromise<ContentCandidateRecord>;
  listContentCandidateBatches(taskId?: string): MaybePromise<ContentCandidateBatchRecord[]>;
  listContentCandidates(taskId?: string): MaybePromise<ContentCandidateRecord[]>;
  findPublicationRecordByUrl(url: string): MaybePromise<PublicationRecord | undefined>;
  findPublicationRecordById(id: string): MaybePromise<PublicationRecord | undefined>;
  listPublicationRecords(): MaybePromise<PublicationRecord[]>;
  updatePublicationRecord(
    id: string,
    patch: Partial<Pick<PublicationRecord, 'status' | 'trackingStatus' | 'trackingEndsAt'>>,
  ): MaybePromise<PublicationRecord>;
  createPublicationRecord(input: CreatePublicationRecordInput): MaybePromise<PublicationRecord>;
  createPublicationMetric(input: CreatePublicationMetricInput): MaybePromise<PublicationMetricRecord>;
  findLatestPublicationMetric(publicationRecordId: string): MaybePromise<PublicationMetricRecord | undefined>;
}
