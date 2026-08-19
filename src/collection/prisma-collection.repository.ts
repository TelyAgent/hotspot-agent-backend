import { Injectable, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { createDefaultCollectionState, mergePlatformCollectionConfigDefaults } from './default-collection-state';
import { CollectionRepository } from './collection.repository';
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

@Injectable()
export class PrismaCollectionRepository implements CollectionRepository, OnModuleInit {
  jobConfigs: CollectionJobConfig[] = [];
  private platformConfigs: PlatformCollectionConfig[] = [];

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.seedDefaults(createDefaultCollectionState());
  }

  async seedDefaults(state: CollectionState) {
    for (const config of state.platformConfigs) {
      const existing = await this.prisma.platformCollectionConfig.findUnique({
        where: { platform: config.platform },
      });
      const merged = existing
        ? mergePlatformCollectionConfigDefaults(
            {
              id: existing.id,
              platform: existing.platform as PlatformCollectionConfig['platform'],
              connectorId: existing.connectorId,
              displayName: existing.displayName,
              enabled: existing.enabled,
              defaultTimezone: existing.defaultTimezone,
              defaultRegions: existing.defaultRegions as string[],
              rateLimit: existing.rateLimit as PlatformCollectionConfig['rateLimit'],
              variables: existing.variables as PlatformCollectionConfig['variables'],
            },
            config,
          )
        : config;
      await this.prisma.platformCollectionConfig.upsert({
        where: { platform: config.platform },
        update: {
          defaultRegions: merged.defaultRegions as any,
          variables: merged.variables as any,
        },
        create: {
          id: config.id,
          platform: config.platform,
          connectorId: config.connectorId,
          displayName: config.displayName,
          enabled: config.enabled,
          defaultTimezone: config.defaultTimezone,
          defaultRegions: config.defaultRegions as any,
          rateLimit: (config.rateLimit ?? undefined) as any,
          variables: config.variables as any,
        },
      });
    }

    for (const job of state.jobConfigs) {
      await this.prisma.collectionJobConfig.upsert({
        where: { id: job.id },
        update: {},
        create: {
          id: job.id,
          platform: job.platform,
          name: job.name,
          toolName: job.toolName,
          sourceType: job.sourceType,
          enabled: job.enabled,
          schedule: job.schedule as any,
          inputTemplate: job.inputTemplate as any,
          variableRefs: job.variableRefs as any,
          outputTarget: job.outputTarget as any,
        },
      });
    }

    await this.refreshConfigs();
  }

  async refreshConfigs() {
    const platforms = await this.prisma.platformCollectionConfig.findMany();
    const jobs = await this.prisma.collectionJobConfig.findMany();
    this.platformConfigs = platforms.map((config) => ({
      id: config.id,
      platform: config.platform as PlatformCollectionConfig['platform'],
      connectorId: config.connectorId,
      displayName: config.displayName,
      enabled: config.enabled,
      defaultTimezone: config.defaultTimezone,
      defaultRegions: config.defaultRegions as string[],
      rateLimit: config.rateLimit as PlatformCollectionConfig['rateLimit'],
      variables: config.variables as PlatformCollectionConfig['variables'],
    }));
    this.jobConfigs = jobs.map((job) => ({
      id: job.id,
      platform: job.platform as CollectionJobConfig['platform'],
      name: job.name,
      toolName: job.toolName as CollectionJobConfig['toolName'],
      sourceType: job.sourceType as CollectionJobConfig['sourceType'],
      enabled: job.enabled,
      schedule: job.schedule as CollectionJobConfig['schedule'],
      inputTemplate: job.inputTemplate as CollectionJobConfig['inputTemplate'],
      variableRefs: job.variableRefs as CollectionJobConfig['variableRefs'],
      outputTarget: job.outputTarget as CollectionJobConfig['outputTarget'],
    }));
  }

  async findPlatformConfig(platform: string) {
    await this.refreshConfigs();
    return this.platformConfigs.find((config) => config.platform === platform);
  }

  async updatePlatformConfig(
    platform: string,
    patch: Partial<Pick<PlatformCollectionConfig, 'variables' | 'enabled' | 'defaultRegions'>>,
  ) {
    const existing = await this.findPlatformConfig(platform);
    if (!existing) {
      throw new Error(`Platform config not found: ${platform}`);
    }
    const nextVariables = patch.variables
      ? { ...existing.variables, ...patch.variables }
      : existing.variables;
    await this.prisma.platformCollectionConfig.update({
      where: { platform },
      data: {
        enabled: patch.enabled,
        defaultRegions: patch.defaultRegions,
        variables: nextVariables as Prisma.InputJsonValue,
      },
    });
    await this.refreshConfigs();
    const updated = this.platformConfigs.find((config) => config.platform === platform);
    if (!updated) {
      throw new Error(`Platform config not found after update: ${platform}`);
    }
    return updated;
  }

  async findJobConfig(jobId: string) {
    await this.refreshConfigs();
    return this.jobConfigs.find((config) => config.id === jobId);
  }

  async updateJobConfig(
    jobId: string,
    patch: Partial<Pick<CollectionJobConfig, 'enabled' | 'schedule' | 'inputTemplate' | 'variableRefs' | 'outputTarget'>>,
  ) {
    await this.prisma.collectionJobConfig.update({
      where: { id: jobId },
      data: {
        enabled: patch.enabled,
        schedule: patch.schedule as any,
        inputTemplate: patch.inputTemplate as any,
        variableRefs: patch.variableRefs as any,
        outputTarget: patch.outputTarget as any,
      },
    });
    await this.refreshConfigs();
    const updated = this.jobConfigs.find((config) => config.id === jobId);
    if (!updated) {
      throw new Error(`Collection job not found after update: ${jobId}`);
    }
    return updated;
  }

  async listJobConfigs(platform: string) {
    await this.refreshConfigs();
    return this.jobConfigs.filter((config) => config.platform === platform);
  }

  async findLatestFetchRun(input: {
    platform: string;
    toolName: string;
    sourceType: string;
    status?: SourceFetchRun['status'];
  }) {
    const run = await this.prisma.sourceFetchRun.findFirst({
      where: {
        platform: input.platform,
        toolName: input.toolName,
        sourceType: input.sourceType,
        status: input.status,
      },
      orderBy: { startedAt: 'desc' },
    });
    return run ? mapFetchRun(run) : undefined;
  }

  saveFetchRun(fetchRun: SourceFetchRun) {
    return this.prisma.sourceFetchRun
      .create({
        data: {
          ...fetchRun,
          startedAt: new Date(fetchRun.startedAt),
          finishedAt: fetchRun.finishedAt ? new Date(fetchRun.finishedAt) : undefined,
          input: fetchRun.input as object,
        },
      })
      .then(mapFetchRun);
  }

  updateFetchRun(id: string, patch: Partial<SourceFetchRun>) {
    return this.prisma.sourceFetchRun
      .update({
        where: { id },
        data: {
          ...patch,
          startedAt: patch.startedAt ? new Date(patch.startedAt) : undefined,
          finishedAt: patch.finishedAt ? new Date(patch.finishedAt) : undefined,
          input: patch.input as object | undefined,
        },
      })
      .then(mapFetchRun);
  }

  saveXTrendSnapshot(snapshot: XTrendSnapshot) {
    return this.prisma.xTrendSnapshot
      .create({
        data: {
          ...snapshot,
          collectedAt: new Date(snapshot.collectedAt),
          raw: snapshot.raw as object | undefined,
        },
      })
      .then((saved) => ({
        ...saved,
        collectedAt: saved.collectedAt.toISOString(),
        checksum: saved.checksum ?? undefined,
        raw: saved.raw ?? undefined,
      }));
  }

  saveXTrendSnapshotItems(items: XTrendSnapshotItem[]) {
    return this.prisma.xTrendSnapshotItem
      .createManyAndReturn({
        data: items.map((item) => ({
          ...item,
          raw: item.raw as object,
        })),
      })
      .then((saved) =>
        saved.map((item) => ({
          ...item,
          query: item.query ?? undefined,
          url: item.url ?? undefined,
          volume: item.volume ?? undefined,
          category: item.category ?? undefined,
          raw: item.raw,
        })),
      );
  }

  saveSourceSnapshot(snapshot: SourceSnapshot) {
    return this.prisma.sourceSnapshot
      .create({
        data: {
          ...snapshot,
          collectedAt: new Date(snapshot.collectedAt),
        },
      })
      .then((saved) => ({
        ...saved,
        platform: saved.platform as SourceSnapshot['platform'],
        sourceType: saved.sourceType as SourceSnapshot['sourceType'],
        collectedAt: saved.collectedAt.toISOString(),
      }));
  }

  saveSourceSnapshotItems(items: SourceSnapshotItem[]) {
    return this.prisma.sourceSnapshotItem
      .createManyAndReturn({
        data: items.map((item) => ({
          ...item,
          metrics: item.metrics as object | undefined,
        })),
      })
      .then((saved) =>
        saved.map((item) => ({
          ...item,
          platform: item.platform as SourceSnapshotItem['platform'],
          sourceType: item.sourceType as SourceSnapshotItem['sourceType'],
          metrics: item.metrics as SourceSnapshotItem['metrics'],
        })),
      );
  }

  async findPreviousSourceSnapshot(input: {
    platform: string;
    sourceType: string;
    region: string;
    before: string;
  }) {
    const snapshot = await this.prisma.sourceSnapshot.findFirst({
      where: {
        platform: input.platform,
        sourceType: input.sourceType,
        region: input.region,
        collectedAt: { lt: new Date(input.before) },
      },
      orderBy: { collectedAt: 'desc' },
    });

    return snapshot
      ? {
          ...snapshot,
          platform: snapshot.platform as SourceSnapshot['platform'],
          sourceType: snapshot.sourceType as SourceSnapshot['sourceType'],
          collectedAt: snapshot.collectedAt.toISOString(),
        }
      : undefined;
  }

  async findLatestSourceSnapshot(input: {
    platform: string;
    sourceType: string;
    region: string;
  }) {
    const snapshot = await this.prisma.sourceSnapshot.findFirst({
      where: {
        platform: input.platform,
        sourceType: input.sourceType,
        region: input.region,
      },
      orderBy: { collectedAt: 'desc' },
    });

    return snapshot
      ? {
          ...snapshot,
          platform: snapshot.platform as SourceSnapshot['platform'],
          sourceType: snapshot.sourceType as SourceSnapshot['sourceType'],
          collectedAt: snapshot.collectedAt.toISOString(),
        }
      : undefined;
  }

  async findLatestSourceSnapshots(input: {
    platform: string;
    sourceType: string;
    regions: string[];
  }) {
    if (input.regions.length === 0) {
      return [];
    }

    const snapshots = await this.prisma.sourceSnapshot.findMany({
      where: {
        platform: input.platform,
        sourceType: input.sourceType,
        region: { in: input.regions },
      },
      orderBy: [{ region: 'asc' }, { collectedAt: 'desc' }],
    });

    const latestByRegion = new Map<string, SourceSnapshot>();
    for (const snapshot of snapshots) {
      if (!latestByRegion.has(snapshot.region)) {
        latestByRegion.set(snapshot.region, {
          ...snapshot,
          platform: snapshot.platform as SourceSnapshot['platform'],
          sourceType: snapshot.sourceType as SourceSnapshot['sourceType'],
          collectedAt: snapshot.collectedAt.toISOString(),
        });
      }
    }

    return input.regions.flatMap((region) => {
      const snapshot = latestByRegion.get(region);
      return snapshot ? [snapshot] : [];
    });
  }

  async findSourceSnapshotItems(sourceSnapshotId: string) {
    const items = await this.prisma.sourceSnapshotItem.findMany({
      where: { sourceSnapshotId },
      orderBy: { rank: 'asc' },
    });
    return items.map((item) => ({
      ...item,
      platform: item.platform as SourceSnapshotItem['platform'],
      sourceType: item.sourceType as SourceSnapshotItem['sourceType'],
      metrics: item.metrics as SourceSnapshotItem['metrics'],
    }));
  }

  saveSourceSnapshotDiff(diff: SourceSnapshotDiff) {
    return this.prisma.sourceSnapshotDiff
      .create({
        data: {
          ...diff,
          entered: diff.entered as any,
          exited: diff.exited as any,
          rankUp: diff.rankUp as any,
          rankDown: diff.rankDown as any,
          unchanged: diff.unchanged as any,
        },
      })
      .then((saved) => ({
        id: saved.id,
        platform: saved.platform as SourceSnapshotDiff['platform'],
        region: saved.region,
        currentSnapshotId: saved.currentSnapshotId,
        previousSnapshotId: saved.previousSnapshotId ?? undefined,
        entered: saved.entered as unknown as SourceSnapshotDiff['entered'],
        exited: saved.exited as unknown as SourceSnapshotDiff['exited'],
        rankUp: saved.rankUp as unknown as SourceSnapshotDiff['rankUp'],
        rankDown: saved.rankDown as unknown as SourceSnapshotDiff['rankDown'],
        unchanged: saved.unchanged as unknown as SourceSnapshotDiff['unchanged'],
      }));
  }

  async findSourceSnapshotDiffs(input: { currentSnapshotIds: string[] }) {
    if (input.currentSnapshotIds.length === 0) {
      return [];
    }

    const diffs = await this.prisma.sourceSnapshotDiff.findMany({
      where: { currentSnapshotId: { in: input.currentSnapshotIds } },
    });
    return diffs.map((diff) => ({
      id: diff.id,
      platform: diff.platform as SourceSnapshotDiff['platform'],
      region: diff.region,
      currentSnapshotId: diff.currentSnapshotId,
      previousSnapshotId: diff.previousSnapshotId ?? undefined,
      entered: diff.entered as unknown as SourceSnapshotDiff['entered'],
      exited: diff.exited as unknown as SourceSnapshotDiff['exited'],
      rankUp: diff.rankUp as unknown as SourceSnapshotDiff['rankUp'],
      rankDown: diff.rankDown as unknown as SourceSnapshotDiff['rankDown'],
      unchanged: diff.unchanged as unknown as SourceSnapshotDiff['unchanged'],
    }));
  }

  saveSignals(signals: Signal[]) {
    return this.prisma.signal
      .createManyAndReturn({
        data: signals.map((signal) => ({
          ...signal,
          publishedAt: signal.publishedAt ? new Date(signal.publishedAt) : undefined,
          observedAt: new Date(signal.observedAt),
          metrics: signal.metrics as any,
          raw: signal.raw as any,
        })),
      })
      .then((saved) =>
        saved.map((signal) => ({
          ...signal,
          platformRefTable: signal.platformRefTable ?? undefined,
          platformRefId: signal.platformRefId ?? undefined,
          snapshotId: signal.snapshotId ?? undefined,
          platform: signal.platform as Signal['platform'],
          sourceType: signal.sourceType as Signal['sourceType'],
          summary: signal.summary ?? undefined,
          text: signal.text ?? undefined,
          url: signal.url ?? undefined,
          region: signal.region ?? undefined,
          rank: signal.rank ?? undefined,
          authorHandle: signal.authorHandle ?? undefined,
          publishedAt: signal.publishedAt?.toISOString(),
          observedAt: signal.observedAt.toISOString(),
          normalizedKey: signal.normalizedKey ?? undefined,
          metrics: signal.metrics as Signal['metrics'],
          raw: signal.raw ?? undefined,
        })),
      );
  }
}

function mapFetchRun(run: {
  id: string;
  platform: string;
  connectorId: string;
  toolName: string;
  sourceType: string;
  status: string;
  input: unknown;
  startedAt: Date;
  finishedAt: Date | null;
  itemCount: number;
  error: string | null;
}): SourceFetchRun {
  return {
    id: run.id,
    platform: run.platform as SourceFetchRun['platform'],
    connectorId: run.connectorId,
    toolName: run.toolName,
    sourceType: run.sourceType as SourceFetchRun['sourceType'],
    status: run.status as SourceFetchRun['status'],
    input: run.input,
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt?.toISOString(),
    itemCount: run.itemCount,
    error: run.error ?? undefined,
  };
}
