import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ContentService } from '../../src/content/content.service';
import { InMemoryContentRepository } from '../../src/content/in-memory-content.repository';
import { ContentCandidateGenerator } from '../../src/content/content-candidate-generator';
import { ContentRiskPrechecker } from '../../src/content/content-risk-prechecker';

describe('ContentService', () => {
  it('lists account response tasks with candidate counts', async () => {
    const repository = new InMemoryContentRepository();
    repository.accountResponseTasks.push({
      id: 'task_1',
      eventId: 'event_1',
      accountId: 'account_flash',
      status: 'ready_for_generation',
      priority: 'high',
      skill: 'respond-with-breaking-brief',
      skillVersion: '1.0.0',
      assignmentReason: 'Base pipeline.',
      riskStatus: 'not_checked',
      createdAt: '2026-08-20T01:00:00.000Z',
      updatedAt: '2026-08-20T01:00:00.000Z',
    });
    repository.events.push({
      eventId: 'event_1',
      title: 'OpenAI 正式发布 GPT-6 API',
      oneLineSummary: 'OpenAI 发布新一代 API 并引发开发者关注。',
      status: 'responding',
      confirmationLevel: 'confirmed',
      expressionBoundary: '只表述已确认发布信息。',
      confirmedFacts: [],
      unconfirmedFacts: [],
      evidenceRecords: [],
      sourceContexts: [],
    });
    repository.operationAccounts.push({
      id: 'account_flash',
      key: 'respond-with-breaking-brief',
      name: 'WatcherGuru 快讯号',
      enabled: true,
      fields: {
        skill: 'respond-with-breaking-brief',
      },
    });

    const service = new ContentService(repository);

    await expect(service.listTasks()).resolves.toEqual({
      items: [
        {
          id: 'task_1',
          eventId: 'event_1',
          eventTitle: 'OpenAI 正式发布 GPT-6 API',
          eventSummary: 'OpenAI 发布新一代 API 并引发开发者关注。',
          accountId: 'account_flash',
          accountName: 'WatcherGuru 快讯号',
          status: 'ready_for_generation',
          priority: 'high',
          skill: 'respond-with-breaking-brief',
          skillVersion: '1.0.0',
          assignmentReason: 'Base pipeline.',
          riskStatus: 'not_checked',
          candidateCount: 0,
          createdAt: '2026-08-20T01:00:00.000Z',
          updatedAt: '2026-08-20T01:00:00.000Z',
        },
      ],
      total: 1,
    });
  });

  it('returns task detail with batches and candidates', async () => {
    const repository = new InMemoryContentRepository();
    repository.accountResponseTasks.push({
      id: 'task_1',
      eventId: 'event_1',
      accountId: 'account_flash',
      status: 'ready_for_publish',
      priority: 'normal',
      skill: 'respond-with-breaking-brief',
      skillVersion: '1.0.0',
      assignmentReason: 'Base pipeline.',
      riskStatus: 'low',
      latestCandidateBatchId: 'batch_1',
      createdAt: '2026-08-20T01:00:00.000Z',
      updatedAt: '2026-08-20T01:10:00.000Z',
    });
    repository.events.push({
      eventId: 'event_1',
      title: 'OpenAI 正式发布 GPT-6 API',
      oneLineSummary: 'OpenAI 发布新一代 API 并引发开发者关注。',
      status: 'responding',
      confirmationLevel: 'confirmed',
      expressionBoundary: '只表述已确认发布信息。',
      confirmedFacts: [],
      unconfirmedFacts: [],
      evidenceRecords: [],
      sourceContexts: [],
    });
    repository.operationAccounts.push({
      id: 'account_flash',
      key: 'respond-with-breaking-brief',
      name: 'WatcherGuru 快讯号',
      enabled: true,
      fields: {
        skill: 'respond-with-breaking-brief',
      },
    });
    repository.contentCandidateBatches.push({
      id: 'batch_1',
      taskId: 'task_1',
      workflowRunId: 'wrun_generate',
      generationKind: 'initial',
      status: 'success',
      createdAt: '2026-08-20T01:10:00.000Z',
    });
    repository.contentCandidates.push({
      id: 'candidate_1',
      batchId: 'batch_1',
      taskId: 'task_1',
      localKey: 'a',
      format: 'original_post',
      text: 'Draft copy',
      angle: 'fast fact',
      factualClaims: ['AI trended on X'],
      uncertaintyNotes: [],
      riskStatus: 'low',
      status: 'available',
      createdAt: '2026-08-20T01:10:00.000Z',
    });

    const service = new ContentService(repository);

    await expect(service.getTask('task_1')).resolves.toEqual({
      id: 'task_1',
      eventId: 'event_1',
      eventTitle: 'OpenAI 正式发布 GPT-6 API',
      eventSummary: 'OpenAI 发布新一代 API 并引发开发者关注。',
      accountId: 'account_flash',
      accountName: 'WatcherGuru 快讯号',
      status: 'ready_for_publish',
      priority: 'normal',
      skill: 'respond-with-breaking-brief',
      skillVersion: '1.0.0',
      assignmentReason: 'Base pipeline.',
      riskStatus: 'low',
      latestCandidateBatchId: 'batch_1',
      candidateCount: 1,
      createdAt: '2026-08-20T01:00:00.000Z',
      updatedAt: '2026-08-20T01:10:00.000Z',
      batches: [
        {
          id: 'batch_1',
          taskId: 'task_1',
          workflowRunId: 'wrun_generate',
          generationKind: 'initial',
          status: 'success',
          createdAt: '2026-08-20T01:10:00.000Z',
        },
      ],
      candidates: [
        expect.objectContaining({
          id: 'candidate_1',
          text: 'Draft copy',
          status: 'available',
        }),
      ],
    });
  });

  it('throws not found for unknown tasks', async () => {
    const service = new ContentService(new InMemoryContentRepository());

    await expect(service.getTask('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('generates a candidate batch and prechecks three candidates when requested from task detail', async () => {
    const repository = new InMemoryContentRepository();
    repository.accountResponseTasks.push({
      id: 'task_1',
      eventId: 'event_1',
      accountId: 'account_flash',
      status: 'ready_for_generation',
      priority: 'normal',
      skill: 'respond-with-breaking-brief',
      skillVersion: '1.0.0',
      assignmentReason: 'Base pipeline.',
      riskStatus: 'not_checked',
      createdAt: '2026-08-20T01:00:00.000Z',
      updatedAt: '2026-08-20T01:00:00.000Z',
    });
    repository.events.push({
      eventId: 'event_1',
      title: 'AI enters top trends',
      oneLineSummary: 'AI entered the United States X trend top five.',
      status: 'responding',
      confirmationLevel: 'unconfirmed',
      expressionBoundary: 'Treat as X trend claim until confirmed.',
      confirmedFacts: [],
      unconfirmedFacts: ['AI is trending on X'],
      evidenceRecords: [{ sourceType: 'x_trend', claim: 'AI ranked #4 on United States trends' }],
      sourceContexts: [],
    });
    repository.operationAccounts.push({
      id: 'account_flash',
      key: 'respond-with-breaking-brief',
      name: '快讯型',
      enabled: true,
      fields: {
        skill: 'respond-with-breaking-brief',
        type: '基础生产线',
        personaType: '把热点压缩为可快速扫描的单一事实更新',
      },
    });
    const generator: ContentCandidateGenerator = {
      generate: jest.fn().mockResolvedValue([
        {
          localKey: 'a',
          format: 'original_post',
          text: 'Candidate A',
          angle: 'fast fact',
          factualClaims: ['AI ranked #4 on United States trends'],
          uncertaintyNotes: ['Treat as X trend claim until confirmed.'],
          productBridge: 'none',
        },
        {
          localKey: 'b',
          format: 'original_post',
          text: 'Candidate B',
          angle: 'context',
          factualClaims: ['AI ranked #4 on United States trends'],
          uncertaintyNotes: ['Treat as X trend claim until confirmed.'],
          productBridge: 'none',
        },
        {
          localKey: 'c',
          format: 'thread',
          text: 'Candidate C',
          angle: 'what to watch',
          factualClaims: ['AI ranked #4 on United States trends'],
          uncertaintyNotes: ['Treat as X trend claim until confirmed.'],
          productBridge: 'none',
        },
      ]),
    };
    const prechecker: ContentRiskPrechecker = {
      precheck: jest
        .fn()
        .mockResolvedValueOnce({
          riskStatus: 'low',
          candidateStatus: 'available',
          reasons: [],
        })
        .mockResolvedValueOnce({
          riskStatus: 'medium',
          candidateStatus: 'warning',
          reasons: ['表达需要谨慎。'],
        })
        .mockResolvedValueOnce({
          riskStatus: 'high',
          candidateStatus: 'blocked',
          reasons: ['包含未经证实的确定性表述。'],
        }),
    };
    const service = new ContentService(repository, generator, prechecker);

    const result = await service.generateCandidates('task_1', {
      generationKind: 'initial',
      instruction: '更短一点',
      now: '2026-08-20T01:15:00.000Z',
    });

    expect(generator.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        generationKind: 'initial',
        userInstruction: '更短一点',
        task: expect.objectContaining({ id: 'task_1', eventId: 'event_1', accountId: 'account_flash' }),
        eventContextPack: expect.objectContaining({
          eventId: 'event_1',
          title: 'AI enters top trends',
        }),
        account: expect.objectContaining({
          id: 'account_flash',
          name: '快讯型',
        }),
      }),
    );
    expect(result).toMatchObject({
      taskId: 'task_1',
      status: 'ready_for_publish',
      candidates: [
        expect.objectContaining({ text: 'Candidate A', status: 'available', riskStatus: 'low' }),
        expect.objectContaining({ text: 'Candidate B', status: 'warning', riskStatus: 'medium' }),
        expect.objectContaining({ text: 'Candidate C', status: 'blocked', riskStatus: 'high' }),
      ],
    });
    expect(prechecker.precheck).toHaveBeenCalledTimes(3);
    expect(repository.contentCandidateBatches).toEqual([
      expect.objectContaining({
        taskId: 'task_1',
        generationKind: 'initial',
        userInstruction: '更短一点',
        status: 'success',
      }),
    ]);
    expect(repository.contentCandidates).toHaveLength(3);
    expect(repository.accountResponseTasks[0]).toEqual(
      expect.objectContaining({
        status: 'ready_for_publish',
        riskStatus: 'high',
        latestCandidateBatchId: result.batchId,
      }),
    );
  });

  it('publishes a specified available candidate and rejects blocked candidates', async () => {
    const repository = new InMemoryContentRepository();
    repository.accountResponseTasks.push({
      id: 'task_1',
      eventId: 'event_1',
      accountId: 'account_flash',
      status: 'ready_for_publish',
      priority: 'normal',
      skill: 'respond-with-breaking-brief',
      skillVersion: '1.0.0',
      assignmentReason: 'Base pipeline.',
      riskStatus: 'medium',
      createdAt: '2026-08-20T01:00:00.000Z',
      updatedAt: '2026-08-20T01:15:00.000Z',
    });
    repository.eventTimings.push({
      id: 'event_1',
      title: 'OpenAI 正式发布 GPT-6 API',
      formedAt: '2026-08-20T01:00:00.000Z',
    });
    repository.contentCandidates.push(
      {
        id: 'candidate_available',
        batchId: 'batch_1',
        taskId: 'task_1',
        localKey: 'a',
        format: 'original_post',
        text: 'Available copy',
        angle: 'fast fact',
        factualClaims: [],
        uncertaintyNotes: [],
        riskStatus: 'low',
        status: 'available',
        createdAt: '2026-08-20T01:15:00.000Z',
      },
      {
        id: 'candidate_blocked',
        batchId: 'batch_1',
        taskId: 'task_1',
        localKey: 'b',
        format: 'original_post',
        text: 'Blocked copy',
        angle: 'bad angle',
        factualClaims: [],
        uncertaintyNotes: [],
        riskStatus: 'high',
        status: 'blocked',
        createdAt: '2026-08-20T01:15:00.000Z',
      },
    );
    const service = new ContentService(repository);

    await expect(
      service.publishTask('task_1', {
        candidateId: 'candidate_blocked',
        url: 'https://x.com/account_flash/status/1234567890',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.publishTask('task_1', {
        candidateId: 'candidate_available',
        url: 'https://example.com/not-x',
      }),
    ).rejects.toBeInstanceOf(
      BadRequestException,
    );
    const result = await service.publishTask('task_1', {
      candidateId: 'candidate_available',
      url: 'https://x.com/account_flash/status/1234567890',
      now: '2026-08-20T01:30:00.000Z',
    });

    expect(result).toEqual(
      expect.objectContaining({
        taskId: 'task_1',
        candidateId: 'candidate_available',
        eventId: 'event_1',
        accountId: 'account_flash',
        url: 'https://x.com/account_flash/status/1234567890',
        status: 'published',
        trackingStatus: 'tracking',
        trackingEndsAt: '2026-08-27T01:30:00.000Z',
        wellPerforming: false,
        trackingRuleVersion: 'publication-tracking-v1',
        trackingFailureCount: 0,
        eventFormedAt: '2026-08-20T01:00:00.000Z',
        urlFilledAt: '2026-08-20T01:30:00.000Z',
        firstPublishLatencyMs: 30 * 60 * 1000,
      }),
    );
    expect(repository.accountResponseTasks[0]).toEqual(expect.objectContaining({ status: 'published' }));
    await expect(
      service.publishTask('task_1', {
        candidateId: 'candidate_available',
        url: 'https://x.com/account_flash/status/1234567890',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('records publication metrics and completes tracking', async () => {
    const repository = new InMemoryContentRepository();
    repository.accountResponseTasks.push({
      id: 'task_1',
      eventId: 'event_1',
      accountId: 'account_flash',
      status: 'published',
      priority: 'normal',
      skill: 'respond-with-breaking-brief',
      skillVersion: '1.0.0',
      assignmentReason: 'Base pipeline.',
      riskStatus: 'low',
      createdAt: '2026-08-20T01:00:00.000Z',
      updatedAt: '2026-08-20T01:30:00.000Z',
    });
    repository.publicationRecords.push({
      id: 'publication_1',
      taskId: 'task_1',
      candidateId: 'candidate_selected',
      eventId: 'event_1',
      accountId: 'account_flash',
      url: 'https://x.com/account_flash/status/1234567890',
      status: 'published',
      publishedAt: '2026-08-20T01:30:00.000Z',
      trackingStatus: 'tracking',
      trackingEndsAt: '2026-08-27T01:30:00.000Z',
      wellPerforming: false,
      trackingRuleVersion: 'publication-tracking-v1',
      trackingFailureCount: 0,
      createdAt: '2026-08-20T01:30:00.000Z',
    });
    const service = new ContentService(repository);

    const metrics = await service.recordPublicationMetrics('publication_1', {
      capturedAt: '2026-08-20T03:30:00.000Z',
      likes: 12,
      replies: 3,
      reposts: 4,
      quotes: 1,
      views: 1200,
    });

    expect(metrics).toEqual(
      expect.objectContaining({
        publicationRecordId: 'publication_1',
        likes: 12,
        replies: 3,
        reposts: 4,
        quotes: 1,
        views: 1200,
        capturedAt: '2026-08-20T03:30:00.000Z',
      }),
    );
    expect(repository.accountResponseTasks[0]).toEqual(expect.objectContaining({ status: 'tracking' }));
    expect(repository.publicationRecords[0]).toEqual(
      expect.objectContaining({
        wellPerforming: true,
        trackingEndsAt: '2026-09-03T01:30:00.000Z',
      }),
    );

    const completed = await service.completeTracking('publication_1', {
      now: '2026-08-27T01:30:00.000Z',
    });

    expect(completed).toEqual(
      expect.objectContaining({
        id: 'publication_1',
        trackingStatus: 'completed',
      }),
    );
    expect(repository.accountResponseTasks[0]).toEqual(expect.objectContaining({ status: 'completed' }));
  });
});
