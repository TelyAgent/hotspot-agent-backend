import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  ContentTaskRecord,
  ContentCommandExecutionRecord,
  ContentCandidateBatchRecord,
  ContentCandidateRecord,
  CreateContentCandidateBatchInput,
  CreateContentCandidateInput,
  CreatePublicationMetricInput,
  CreatePublicationRecordInput,
  EventContextPackRecord,
  OperationAccountRecord,
  PublicationMetricRecord,
  PublicationRecord,
} from './content.types';
import { ContentRepository, CreateContentTaskInput } from './content.repository';

@Injectable()
export class PrismaContentRepository implements ContentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findCommandExecutionByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<ContentCommandExecutionRecord | undefined> {
    const execution = await this.contentDelegate('workflowCommandExecution').findFirst({
      where: { idempotencyKey, status: 'success' },
      orderBy: { createdAt: 'desc' },
    });
    return execution ? mapContentCommandExecution(execution) : undefined;
  }

  async saveCommandExecution(execution: ContentCommandExecutionRecord) {
    const saved = await this.contentDelegate('workflowCommandExecution').create({
      data: {
        id: execution.id,
        workflowCommandId: execution.workflowCommandId,
        workflowRunId: execution.workflowRunId,
        commandType: execution.commandType,
        idempotencyKey: execution.idempotencyKey,
        status: execution.status,
        targetEventId: execution.targetTaskId,
        error: execution.error,
        createdAt: new Date(execution.createdAt),
      },
    });
    return mapContentCommandExecution(saved);
  }

  async findContentTaskByEventAndAccount(eventId: string, accountId: string) {
    const task = await this.contentDelegate('contentTask').findUnique({
      where: {
        eventId_accountId: {
          eventId,
          accountId,
        },
      },
    });
    return task ? mapContentTask(task) : undefined;
  }

  async createContentTask(input: CreateContentTaskInput) {
    const task = await this.contentDelegate('contentTask').create({
      data: {
        id: input.id,
        eventId: input.eventId,
        accountId: input.accountId,
        workflowRunId: input.workflowRunId,
        assignmentCommandId: input.assignmentCommandId,
        status: input.status,
        priority: input.priority,
        skill: input.skill,
        skillVersion: input.skillVersion,
        assignmentReason: input.assignmentReason,
        riskStatus: input.riskStatus,
        createdAt: new Date(input.createdAt),
        updatedAt: new Date(input.updatedAt),
      },
    });
    return mapContentTask(task);
  }

  async updateContentTask(id: string, patch: Parameters<ContentRepository['updateContentTask']>[1]) {
    const task = await this.contentDelegate('contentTask').update({
      where: { id },
      data: {
        status: patch.status,
        riskStatus: patch.riskStatus,
        latestCandidateBatchId: patch.latestCandidateBatchId,
        updatedAt: patch.updatedAt ? new Date(patch.updatedAt) : undefined,
      },
    });
    return mapContentTask(task);
  }

  async listContentTasks() {
    const tasks = await this.contentDelegate('contentTask').findMany({
      orderBy: { createdAt: 'desc' },
    });
    return tasks.map(mapContentTask);
  }

  async findContentTaskById(id: string) {
    const task = await this.contentDelegate('contentTask').findUnique({ where: { id } });
    return task ? mapContentTask(task) : undefined;
  }

  async listOperationAccounts() {
    const accounts = await this.contentDelegate('operationAccount').findMany({
      orderBy: { createdAt: 'asc' },
    });
    return accounts.map(mapOperationAccount);
  }

  async findOperationAccountById(id: string) {
    const account = await this.contentDelegate('operationAccount').findUnique({ where: { id } });
    return account ? mapOperationAccount(account) : undefined;
  }

  async findEventContextPackById(id: string) {
    const event = await this.contentDelegate('event').findUnique({
      where: { id },
      include: {
        intakes: { orderBy: { createdAt: 'desc' }, take: 1 },
        evidence: { orderBy: { createdAt: 'asc' } },
        sourceContexts: { orderBy: { createdAt: 'asc' } },
      },
    });
    return event ? mapEventContextPack(event) : undefined;
  }

  async findEventTimingById(id: string) {
    const event = await this.contentDelegate('event').findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        formedAt: true,
      },
    });
    return event ? mapEventTiming(event) : undefined;
  }

  async createContentCandidateBatch(input: CreateContentCandidateBatchInput) {
    const batch = await this.contentDelegate('contentCandidateBatch').create({
      data: {
        id: input.id,
        taskId: input.taskId,
        workflowRunId: input.workflowRunId,
        generationKind: input.generationKind,
        userInstruction: input.userInstruction,
        status: input.status,
        createdAt: new Date(input.createdAt),
      },
    });
    return mapContentCandidateBatch(batch);
  }

  async createContentCandidates(input: CreateContentCandidateInput[]) {
    await this.contentDelegate('contentCandidate').createMany({
      data: input.map((candidate) => ({
        id: candidate.id,
        batchId: candidate.batchId,
        taskId: candidate.taskId,
        localKey: candidate.localKey,
        format: candidate.format,
        text: candidate.text,
        targetPostUrl: candidate.targetPostUrl,
        angle: candidate.angle,
        factualClaims: candidate.factualClaims,
        uncertaintyNotes: candidate.uncertaintyNotes,
        productBridge: candidate.productBridge,
        riskStatus: candidate.riskStatus,
        precheckPayload: candidate.precheckPayload,
        status: candidate.status,
        createdAt: new Date(candidate.createdAt),
      })),
    });
    const candidates = await this.contentDelegate('contentCandidate').findMany({
      where: { id: { in: input.map((candidate) => candidate.id) } },
      orderBy: { createdAt: 'asc' },
    });
    return candidates.map(mapContentCandidate);
  }

  async findContentCandidateById(id: string) {
    const candidate = await this.contentDelegate('contentCandidate').findUnique({ where: { id } });
    return candidate ? mapContentCandidate(candidate) : undefined;
  }

  async updateContentCandidate(id: string, patch: Parameters<ContentRepository['updateContentCandidate']>[1]) {
    const candidate = await this.contentDelegate('contentCandidate').update({
      where: { id },
      data: {
        status: patch.status,
        riskStatus: patch.riskStatus,
        precheckPayload: patch.precheckPayload,
      },
    });
    return mapContentCandidate(candidate);
  }

  async listContentCandidateBatches(taskId?: string) {
    const batches = await this.contentDelegate('contentCandidateBatch').findMany({
      where: taskId ? { taskId } : undefined,
      orderBy: { createdAt: 'desc' },
    });
    return batches.map(mapContentCandidateBatch);
  }

  async listContentCandidates(taskId?: string) {
    const candidates = await this.contentDelegate('contentCandidate').findMany({
      where: taskId ? { taskId } : undefined,
      orderBy: { createdAt: 'desc' },
    });
    return candidates.map(mapContentCandidate);
  }

  async findPublicationRecordByUrl(url: string) {
    const record = await this.contentDelegate('publicationRecord').findUnique({ where: { url } });
    return record ? mapPublicationRecord(record) : undefined;
  }

  async findPublicationRecordById(id: string) {
    const record = await this.contentDelegate('publicationRecord').findUnique({ where: { id } });
    return record ? mapPublicationRecord(record) : undefined;
  }

  async listPublicationRecords() {
    const records = await this.contentDelegate('publicationRecord').findMany({
      orderBy: { createdAt: 'desc' },
    });
    return records.map(mapPublicationRecord);
  }

  async updatePublicationRecord(id: string, patch: Parameters<ContentRepository['updatePublicationRecord']>[1]) {
    const record = await this.contentDelegate('publicationRecord').update({
      where: { id },
      data: {
        status: patch.status,
        trackingStatus: patch.trackingStatus,
        trackingEndsAt: patch.trackingEndsAt ? new Date(patch.trackingEndsAt) : undefined,
        wellPerforming: patch.wellPerforming,
        trackingRuleVersion: patch.trackingRuleVersion,
        lastTrackingError: patch.lastTrackingError,
        lastTrackingErrorAt: patch.lastTrackingErrorAt ? new Date(patch.lastTrackingErrorAt) : undefined,
        trackingFailureCount: patch.trackingFailureCount,
        eventFormedAt: patch.eventFormedAt ? new Date(patch.eventFormedAt) : undefined,
        urlFilledAt: patch.urlFilledAt ? new Date(patch.urlFilledAt) : undefined,
        firstPublishLatencyMs: patch.firstPublishLatencyMs,
      },
    });
    return mapPublicationRecord(record);
  }

  async createPublicationRecord(input: CreatePublicationRecordInput) {
    const record = await this.contentDelegate('publicationRecord').create({
      data: {
        id: input.id,
        taskId: input.taskId,
        candidateId: input.candidateId,
        eventId: input.eventId,
        accountId: input.accountId,
        url: input.url,
        status: input.status,
        publishedAt: new Date(input.publishedAt),
        trackingStatus: input.trackingStatus,
        trackingEndsAt: input.trackingEndsAt ? new Date(input.trackingEndsAt) : undefined,
        wellPerforming: input.wellPerforming,
        trackingRuleVersion: input.trackingRuleVersion,
        lastTrackingError: input.lastTrackingError,
        lastTrackingErrorAt: input.lastTrackingErrorAt ? new Date(input.lastTrackingErrorAt) : undefined,
        trackingFailureCount: input.trackingFailureCount,
        eventFormedAt: input.eventFormedAt ? new Date(input.eventFormedAt) : undefined,
        urlFilledAt: input.urlFilledAt ? new Date(input.urlFilledAt) : undefined,
        firstPublishLatencyMs: input.firstPublishLatencyMs,
        createdAt: new Date(input.createdAt),
      },
    });
    return mapPublicationRecord(record);
  }

  async createPublicationMetric(input: CreatePublicationMetricInput) {
    const metric = await this.contentDelegate('publicationMetric').create({
      data: {
        id: input.id,
        publicationRecordId: input.publicationRecordId,
        capturedAt: new Date(input.capturedAt),
        likes: input.likes,
        replies: input.replies,
        reposts: input.reposts,
        quotes: input.quotes,
        views: input.views,
        raw: input.raw,
        createdAt: new Date(input.createdAt),
      },
    });
    return mapPublicationMetric(metric);
  }

  async findLatestPublicationMetric(publicationRecordId: string) {
    const metric = await this.contentDelegate('publicationMetric').findFirst({
      where: { publicationRecordId },
      orderBy: { capturedAt: 'desc' },
    });
    return metric ? mapPublicationMetric(metric) : undefined;
  }

  async listPublicationMetrics(publicationRecordId?: string) {
    const metrics = await this.contentDelegate('publicationMetric').findMany({
      where: publicationRecordId ? { publicationRecordId } : undefined,
      orderBy: { capturedAt: 'desc' },
    });
    return metrics.map(mapPublicationMetric);
  }

  private contentDelegate(name: string) {
    return (this.prisma as unknown as Record<string, unknown>)[name] as {
      findFirst: (args: unknown) => Promise<unknown>;
      findUnique: (args: unknown) => Promise<unknown>;
      findMany: (args: unknown) => Promise<unknown[]>;
      create: (args: unknown) => Promise<unknown>;
      createMany: (args: unknown) => Promise<unknown>;
      update: (args: unknown) => Promise<unknown>;
    };
  }
}

function mapContentTask(task: unknown): ContentTaskRecord {
  const row = task as {
    id: string;
    eventId: string;
    accountId: string;
    workflowRunId: string | null;
    assignmentCommandId: string | null;
    status: string;
    priority: string;
    skill: string;
    skillVersion: string;
    assignmentReason: string;
    riskStatus: string;
    latestCandidateBatchId: string | null;
    createdAt: Date;
    updatedAt: Date;
  };
  return {
    id: row.id,
    eventId: row.eventId,
    accountId: row.accountId,
    workflowRunId: row.workflowRunId ?? undefined,
    assignmentCommandId: row.assignmentCommandId ?? undefined,
    status: row.status as ContentTaskRecord['status'],
    priority: row.priority as ContentTaskRecord['priority'],
    skill: row.skill,
    skillVersion: row.skillVersion,
    assignmentReason: row.assignmentReason,
    riskStatus: row.riskStatus,
    latestCandidateBatchId: row.latestCandidateBatchId ?? undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapOperationAccount(account: unknown): OperationAccountRecord {
  const row = account as {
    id: string;
    key: string;
    name: string;
    description: string | null;
    enabled: boolean;
    fields: unknown;
  };
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    description: row.description ?? undefined,
    enabled: row.enabled,
    fields: isRecord(row.fields) ? row.fields : {},
  };
}

function mapEventContextPack(event: unknown): EventContextPackRecord {
  const row = event as {
    id: string;
    title: string;
    status: string;
    intakes?: {
      oneLineSummary: string;
      confirmationLevel: string;
      expressionBoundary: string;
      payload: unknown;
    }[];
    evidence?: {
      sourceType: string;
      url: string | null;
      claim: string;
      payload: unknown;
    }[];
    sourceContexts?: {
      payload: unknown;
    }[];
  };
  const intake = row.intakes?.[0];
  const payload = isRecord(intake?.payload) ? intake.payload : {};
  return {
    eventId: row.id,
    title: row.title,
    oneLineSummary: intake?.oneLineSummary ?? row.title,
    status: row.status,
    confirmationLevel: intake?.confirmationLevel ?? 'unconfirmed',
    expressionBoundary: intake?.expressionBoundary ?? '',
    confirmedFacts: stringArray(payload.confirmedFacts),
    unconfirmedFacts: stringArray(payload.unconfirmedFacts),
    evidenceRecords: (row.evidence ?? []).map((record) => ({
      sourceType: record.sourceType,
      url: record.url ?? undefined,
      claim: record.claim,
      payload: record.payload,
    })),
    sourceContexts: (row.sourceContexts ?? []).map((context) => context.payload),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function mapContentCandidateBatch(batch: unknown): ContentCandidateBatchRecord {
  const row = batch as {
    id: string;
    taskId: string;
    workflowRunId: string;
    generationKind: string;
    userInstruction: string | null;
    status: string;
    createdAt: Date;
  };
  return {
    id: row.id,
    taskId: row.taskId,
    workflowRunId: row.workflowRunId,
    generationKind: row.generationKind,
    userInstruction: row.userInstruction ?? undefined,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  };
}

function mapContentCandidate(candidate: unknown): ContentCandidateRecord {
  const row = candidate as {
    id: string;
    batchId: string;
    taskId: string;
    localKey: string;
    format: string;
    text: string;
    targetPostUrl: string | null;
    angle: string;
    factualClaims: unknown;
    uncertaintyNotes: unknown;
    productBridge: string | null;
    riskStatus: string;
    precheckPayload: unknown | null;
    status: string;
    createdAt: Date;
  };
  return {
    id: row.id,
    batchId: row.batchId,
    taskId: row.taskId,
    localKey: row.localKey,
    format: row.format,
    text: row.text,
    targetPostUrl: row.targetPostUrl ?? undefined,
    angle: row.angle,
    factualClaims: row.factualClaims,
    uncertaintyNotes: row.uncertaintyNotes,
    productBridge: row.productBridge ?? undefined,
    riskStatus: row.riskStatus,
    precheckPayload: row.precheckPayload ?? undefined,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  };
}

function mapPublicationRecord(record: unknown): PublicationRecord {
  const row = record as {
    id: string;
    taskId: string;
    candidateId: string;
    eventId: string;
    accountId: string;
    url: string;
    status: string;
    publishedAt: Date;
    trackingStatus: string;
    trackingEndsAt: Date | null;
    wellPerforming: boolean;
    trackingRuleVersion: string;
    lastTrackingError: string | null;
    lastTrackingErrorAt: Date | null;
    trackingFailureCount: number;
    eventFormedAt: Date | null;
    urlFilledAt: Date | null;
    firstPublishLatencyMs: number | null;
    createdAt: Date;
  };
  return {
    id: row.id,
    taskId: row.taskId,
    candidateId: row.candidateId,
    eventId: row.eventId,
    accountId: row.accountId,
    url: row.url,
    status: row.status,
    publishedAt: row.publishedAt.toISOString(),
    trackingStatus: row.trackingStatus,
    trackingEndsAt: row.trackingEndsAt?.toISOString(),
    wellPerforming: row.wellPerforming,
    trackingRuleVersion: row.trackingRuleVersion,
    lastTrackingError: row.lastTrackingError ?? undefined,
    lastTrackingErrorAt: row.lastTrackingErrorAt?.toISOString(),
    trackingFailureCount: row.trackingFailureCount,
    eventFormedAt: row.eventFormedAt?.toISOString(),
    urlFilledAt: row.urlFilledAt?.toISOString(),
    firstPublishLatencyMs: row.firstPublishLatencyMs ?? undefined,
    createdAt: row.createdAt.toISOString(),
  };
}

function mapEventTiming(event: unknown) {
  const row = event as {
    id: string;
    title: string;
    formedAt: Date;
  };
  return {
    id: row.id,
    title: row.title,
    formedAt: row.formedAt.toISOString(),
  };
}

function mapPublicationMetric(metric: unknown): PublicationMetricRecord {
  const row = metric as {
    id: string;
    publicationRecordId: string;
    capturedAt: Date;
    likes: number;
    replies: number;
    reposts: number;
    quotes: number | null;
    views: number | null;
    raw: unknown | null;
    createdAt: Date;
  };
  return {
    id: row.id,
    publicationRecordId: row.publicationRecordId,
    capturedAt: row.capturedAt.toISOString(),
    likes: row.likes,
    replies: row.replies,
    reposts: row.reposts,
    quotes: row.quotes ?? undefined,
    views: row.views ?? undefined,
    raw: row.raw ?? undefined,
    createdAt: row.createdAt.toISOString(),
  };
}

function mapContentCommandExecution(execution: unknown): ContentCommandExecutionRecord {
  const row = execution as {
    id: string;
    workflowCommandId: string;
    workflowRunId: string;
    commandType: string;
    idempotencyKey: string;
    status: string;
    targetEventId: string | null;
    error: string | null;
    createdAt: Date;
  };
  return {
    id: row.id,
    workflowCommandId: row.workflowCommandId,
    workflowRunId: row.workflowRunId,
    commandType: row.commandType as ContentCommandExecutionRecord['commandType'],
    idempotencyKey: row.idempotencyKey,
    status: row.status as ContentCommandExecutionRecord['status'],
    targetTaskId: row.targetEventId ?? undefined,
    error: row.error ?? undefined,
    createdAt: row.createdAt.toISOString(),
  };
}
