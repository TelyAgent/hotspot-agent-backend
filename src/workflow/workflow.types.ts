export type WorkflowType = 'event_formation' | 'content_generation' | 'promotion_monitoring';
export type WorkflowStatus = 'draft' | 'enabled' | 'disabled';
export type WorkflowRunStatus = 'running' | 'success' | 'failed' | 'partial_success';
export type WorkflowCommandExecutionStatus = 'success' | 'skipped' | 'failed';

export interface WorkflowDefinitionRecord {
  id: string;
  workflowId: string;
  name: string;
  type: WorkflowType;
  version: string;
  status: WorkflowStatus;
  markdownPath: string;
  outputSchemaPath: string;
  checksum: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowRunRecord {
  id: string;
  workflowDefinitionId: string;
  status: WorkflowRunStatus;
  startedAt: string;
  finishedAt?: string;
  model?: string;
  input: unknown;
  output?: unknown;
  error?: string;
}

export interface WorkflowCommandRecord {
  id: string;
  workflowRunId: string;
  type: EventCommand['type'];
  idempotencyKey: string;
  payload: EventCommand;
  createdAt: string;
}

export interface WorkflowCommandExecutionRecord {
  id: string;
  workflowCommandId: string;
  workflowRunId: string;
  commandType: EventCommand['type'];
  idempotencyKey: string;
  status: WorkflowCommandExecutionStatus;
  targetEventId?: string;
  error?: string;
  createdAt: string;
}

export interface TrendSnapshotItemContext {
  rank: number;
  title: string;
  query?: string;
  normalizedKey: string;
  url?: string;
  representativePosts?: {
    postId?: string;
    authorHandle?: string;
    text?: string;
    url?: string;
    publishedAt?: string;
    metrics?: Record<string, number | undefined>;
  }[];
  rawRef: {
    platform: 'x';
    table: 'x_trend_snapshot_item' | 'source_snapshot_item';
    id: string;
  };
}

export interface TrendRegionSnapshotContext {
  region: string;
  snapshotId: string;
  collectedAt: string;
  items: TrendSnapshotItemContext[];
}

export interface XTrendEventContextV1 {
  schemaVersion: 'x_trend_event_context_v1';
  workflowRunId: string;
  observedAt: string;
  currentBatch: {
    batchId: string;
    collectedAt: string;
    successfulRegions: TrendRegionSnapshotContext[];
    failedRegions: { region: string; error: string; observedAt: string }[];
  };
  previousSuccessfulSnapshots: {
    byRegion: Record<string, TrendRegionSnapshotContext | null>;
  };
  snapshotDiffs: unknown[];
  configuredTopics: {
    id: string;
    name: string;
    semanticKeywords: string[];
    positiveExamples: string[];
    negativeExamples: string[];
    enabled: boolean;
  }[];
  eventCandidates: ExistingEventSummary[];
  recentEventHistory: ExistingEventSummary[];
}

export interface ExistingEventSummary {
  eventId: string;
  title: string;
  summary?: string;
  normalizedKey?: string;
  status: string;
  sourceContexts: unknown[];
  formedAt: string;
}

export interface EventWorkflowCommandsV1 {
  schemaVersion: 'event_workflow_commands_v1';
  workflowId: string;
  workflowVersion: string;
  runId: string;
  commands: EventCommand[];
  diagnostics?: { level: 'info' | 'warning' | 'error'; message: string }[];
}

export type EventCommand = CreateEventCommand | UpdateEventContextCommand | IgnoreSignalCommand;

export interface CreateEventCommand {
  type: 'create_event';
  idempotencyKey: string;
  eventCandidate: {
    title: string;
    subject?: string;
    action?: string;
    object?: string;
    oneLineSummary: string;
    normalizedEventKey: string;
    confidence: 'high' | 'medium' | 'low';
  };
  eventIntake: EventIntakePayload;
  trigger: TriggerPayload;
  sourceContext: EventSourceContextPayload;
  evidenceRecords: EvidenceRecordPayload[];
  startResponsePipeline: boolean;
}

export interface UpdateEventContextCommand {
  type: 'update_event_context';
  idempotencyKey: string;
  targetEventId: string;
  reason: string;
  trigger?: TriggerPayload;
  sourceContextPatch: EventSourceContextPayload;
  evidenceRecords?: EvidenceRecordPayload[];
  startResponsePipeline: false;
}

export interface IgnoreSignalCommand {
  type: 'ignore';
  idempotencyKey: string;
  reason: string;
  sourceRefs: SourceRef[];
}

export interface EventIntakePayload {
  schemaVersion: 'event_intake_v1';
  entryMode: 'x_trend' | 'x_topic_circle';
  observedAt: string;
  t0?: string;
  title: string;
  oneLineSummary: string;
  confirmationLevel: 'unconfirmed' | 'partially_supported' | 'confirmed' | 'conflicting';
  expressionBoundary: string;
  confirmedFacts: string[];
  unconfirmedFacts: string[];
  evidenceRecords: EvidenceRecordPayload[];
  trendContext: EventSourceContextPayload;
  trigger: TriggerPayload;
  candidateEventIds: string[];
  dedupeKey: string;
}

export interface TriggerPayload {
  ruleId: string;
  reason: string;
  t0: string;
  observedAt: string;
}

export interface XTrendSourceContext {
  regions: {
    region: string;
    rank?: number;
    previousRank?: number;
    snapshotId: string;
    representativePosts: EvidenceRecordPayload[];
  }[];
  matchedRules?: TriggerPayload[];
}

export type EventSourceContextPayload = XTrendSourceContext | Record<string, unknown>;

export interface EvidenceRecordPayload {
  sourceType: 'x_trend' | 'x_post' | 'x_topic_circle' | 'manual' | 'external';
  url?: string;
  claim: string;
  payload?: unknown;
}

export interface SourceRef {
  platform: string;
  sourceType: string;
  id: string;
}

export interface EventRecord {
  id: string;
  title: string;
  normalizedEventKey: string;
  status: string;
  confidence: 'high' | 'medium' | 'low';
  formedAt: string;
  updatedAt: string;
}
