import { Inject, Injectable } from '@nestjs/common';
import { COLLECTION_REPOSITORY } from '../collection/collection.tokens';
import { CollectionRepository } from '../collection/collection.repository';
import { SourceSnapshot, SourceSnapshotItem, SourceType } from '../collection/collection.types';
import { TrendRegionSnapshotContext, XTrendEventContextV1 } from './workflow.types';

export interface BuildXTrendContextInput {
  workflowRunId: string;
  observedAt: string;
  platform: string;
  sourceType: SourceType;
  regions: string[];
}

@Injectable()
export class XTrendContextBuilder {
  constructor(@Inject(COLLECTION_REPOSITORY) private readonly collectionRepository: CollectionRepository) {}

  async build(input: BuildXTrendContextInput): Promise<XTrendEventContextV1> {
    const latestSnapshots = await this.collectionRepository.findLatestSourceSnapshots({
      platform: input.platform,
      sourceType: input.sourceType,
      regions: input.regions,
    });
    const latestSnapshotIds = latestSnapshots.map((snapshot) => snapshot.id);
    const successfulRegions = await Promise.all(
      latestSnapshots.map((snapshot) => this.toRegionSnapshotContext(snapshot)),
    );
    const previousByRegionEntries = await Promise.all(
      latestSnapshots.map(async (snapshot) => {
        const previous = await this.collectionRepository.findPreviousSourceSnapshot({
          platform: input.platform,
          sourceType: input.sourceType,
          region: snapshot.region,
          before: snapshot.collectedAt,
        });
        return [
          snapshot.region,
          previous ? await this.toRegionSnapshotContext(previous) : null,
        ] as const;
      }),
    );

    return {
      schemaVersion: 'x_trend_event_context_v1',
      workflowRunId: input.workflowRunId,
      observedAt: input.observedAt,
      currentBatch: {
        batchId: `${input.platform}:${input.sourceType}:${input.observedAt}`,
        collectedAt: this.resolveBatchCollectedAt(latestSnapshots, input.observedAt),
        successfulRegions,
        failedRegions: this.resolveMissingRegions(input.regions, latestSnapshots, input.observedAt),
      },
      previousSuccessfulSnapshots: {
        byRegion: Object.fromEntries(previousByRegionEntries),
      },
      snapshotDiffs: await this.collectionRepository.findSourceSnapshotDiffs({
        currentSnapshotIds: latestSnapshotIds,
      }),
      configuredTopics: [],
      eventCandidates: [],
      recentEventHistory: [],
    };
  }

  private async toRegionSnapshotContext(snapshot: SourceSnapshot): Promise<TrendRegionSnapshotContext> {
    const items = await this.collectionRepository.findSourceSnapshotItems(snapshot.id);
    return {
      region: snapshot.region,
      snapshotId: snapshot.id,
      collectedAt: snapshot.collectedAt,
      items: items.map((item) => this.toTrendSnapshotItemContext(item)),
    };
  }

  private toTrendSnapshotItemContext(item: SourceSnapshotItem) {
    return {
      rank: item.rank,
      title: item.title,
      normalizedKey: item.normalizedKey,
      rawRef: {
        platform: 'x' as const,
        table: 'source_snapshot_item' as const,
        id: item.id,
      },
    };
  }

  private resolveBatchCollectedAt(snapshots: SourceSnapshot[], fallback: string) {
    return snapshots
      .map((snapshot) => snapshot.collectedAt)
      .sort((left, right) => right.localeCompare(left))[0] ?? fallback;
  }

  private resolveMissingRegions(regions: string[], snapshots: SourceSnapshot[], observedAt: string) {
    const successfulRegionSet = new Set(snapshots.map((snapshot) => snapshot.region));
    return regions
      .filter((region) => !successfulRegionSet.has(region))
      .map((region) => ({
        region,
        error: 'latest_snapshot_not_found',
        observedAt,
      }));
  }
}
