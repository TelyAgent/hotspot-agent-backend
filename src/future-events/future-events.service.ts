import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { FutureSourceType, mapFutureEventView } from './future-event.mapper';
import { DEFAULT_FUTURE_SOURCE_CONFIGS } from './future-source-defaults';
import { BlsIcsConnector } from './connectors/bls-ics.connector';
import { ParsedFutureSourceItem } from './connectors/bls-ics.parser';
import { BeaScheduleConnector, FomcCalendarConnector, OpmHolidaysConnector } from './connectors/official-html.connector';

export interface FutureEventListQuery {
  month?: string;
  unassigned?: boolean;
  confirmationLevel?: string;
  sourceType?: string;
  actionScoreMin?: string | number;
}

@Injectable()
export class FutureEventsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly blsConnector: BlsIcsConnector = new BlsIcsConnector(),
    private readonly beaConnector: BeaScheduleConnector = new BeaScheduleConnector(),
    private readonly opmConnector: OpmHolidaysConnector = new OpmHolidaysConnector(),
    private readonly fomcConnector: FomcCalendarConnector = new FomcCalendarConnector(),
  ) {}

  async onModuleInit() {
    await this.seedDefaultSourceConfigs();
    await this.backfillMissingOfficialScores();
  }

  async list(query: FutureEventListQuery = {}) {
    const events = await this.prisma.futureEvent.findMany({
      where: this.buildWhere(query),
      orderBy: [{ factTime: 'asc' }, { createdAt: 'desc' }],
      include: this.includeAggregate(),
    });

    return events.map((event) => mapFutureEventView(this.toAggregate(event)));
  }

  async detail(id: string) {
    const event = await this.prisma.futureEvent.findUnique({
      where: { id },
      include: this.includeAggregate(),
    });
    if (!event) {
      throw new NotFoundException(`未来事件不存在：${id}`);
    }
    return mapFutureEventView(this.toAggregate(event));
  }

  async heat(id: string) {
    return (await this.detail(id)).heat;
  }

  async sourceStatus() {
    const configs = await this.prisma.futureSourceConfig.findMany({
      orderBy: { sourceType: 'asc' },
      include: {
        runs: {
          orderBy: { startedAt: 'desc' },
          take: 1,
        },
      },
    });

    return configs.map((config) => {
      const lastRun = config.runs[0];
      return {
        source: config.sourceType as FutureSourceType,
        enabled: config.enabled,
        lastSyncAt: lastRun?.finishedAt?.toISOString() ?? null,
        status: config.enabled ? (lastRun?.status === 'failed' ? 'error' : lastRun ? 'ok' : 'pending') : 'disabled',
        nextSyncAt: null,
        message: lastRun?.error ?? undefined,
      };
    });
  }

  private async seedDefaultSourceConfigs() {
    for (const config of DEFAULT_FUTURE_SOURCE_CONFIGS) {
      await this.prisma.futureSourceConfig.upsert({
        where: { sourceType: config.sourceType },
        update: {
          displayName: config.displayName,
          connectorId: config.connectorId,
          schedule: config.schedule,
          variables: config.variables,
        },
        create: {
          id: config.id,
          sourceType: config.sourceType,
          displayName: config.displayName,
          connectorId: config.connectorId,
          enabled: config.enabled,
          schedule: config.schedule,
          variables: config.variables,
        },
      });
    }
  }

  private async backfillMissingOfficialScores() {
    if (!this.hasScoreBackfillDelegates()) {
      return;
    }
    const events = await this.prisma.futureEvent.findMany({
      where: {
        currentScore: 0,
        scoreVersions: { none: {} },
        evidence: {
          some: {
            sourceType: { in: ['bls', 'bea', 'opm', 'fomc'] },
            sourceItemId: { not: null },
          },
        },
      },
      include: {
        evidence: {
          where: {
            sourceType: { in: ['bls', 'bea', 'opm', 'fomc'] },
            sourceItemId: { not: null },
          },
          include: { sourceItem: true },
          take: 1,
        },
      },
      take: 200,
    });

    for (const event of events) {
      const sourceItem = event.evidence[0]?.sourceItem;
      if (!sourceItem || !this.isOfficialSourceType(sourceItem.sourceType)) {
        continue;
      }
      await this.runWindowScoreWorkflow(event.id, this.sourceItemToParsedItem(sourceItem), this.sourceMetadata(sourceItem.sourceType));
    }
  }

  private hasScoreBackfillDelegates() {
    const prisma = this.prisma as any;
    return Boolean(
      prisma.futureEvent?.findMany &&
        prisma.workflowDefinition?.upsert &&
        prisma.workflowRun?.create &&
        prisma.futureEventWindow?.deleteMany &&
        prisma.futureEventWindow?.create &&
        prisma.futureEventHeatQuery?.updateMany &&
        prisma.futureEventHeatQuery?.create &&
        prisma.futureEventScoreVersion?.create &&
        prisma.futureEvent?.update,
    );
  }

  async createManual(body: unknown) {
    const input = this.parseManualInput(body);
    const now = new Date();
    const factTime = input.factTime ? new Date(input.factTime) : null;
    const dedupeKey = this.createDedupeKey(input.title, input.subject, input.eventType, factTime);
    const sourceRun = await this.prisma.futureSourceRun.create({
      data: {
        id: `fsrun_${randomUUID()}`,
        sourceType: 'manual',
        status: 'success',
        startedAt: now,
        finishedAt: now,
        itemCount: 1,
        input: input as object,
        rawSummary: { title: input.title, sourceUrl: input.sourceUrl },
      },
    });
    const sourceItem = await this.prisma.futureSourceItem.create({
      data: {
        id: `fsitem_${randomUUID()}`,
        sourceRunId: sourceRun.id,
        sourceType: 'manual',
        sourceItemId: `manual:${dedupeKey}`,
        sourceUrl: input.sourceUrl,
        retrievedAt: now,
        title: input.title,
        description: input.attentionReason ?? null,
        startTime: factTime,
        endTime: null,
        timezone: input.timezone,
        raw: input as object,
      },
    });
    const event = await this.prisma.futureEvent.upsert({
      where: { dedupeKey },
      update: {
        title: input.title,
        subject: input.subject,
        eventType: input.eventType,
        factTime,
        timezone: input.timezone,
        schedulePrecision: input.schedulePrecision,
        ruleVersion: 'manual@v1',
      },
      create: {
        id: `future_${randomUUID()}`,
        title: input.title,
        subject: input.subject,
        eventType: input.eventType,
        dedupeKey,
        factTime,
        factEndTime: null,
        timezone: input.timezone,
        schedulePrecision: input.schedulePrecision,
        confirmationLevel: 'needs_verification',
        expressionBoundary: 'internal_only',
        status: 'active',
        currentScore: 0,
        currentScoreBand: 'observe',
        ruleVersion: 'manual@v1',
      },
      include: this.includeAggregate(),
    });
    const evidence = {
      id: `fev_${randomUUID()}`,
      futureEventId: event.id,
      sourceItemId: sourceItem.id,
      sourceType: 'manual',
      url: input.sourceUrl,
      verifiedAt: now,
      claims: input.attentionReason ? [input.attentionReason] : [],
      raw: input as object,
    };
    await this.prisma.futureEventEvidence.create({ data: evidence });

    return mapFutureEventView(
      this.toAggregate({
        ...event,
        evidence: [evidence, ...event.evidence],
      }),
    );
  }

  async importCsv(csv: string) {
    const lines = csv
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    let imported = 0;
    let skipped = 0;
    const events = [];

    for (const line of lines.slice(1)) {
      const [title, subject, eventType, factTime, sourceUrl] = line.split(',').map((cell) => cell.trim());
      if (!title || !sourceUrl) {
        skipped += 1;
        continue;
      }
      events.push(await this.createManual({ title, subject, eventType, factTime: factTime || null, sourceUrl }));
      imported += 1;
    }

    return { imported, skipped, events };
  }

  async resyncSource(source: string) {
    const config = await this.prisma.futureSourceConfig.findUnique({ where: { sourceType: source } });
    if (!config) {
      throw new NotFoundException(`未来事件来源不存在：${source}`);
    }
    const now = new Date();
    const run = await this.prisma.futureSourceRun.create({
      data: {
        id: `fsrun_${randomUUID()}`,
        sourceConfigId: config.id,
        sourceType: source,
        status: config.enabled ? 'running' : 'disabled',
        startedAt: now,
        finishedAt: null,
        itemCount: 0,
        input: { source, connectorId: config.connectorId, manualTrigger: true },
      },
    });
    if (!config.enabled) {
      return { status: 'disabled', source, itemCount: 0 };
    }
    try {
      const items = await this.fetchSourceItems(source, config.variables as Record<string, unknown>, now);
      let storedCount = 0;
      for (const item of items) {
        if (this.isInCurrentYearWindow(item, now)) {
          await this.upsertOfficialSourceItem(run.id, item);
          storedCount += 1;
        }
      }
      await this.prisma.futureSourceRun.update({
        where: { id: run.id },
        data: {
          status: 'success',
          finishedAt: new Date(),
          itemCount: storedCount,
          rawSummary: { fetchedCount: items.length, storedCount },
        },
      });
      return { status: 'success', source, itemCount: storedCount };
    } catch (error) {
      await this.prisma.futureSourceRun.update({
        where: { id: run.id },
        data: {
          status: 'failed',
          finishedAt: new Date(),
          error: error instanceof Error ? error.message : String(error),
        },
      });
      throw error;
    }
  }

  async respond(id: string, kind: string) {
    const futureEvent = await this.prisma.futureEvent.findUnique({
      where: { id },
      include: this.includeAggregate(),
    });
    if (!futureEvent) {
      throw new NotFoundException(`未来事件不存在：${id}`);
    }
    if (futureEvent.expressionBoundary === 'internal_only' || futureEvent.expressionBoundary === 'blocked') {
      throw new Error(`Future event ${id} cannot enter outward response with expressionBoundary=${futureEvent.expressionBoundary}`);
    }

    const entryMode = 'scheduled_manual_response';
    const existingLink = await this.prisma.futureEventResponseLink.findUnique({
      where: { futureEventId_entryMode: { futureEventId: id, entryMode } },
    });
    if (existingLink) {
      return { eventId: existingLink.eventId, next: kind };
    }

    const now = new Date();
    const workflowDefinition = await this.prisma.workflowDefinition.upsert({
      where: { workflowId_version: { workflowId: 'future-event-manual-response', version: 'v1' } },
      update: {
        status: 'active',
        checksum: 'manual-response-v1',
      },
      create: {
        id: 'wdef_future_event_manual_response_v1',
        workflowId: 'future-event-manual-response',
        name: 'Future Event Manual Response',
        type: 'future_event_response',
        version: 'v1',
        status: 'active',
        markdownPath: 'workflows/future-events/future-event-response-gate/WORKFLOW.md',
        outputSchemaPath: 'workflows/future-events/future-event-response-gate/output.schema.json',
        checksum: 'manual-response-v1',
      },
    });
    const workflowRunId = `wrun_${randomUUID()}`;
    await this.prisma.workflowRun.create({
      data: {
        id: workflowRunId,
        workflowDefinitionId: workflowDefinition.id,
        status: 'success',
        startedAt: now,
        finishedAt: now,
        input: { futureEventId: id, kind },
        output: { entryMode },
      },
    });
    const normalizedEventKey = `schedule:${futureEvent.dedupeKey}`;
    const event = await this.prisma.event.upsert({
      where: { normalizedEventKey },
      update: {
        title: futureEvent.title,
        status: 'responding',
        confidence: this.eventConfidence(futureEvent.confirmationLevel),
      },
      create: {
        id: `event_${randomUUID()}`,
        title: futureEvent.title,
        normalizedEventKey,
        status: 'responding',
        confidence: this.eventConfidence(futureEvent.confirmationLevel),
        formedAt: now,
      },
    });
    const summary = futureEvent.subject ? `${futureEvent.subject}：${futureEvent.title}` : futureEvent.title;
    await this.prisma.eventIntake.create({
      data: {
        id: `intake_${randomUUID()}`,
        eventId: event.id,
        workflowRunId,
        entryMode,
        observedAt: now,
        t0: now,
        title: futureEvent.title,
        oneLineSummary: summary,
        confirmationLevel: futureEvent.confirmationLevel,
        expressionBoundary: futureEvent.expressionBoundary,
        payload: {
          scheduleContext: this.scheduleContextPayload(futureEvent),
          trigger: { ruleId: 'SCHEDULE-MANUAL', reason: `manual ${kind} response`, observedAt: now.toISOString() },
        },
        dedupeKey: normalizedEventKey,
      },
    });
    await this.prisma.eventSourceContext.create({
      data: {
        id: `ctx_${randomUUID()}`,
        eventId: event.id,
        workflowRunId,
        sourceType: 'schedule',
        payload: this.scheduleContextPayload(futureEvent),
      },
    });
    for (const evidence of futureEvent.evidence) {
      await this.prisma.eventEvidence.create({
        data: {
          id: `eev_${randomUUID()}`,
          eventId: event.id,
          workflowRunId,
          sourceType: evidence.sourceType,
          url: evidence.url,
          claim: this.firstClaim(evidence.claims) ?? futureEvent.title,
          payload: evidence as object,
        },
      });
    }
    await this.prisma.futureEventResponseLink.create({
      data: {
        id: `felink_${randomUUID()}`,
        futureEventId: id,
        eventId: event.id,
        entryMode,
        createdBy: 'operator',
      },
    });

    return { eventId: event.id, next: kind };
  }

  async updateManual(id: string, _body: unknown) {
    await this.detail(id);
    throw new Error('Manual future event update is not implemented yet.');
  }

  async remove(id: string) {
    await this.prisma.futureEvent.delete({ where: { id } });
    return { status: 'deleted' };
  }

  private buildWhere(query: FutureEventListQuery) {
    const where: Record<string, unknown> = {};
    if (query.unassigned) {
      where.factTime = null;
    } else if (query.month) {
      const [year, month] = query.month.split('-').map((part) => Number.parseInt(part, 10));
      if (Number.isFinite(year) && Number.isFinite(month)) {
        where.factTime = {
          gte: new Date(Date.UTC(year, month - 1, 1)),
          lt: new Date(Date.UTC(year, month, 1)),
        };
      }
    }
    if (query.confirmationLevel) {
      where.confirmationLevel = query.confirmationLevel;
    }
    if (query.sourceType) {
      where.evidence = { some: { sourceType: query.sourceType } };
    }
    const actionScoreMin = Number.parseInt(String(query.actionScoreMin ?? ''), 10);
    if (Number.isFinite(actionScoreMin)) {
      where.currentScore = { gte: actionScoreMin };
    }
    return where;
  }

  private includeAggregate() {
    return {
      evidence: { orderBy: { verifiedAt: 'desc' as const } },
      windows: { orderBy: { createdAt: 'desc' as const } },
      heatQueries: { where: { active: true }, orderBy: { createdAt: 'desc' as const }, take: 1 },
      heatBuckets: { orderBy: { startAt: 'asc' as const }, take: 28 },
      scoreVersions: { orderBy: { createdAt: 'desc' as const }, take: 1 },
    };
  }

  private toAggregate(event: any) {
    return {
      event,
      evidence: event.evidence.map((item: any) => ({
        ...item,
        originalId: item.sourceItemId,
      })),
      windows: event.windows,
      heatQuery: event.heatQueries[0] ?? null,
      heatBuckets: event.heatBuckets,
      latestScore: event.scoreVersions[0] ?? null,
    };
  }

  private parseManualInput(body: unknown) {
    const record = body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
    const title = this.requiredString(record.title, 'title');
    const sourceUrl = this.requiredString(record.sourceUrl, 'sourceUrl');
    const subject = typeof record.subject === 'string' ? record.subject.trim() : '';
    const eventType = typeof record.eventType === 'string' && record.eventType.trim() ? record.eventType.trim() : '人工导入';
    const factTime = typeof record.factTime === 'string' && record.factTime.trim() ? record.factTime.trim() : null;
    const timezone = typeof record.timezone === 'string' && record.timezone.trim() ? record.timezone.trim() : 'UTC';
    const schedulePrecision =
      typeof record.schedulePrecision === 'string' && record.schedulePrecision.trim()
        ? record.schedulePrecision.trim()
        : factTime
          ? 'date'
          : 'unknown';
    const attentionReason =
      typeof record.attentionReason === 'string' && record.attentionReason.trim() ? record.attentionReason.trim() : undefined;
    return { title, subject, eventType, factTime, timezone, schedulePrecision, sourceUrl, attentionReason };
  }

  private requiredString(value: unknown, name: string) {
    if (typeof value !== 'string' || !value.trim()) {
      throw new Error(`${name} is required`);
    }
    return value.trim();
  }

  private createDedupeKey(title: string, subject: string, eventType: string, factTime: Date | null) {
    return [eventType, subject || 'unknown', title, factTime?.toISOString().slice(0, 10) ?? 'unknown']
      .join(':')
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  private async fetchSourceItems(source: string, variables: Record<string, unknown>, now: Date) {
    const input = { sourceType: source, variables, retrievedAt: now.toISOString() };
    if (source === 'bls') return this.blsConnector.fetch(input);
    if (source === 'bea') return this.beaConnector.fetch(input);
    if (source === 'opm') return this.opmConnector.fetch(input);
    if (source === 'fomc') return this.fomcConnector.fetch(input);
    throw new Error(`Source connector is not implemented yet: ${source}`);
  }

  private isInCurrentYearWindow(item: ParsedFutureSourceItem, now: Date) {
    if (!item.startTime) return false;
    const startTime = new Date(item.startTime);
    const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const startOfNextYear = new Date(Date.UTC(now.getUTCFullYear() + 1, 0, 1));
    return startTime >= startOfToday && startTime < startOfNextYear;
  }

  private async upsertOfficialSourceItem(sourceRunId: string, item: ParsedFutureSourceItem) {
    const metadata = this.sourceMetadata(item.sourceType);
    const sourceItem = await this.prisma.futureSourceItem.upsert({
      where: { sourceType_sourceItemId: { sourceType: item.sourceType, sourceItemId: item.sourceItemId } },
      update: {
        sourceRunId,
        sourceUrl: item.sourceUrl,
        retrievedAt: new Date(item.retrievedAt),
        title: item.title,
        description: item.description,
        startTime: item.startTime ? new Date(item.startTime) : null,
        endTime: item.endTime ? new Date(item.endTime) : null,
        timezone: item.timezone,
        raw: item.raw,
      },
      create: {
        id: `fsitem_${randomUUID()}`,
        sourceRunId,
        sourceType: item.sourceType,
        sourceItemId: item.sourceItemId,
        sourceUrl: item.sourceUrl,
        retrievedAt: new Date(item.retrievedAt),
        title: item.title,
        description: item.description,
        startTime: item.startTime ? new Date(item.startTime) : null,
        endTime: item.endTime ? new Date(item.endTime) : null,
        timezone: item.timezone,
        raw: item.raw,
      },
    });
    const factTime = item.startTime ? new Date(item.startTime) : null;
    const dedupeKey = this.createDedupeKey(item.title, metadata.subject, metadata.eventType, factTime);
    const futureEvent = await this.prisma.futureEvent.upsert({
      where: { dedupeKey },
      update: {
        title: item.title,
        subject: metadata.subject,
        eventType: metadata.eventType,
        factTime,
        factEndTime: item.endTime ? new Date(item.endTime) : null,
        timezone: item.timezone,
        schedulePrecision: metadata.schedulePrecision,
        confirmationLevel: metadata.confirmationLevel,
        expressionBoundary: metadata.expressionBoundary,
        status: 'active',
        ruleVersion: 'future-source-intake-normalization@v1',
      },
      create: {
        id: `future_${randomUUID()}`,
        title: item.title,
        subject: metadata.subject,
        eventType: metadata.eventType,
        dedupeKey,
        factTime,
        factEndTime: item.endTime ? new Date(item.endTime) : null,
        timezone: item.timezone,
        schedulePrecision: metadata.schedulePrecision,
        confirmationLevel: metadata.confirmationLevel,
        expressionBoundary: metadata.expressionBoundary,
        status: 'active',
        currentScore: 0,
        currentScoreBand: 'observe',
        ruleVersion: 'future-source-intake-normalization@v1',
      },
    });
    await this.prisma.futureEventEvidence.upsert({
      where: { id: `fev_${item.sourceType}_${item.sourceItemId}`.replace(/[^a-zA-Z0-9_-]/g, '_') },
      update: {
        futureEventId: futureEvent.id,
        sourceItemId: sourceItem.id,
        url: item.sourceUrl,
        verifiedAt: new Date(item.retrievedAt),
        claims: [`${item.title} is listed on ${metadata.subject} official schedule.`],
        raw: item.raw,
      },
      create: {
        id: `fev_${item.sourceType}_${item.sourceItemId}`.replace(/[^a-zA-Z0-9_-]/g, '_'),
        futureEventId: futureEvent.id,
        sourceItemId: sourceItem.id,
        sourceType: item.sourceType,
        url: item.sourceUrl,
        verifiedAt: new Date(item.retrievedAt),
        claims: [`${item.title} is listed on ${metadata.subject} official schedule.`],
        raw: item.raw,
      },
    });
    await this.runWindowScoreWorkflow(futureEvent.id, item, metadata);
  }

  private async runWindowScoreWorkflow(
    futureEventId: string,
    item: ParsedFutureSourceItem,
    metadata: Record<string, string>,
  ) {
    const now = new Date();
    const workflowDefinition = await this.prisma.workflowDefinition.upsert({
      where: { workflowId_version: { workflowId: 'future-event-window-score', version: 'v1' } },
      update: {
        status: 'active',
        checksum: 'future-event-window-score-v1',
      },
      create: {
        id: 'wdef_future_event_window_score_v1',
        workflowId: 'future-event-window-score',
        name: 'Future Event Window Score',
        type: 'content_generation',
        version: 'v1',
        status: 'active',
        markdownPath: 'workflows/future-events/future-event-window-score/WORKFLOW.md',
        outputSchemaPath: 'workflows/future-events/future-event-window-score/output.schema.json',
        checksum: 'future-event-window-score-v1',
      },
    });
    const workflowRun = await this.prisma.workflowRun.create({
      data: {
        id: `wrun_${randomUUID()}`,
        workflowDefinitionId: workflowDefinition.id,
        status: 'success',
        startedAt: now,
        finishedAt: now,
        input: {
          futureEventId,
          sourceType: item.sourceType,
          title: item.title,
          factTime: item.startTime,
          factEndTime: item.endTime,
          confirmationLevel: metadata.confirmationLevel,
          expressionBoundary: metadata.expressionBoundary,
        },
        output: { command: 'update_future_event_windows_score', version: 'future-event-window-score@v1' },
      },
    });
    const windows = this.calculateWindows(item, now);
    for (const window of windows) {
      await this.prisma.futureEventWindow.deleteMany({
        where: { futureEventId, windowType: window.windowType },
      });
      await this.prisma.futureEventWindow.create({
        data: {
          id: `few_${randomUUID()}`,
          futureEventId,
          windowType: window.windowType,
          startAt: window.startAt,
          endAt: window.endAt,
          source: 'workflow',
          version: 'future-event-window-score@v1',
        },
      });
    }
    await this.prisma.futureEventHeatQuery.updateMany({
      where: { futureEventId, active: true },
      data: { active: false },
    });
    await this.prisma.futureEventHeatQuery.create({
      data: {
        id: `fehq_${randomUUID()}`,
        futureEventId,
        query: this.heatQueryFor(item),
        version: 'future-event-window-score@v1',
        active: true,
      },
    });
    const score = this.calculateScore(item, metadata, now);
    await this.prisma.futureEventScoreVersion.create({
      data: {
        id: `fescore_${randomUUID()}`,
        futureEventId,
        total: score.total,
        impact: score.impact,
        evidence: score.evidence,
        heatMomentum: score.heatMomentum,
        timeUrgency: score.timeUrgency,
        contentReadiness: score.contentReadiness,
        band: score.band,
        reasons: score.reasons,
        workflowRunId: workflowRun.id,
        version: 'future-event-window-score@v1',
      },
    });
    await this.prisma.futureEvent.update({
      where: { id: futureEventId },
      data: {
        currentScore: score.total,
        currentScoreBand: score.band,
        ruleVersion: 'future-event-window-score@v1',
      },
    });
  }

  private calculateWindows(item: ParsedFutureSourceItem, now: Date) {
    const factTime = item.startTime ? new Date(item.startTime) : null;
    if (!factTime) {
      return [
        {
          windowType: 'monitoring',
          startAt: now,
          endAt: null,
        },
      ];
    }
    const day = 24 * 60 * 60 * 1000;
    return [
      { windowType: 'monitoring', startAt: now, endAt: new Date(factTime.getTime() + day) },
      { windowType: 'preheat', startAt: new Date(factTime.getTime() - 7 * day), endAt: factTime },
      { windowType: 'live', startAt: factTime, endAt: item.endTime ? new Date(item.endTime) : new Date(factTime.getTime() + day) },
      { windowType: 'followUp', startAt: new Date(factTime.getTime() + day), endAt: new Date(factTime.getTime() + 3 * day) },
    ];
  }

  private heatQueryFor(item: ParsedFutureSourceItem) {
    const title = item.title.trim();
    if (/consumer price index|cpi/i.test(title)) return 'US CPI';
    if (/employment situation|nonfarm|payroll/i.test(title)) return 'US jobs report';
    if (/personal income|pce/i.test(title)) return 'PCE';
    if (/gross domestic product|gdp/i.test(title)) return 'US GDP';
    if (item.sourceType === 'fomc') return 'FOMC';
    return title;
  }

  private calculateScore(item: ParsedFutureSourceItem, metadata: Record<string, string>, now: Date) {
    const impact = this.impactScore(item, metadata);
    const evidence = metadata.confirmationLevel === 'fixed' || metadata.confirmationLevel === 'confirmed' ? 20 : 10;
    const heatMomentum = 0;
    const timeUrgency = this.timeUrgencyScore(item.startTime, now);
    const contentReadiness = metadata.expressionBoundary === 'factual' || metadata.expressionBoundary === 'qualified' ? 8 : 2;
    const total = Math.min(70, impact.scope + impact.relevance + impact.outcomeImportance + evidence + heatMomentum + timeUrgency + contentReadiness);
    return {
      total,
      impact,
      evidence,
      heatMomentum,
      timeUrgency,
      contentReadiness,
      band: this.scoreBand(total),
      reasons: [
        `${metadata.subject} official source`,
        `confirmation=${metadata.confirmationLevel}`,
        heatMomentum === 0 ? 'no heat buckets yet, score capped at 70' : 'heat momentum included',
      ],
    };
  }

  private impactScore(item: ParsedFutureSourceItem, metadata: Record<string, string>) {
    if (item.sourceType === 'fomc') {
      return { scope: 10, relevance: 10, outcomeImportance: 10 };
    }
    const title = item.title.toLowerCase();
    if (metadata.eventType === '经济数据发布' && /(cpi|consumer price index|employment situation|gdp|gross domestic product|pce|personal income)/i.test(title)) {
      return { scope: 10, relevance: 9, outcomeImportance: 9 };
    }
    if (metadata.eventType === '经济数据发布') {
      return { scope: 8, relevance: 7, outcomeImportance: 7 };
    }
    if (item.sourceType === 'opm') {
      return { scope: 5, relevance: 4, outcomeImportance: 3 };
    }
    return { scope: 5, relevance: 5, outcomeImportance: 5 };
  }

  private timeUrgencyScore(startTime: string | null, now: Date) {
    if (!startTime) return 0;
    const days = Math.ceil((new Date(startTime).getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
    if (days <= 1) return 10;
    if (days <= 3) return 8;
    if (days <= 7) return 6;
    if (days <= 14) return 4;
    if (days <= 30) return 2;
    return 1;
  }

  private scoreBand(total: number) {
    if (total >= 85) return 'auto_response';
    if (total >= 70) return 'worth_response';
    if (total >= 55) return 'planning';
    if (total >= 35) return 'reserve';
    return 'observe';
  }

  private sourceMetadata(sourceType: ParsedFutureSourceItem['sourceType']) {
    const map = {
      bls: {
        subject: 'BLS',
        eventType: '经济数据发布',
        schedulePrecision: 'exact_time',
        confirmationLevel: 'confirmed',
        expressionBoundary: 'factual',
      },
      bea: {
        subject: 'BEA',
        eventType: '经济数据发布',
        schedulePrecision: 'exact_time',
        confirmationLevel: 'confirmed',
        expressionBoundary: 'factual',
      },
      opm: {
        subject: 'OPM',
        eventType: '美国联邦假日',
        schedulePrecision: 'date',
        confirmationLevel: 'fixed',
        expressionBoundary: 'factual',
      },
      fomc: {
        subject: 'FOMC',
        eventType: '货币政策会议',
        schedulePrecision: 'date_range',
        confirmationLevel: 'confirmed',
        expressionBoundary: 'factual',
      },
    } satisfies Record<ParsedFutureSourceItem['sourceType'], Record<string, string>>;
    return map[sourceType];
  }

  private isOfficialSourceType(sourceType: string): sourceType is ParsedFutureSourceItem['sourceType'] {
    return sourceType === 'bls' || sourceType === 'bea' || sourceType === 'opm' || sourceType === 'fomc';
  }

  private sourceItemToParsedItem(sourceItem: {
    sourceType: string;
    sourceItemId: string;
    sourceUrl: string;
    retrievedAt: Date;
    title: string;
    description: string | null;
    startTime: Date | null;
    endTime: Date | null;
    timezone: string;
    raw: unknown;
  }): ParsedFutureSourceItem {
    if (!this.isOfficialSourceType(sourceItem.sourceType)) {
      throw new Error(`Unsupported official source type: ${sourceItem.sourceType}`);
    }
    return {
      sourceType: sourceItem.sourceType,
      sourceItemId: sourceItem.sourceItemId,
      sourceUrl: sourceItem.sourceUrl,
      retrievedAt: sourceItem.retrievedAt.toISOString(),
      title: sourceItem.title,
      description: sourceItem.description,
      startTime: sourceItem.startTime?.toISOString() ?? null,
      endTime: sourceItem.endTime?.toISOString() ?? null,
      timezone: sourceItem.timezone,
      raw: sourceItem.raw && typeof sourceItem.raw === 'object' && !Array.isArray(sourceItem.raw) ? (sourceItem.raw as Record<string, string>) : {},
    };
  }

  private eventConfidence(confirmationLevel: string) {
    return confirmationLevel === 'fixed' || confirmationLevel === 'confirmed' ? 'high' : 'medium';
  }

  private firstClaim(claims: unknown): string | undefined {
    return Array.isArray(claims) ? claims.find((claim): claim is string => typeof claim === 'string' && claim.length > 0) : undefined;
  }

  private scheduleContextPayload(futureEvent: any) {
    return {
      futureEventId: futureEvent.id,
      title: futureEvent.title,
      subject: futureEvent.subject,
      eventType: futureEvent.eventType,
      factTime: futureEvent.factTime?.toISOString() ?? null,
      factEndTime: futureEvent.factEndTime?.toISOString() ?? null,
      timezone: futureEvent.timezone,
      schedulePrecision: futureEvent.schedulePrecision,
      confirmationLevel: futureEvent.confirmationLevel,
      expressionBoundary: futureEvent.expressionBoundary,
      ruleVersion: futureEvent.ruleVersion,
      evidence: futureEvent.evidence.map((item: any) => ({
        sourceType: item.sourceType,
        url: item.url,
        claims: item.claims,
        verifiedAt: item.verifiedAt?.toISOString?.() ?? item.verifiedAt,
      })),
    };
  }
}
