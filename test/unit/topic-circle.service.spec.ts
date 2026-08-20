import { SELF_DECLARED_DEPS_METADATA } from '@nestjs/common/constants';
import { TopicCircleService } from '../../src/topic-circle/topic-circle.service';
import { WorkflowRunner } from '../../src/workflow/workflow-runner';

describe('TopicCircleService', () => {
  it('declares an explicit WorkflowRunner injection token for event formation', () => {
    const deps = Reflect.getMetadata(SELF_DECLARED_DEPS_METADATA, TopicCircleService) ?? [];

    expect(deps).toContainEqual({ index: 2, param: WorkflowRunner });
  });

  it('seeds five topic circles and fifty monitored accounts', async () => {
    const prisma = {
      topicCircleConfig: {
        upsert: jest.fn().mockResolvedValue({}),
      },
      topicCircleAccount: {
        upsert: jest.fn().mockResolvedValue({}),
      },
    };
    const service = new TopicCircleService(prisma as never, {} as never);

    await service.onModuleInit();

    expect(prisma.topicCircleConfig.upsert).toHaveBeenCalledTimes(5);
    expect(prisma.topicCircleAccount.upsert).toHaveBeenCalledTimes(50);
    expect(prisma.topicCircleConfig.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'topic-ai-tech' },
        create: expect.objectContaining({
          name: 'AI 与科技',
          workflowId: 'topic-circle-event-formation',
          ruleVersion: 'topic-circle-radar-v1.2',
        }),
      }),
    );
    expect(prisma.topicCircleAccount.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          topicCircleId_handle: {
            topicCircleId: 'topic-ai-tech',
            handle: '@OpenAI',
          },
        },
      }),
    );
  });

  it('delegates topic circle trigger decisions to the workflow runner', async () => {
    const now = new Date('2026-08-19T10:00:00.000Z');
    const workflowRunner = {
      runTopicCircleEventFormation: jest.fn().mockResolvedValue({
        run: { id: 'wrun_topic_circle', status: 'success' },
        commands: [
          {
            payload: {
              type: 'create_event',
              trigger: { ruleId: 'TC-99' },
            },
          },
        ],
        executions: [{ targetEventId: 'event_topic_circle' }],
      }),
    };
    const prisma = {
      topicCircleCandidate: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'candidate_1',
            title: '候选话题',
            summary: '候选摘要',
            coreFact: '核心事实',
            normalizedEventKey: 'topic-circle:test',
            confidence: 0.72,
            b3h: 3,
            b24h: 3,
            tmax: 1.5,
            tmaxPostId: null,
            tmaxTop5: false,
            triggeredAt: null,
            triggerType: null,
            eventId: null,
            ruleVersion: 'topic-circle-radar-v1.2',
            topicCircle: {
              id: 'topic-ai-tech',
              name: 'AI 与科技',
              keywords: ['AI'],
              positiveExamples: [],
              negativeExamples: [],
            },
            posts: [
              {
                postId: 'post_1',
                handle: 'OpenAI',
                publishedAt: now,
                contributionWindow: { bucket: '3h' },
              },
            ],
            updatedAt: now,
          },
        ]),
        update: jest.fn().mockResolvedValue({}),
      },
      xTopicCirclePost: {
        findMany: jest.fn().mockResolvedValue([
          {
            postId: 'post_1',
            authorHandle: 'OpenAI',
            text: 'AI update',
            url: 'https://x.com/OpenAI/status/post_1',
            postType: 'original',
            publishedAt: now,
            metrics: { views: 1000 },
          },
        ]),
      },
      event: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      eventSourceContext: {
        create: jest.fn().mockResolvedValue({}),
      },
      eventEvidence: {
        create: jest.fn().mockResolvedValue({}),
      },
    };
    const service = new TopicCircleService(prisma as never, {} as never, workflowRunner);

    const result = await service.evaluateTriggers(now);

    expect(result).toEqual({ triggered: 1, refreshed: 0 });
    const workflowInput = workflowRunner.runTopicCircleEventFormation.mock.calls[0][0];
    expect(workflowInput).toEqual(
      expect.objectContaining({
        observedAt: now.toISOString(),
      }),
    );
    expect(workflowInput.context).toEqual(
      expect.objectContaining({
        schemaVersion: 'topic_circle_event_formation_context_v1',
        topicCircle: {
          id: 'topic-ai-tech',
          name: 'AI 与科技',
        },
        candidate: {
          id: 'candidate_1',
          title: '候选话题',
          normalizedEventKey: 'topic-circle:test',
          b3h: 3,
          b24h: 3,
          tmax: 1.5,
          tmaxTop5: false,
          triggeredAt: null,
          eventId: null,
          ruleVersion: 'topic-circle-radar-v1.2',
        },
      }),
    );
    expect(workflowInput.context).not.toHaveProperty('posts');
    expect(workflowInput.context).not.toHaveProperty('postRefs');
    expect(workflowInput.context).not.toHaveProperty('contributors');
    expect(workflowInput.context).not.toHaveProperty('postCount');
    expect(workflowInput.context.topicCircle).not.toHaveProperty('keywords');
    expect(workflowInput.context.topicCircle).not.toHaveProperty('positiveExamples');
    expect(workflowInput.context.topicCircle).not.toHaveProperty('negativeExamples');
    expect(workflowInput.context.candidate).not.toHaveProperty('summary');
    expect(workflowInput.context.candidate).not.toHaveProperty('coreFact');
    expect(workflowInput.context.candidate).not.toHaveProperty('confidence');
    expect(workflowInput.context.candidate).not.toHaveProperty('tmaxPostId');
    expect(prisma.topicCircleCandidate.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'candidate_1' },
        data: expect.objectContaining({
          status: 'triggered',
          triggerType: 'TC-99',
          eventId: 'event_topic_circle',
          workflowRunId: 'wrun_topic_circle',
        }),
      }),
    );
    expect(prisma.eventSourceContext.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventId: 'event_topic_circle',
          workflowRunId: 'wrun_topic_circle',
          sourceType: 'x_topic_circle',
        }),
      }),
    );
    expect(prisma.eventEvidence.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventId: 'event_topic_circle',
          workflowRunId: 'wrun_topic_circle',
          sourceType: 'x_topic_circle',
          url: 'https://x.com/OpenAI/status/post_1',
          payload: expect.objectContaining({
            postId: 'post_1',
            text: 'AI update',
          }),
        }),
      }),
    );
  });

  it('does not form events again for candidates that already triggered', async () => {
    const now = new Date('2026-08-19T10:00:00.000Z');
    const workflowRunner = {
      runTopicCircleEventFormation: jest.fn(),
    };
    const prisma = {
      topicCircleCandidate: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const service = new TopicCircleService(prisma as never, {} as never, workflowRunner);

    const result = await service.evaluateTriggers(now);

    expect(result).toEqual({ triggered: 0, refreshed: 0 });
    expect(workflowRunner.runTopicCircleEventFormation).not.toHaveBeenCalled();
    expect(prisma.topicCircleCandidate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          triggeredAt: null,
          eventId: null,
        }),
      }),
    );
  });

  it('uses topic clustering workflow output before falling back to keyword grouping', async () => {
    const now = new Date('2026-08-19T11:00:00.000Z');
    const clusteringRunner = {
      runTopicCircleClustering: jest.fn().mockResolvedValue({
        candidates: [
          {
            normalizedEventKey: 'topic-circle:ai-tech:model-release',
            title: 'AI 与科技：模型发布',
            summary: '多个 AI 账号讨论模型发布。',
            coreFact: 'AI 主题圈账号正在讨论模型发布',
            confidence: 0.91,
            postIds: ['post_1', 'post_2'],
          },
        ],
      }),
    };
    const prisma = {
      topicCircleConfig: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'topic-ai-tech',
            name: 'AI 与科技',
            keywords: ['AI'],
            enabled: true,
          },
        ]),
      },
      xTopicCirclePost: {
        findMany: jest.fn().mockResolvedValue([
          {
            postId: 'post_1',
            text: 'OpenAI released a model',
            authorHandle: 'OpenAI',
            publishedAt: now,
          },
          {
            postId: 'post_2',
            text: 'Anthropic comments on the model release',
            authorHandle: 'AnthropicAI',
            publishedAt: now,
          },
        ]),
      },
      topicCircleCandidate: {
        upsert: jest.fn().mockResolvedValue({}),
      },
      topicCircleCandidatePost: {
        upsert: jest.fn().mockResolvedValue({}),
      },
    };
    const service = new TopicCircleService(prisma as never, {} as never, undefined, clusteringRunner);

    const result = await service.summarizeTopics(now);

    expect(result).toEqual({ topics: 1 });
    expect(clusteringRunner.runTopicCircleClustering).toHaveBeenCalledWith(
      expect.objectContaining({
        topicCircle: expect.objectContaining({ id: 'topic-ai-tech', name: 'AI 与科技' }),
        posts: expect.arrayContaining([expect.objectContaining({ postId: 'post_1' })]),
      }),
    );
    expect(prisma.topicCircleCandidate.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          normalizedEventKey: 'topic-circle:ai-tech:model-release',
          title: 'AI 与科技：模型发布',
          confidence: 0.91,
        }),
      }),
    );
  });

  it('scopes manual collection to the selected topic circle', async () => {
    const now = new Date('2026-08-19T12:00:00.000Z');
    const prisma = {
      topicCircleAccount: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      topicCircleFetchRun: {
        create: jest.fn().mockResolvedValue({
          id: 'tc_fetch_scoped',
        }),
        update: jest.fn().mockResolvedValue({
          id: 'tc_fetch_scoped',
          accountCount: 0,
          itemCount: 0,
          status: 'success',
          error: null,
        }),
      },
    };
    const service = new TopicCircleService(prisma as never, {} as never);

    await service.collectAll(now, 'AI 与科技');

    expect(prisma.topicCircleAccount.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          enabled: true,
          topicCircle: {
            enabled: true,
            OR: [{ id: 'AI 与科技' }, { name: 'AI 与科技' }],
          },
        }),
      }),
    );
    expect(prisma.topicCircleFetchRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          input: expect.objectContaining({
            circle: 'AI 与科技',
            accountCount: 0,
            handles: [],
          }),
        }),
      }),
    );
  });

  it('returns topic circle pipeline status for troubleshooting', async () => {
    const startedAt = new Date('2026-08-19T09:00:00.000Z');
    const finishedAt = new Date('2026-08-19T09:01:00.000Z');
    const prisma = {
      topicCircleFetchRun: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'tc_fetch_latest',
          status: 'partial_success',
          startedAt,
          finishedAt,
          accountCount: 10,
          itemCount: 21,
          error: '@bad: timeout',
        }),
      },
      topicCircleAccountFetchRun: {
        findMany: jest.fn().mockResolvedValue([
          {
            handle: 'bad',
            status: 'failed',
            startedAt,
            finishedAt,
            since: new Date('2026-08-19T06:00:00.000Z'),
            until: startedAt,
            itemCount: 0,
            error: 'timeout',
          },
        ]),
      },
      xTopicCirclePost: {
        count: jest.fn().mockResolvedValue(21),
      },
      topicCircleCandidate: {
        count: jest.fn().mockResolvedValueOnce(4).mockResolvedValueOnce(2),
      },
      workflowRun: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'wrun_latest',
          status: 'success',
          startedAt,
          finishedAt,
          error: null,
          definition: {
            workflowId: 'topic-circle-event-formation',
            version: '1.0.0',
          },
        }),
      },
    };
    const service = new TopicCircleService(prisma as never, {} as never);

    await expect(service.getPipelineStatus()).resolves.toEqual({
      latestFetchRun: {
        id: 'tc_fetch_latest',
        status: 'partial_success',
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        accountCount: 10,
        itemCount: 21,
        error: '@bad: timeout',
      },
      failedAccounts: [
        {
          handle: 'bad',
          status: 'failed',
          startedAt: startedAt.toISOString(),
          finishedAt: finishedAt.toISOString(),
          since: '2026-08-19T06:00:00.000Z',
          until: startedAt.toISOString(),
          itemCount: 0,
          error: 'timeout',
        },
      ],
      recentPostCount24h: 21,
      candidateCount24h: 4,
      triggeredCandidateCount24h: 2,
      latestWorkflowRun: {
        id: 'wrun_latest',
        workflowId: 'topic-circle-event-formation',
        workflowVersion: '1.0.0',
        status: 'success',
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        error: null,
      },
    });
  });
});
