export type ConfirmationLevel = 'fixed' | 'confirmed' | 'expected' | 'needs_verification' | 'changed' | 'cancelled';
export type SchedulePrecision = 'exact_time' | 'date' | 'date_range' | 'season_cycle' | 'unknown';
export type ExpressionBoundary = 'factual' | 'qualified' | 'internal_only' | 'blocked';
export type FutureSourceType = 'opm' | 'bea' | 'bls' | 'fomc' | 'manual';
export type EntryMode = 'trend_trigger' | 'scheduled_manual_response' | 'scheduled_auto_response';

export interface FutureEventRow {
  id: string;
  title: string;
  subject: string;
  eventType: string;
  factTime: Date | null;
  factEndTime: Date | null;
  timezone: string;
  schedulePrecision: string;
  confirmationLevel: string;
  expressionBoundary: string;
  relatedEventId: string | null;
  entryMode: string | null;
  ruleVersion: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface FutureEventEvidenceRow {
  id: string;
  url: string;
  sourceType: string;
  verifiedAt: Date;
  claims: unknown;
  originalId?: string | null;
}

export interface FutureEventWindowRow {
  windowType: string;
  startAt: Date | null;
  endAt: Date | null;
}

export interface FutureEventHeatQueryRow {
  query: string;
  version: string;
  createdAt: Date;
}

export interface FutureEventHeatBucketRow {
  startAt: Date;
  endAt: Date;
  postCount: number;
}

export interface FutureEventScoreVersionRow {
  total: number;
  impact: unknown;
  evidence: number;
  heatMomentum: number;
  timeUrgency: number;
  contentReadiness: number;
  version: string;
}

export interface FutureEventAggregate {
  event: FutureEventRow;
  evidence: FutureEventEvidenceRow[];
  windows: FutureEventWindowRow[];
  heatQuery: FutureEventHeatQueryRow | null;
  heatBuckets: FutureEventHeatBucketRow[];
  latestScore: FutureEventScoreVersionRow | null;
}

export function mapFutureEventView(input: FutureEventAggregate) {
  const latestScore = input.latestScore;
  const heatQuery = input.heatQuery;
  const buckets = input.heatBuckets.map((bucket) => ({
    startAt: bucket.startAt.toISOString(),
    endAt: bucket.endAt.toISOString(),
    count: bucket.postCount,
  }));
  const last6h = buckets.at(-1)?.count ?? 0;
  const prev6h = buckets.at(-2)?.count ?? 0;
  const cumulative = buckets.reduce((sum, bucket) => sum + bucket.count, 0);

  return {
    id: input.event.id,
    title: input.event.title,
    subject: input.event.subject,
    eventType: input.event.eventType,
    factTime: input.event.factTime?.toISOString() ?? null,
    timezone: input.event.timezone,
    schedulePrecision: input.event.schedulePrecision as SchedulePrecision,
    confirmationLevel: input.event.confirmationLevel as ConfirmationLevel,
    expressionBoundary: input.event.expressionBoundary as ExpressionBoundary,
    evidence: input.evidence.map((item) => ({
      id: item.id,
      url: item.url,
      sourceType: item.sourceType as FutureSourceType,
      verifiedAt: item.verifiedAt.toISOString(),
      claims: toStringArray(item.claims),
      originalId: item.originalId ?? undefined,
    })),
    windows: {
      monitoring: windowPair(input.windows, 'monitoring'),
      preheat: windowPair(input.windows, 'preheat'),
      live: windowPair(input.windows, 'live'),
      followUp: windowPair(input.windows, 'followUp'),
    },
    actionScore: {
      total: latestScore?.total ?? 0,
      impact: toImpactScore(latestScore?.impact),
      evidence: latestScore?.evidence ?? 0,
      heatMomentum: latestScore?.heatMomentum ?? 0,
      timeUrgency: latestScore?.timeUrgency ?? 0,
      contentReadiness: latestScore?.contentReadiness ?? 0,
      version: latestScore?.version ?? 'v0',
    },
    heat: {
      query: heatQuery?.query ?? '',
      queryVersion: heatQuery?.version ?? 'v0',
      monitoringStartedAt: heatQuery?.createdAt.toISOString() ?? null,
      buckets,
      last6h,
      prev6h,
      growthPct: prev6h > 0 ? ((last6h - prev6h) / prev6h) * 100 : null,
      intensityMultiple: null,
      cumulative,
    },
    relatedEventId: input.event.relatedEventId,
    entryMode: input.event.entryMode as EntryMode | null,
    ruleVersion: input.event.ruleVersion,
    createdAt: input.event.createdAt.toISOString(),
    updatedAt: input.event.updatedAt.toISOString(),
  };
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function toImpactScore(value: unknown) {
  const record = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  return {
    scope: typeof record.scope === 'number' ? record.scope : 0,
    relevance: typeof record.relevance === 'number' ? record.relevance : 0,
    outcomeImportance: typeof record.outcomeImportance === 'number' ? record.outcomeImportance : 0,
  };
}

function windowPair(windows: FutureEventWindowRow[], type: string): [string, string] | null {
  const window = windows.find((item) => item.windowType === type);
  if (!window?.startAt || !window.endAt) {
    return null;
  }
  return [window.startAt.toISOString(), window.endAt.toISOString()];
}
