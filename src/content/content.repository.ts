import {
  ContentTaskRecord,
  ContentCommandExecutionRecord,
  ContentCandidateBatchRecord,
  ContentCandidateRecord,
  CreateContentCandidateBatchInput,
  CreateContentCandidateInput,
  CreatePublicationMetricInput,
  CreatePublicationRecordInput,
  EventContextPackRecord,
  EventTimingRecord,
  MaybePromise,
  OperationAccountRecord,
  PublicationMetricRecord,
  PublicationRecord,
} from './content.types';

export interface CreateContentTaskInput {
  id: string;
  eventId: string;
  accountId: string;
  workflowRunId?: string;
  assignmentCommandId?: string;
  status: ContentTaskRecord['status'];
  priority: ContentTaskRecord['priority'];
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
  findContentTaskByEventAndAccount(
    eventId: string,
    accountId: string,
  ): MaybePromise<ContentTaskRecord | undefined>;
  createContentTask(input: CreateContentTaskInput): MaybePromise<ContentTaskRecord>;
  updateContentTask(
    id: string,
    patch: Partial<
      Pick<
        ContentTaskRecord,
        'status' | 'riskStatus' | 'latestCandidateBatchId' | 'updatedAt'
      >
    >,
  ): MaybePromise<ContentTaskRecord>;
  listContentTasks(): MaybePromise<ContentTaskRecord[]>;
  findContentTaskById(id: string): MaybePromise<ContentTaskRecord | undefined>;
  listOperationAccounts(): MaybePromise<OperationAccountRecord[]>;
  findOperationAccountById(id: string): MaybePromise<OperationAccountRecord | undefined>;
  findEventContextPackById(id: string): MaybePromise<EventContextPackRecord | undefined>;
  findEventTimingById(id: string): MaybePromise<EventTimingRecord | undefined>;
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
    patch: Partial<
      Pick<
        PublicationRecord,
        | 'status'
        | 'trackingStatus'
        | 'trackingEndsAt'
        | 'wellPerforming'
        | 'trackingRuleVersion'
        | 'lastTrackingError'
        | 'lastTrackingErrorAt'
        | 'trackingFailureCount'
        | 'eventFormedAt'
        | 'urlFilledAt'
        | 'firstPublishLatencyMs'
      >
    >,
  ): MaybePromise<PublicationRecord>;
  createPublicationRecord(input: CreatePublicationRecordInput): MaybePromise<PublicationRecord>;
  createPublicationMetric(input: CreatePublicationMetricInput): MaybePromise<PublicationMetricRecord>;
  findLatestPublicationMetric(publicationRecordId: string): MaybePromise<PublicationMetricRecord | undefined>;
  listPublicationMetrics(publicationRecordId?: string): MaybePromise<PublicationMetricRecord[]>;
}
