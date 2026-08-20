import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ToolRegistry } from '../connectors/tool-registry';
import { PrismaService } from '../prisma/prisma.service';
import { WorkflowRunner } from '../workflow/workflow-runner';
import { TriggerPayload } from '../workflow/workflow.types';
import { TopicCircleClusteringWorkflowRunner } from './topic-circle-clustering.runner';
import {
  DEFAULT_TOPIC_CIRCLES,
  TOPIC_CIRCLE_RULE_VERSION,
  TOPIC_CIRCLE_WORKFLOW_ID,
} from './topic-circle.defaults';

const OVERLAP_MS = 10 * 60 * 1000;
const FIRST_COLLECT_WINDOW_MS = 3 * 60 * 60 * 1000;
const MAX_PAGES = 5;
const TOPIC_WINDOW_MS = 24 * 60 * 60 * 1000;
const SHORT_WINDOW_MS = 3 * 60 * 60 * 1000;
const BASELINE_POST_LIMIT = 30;

export interface TopicCircleCollectionResult {
  fetchRun: Awaited<ReturnType<PrismaService['topicCircleFetchRun']['update']>>;
  analysis?: {
    topics: number;
    computed: number;
    triggered: number;
    refreshed: number;
  };
}

interface XAccountPost {
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
  metrics?: Record<string, number | undefined>;
  raw: unknown;
}

interface XGetAccountPostsOutput {
  platform: 'x';
  sourceType: 'topic_circle_post';
  handle: string;
  collectedAt: string;
  posts: XAccountPost[];
  nextCursor?: string;
}

export interface TopicCircleClusteringInput {
  topicCircle: {
    id: string;
    name: string;
    keywords: unknown;
    positiveExamples?: unknown;
    negativeExamples?: unknown;
  };
  posts: Array<{
    postId: string;
    text: string;
    authorHandle: string;
    publishedAt: string;
    metrics?: Prisma.JsonValue | null;
  }>;
  observedAt: string;
}

export interface TopicCircleClusteredCandidate {
  normalizedEventKey: string;
  title: string;
  summary: string;
  coreFact: string;
  confidence: number;
  postIds: string[];
}

export interface TopicCircleClusteringRunner {
  runTopicCircleClustering(input: TopicCircleClusteringInput): Promise<{ candidates: TopicCircleClusteredCandidate[] }>;
}

@Injectable()
export class TopicCircleService implements OnModuleInit {
  private readonly logger = new Logger(TopicCircleService.name);
  private workflowRunnerMissingWarned = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tools: ToolRegistry,
    @Optional()
    @Inject(WorkflowRunner)
    private readonly workflowRunner?: Pick<WorkflowRunner, 'runTopicCircleEventFormation'>,
    @Optional()
    @Inject(TopicCircleClusteringWorkflowRunner)
    private readonly clusteringRunner?: TopicCircleClusteringRunner,
  ) {}

  async onModuleInit() {
    await this.seedDefaults();
  }

  async seedDefaults() {
    for (const circle of DEFAULT_TOPIC_CIRCLES) {
      await this.prisma.topicCircleConfig.upsert({
        where: { id: circle.id },
        update: {
          keywords: circle.keywords as Prisma.InputJsonValue,
          positiveExamples: circle.positiveExamples as Prisma.InputJsonValue,
          negativeExamples: circle.negativeExamples as Prisma.InputJsonValue,
        },
        create: {
          id: circle.id,
          name: circle.name,
          description: circle.description,
          enabled: true,
          keywords: circle.keywords as Prisma.InputJsonValue,
          positiveExamples: circle.positiveExamples as Prisma.InputJsonValue,
          negativeExamples: circle.negativeExamples as Prisma.InputJsonValue,
          workflowId: TOPIC_CIRCLE_WORKFLOW_ID,
          ruleVersion: TOPIC_CIRCLE_RULE_VERSION,
        },
      });

      for (const handle of circle.accounts) {
        await this.prisma.topicCircleAccount.upsert({
          where: {
            topicCircleId_handle: {
              topicCircleId: circle.id,
              handle,
            },
          },
          update: {},
          create: {
            id: `tc_account_${circle.id}_${this.slugHandle(handle)}`,
            topicCircleId: circle.id,
            handle,
            enabled: true,
          },
        });
      }
    }
  }

  async collectAll(now = new Date(), circle?: string): Promise<TopicCircleCollectionResult> {
    const accounts = await this.prisma.topicCircleAccount.findMany({
      where: { enabled: true, topicCircle: this.topicCircleScopeWhere(circle) },
      include: { topicCircle: true },
      orderBy: [{ topicCircleId: 'asc' }, { handle: 'asc' }],
    });
    const fetchRun = await this.prisma.topicCircleFetchRun.create({
      data: {
        id: `tc_fetch_${randomUUID()}`,
        platform: 'x',
        status: 'running',
        startedAt: now,
        accountCount: accounts.length,
        itemCount: 0,
        input: {
          circle: circle ?? null,
          accountCount: accounts.length,
          handles: accounts.map((account) => account.handle),
        },
      },
    });

    let itemCount = 0;
    const errors: string[] = [];
    let analysis: TopicCircleCollectionResult['analysis'];

    for (const account of accounts) {
      try {
        itemCount += await this.collectAccount({
          fetchRunId: fetchRun.id,
          topicCircleId: account.topicCircleId,
          handle: account.handle,
          now,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`${account.handle}: ${message}`);
        this.logger.warn(`主题圈账号 ${account.handle} 采集失败: ${message}`);
      }
    }

    const status = errors.length === 0 ? 'success' : itemCount > 0 ? 'partial_success' : 'failed';
    const finished = await this.prisma.topicCircleFetchRun.update({
      where: { id: fetchRun.id },
      data: {
        status,
        finishedAt: new Date(),
        itemCount,
        error: errors.length ? errors.join('; ') : undefined,
      },
    });

    if (itemCount > 0) {
      analysis = await this.analyzeAndTrigger(now, circle);
    }

    return { fetchRun: finished, analysis };
  }

  async analyzeAndTrigger(now = new Date(), circle?: string) {
    const summarized = await this.summarizeTopics(now, circle);
    const metrics = await this.computeMetrics(now, circle);
    const trigger = await this.evaluateTriggers(now, circle);
    return { ...summarized, ...metrics, ...trigger };
  }

  async summarizeTopics(now = new Date(), circle?: string) {
    const since24h = new Date(now.getTime() - TOPIC_WINDOW_MS);
    const circles = await this.prisma.topicCircleConfig.findMany({
      where: this.topicCircleScopeWhere(circle),
    });
    let topics = 0;

    for (const circle of circles) {
      const keywords = this.jsonStringArray(circle.keywords);
      const posts = await this.prisma.xTopicCirclePost.findMany({
        where: {
          topicCircleId: circle.id,
          publishedAt: { gte: since24h, lte: now },
        },
        orderBy: { publishedAt: 'desc' },
      });
      const groups = await this.buildCandidateGroups(circle, keywords, posts, now);

      for (const group of groups) {
        const candidateId = `tc_candidate_${circle.id}_${group.normalizedEventKey}`;
        await this.prisma.topicCircleCandidate.upsert({
          where: {
            topicCircleId_normalizedEventKey: {
              topicCircleId: circle.id,
              normalizedEventKey: group.normalizedEventKey,
            },
          },
          update: {
            title: group.title,
            summary: group.summary,
            coreFact: group.coreFact,
            confidence: group.confidence,
            ruleVersion: TOPIC_CIRCLE_RULE_VERSION,
            updatedAt: now,
          },
          create: {
            id: candidateId,
            topicCircleId: circle.id,
            title: group.title,
            summary: group.summary,
            coreFact: group.coreFact,
            normalizedEventKey: group.normalizedEventKey,
            confidence: group.confidence,
            status: 'candidate',
            ruleVersion: TOPIC_CIRCLE_RULE_VERSION,
          },
        });
        await Promise.all(
          group.posts.map((post) =>
            this.prisma.topicCircleCandidatePost.upsert({
              where: { id: `${candidateId}_${post.postId}` },
              update: {
                handle: post.authorHandle,
                publishedAt: post.publishedAt,
                contributionWindow: this.resolveContributionWindow(post.publishedAt, now),
              },
              create: {
                id: `${candidateId}_${post.postId}`,
                candidateId,
                platform: 'x',
                postTable: 'x_topic_circle_post',
                postId: post.postId,
                handle: post.authorHandle,
                publishedAt: post.publishedAt,
                contributionWindow: this.resolveContributionWindow(post.publishedAt, now),
              },
            }),
          ),
        );
        topics++;
      }
    }

    return { topics };
  }

  async listMonitorTopics() {
    const circles = await this.prisma.topicCircleConfig.findMany({
      orderBy: { createdAt: 'asc' },
      include: { accounts: true },
    });
    const since3h = new Date(Date.now() - 3 * 60 * 60 * 1000);

    return Promise.all(
      circles.map(async (circle) => ({
        id: circle.id,
        name: circle.name,
        enabled: circle.enabled,
        accountCount: circle.accounts.filter((account) => account.enabled).length,
        recentPostCount3h: await this.prisma.xTopicCirclePost.count({
          where: { topicCircleId: circle.id, publishedAt: { gte: since3h } },
        }),
        candidateCount24h: await this.prisma.topicCircleCandidate.count({
          where: { topicCircleId: circle.id, updatedAt: { gte: new Date(Date.now() - TOPIC_WINDOW_MS) } },
        }),
        triggeredEventCount24h: await this.prisma.topicCircleCandidate.count({
          where: {
            topicCircleId: circle.id,
            triggeredAt: { gte: new Date(Date.now() - TOPIC_WINDOW_MS) },
            eventId: { not: null },
          },
        }),
        latestCandidates: await this.latestCandidatesForCircle(circle.id),
      })),
    );
  }

  async computeMetrics(now = new Date(), circle?: string) {
    const since24h = new Date(now.getTime() - TOPIC_WINDOW_MS);
    const since3h = new Date(now.getTime() - SHORT_WINDOW_MS);
    const candidates = await this.prisma.topicCircleCandidate.findMany({
      where: {
        updatedAt: { gte: since24h },
        ...(circle ? { topicCircle: this.topicCircleIdentityWhere(circle) } : {}),
      },
      include: { posts: true },
    });
    let computed = 0;

    for (const candidate of candidates) {
      const posts = await this.prisma.xTopicCirclePost.findMany({
        where: { postId: { in: candidate.posts.map((post) => post.postId) } },
      });
      const b3h = new Set(posts.filter((post) => post.publishedAt >= since3h).map((post) => post.authorHandle)).size;
      const b24h = new Set(posts.filter((post) => post.publishedAt >= since24h).map((post) => post.authorHandle)).size;
      const strongest = await this.computeTmax(posts);
      await this.prisma.topicCircleCandidate.update({
        where: { id: candidate.id },
        data: {
          b3h,
          b24h,
          tmax: strongest?.ratio,
          tmaxPostId: strongest?.postId,
          tmaxTop5: strongest ? await this.isTop5Percent(strongest.handle, strongest.views) : false,
        },
      });
      computed++;
    }

    return { computed };
  }

  async evaluateTriggers(now = new Date(), circle?: string) {
    const candidates = await this.prisma.topicCircleCandidate.findMany({
      where: {
        updatedAt: { gte: new Date(now.getTime() - TOPIC_WINDOW_MS) },
        triggeredAt: null,
        eventId: null,
        ...(circle ? { topicCircle: this.topicCircleIdentityWhere(circle) } : {}),
      },
      include: { topicCircle: true, posts: true },
      orderBy: { updatedAt: 'desc' },
    });
    let triggered = 0;
    let refreshed = 0;

    for (const candidate of candidates) {
      const result = await this.runCandidateWorkflow(candidate, now);
      if (!result || result.run.status === 'failed') {
        continue;
      }
      const eventId = result.executions.find((execution) => execution.targetEventId)?.targetEventId;
      if (!eventId) {
        continue;
      }
      const firstTrigger = !candidate.triggeredAt;
      const triggerType = result.commands
        .map((command) => command.payload.type !== 'ignore' ? command.payload.trigger?.ruleId : undefined)
        .filter((ruleId): ruleId is string => Boolean(ruleId))
        .join(',');
      await this.prisma.topicCircleCandidate.update({
        where: { id: candidate.id },
        data: {
          status: 'triggered',
          triggeredAt: candidate.triggeredAt ?? now,
          triggerType,
          eventId,
          workflowRunId: result.run.id,
        },
      });
      if (firstTrigger) {
        const matchedRules = this.matchedRulesFromCommands(result.commands);
        await this.saveTriggeredEventEvidence(candidate, eventId, result.run.id, matchedRules);
      }
      if (firstTrigger) triggered++;
      else refreshed++;
    }

    return { triggered, refreshed };
  }

  async listCandidates(circle?: string) {
    const candidates = await this.prisma.topicCircleCandidate.findMany({
      where: circle ? { topicCircle: { name: circle } } : {},
      include: {
        topicCircle: true,
        posts: true,
      },
      orderBy: { updatedAt: 'desc' },
    });

    return candidates.map((candidate) => ({
      id: candidate.id,
      circle: candidate.topicCircle.name,
      title: candidate.title,
      summary: candidate.summary,
      coreFact: candidate.coreFact,
      postIds: candidate.posts.map((post) => post.postId),
      b3h: candidate.b3h,
      b24h: candidate.b24h,
      tmax: candidate.tmax,
      tmaxTop5: candidate.tmaxTop5,
      eventId: candidate.eventId,
      triggeredAt: candidate.triggeredAt?.toISOString() ?? null,
      triggerType: candidate.triggerType,
      createdAt: candidate.createdAt.toISOString(),
      updatedAt: candidate.updatedAt.toISOString(),
    }));
  }

  async getPipelineStatus(now = new Date()) {
    const since24h = new Date(now.getTime() - TOPIC_WINDOW_MS);
    const latestFetchRun = await this.prisma.topicCircleFetchRun.findFirst({
      orderBy: { startedAt: 'desc' },
    });
    const failedAccounts = await this.prisma.topicCircleAccountFetchRun.findMany({
      where: latestFetchRun ? { fetchRunId: latestFetchRun.id, status: 'failed' } : { status: 'failed' },
      orderBy: { startedAt: 'desc' },
      take: 20,
    });
    const latestWorkflowRun = await this.prisma.workflowRun.findFirst({
      where: { definition: { workflowId: TOPIC_CIRCLE_WORKFLOW_ID } },
      include: { definition: true },
      orderBy: { startedAt: 'desc' },
    });

    return {
      latestFetchRun: latestFetchRun
        ? {
            id: latestFetchRun.id,
            status: latestFetchRun.status,
            startedAt: latestFetchRun.startedAt.toISOString(),
            finishedAt: latestFetchRun.finishedAt?.toISOString() ?? null,
            accountCount: latestFetchRun.accountCount,
            itemCount: latestFetchRun.itemCount,
            error: latestFetchRun.error,
          }
        : null,
      failedAccounts: failedAccounts.map((run) => ({
        handle: run.handle,
        status: run.status,
        startedAt: run.startedAt.toISOString(),
        finishedAt: run.finishedAt?.toISOString() ?? null,
        since: run.since.toISOString(),
        until: run.until.toISOString(),
        itemCount: run.itemCount,
        error: run.error,
      })),
      recentPostCount24h: await this.prisma.xTopicCirclePost.count({
        where: { publishedAt: { gte: since24h, lte: now } },
      }),
      candidateCount24h: await this.prisma.topicCircleCandidate.count({
        where: { updatedAt: { gte: since24h } },
      }),
      triggeredCandidateCount24h: await this.prisma.topicCircleCandidate.count({
        where: { triggeredAt: { gte: since24h } },
      }),
      latestWorkflowRun: latestWorkflowRun
        ? {
            id: latestWorkflowRun.id,
            workflowId: latestWorkflowRun.definition.workflowId,
            workflowVersion: latestWorkflowRun.definition.version,
            status: latestWorkflowRun.status,
            startedAt: latestWorkflowRun.startedAt.toISOString(),
            finishedAt: latestWorkflowRun.finishedAt?.toISOString() ?? null,
            error: latestWorkflowRun.error,
          }
        : null,
    };
  }

  private async collectAccount(input: {
    fetchRunId: string;
    topicCircleId: string;
    handle: string;
    now: Date;
  }) {
    const normalizedHandle = this.normalizeHandle(input.handle);
    const stateId = `tc_sync_x_${normalizedHandle.toLowerCase()}`;
    const state = await this.prisma.topicCircleAccountSyncState.findUnique({
      where: { platform_handle: { platform: 'x', handle: normalizedHandle } },
    });
    const since = state?.lastSuccessfulCollectedAt
      ? new Date(state.lastSuccessfulCollectedAt.getTime() - OVERLAP_MS)
      : new Date(input.now.getTime() - FIRST_COLLECT_WINDOW_MS);

    const accountRun = await this.prisma.topicCircleAccountFetchRun.create({
      data: {
        id: `tc_account_run_${randomUUID()}`,
        fetchRunId: input.fetchRunId,
        topicCircleId: input.topicCircleId,
        handle: normalizedHandle,
        status: 'running',
        startedAt: input.now,
        since,
        until: input.now,
      },
    });

    try {
      const output = await this.tools.invoke<XGetAccountPostsOutput>('x.getAccountPosts', {
        handle: normalizedHandle,
        since: since.toISOString(),
        until: input.now.toISOString(),
        maxPages: MAX_PAGES,
        includeReplies: true,
        includeQuotes: true,
        includeReposts: false,
      });
      const posts = output.posts.filter((post) => this.isEffectivePost(post));
      let savedCount = 0;

      for (const post of posts) {
        await this.prisma.xTopicCirclePost.upsert({
          where: { postId: post.postId },
          update: {
            metrics: (post.metrics ?? {}) as Prisma.InputJsonValue,
            observedAt: input.now,
            raw: post.raw as Prisma.InputJsonValue,
          },
          create: {
            id: `x_tc_post_${randomUUID()}`,
            postId: post.postId,
            fetchRunId: input.fetchRunId,
            accountRunId: accountRun.id,
            topicCircleId: input.topicCircleId,
            authorHandle: this.normalizeHandle(post.authorHandle),
            authorId: post.authorId,
            authorName: post.authorName,
            text: post.text,
            url: post.url,
            postType: post.postType,
            replyToPostId: post.replyToPostId,
            repostedPostId: post.repostedPostId,
            quotedPostId: post.quotedPostId,
            publishedAt: new Date(post.publishedAt),
            observedAt: input.now,
            metrics: (post.metrics ?? {}) as Prisma.InputJsonValue,
            raw: post.raw as Prisma.InputJsonValue,
          },
        });
        savedCount++;
      }

      await this.prisma.topicCircleAccountFetchRun.update({
        where: { id: accountRun.id },
        data: { status: 'success', finishedAt: new Date(), itemCount: savedCount },
      });
      await this.prisma.topicCircleAccountSyncState.upsert({
        where: { platform_handle: { platform: 'x', handle: normalizedHandle } },
        update: {
          lastSuccessfulCollectedAt: input.now,
          lastAttemptedAt: input.now,
          lastError: null,
        },
        create: {
          id: stateId,
          platform: 'x',
          handle: normalizedHandle,
          lastSuccessfulCollectedAt: input.now,
          lastAttemptedAt: input.now,
          lastError: null,
        },
      });
      return savedCount;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.prisma.topicCircleAccountFetchRun.update({
        where: { id: accountRun.id },
        data: { status: 'failed', finishedAt: new Date(), error: message },
      });
      await this.prisma.topicCircleAccountSyncState.upsert({
        where: { platform_handle: { platform: 'x', handle: normalizedHandle } },
        update: {
          lastAttemptedAt: input.now,
          lastError: message,
        },
        create: {
          id: stateId,
          platform: 'x',
          handle: normalizedHandle,
          lastAttemptedAt: input.now,
          lastError: message,
        },
      });
      throw error;
    }
  }

  private groupPostsIntoCandidates(
    circleName: string,
    keywords: string[],
    posts: Array<{ postId: string; text: string; authorHandle: string; publishedAt: Date }>,
  ) {
    const groups = new Map<string, Array<{ postId: string; text: string; authorHandle: string; publishedAt: Date }>>();
    for (const post of posts) {
      const key = this.matchKeyword(post.text, keywords);
      if (!key) continue;
      const normalizedEventKey = this.normalizeEventKey(`topic-circle:${circleName}:${key}`);
      groups.set(normalizedEventKey, [...(groups.get(normalizedEventKey) ?? []), post]);
    }

    return [...groups.entries()].map(([normalizedEventKey, groupedPosts]) => {
      const keyword = normalizedEventKey.split(':').at(-1) ?? circleName;
      const handles = [...new Set(groupedPosts.map((post) => post.authorHandle))];
      return {
        normalizedEventKey,
        title: `${circleName}：${keyword}`,
        summary: `${handles.length} 个关注账号在最近 24 小时讨论 ${keyword}。`,
        coreFact: `${circleName} 主题圈内账号正在集中讨论 ${keyword}`,
        confidence: 0.72,
        posts: groupedPosts,
      };
    });
  }

  private async buildCandidateGroups(
    circle: { id: string; name: string; keywords: Prisma.JsonValue; positiveExamples?: Prisma.JsonValue; negativeExamples?: Prisma.JsonValue },
    keywords: string[],
    posts: Array<{
      postId: string;
      text: string;
      authorHandle: string;
      publishedAt: Date;
      metrics?: Prisma.JsonValue | null;
    }>,
    now: Date,
  ) {
    if (this.clusteringRunner) {
      try {
        const output = await this.clusteringRunner.runTopicCircleClustering({
          topicCircle: {
            id: circle.id,
            name: circle.name,
            keywords: circle.keywords,
            positiveExamples: circle.positiveExamples,
            negativeExamples: circle.negativeExamples,
          },
          posts: posts.map((post) => ({
            postId: post.postId,
            text: post.text,
            authorHandle: post.authorHandle,
            publishedAt: post.publishedAt.toISOString(),
            metrics: post.metrics,
          })),
          observedAt: now.toISOString(),
        });
        const groups = this.mapClusteredCandidatesToGroups(output.candidates, posts);
        if (groups.length > 0) {
          return groups;
        }
      } catch (error) {
        this.logger.warn(`主题圈 ${circle.name} 聚类工作流失败，使用关键词兜底: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return this.groupPostsIntoCandidates(circle.name, keywords, posts);
  }

  private mapClusteredCandidatesToGroups(
    candidates: TopicCircleClusteredCandidate[],
    posts: Array<{ postId: string; text: string; authorHandle: string; publishedAt: Date }>,
  ) {
    const postMap = new Map(posts.map((post) => [post.postId, post]));
    return candidates
      .map((candidate) => ({
        normalizedEventKey: this.normalizeEventKey(candidate.normalizedEventKey),
        title: candidate.title,
        summary: candidate.summary,
        coreFact: candidate.coreFact,
        confidence: Math.max(0, Math.min(1, candidate.confidence)),
        posts: candidate.postIds.map((postId) => postMap.get(postId)).filter((post): post is typeof posts[number] => Boolean(post)),
      }))
      .filter((candidate) => candidate.normalizedEventKey && candidate.posts.length > 0);
  }

  private async computeTmax(posts: Array<{ postId: string; authorHandle: string; metrics: Prisma.JsonValue | null }>) {
    let strongest: { postId: string; handle: string; views: number; ratio: number } | undefined;
    for (const post of posts) {
      const views = this.metricNumber(post.metrics, 'views');
      if (!views) continue;
      const baseline = await this.accountBaseline(post.authorHandle);
      if (!baseline) continue;
      const ratio = views / baseline;
      if (!strongest || ratio > strongest.ratio) {
        strongest = { postId: post.postId, handle: post.authorHandle, views, ratio };
      }
    }
    return strongest;
  }

  private async accountBaseline(handle: string) {
    const posts = await this.prisma.xTopicCirclePost.findMany({
      where: { authorHandle: handle },
      orderBy: { publishedAt: 'desc' },
      take: BASELINE_POST_LIMIT,
    });
    const views = posts
      .map((post) => this.metricNumber(post.metrics, 'views'))
      .filter((value): value is number => typeof value === 'number')
      .sort((left, right) => left - right);
    if (!views.length) return null;
    const mid = Math.floor(views.length / 2);
    return views.length % 2 ? views[mid] : (views[mid - 1] + views[mid]) / 2;
  }

  private async isTop5Percent(handle: string, views: number) {
    const posts = await this.prisma.xTopicCirclePost.findMany({
      where: { authorHandle: handle },
      orderBy: { publishedAt: 'desc' },
      take: BASELINE_POST_LIMIT,
    });
    const ranked = posts
      .map((post) => this.metricNumber(post.metrics, 'views'))
      .filter((value): value is number => typeof value === 'number')
      .sort((left, right) => right - left);
    if (ranked.length < 20) return false;
    const topCount = Math.max(1, Math.ceil(ranked.length * 0.05));
    return views >= (ranked[topCount - 1] ?? Number.POSITIVE_INFINITY);
  }

  private async runCandidateWorkflow(
    candidate: Prisma.TopicCircleCandidateGetPayload<{ include: { topicCircle: true; posts: true } }>,
    now: Date,
  ) {
    if (!this.workflowRunner) {
      if (!this.workflowRunnerMissingWarned) {
        this.workflowRunnerMissingWarned = true;
        this.logger.warn('重点主题事件形成工作流未注入，候选不会形成 Event。');
      }
      return undefined;
    }
    return this.workflowRunner.runTopicCircleEventFormation({
      observedAt: now.toISOString(),
      context: {
        schemaVersion: 'topic_circle_event_formation_context_v1',
        topicCircle: {
          id: candidate.topicCircle.id,
          name: candidate.topicCircle.name,
        },
        candidate: {
          id: candidate.id,
          title: candidate.title,
          normalizedEventKey: candidate.normalizedEventKey,
          b3h: candidate.b3h,
          b24h: candidate.b24h,
          tmax: candidate.tmax,
          tmaxTop5: candidate.tmaxTop5,
          triggeredAt: candidate.triggeredAt?.toISOString() ?? null,
          eventId: candidate.eventId,
          ruleVersion: candidate.ruleVersion,
        },
        previousTrigger: {
          triggeredAt: candidate.triggeredAt?.toISOString() ?? null,
          triggerType: candidate.triggerType,
          eventId: candidate.eventId,
        },
        existingEvent: await this.prisma.event.findUnique({ where: { normalizedEventKey: candidate.normalizedEventKey } }),
      },
    });
  }

  private async saveTriggeredEventEvidence(
    candidate: Prisma.TopicCircleCandidateGetPayload<{ include: { topicCircle: true; posts: true } }>,
    eventId: string,
    workflowRunId: string,
    matchedRules: TriggerPayload[],
  ) {
    const postIds = [...new Set(candidate.posts.map((post) => post.postId))];
    if (postIds.length === 0) return;

    const sourcePosts = await this.prisma.xTopicCirclePost.findMany({
      where: { postId: { in: postIds } },
      orderBy: { publishedAt: 'desc' },
      take: 20,
    });
    const postRefs = sourcePosts.map((post) => ({
      postId: post.postId,
      authorHandle: post.authorHandle,
      url: post.url,
      postType: post.postType,
      publishedAt: post.publishedAt.toISOString(),
      metrics: post.metrics,
    }));

    await this.prisma.eventSourceContext.create({
      data: {
        id: `event_source_context_${randomUUID()}`,
        eventId,
        workflowRunId,
        sourceType: 'x_topic_circle',
        payload: {
          schemaVersion: 'topic_circle_event_evidence_v1',
          topicCircle: {
            id: candidate.topicCircle.id,
            name: candidate.topicCircle.name,
          },
          candidate: {
            id: candidate.id,
            title: candidate.title,
            summary: candidate.summary,
            coreFact: candidate.coreFact,
            normalizedEventKey: candidate.normalizedEventKey,
            b3h: candidate.b3h,
            b24h: candidate.b24h,
            tmax: candidate.tmax,
            tmaxPostId: candidate.tmaxPostId,
            tmaxTop5: candidate.tmaxTop5,
            ruleVersion: candidate.ruleVersion,
          },
          matchedRules,
          postRefs,
        } as unknown as Prisma.InputJsonValue,
      },
    });

    await Promise.all(
      sourcePosts.map((post) =>
        this.prisma.eventEvidence.create({
          data: {
            id: `event_evidence_${randomUUID()}`,
            eventId,
            workflowRunId,
            sourceType: 'x_topic_circle',
            url: post.url,
            claim: `${post.authorHandle} 发布了与「${candidate.title}」相关的主题圈帖子。`,
            payload: {
              postId: post.postId,
              authorHandle: post.authorHandle,
              authorName: post.authorName,
              text: post.text,
              postType: post.postType,
              publishedAt: post.publishedAt.toISOString(),
              metrics: post.metrics,
            } as unknown as Prisma.InputJsonValue,
          },
        }),
      ),
    );
  }

  private matchedRulesFromCommands(commands: Array<{ payload: { type: string; trigger?: TriggerPayload } }>) {
    return commands
      .map((command) => command.payload.trigger)
      .filter((trigger): trigger is TriggerPayload => Boolean(trigger));
  }

  private topicCircleScopeWhere(circle?: string): Prisma.TopicCircleConfigWhereInput {
    return {
      enabled: true,
      ...(circle ? this.topicCircleIdentityWhere(circle) : {}),
    };
  }

  private topicCircleIdentityWhere(circle: string): Prisma.TopicCircleConfigWhereInput {
    return {
      OR: [
        { id: circle },
        { name: circle },
      ],
    };
  }

  private async latestCandidatesForCircle(topicCircleId: string) {
    const candidates = await this.prisma.topicCircleCandidate.findMany({
      where: { topicCircleId },
      orderBy: { updatedAt: 'desc' },
      take: 3,
    });
    return candidates.map((candidate) => ({
      id: candidate.id,
      title: candidate.title,
      summary: candidate.summary,
      b3h: candidate.b3h,
      b24h: candidate.b24h,
      tmax: candidate.tmax,
      triggerType: candidate.triggerType,
      eventId: candidate.eventId,
    }));
  }

  private matchKeyword(text: string, keywords: string[]) {
    const lower = text.toLowerCase();
    return [...keywords]
      .sort((left, right) => right.length - left.length)
      .find((keyword) => lower.includes(keyword.toLowerCase()))
      ?.trim();
  }

  private metricNumber(metrics: Prisma.JsonValue | null, key: string) {
    if (!metrics || typeof metrics !== 'object' || Array.isArray(metrics)) return undefined;
    const value = (metrics as Record<string, unknown>)[key];
    return typeof value === 'number' ? value : undefined;
  }

  private resolveContributionWindow(publishedAt: Date, now: Date) {
    return now.getTime() - publishedAt.getTime() <= SHORT_WINDOW_MS ? '3h' : '24h';
  }

  private jsonStringArray(value: Prisma.JsonValue) {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  }

  private normalizeEventKey(value: string) {
    return value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\u4e00-\u9fa5:_-]+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 180);
  }

  private isEffectivePost(post: XAccountPost) {
    return post.postType !== 'repost' && post.text.trim().length > 0;
  }

  private normalizeHandle(handle: string) {
    return handle.trim().replace(/^@/, '');
  }

  private slugHandle(handle: string) {
    return this.normalizeHandle(handle).toLowerCase().replace(/[^a-z0-9_]+/g, '-');
  }
}
