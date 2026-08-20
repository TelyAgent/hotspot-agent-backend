import { BadRequestException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  ContentCandidateGenerator,
  TemplateContentCandidateGenerator,
} from './content-candidate-generator';
import {
  ContentRiskPrecheckResult,
  ContentRiskPrechecker,
  RuleBasedContentRiskPrechecker,
} from './content-risk-prechecker';
import { CONTENT_REPOSITORY } from './content.tokens';
import { ContentRepository } from './content.repository';
import { AccountResponseTaskRecord, EventContextPackRecord, OperationAccountRecord } from './content.types';
import { CONTENT_CANDIDATE_GENERATOR, CONTENT_RISK_PRECHECKER } from './content.tokens';

export interface GenerateCandidatesRequest {
  generationKind?: 'initial' | 'regenerate_all' | 'revise_selected';
  instruction?: string;
  now?: string;
}

export interface PublishTaskRequest {
  candidateId: string;
  url: string;
  now?: string;
}

export interface RecordPublicationMetricsRequest {
  capturedAt?: string;
  likes: number;
  replies: number;
  reposts: number;
  quotes?: number;
  views?: number;
  raw?: unknown;
}

export interface CompleteTrackingRequest {
  now?: string;
}

@Injectable()
export class ContentService {
  constructor(
    @Inject(CONTENT_REPOSITORY) private readonly contentRepository: ContentRepository,
    @Optional()
    @Inject(CONTENT_CANDIDATE_GENERATOR)
    private readonly contentCandidateGenerator: ContentCandidateGenerator = new TemplateContentCandidateGenerator(),
    @Optional()
    @Inject(CONTENT_RISK_PRECHECKER)
    private readonly contentRiskPrechecker: ContentRiskPrechecker = new RuleBasedContentRiskPrechecker(),
  ) {}

  async listTasks() {
    const [tasks, candidates, accounts] = await Promise.all([
      this.contentRepository.listAccountResponseTasks(),
      this.contentRepository.listContentCandidates(),
      this.contentRepository.listOperationAccounts(),
    ]);
    const eventContextPacks = await Promise.all(
      Array.from(new Set(tasks.map((task) => task.eventId))).map((eventId) =>
        this.contentRepository.findEventContextPackById(eventId),
      ),
    );
    const eventById = new Map(
      eventContextPacks
        .filter((eventContextPack): eventContextPack is EventContextPackRecord => Boolean(eventContextPack))
        .map((eventContextPack) => [eventContextPack.eventId, eventContextPack]),
    );
    const accountById = new Map(accounts.map((account) => [account.id, account]));
    return {
      items: tasks.map((task) =>
        this.toTaskItem(
          task,
          candidates.filter((candidate) => candidate.taskId === task.id).length,
          eventById.get(task.eventId),
          accountById.get(task.accountId),
        ),
      ),
      total: tasks.length,
    };
  }

  async getTask(id: string) {
    const task = await this.contentRepository.findAccountResponseTaskById(id);
    if (!task) {
      throw new NotFoundException(`Content task not found: ${id}`);
    }
    const [batches, candidates, eventContextPack, account] = await Promise.all([
      this.contentRepository.listContentCandidateBatches(id),
      this.contentRepository.listContentCandidates(id),
      this.contentRepository.findEventContextPackById(task.eventId),
      this.contentRepository.findOperationAccountById(task.accountId),
    ]);
    return {
      ...this.toTaskItem(task, candidates.length, eventContextPack, account),
      batches,
      candidates,
    };
  }

  async generateCandidates(id: string, request: GenerateCandidatesRequest = {}) {
    const task = await this.contentRepository.findAccountResponseTaskById(id);
    if (!task) {
      throw new NotFoundException(`Content task not found: ${id}`);
    }
    const [eventContextPack, account, existingCandidates] = await Promise.all([
      this.contentRepository.findEventContextPackById(task.eventId),
      this.contentRepository.findOperationAccountById(task.accountId),
      this.contentRepository.listContentCandidates(task.id),
    ]);
    if (!eventContextPack) {
      throw new NotFoundException(`Event context pack not found: ${task.eventId}`);
    }
    if (!account) {
      throw new NotFoundException(`Operation account not found: ${task.accountId}`);
    }

    const now = request.now ?? new Date().toISOString();
    const generationKind = request.generationKind ?? (existingCandidates.length ? 'regenerate_all' : 'initial');
    const generated = await this.contentCandidateGenerator.generate({
      generationKind,
      userInstruction: request.instruction,
      task: {
        id: task.id,
        eventId: task.eventId,
        accountId: task.accountId,
        status: task.status,
        skill: task.skill,
        skillVersion: task.skillVersion,
      },
      eventContextPack,
      account,
      existingCandidates: existingCandidates.map((candidate) => ({
        id: candidate.id,
        text: candidate.text,
        status: candidate.status,
      })),
    });
    if (generated.length !== 3) {
      throw new Error(`Content generator must return exactly 3 candidates, received ${generated.length}.`);
    }
    const precheckResults = await Promise.all(
      generated.map((candidate) =>
        this.contentRiskPrechecker.precheck({
          candidate,
          eventContextPack,
          account,
        }),
      ),
    );

    const batch = await this.contentRepository.createContentCandidateBatch({
      id: `content_candidate_batch_${randomUUID()}`,
      taskId: task.id,
      workflowRunId: `manual_generation_${randomUUID()}`,
      generationKind,
      userInstruction: request.instruction,
      status: 'success',
      createdAt: now,
    });
    const candidates = await this.contentRepository.createContentCandidates(
      generated.map((candidate, index) => ({
        id: `content_candidate_${randomUUID()}`,
        batchId: batch.id,
        taskId: task.id,
        localKey: candidate.localKey,
        format: candidate.format,
        text: candidate.text,
        targetPostUrl: candidate.targetPostUrl,
        angle: candidate.angle,
        factualClaims: candidate.factualClaims,
        uncertaintyNotes: candidate.uncertaintyNotes,
        productBridge: candidate.productBridge,
        riskStatus: precheckResults[index].riskStatus,
        precheckPayload: precheckResults[index],
        status: precheckResults[index].candidateStatus,
        createdAt: now,
      })),
    );
    const taskRiskStatus = highestRisk(precheckResults);
    const updatedTask = await this.contentRepository.updateAccountResponseTask(task.id, {
      status: candidates.some((candidate) => candidate.status === 'available' || candidate.status === 'warning')
        ? 'ready_for_publish'
        : 'precheck_blocked',
      riskStatus: taskRiskStatus,
      latestCandidateBatchId: batch.id,
      updatedAt: now,
    });

    return {
      taskId: task.id,
      batchId: batch.id,
      status: updatedTask.status,
      candidates,
    };
  }

  async publishTask(taskId: string, request: PublishTaskRequest) {
    const task = await this.requireTask(taskId);
    if (!request.candidateId?.trim()) {
      throw new BadRequestException('candidateId is required.');
    }
    const candidate = await this.contentRepository.findContentCandidateById(request.candidateId.trim());
    if (!candidate || candidate.taskId !== task.id) {
      throw new NotFoundException(`Content candidate not found for task: ${request.candidateId}`);
    }
    if (candidate.status === 'blocked') {
      throw new BadRequestException('Blocked candidates cannot be published.');
    }
    if (candidate.status !== 'available' && candidate.status !== 'warning' && candidate.status !== 'published') {
      throw new BadRequestException(`Candidate status cannot be published: ${candidate.status}`);
    }
    const url = request.url.trim();
    if (!isValidXPostUrl(url)) {
      throw new BadRequestException('URL 格式错误，请输入有效的 X/Twitter 帖子链接。');
    }
    const duplicate = await this.contentRepository.findPublicationRecordByUrl(url);
    if (duplicate) {
      throw new BadRequestException('该 URL 已被其他发布记录使用。');
    }
    const now = request.now ?? new Date().toISOString();
    const publication = await this.contentRepository.createPublicationRecord({
      id: `publication_record_${randomUUID()}`,
      taskId: task.id,
      candidateId: candidate.id,
      eventId: task.eventId,
      accountId: task.accountId,
      url,
      status: 'published',
      publishedAt: now,
      trackingStatus: 'tracking',
      trackingEndsAt: new Date(new Date(now).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      createdAt: now,
    });
    await Promise.all([
      this.contentRepository.updateContentCandidate(candidate.id, { status: 'published' }),
      this.contentRepository.updateAccountResponseTask(task.id, {
        status: 'published',
        updatedAt: now,
      }),
    ]);
    return publication;
  }

  async recordPublicationMetrics(publicationRecordId: string, request: RecordPublicationMetricsRequest) {
    const publication = await this.contentRepository.findPublicationRecordById(publicationRecordId);
    if (!publication) {
      throw new NotFoundException(`Publication record not found: ${publicationRecordId}`);
    }
    const now = new Date().toISOString();
    const metric = await this.contentRepository.createPublicationMetric({
      id: `publication_metric_${randomUUID()}`,
      publicationRecordId: publication.id,
      capturedAt: request.capturedAt ?? now,
      likes: nonNegativeInteger(request.likes, 'likes'),
      replies: nonNegativeInteger(request.replies, 'replies'),
      reposts: nonNegativeInteger(request.reposts, 'reposts'),
      quotes: optionalNonNegativeInteger(request.quotes, 'quotes'),
      views: optionalNonNegativeInteger(request.views, 'views'),
      raw: request.raw,
      createdAt: now,
    });
    await Promise.all([
      this.contentRepository.updatePublicationRecord(publication.id, {
        trackingStatus: 'tracking',
      }),
      this.contentRepository.updateAccountResponseTask(publication.taskId, {
        status: 'tracking',
        updatedAt: now,
      }),
    ]);
    return metric;
  }

  async completeTracking(publicationRecordId: string, request: CompleteTrackingRequest = {}) {
    const publication = await this.contentRepository.findPublicationRecordById(publicationRecordId);
    if (!publication) {
      throw new NotFoundException(`Publication record not found: ${publicationRecordId}`);
    }
    const now = request.now ?? new Date().toISOString();
    const completed = await this.contentRepository.updatePublicationRecord(publication.id, {
      trackingStatus: 'completed',
      trackingEndsAt: now,
    });
    await this.contentRepository.updateAccountResponseTask(publication.taskId, {
      status: 'completed',
      updatedAt: now,
    });
    return completed;
  }

  private async requireTask(id: string) {
    const task = await this.contentRepository.findAccountResponseTaskById(id);
    if (!task) {
      throw new NotFoundException(`Content task not found: ${id}`);
    }
    return task;
  }

  private toTaskItem(
    task: AccountResponseTaskRecord,
    candidateCount: number,
    eventContextPack?: EventContextPackRecord,
    account?: OperationAccountRecord,
  ) {
    return {
      id: task.id,
      eventId: task.eventId,
      eventTitle: eventContextPack?.title ?? task.eventId,
      eventSummary: eventContextPack?.oneLineSummary,
      accountId: task.accountId,
      accountName: account?.name ?? task.accountId,
      status: task.status,
      priority: task.priority,
      skill: task.skill,
      skillVersion: task.skillVersion,
      assignmentReason: task.assignmentReason,
      riskStatus: task.riskStatus,
      latestCandidateBatchId: task.latestCandidateBatchId,
      candidateCount,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    };
  }
}

function isValidXPostUrl(url: string) {
  return /^https?:\/\/(x\.com|twitter\.com)\/[^/]+\/status\/\d+/i.test(url);
}

function nonNegativeInteger(value: number, field: string) {
  if (!Number.isInteger(value) || value < 0) {
    throw new BadRequestException(`${field} must be a non-negative integer.`);
  }
  return value;
}

function optionalNonNegativeInteger(value: number | undefined, field: string) {
  return value === undefined ? undefined : nonNegativeInteger(value, field);
}

function highestRisk(results: ContentRiskPrecheckResult[]) {
  const rank: Record<string, number> = {
    low: 1,
    medium: 2,
    high: 3,
    blocked: 4,
  };
  return results.reduce((highest, result) => (rank[result.riskStatus] > rank[highest] ? result.riskStatus : highest), 'low');
}
