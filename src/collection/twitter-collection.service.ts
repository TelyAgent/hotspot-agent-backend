import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger, Optional, forwardRef } from '@nestjs/common';
import { ToolRegistry } from '../connectors/tool-registry';
import { WorkflowRunner } from '../workflow/workflow-runner';
import { CollectionRepository } from './collection.repository';
import { COLLECTION_REPOSITORY } from './collection.tokens';
import { CollectionVariableResolver } from './collection-variable-resolver';
import {
  CollectionJobConfig,
  PlatformCollectionConfig,
  Signal,
  SourceFetchRun,
  SourceSnapshot,
  SourceSnapshotDiff,
  SourceSnapshotItem,
  TrendDiffItem,
  XTrendingToolOutput,
  XTrendSnapshot,
} from './collection.types';

export interface RunTrendingJobInput {
  platformConfig: PlatformCollectionConfig;
  jobConfig: CollectionJobConfig;
  now: string;
  overrideVariables?: Record<string, unknown>;
}

export interface RunTrendingJobResult {
  fetchRun: SourceFetchRun;
  toolInput: Record<string, unknown>;
  snapshots: SourceSnapshot[];
  signals: Signal[];
  workflowRun?: {
    id: string;
    status: string;
    commandCount: number;
    executionCount: number;
  };
}

@Injectable()
export class TwitterCollectionService {
  private readonly logger = new Logger(TwitterCollectionService.name);
  private readonly variables = new CollectionVariableResolver();

  constructor(
    @Inject(COLLECTION_REPOSITORY)
    private readonly repository: CollectionRepository,
    private readonly tools: ToolRegistry,
    @Optional()
    @Inject(forwardRef(() => WorkflowRunner))
    private readonly workflowRunner?: Pick<WorkflowRunner, 'runXTrendEventFormation'>,
  ) {}

  async runTrendingJob(input: RunTrendingJobInput): Promise<RunTrendingJobResult> {
    const toolInput = this.variables.resolve({
      platformConfig: input.platformConfig,
      jobConfig: input.jobConfig,
      runtime: { now: input.now },
      overrideVariables: input.overrideVariables,
    });
    const fetchRun = await this.repository.saveFetchRun({
      id: `run_${randomUUID()}`,
      platform: 'x',
      connectorId: input.platformConfig.connectorId,
      toolName: input.jobConfig.toolName,
      sourceType: 'trend',
      status: 'running',
      input: toolInput,
      startedAt: input.now,
      itemCount: 0,
    });

    const toolResult = await this.invokeTrendingTool(input, fetchRun.id, toolInput);
    if (toolResult.status === 'failed') {
      return { fetchRun: toolResult.fetchRun, toolInput, snapshots: [], signals: [] };
    }
    const toolOutput = toolResult.output;
    const snapshots: SourceSnapshot[] = [];
    const signals: Signal[] = [];
    let itemCount = 0;

    for (const regionOutput of toolOutput) {
      const saved = await this.saveTrendingRegion(fetchRun.id, regionOutput);
      snapshots.push(saved.sourceSnapshot);
      signals.push(...saved.signals);
      itemCount += saved.signals.length;
    }

    const finished = await this.repository.updateFetchRun(fetchRun.id, {
      status: 'success',
      finishedAt: input.now,
      itemCount,
    });

    const workflowRun = await this.triggerEventFormationWorkflow(input.now, snapshots);

    return { fetchRun: finished, toolInput, snapshots, signals, workflowRun };
  }

  private async invokeTrendingTool(
    input: RunTrendingJobInput,
    fetchRunId: string,
    toolInput: Record<string, unknown>,
  ): Promise<
    | { status: 'success'; output: XTrendingToolOutput[] }
    | { status: 'failed'; fetchRun: SourceFetchRun }
  > {
    try {
      const output = await this.tools.invoke<XTrendingToolOutput[]>(input.jobConfig.toolName, {
        ...toolInput,
        now: input.now,
      });
      return { status: 'success', output };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const failed = await this.repository.updateFetchRun(fetchRunId, {
        status: 'failed',
        finishedAt: input.now,
        itemCount: 0,
        error: message,
      });
      return { status: 'failed', fetchRun: failed };
    }
  }

  private async triggerEventFormationWorkflow(observedAt: string, snapshots: SourceSnapshot[]) {
    if (!this.workflowRunner || snapshots.length === 0) {
      return undefined;
    }

    try {
      const result = await this.workflowRunner.runXTrendEventFormation({
        observedAt,
        regions: snapshots.map((snapshot) => snapshot.region),
      });
      return {
        id: result.run.id,
        status: result.run.status,
        commandCount: result.commands.length,
        executionCount: result.executions.length,
      };
    } catch (error) {
      this.logger.warn(
        `X trend event workflow trigger failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return undefined;
    }
  }

  private async saveTrendingRegion(fetchRunId: string, output: XTrendingToolOutput) {
    const xSnapshot: XTrendSnapshot = await this.repository.saveXTrendSnapshot({
      id: `xtrend_${randomUUID()}`,
      fetchRunId,
      region: output.region,
      collectedAt: output.collectedAt,
      itemCount: output.items.length,
      checksum: this.checksum(output.items.map((item) => `${item.rank}:${item.name}`)),
      raw: output.raw,
    });
    const sourceSnapshot = await this.repository.saveSourceSnapshot({
      id: `snap_${randomUUID()}`,
      platform: 'x',
      platformSnapshotId: xSnapshot.id,
      sourceType: 'trend',
      region: output.region,
      collectedAt: output.collectedAt,
      fetchRunId,
      itemCount: output.items.length,
    });
    const xItems = await this.repository.saveXTrendSnapshotItems(
      output.items.map((item) => ({
        id: `xtrend_item_${randomUUID()}`,
        xTrendSnapshotId: xSnapshot.id,
        rank: item.rank,
        name: item.name,
        query: item.query,
        url: item.url,
        volume: item.volume,
        category: item.category,
        normalizedKey: normalizeKey(item.name),
        raw: item.raw,
      })),
    );
    const sourceItems = await this.repository.saveSourceSnapshotItems(
      xItems.map((item) => ({
        id: `snap_item_${randomUUID()}`,
        sourceSnapshotId: sourceSnapshot.id,
        platform: 'x',
        platformItemId: item.id,
        sourceType: 'trend',
        region: output.region,
        rank: item.rank,
        title: item.name,
        normalizedKey: item.normalizedKey,
        metrics: { volume: item.volume },
      })),
    );
    const signals = await this.repository.saveSignals(
      xItems.map((item) => ({
        id: `sig_${randomUUID()}`,
        platformRefTable: 'x_trend_snapshot_item',
        platformRefId: item.id,
        snapshotId: sourceSnapshot.id,
        fetchRunId,
        platform: 'x',
        sourceType: 'trend',
        sourceItemId: `x:trend:${output.region}:${item.normalizedKey}:${output.collectedAt}`,
        title: item.name,
        url: item.url,
        region: output.region,
        rank: item.rank,
        observedAt: output.collectedAt,
        metrics: { volume: item.volume },
        normalizedKey: item.normalizedKey,
        raw: item.raw,
      })),
    );
    await this.repository.saveSourceSnapshotDiff(
      await this.createDiff(sourceSnapshot, sourceItems),
    );

    return { sourceSnapshot, signals };
  }

  private async createDiff(currentSnapshot: SourceSnapshot, currentItems: SourceSnapshotItem[]): Promise<SourceSnapshotDiff> {
    const previous = await this.repository.findPreviousSourceSnapshot({
      platform: currentSnapshot.platform,
      sourceType: currentSnapshot.sourceType,
      region: currentSnapshot.region,
      before: currentSnapshot.collectedAt,
    });
    const previousItems = previous ? await this.repository.findSourceSnapshotItems(previous.id) : [];
    const previousByKey = new Map(previousItems.map((item) => [item.normalizedKey, item]));
    const currentByKey = new Map(currentItems.map((item) => [item.normalizedKey, item]));
    const entered: TrendDiffItem[] = [];
    const rankUp: TrendDiffItem[] = [];
    const rankDown: TrendDiffItem[] = [];
    const unchanged: TrendDiffItem[] = [];

    for (const current of currentItems) {
      const last = previousByKey.get(current.normalizedKey);
      if (!last) {
        entered.push({ normalizedKey: current.normalizedKey, name: current.title, currentRank: current.rank });
        continue;
      }

      const diff = {
        normalizedKey: current.normalizedKey,
        name: current.title,
        previousRank: last.rank,
        currentRank: current.rank,
        rankDelta: last.rank - current.rank,
      };

      if (current.rank < last.rank) rankUp.push(diff);
      else if (current.rank > last.rank) rankDown.push(diff);
      else unchanged.push(diff);
    }

    const exited = previousItems
      .filter((item) => !currentByKey.has(item.normalizedKey))
      .map((item) => ({ normalizedKey: item.normalizedKey, name: item.title, previousRank: item.rank }));

    return {
      id: `diff_${randomUUID()}`,
      platform: currentSnapshot.platform,
      region: currentSnapshot.region,
      currentSnapshotId: currentSnapshot.id,
      previousSnapshotId: previous?.id,
      entered,
      exited,
      rankUp,
      rankDown,
      unchanged,
    };
  }

  private checksum(values: string[]) {
    return values.join('|');
  }
}

function normalizeKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}
