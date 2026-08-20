export type MaybePromise<T> = T | Promise<T>;

export type ContentCommandExecutionStatus = 'success' | 'skipped' | 'failed';
export type ContentTaskStatus =
  | 'ready_for_generation'
  | 'generating'
  | 'generation_failed'
  | 'ready_for_publish'
  | 'precheck_blocked'
  | 'published'
  | 'tracking'
  | 'completed'
  | 'abandoned';

export type ContentTaskPriority = 'urgent' | 'high' | 'normal' | 'low';

export interface OperationAccountRecord {
  id: string;
  key: string;
  name: string;
  description?: string;
  enabled: boolean;
  fields: Record<string, unknown>;
}

export interface EventContextPackRecord {
  eventId: string;
  title: string;
  oneLineSummary: string;
  status: string;
  confirmationLevel: string;
  expressionBoundary: string;
  confirmedFacts: string[];
  unconfirmedFacts: string[];
  evidenceRecords: {
    sourceType: string;
    url?: string;
    claim: string;
    payload?: unknown;
  }[];
  sourceContexts: unknown[];
}

export interface EventTimingRecord {
  id: string;
  title: string;
  formedAt: string;
}

export interface ContentTaskRecord {
  id: string;
  eventId: string;
  accountId: string;
  workflowRunId?: string;
  assignmentCommandId?: string;
  status: ContentTaskStatus;
  priority: ContentTaskPriority;
  skill: string;
  skillVersion: string;
  assignmentReason: string;
  riskStatus: string;
  latestCandidateBatchId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ContentCommandExecutionRecord {
  id: string;
  workflowCommandId: string;
  workflowRunId: string;
  commandType: ContentCommand['type'];
  idempotencyKey: string;
  status: ContentCommandExecutionStatus;
  targetTaskId?: string;
  error?: string;
  createdAt: string;
}

export type ContentCommand = CreateContentTaskCommand | ObserveAccountCommand | SkipAccountCommand;

export interface CreateContentTaskCommand {
  type: 'create_content_task';
  idempotencyKey: string;
  eventId: string;
  accountId: string;
  skill: string;
  skillVersion: string;
  assignmentReason: string;
  priority: ContentTaskPriority;
  source: {
    workflowRunId: string;
    commandId?: string;
    triggerReason: string;
  };
}

export interface ObserveAccountCommand {
  type: 'observe_account';
  idempotencyKey: string;
  eventId: string;
  accountId: string;
  reason: string;
}

export interface SkipAccountCommand {
  type: 'skip_account';
  idempotencyKey: string;
  eventId: string;
  accountId: string;
  reason: string;
}

export interface ContentCandidateBatchRecord {
  id: string;
  taskId: string;
  workflowRunId: string;
  generationKind: string;
  userInstruction?: string;
  status: string;
  createdAt: string;
}

export interface ContentCandidateRecord {
  id: string;
  batchId: string;
  taskId: string;
  localKey: string;
  format: string;
  text: string;
  targetPostUrl?: string;
  angle: string;
  factualClaims: unknown;
  uncertaintyNotes: unknown;
  productBridge?: string;
  riskStatus: string;
  precheckPayload?: unknown;
  status: string;
  createdAt: string;
}

export interface PublicationRecord {
  id: string;
  taskId: string;
  candidateId: string;
  eventId: string;
  accountId: string;
  url: string;
  status: string;
  publishedAt: string;
  trackingStatus: string;
  trackingEndsAt?: string;
  wellPerforming: boolean;
  trackingRuleVersion: string;
  lastTrackingError?: string;
  lastTrackingErrorAt?: string;
  trackingFailureCount: number;
  eventFormedAt?: string;
  urlFilledAt?: string;
  firstPublishLatencyMs?: number;
  createdAt: string;
}

export interface PublicationMetricRecord {
  id: string;
  publicationRecordId: string;
  capturedAt: string;
  likes: number;
  replies: number;
  reposts: number;
  quotes?: number;
  views?: number;
  raw?: unknown;
  createdAt: string;
}

export interface CreateContentCandidateBatchInput {
  id: string;
  taskId: string;
  workflowRunId: string;
  generationKind: string;
  userInstruction?: string;
  status: string;
  createdAt: string;
}

export interface CreateContentCandidateInput {
  id: string;
  batchId: string;
  taskId: string;
  localKey: string;
  format: string;
  text: string;
  targetPostUrl?: string;
  angle: string;
  factualClaims: unknown;
  uncertaintyNotes: unknown;
  productBridge?: string;
  riskStatus: string;
  precheckPayload?: unknown;
  status: string;
  createdAt: string;
}

export interface CreatePublicationRecordInput {
  id: string;
  taskId: string;
  candidateId: string;
  eventId: string;
  accountId: string;
  url: string;
  status: string;
  publishedAt: string;
  trackingStatus: string;
  trackingEndsAt?: string;
  wellPerforming?: boolean;
  trackingRuleVersion?: string;
  lastTrackingError?: string;
  lastTrackingErrorAt?: string;
  trackingFailureCount?: number;
  eventFormedAt?: string;
  urlFilledAt?: string;
  firstPublishLatencyMs?: number;
  createdAt: string;
}

export interface CreatePublicationMetricInput {
  id: string;
  publicationRecordId: string;
  capturedAt: string;
  likes: number;
  replies: number;
  reposts: number;
  quotes?: number;
  views?: number;
  raw?: unknown;
  createdAt: string;
}
