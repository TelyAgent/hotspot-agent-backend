export type Platform = 'x';
export type SourceType = 'trend' | 'post' | 'metric' | 'topic_circle_post';
export type FetchRunStatus = 'running' | 'success' | 'partial_success' | 'failed';

export interface PlatformCollectionConfig {
  id: string;
  platform: Platform;
  connectorId: string;
  displayName: string;
  enabled: boolean;
  defaultTimezone: string;
  defaultRegions: string[];
  rateLimit?: {
    maxRequestsPerMinute?: number;
    maxRequestsPerHour?: number;
  };
  variables: {
    regions?: string[];
    regionWoeids?: Record<string, number>;
    monitoredAccounts?: string[];
    topicKeywords?: string[];
    topicNegativeKeywords?: string[];
    topicConfigs?: TopicTrackingConfig[];
    trendCollectionCron?: string;
    trendEventWorkflowId?: string;
    defaultTrendLimit?: number;
    defaultPostLimit?: number;
  };
}

export interface TopicTrackingConfig {
  id: string;
  name: string;
  enabled: boolean;
  keywords: string[];
  positiveExamples: string[];
  negativeExamples: string[];
  action: string;
  accounts: string[];
  collectionFrequency: string;
  workflowId: string;
  defaultPostLimit: number;
}

export interface CollectionJobConfig {
  id: string;
  platform: Platform;
  name: string;
  toolName: 'x.getTrending' | 'x.getAccountPosts' | 'x.getPostMetrics' | 'x.searchPosts';
  sourceType: SourceType;
  enabled: boolean;
  schedule: {
    type: 'cron' | 'interval';
    value: string;
  };
  inputTemplate: Record<string, unknown>;
  variableRefs: string[];
  outputTarget: {
    platformTables: string[];
    emitSignal: boolean;
    emitSnapshot?: boolean;
    emitSnapshotDiff?: boolean;
  };
}

export interface CollectionState {
  platformConfigs: PlatformCollectionConfig[];
  jobConfigs: CollectionJobConfig[];
}

export interface SourceFetchRun {
  id: string;
  platform: Platform;
  connectorId: string;
  toolName: string;
  sourceType: SourceType;
  status: FetchRunStatus;
  input: unknown;
  startedAt: string;
  finishedAt?: string;
  itemCount: number;
  error?: string;
}

export interface XTrendingItem {
  rank: number;
  name: string;
  query?: string;
  url?: string;
  volume?: number;
  category?: string;
  raw: unknown;
}

export interface XTrendingToolOutput {
  platform: 'x';
  sourceType: 'trend';
  region: string;
  collectedAt: string;
  items: XTrendingItem[];
  raw: unknown;
}

export interface XAccountPost {
  postId: string;
  authorHandle: string;
  authorId?: string;
  authorName?: string;
  text: string;
  url?: string;
  postType: 'original' | 'quote' | 'reply' | 'repost';
  replyToPostId?: string;
  repostedPostId?: string;
  quotedPostId?: string;
  publishedAt: string;
  metrics?: {
    views?: number;
    likes?: number;
    reposts?: number;
    replies?: number;
    quotes?: number;
    bookmarks?: number;
  };
  raw: unknown;
}

export interface XGetAccountPostsToolOutput {
  platform: 'x';
  sourceType: 'topic_circle_post';
  handle: string;
  collectedAt: string;
  posts: XAccountPost[];
  nextCursor?: string;
}

export interface XSearchPostsToolOutput {
  platform: 'x';
  sourceType: 'post';
  query: string;
  queryType: 'Top' | 'Latest';
  collectedAt: string;
  posts: XAccountPost[];
}

export interface XTrendSnapshot {
  id: string;
  fetchRunId: string;
  region: string;
  collectedAt: string;
  itemCount: number;
  checksum?: string;
  raw?: unknown;
}

export interface XTrendSnapshotItem {
  id: string;
  xTrendSnapshotId: string;
  rank: number;
  name: string;
  query?: string;
  url?: string;
  volume?: number;
  category?: string;
  normalizedKey: string;
  raw: unknown;
}

export interface SourceSnapshot {
  id: string;
  platform: Platform;
  platformSnapshotId: string;
  sourceType: 'trend';
  region: string;
  collectedAt: string;
  fetchRunId: string;
  itemCount: number;
}

export interface SourceSnapshotItem {
  id: string;
  sourceSnapshotId: string;
  platform: Platform;
  platformItemId: string;
  sourceType: 'trend';
  region: string;
  rank: number;
  title: string;
  normalizedKey: string;
  metrics?: Record<string, number | undefined>;
}

export interface Signal {
  id: string;
  platformRefTable?: string;
  platformRefId?: string;
  snapshotId?: string;
  fetchRunId: string;
  platform: Platform;
  sourceType: SourceType;
  sourceItemId: string;
  title: string;
  summary?: string;
  text?: string;
  url?: string;
  region?: string;
  rank?: number;
  authorHandle?: string;
  publishedAt?: string;
  observedAt: string;
  metrics?: Record<string, number | undefined>;
  normalizedKey?: string;
  raw?: unknown;
}

export interface TrendDiffItem {
  normalizedKey: string;
  name: string;
  previousRank?: number;
  currentRank?: number;
  rankDelta?: number;
}

export interface SourceSnapshotDiff {
  id: string;
  platform: Platform;
  region: string;
  currentSnapshotId: string;
  previousSnapshotId?: string;
  entered: TrendDiffItem[];
  exited: TrendDiffItem[];
  rankUp: TrendDiffItem[];
  rankDown: TrendDiffItem[];
  unchanged: TrendDiffItem[];
}
