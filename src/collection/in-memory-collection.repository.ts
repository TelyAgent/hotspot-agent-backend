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
import { CollectionRepository } from './collection.repository';

export class InMemoryCollectionRepository implements CollectionRepository {
  readonly platformConfigs: PlatformCollectionConfig[];
  readonly jobConfigs: CollectionJobConfig[];
  readonly fetchRuns: SourceFetchRun[] = [];
  readonly xTrendSnapshots: XTrendSnapshot[] = [];
  readonly xTrendSnapshotItems: XTrendSnapshotItem[] = [];
  readonly sourceSnapshots: SourceSnapshot[] = [];
  readonly sourceSnapshotItems: SourceSnapshotItem[] = [];
  readonly sourceSnapshotDiffs: SourceSnapshotDiff[] = [];
  readonly signals: Signal[] = [];

  constructor(initialState: CollectionState = { platformConfigs: [], jobConfigs: [] }) {
    this.platformConfigs = initialState.platformConfigs;
    this.jobConfigs = initialState.jobConfigs;
  }

  findPlatformConfig(platform: string): PlatformCollectionConfig | undefined {
    return this.platformConfigs.find((config) => config.platform === platform);
  }

  updatePlatformConfig(
    platform: string,
    patch: Partial<Pick<PlatformCollectionConfig, 'variables' | 'enabled' | 'defaultRegions'>>,
  ): PlatformCollectionConfig {
    const existing = this.findPlatformConfig(platform);
    if (!existing) {
      throw new Error(`Platform config not found: ${platform}`);
    }

    if (patch.variables) {
      existing.variables = { ...existing.variables, ...patch.variables };
    }
    if (patch.enabled !== undefined) {
      existing.enabled = patch.enabled;
    }
    if (patch.defaultRegions) {
      existing.defaultRegions = patch.defaultRegions;
    }

    return existing;
  }

  findJobConfig(jobId: string): CollectionJobConfig | undefined {
    return this.jobConfigs.find((config) => config.id === jobId);
  }

  updateJobConfig(
    jobId: string,
    patch: Partial<Pick<CollectionJobConfig, 'enabled' | 'schedule' | 'inputTemplate' | 'variableRefs' | 'outputTarget'>>,
  ): CollectionJobConfig {
    const existing = this.findJobConfig(jobId);
    if (!existing) {
      throw new Error(`Collection job not found: ${jobId}`);
    }
    Object.assign(existing, patch);
    return existing;
  }

  listJobConfigs(platform: string): CollectionJobConfig[] {
    return this.jobConfigs.filter((config) => config.platform === platform);
  }

  saveFetchRun(fetchRun: SourceFetchRun): SourceFetchRun {
    this.fetchRuns.push(fetchRun);
    return fetchRun;
  }

  updateFetchRun(id: string, patch: Partial<SourceFetchRun>): SourceFetchRun {
    const existing = this.fetchRuns.find((run) => run.id === id);
    if (!existing) {
      throw new Error(`Fetch run not found: ${id}`);
    }
    Object.assign(existing, patch);
    return existing;
  }

  saveXTrendSnapshot(snapshot: XTrendSnapshot): XTrendSnapshot {
    this.xTrendSnapshots.push(snapshot);
    return snapshot;
  }

  saveXTrendSnapshotItems(items: XTrendSnapshotItem[]): XTrendSnapshotItem[] {
    this.xTrendSnapshotItems.push(...items);
    return items;
  }

  saveSourceSnapshot(snapshot: SourceSnapshot): SourceSnapshot {
    this.sourceSnapshots.push(snapshot);
    return snapshot;
  }

  saveSourceSnapshotItems(items: SourceSnapshotItem[]): SourceSnapshotItem[] {
    this.sourceSnapshotItems.push(...items);
    return items;
  }

  findPreviousSourceSnapshot(input: {
    platform: string;
    sourceType: string;
    region: string;
    before: string;
  }): SourceSnapshot | undefined {
    return [...this.sourceSnapshots]
      .filter(
        (snapshot) =>
          snapshot.platform === input.platform &&
          snapshot.sourceType === input.sourceType &&
          snapshot.region === input.region &&
          snapshot.collectedAt < input.before,
      )
      .sort((left, right) => right.collectedAt.localeCompare(left.collectedAt))[0];
  }

  findLatestSourceSnapshot(input: {
    platform: string;
    sourceType: string;
    region: string;
  }): SourceSnapshot | undefined {
    return [...this.sourceSnapshots]
      .filter(
        (snapshot) =>
          snapshot.platform === input.platform &&
          snapshot.sourceType === input.sourceType &&
          snapshot.region === input.region,
      )
      .sort((left, right) => right.collectedAt.localeCompare(left.collectedAt))[0];
  }

  findLatestSourceSnapshots(input: {
    platform: string;
    sourceType: string;
    regions: string[];
  }): SourceSnapshot[] {
    return input.regions
      .map((region) =>
        this.findLatestSourceSnapshot({
          platform: input.platform,
          sourceType: input.sourceType,
          region,
        }),
      )
      .filter((snapshot): snapshot is SourceSnapshot => Boolean(snapshot));
  }

  findSourceSnapshotItems(sourceSnapshotId: string): SourceSnapshotItem[] {
    return this.sourceSnapshotItems.filter((item) => item.sourceSnapshotId === sourceSnapshotId);
  }

  saveSourceSnapshotDiff(diff: SourceSnapshotDiff): SourceSnapshotDiff {
    this.sourceSnapshotDiffs.push(diff);
    return diff;
  }

  findSourceSnapshotDiffs(input: { currentSnapshotIds: string[] }): SourceSnapshotDiff[] {
    const idSet = new Set(input.currentSnapshotIds);
    return this.sourceSnapshotDiffs.filter((diff) => idSet.has(diff.currentSnapshotId));
  }

  saveSignals(signals: Signal[]): Signal[] {
    this.signals.push(...signals);
    return signals;
  }
}
