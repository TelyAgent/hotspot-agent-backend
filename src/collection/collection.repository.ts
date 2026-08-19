import {
  CollectionJobConfig,
  CollectionState,
  PlatformCollectionConfig,
  Signal,
  SourceType,
  SourceFetchRun,
  SourceSnapshot,
  SourceSnapshotDiff,
  SourceSnapshotItem,
  XTrendSnapshot,
  XTrendSnapshotItem,
} from './collection.types';

type MaybePromise<T> = T | Promise<T>;

export interface CollectionRepository {
  readonly jobConfigs: CollectionJobConfig[];

  seedDefaults?(state: CollectionState): MaybePromise<void>;
  findPlatformConfig(platform: string): MaybePromise<PlatformCollectionConfig | undefined>;
  updatePlatformConfig(
    platform: string,
    patch: Partial<Pick<PlatformCollectionConfig, 'variables' | 'enabled' | 'defaultRegions'>>,
  ): MaybePromise<PlatformCollectionConfig>;
  findJobConfig(jobId: string): MaybePromise<CollectionJobConfig | undefined>;
  updateJobConfig(
    jobId: string,
    patch: Partial<Pick<CollectionJobConfig, 'enabled' | 'schedule' | 'inputTemplate' | 'variableRefs' | 'outputTarget'>>,
  ): MaybePromise<CollectionJobConfig>;
  listJobConfigs(platform: string): MaybePromise<CollectionJobConfig[]>;
  findLatestFetchRun(input: {
    platform: string;
    toolName: string;
    sourceType: string;
    status?: SourceFetchRun['status'] | SourceFetchRun['status'][];
  }): MaybePromise<SourceFetchRun | undefined>;
  saveFetchRun(fetchRun: SourceFetchRun): MaybePromise<SourceFetchRun>;
  updateFetchRun(id: string, patch: Partial<SourceFetchRun>): MaybePromise<SourceFetchRun>;
  saveXTrendSnapshot(snapshot: XTrendSnapshot): MaybePromise<XTrendSnapshot>;
  saveXTrendSnapshotItems(items: XTrendSnapshotItem[]): MaybePromise<XTrendSnapshotItem[]>;
  saveSourceSnapshot(snapshot: SourceSnapshot): MaybePromise<SourceSnapshot>;
  saveSourceSnapshotItems(items: SourceSnapshotItem[]): MaybePromise<SourceSnapshotItem[]>;
  findPreviousSourceSnapshot(input: {
    platform: string;
    sourceType: string;
    region: string;
    before: string;
  }): MaybePromise<SourceSnapshot | undefined>;
  findLatestSourceSnapshot(input: {
    platform: string;
    sourceType: string;
    region: string;
  }): MaybePromise<SourceSnapshot | undefined>;
  findLatestSourceSnapshots(input: {
    platform: string;
    sourceType: string;
    regions: string[];
  }): MaybePromise<SourceSnapshot[]>;
  findSourceSnapshotItems(sourceSnapshotId: string): MaybePromise<SourceSnapshotItem[]>;
  saveSourceSnapshotDiff(diff: SourceSnapshotDiff): MaybePromise<SourceSnapshotDiff>;
  findSourceSnapshotDiffs(input: { currentSnapshotIds: string[] }): MaybePromise<SourceSnapshotDiff[]>;
  saveSignals(signals: Signal[]): MaybePromise<Signal[]>;
  findSignals(input: {
    platform?: string;
    sourceType?: SourceType;
    snapshotIds?: string[];
  }): MaybePromise<Signal[]>;
}
