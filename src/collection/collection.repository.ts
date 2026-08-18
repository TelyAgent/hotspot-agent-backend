import {
  CollectionJobConfig,
  CollectionState,
  PlatformCollectionConfig,
  Signal,
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
  listJobConfigs(platform: string): MaybePromise<CollectionJobConfig[]>;
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
  findSourceSnapshotItems(sourceSnapshotId: string): MaybePromise<SourceSnapshotItem[]>;
  saveSourceSnapshotDiff(diff: SourceSnapshotDiff): MaybePromise<SourceSnapshotDiff>;
  saveSignals(signals: Signal[]): MaybePromise<Signal[]>;
}
