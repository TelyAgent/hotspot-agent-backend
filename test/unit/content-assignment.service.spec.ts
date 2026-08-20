import { ContentAssignmentService } from '../../src/content/content-assignment.service';
import { ContentAssignmentDecider } from '../../src/content/content-assignment-decider';
import { ContentCommandExecutor } from '../../src/content/content-command.executor';
import { InMemoryContentRepository } from '../../src/content/in-memory-content.repository';

describe('ContentAssignmentService', () => {
  it('creates ready tasks for enabled base pipeline accounts without candidates', async () => {
    const repository = new InMemoryContentRepository();
    repository.operationAccounts.push(
      {
        id: 'operation_account_flash',
        key: 'respond-with-breaking-brief',
        name: '快讯型',
        enabled: true,
        fields: {
          type: '基础生产线',
          skill: 'respond-with-breaking-brief',
          personaType: '把热点压缩为可快速扫描的单一事实更新',
        },
      },
      {
        id: 'operation_account_persona',
        key: 'nick-preszler',
        name: 'Nick Preszler',
        enabled: true,
        fields: {
          type: '人设账号',
          skill: 'Nick Preszler',
          personaType: '机制、激励、指标误读和二阶洞察',
        },
      },
      {
        id: 'operation_account_disabled',
        key: 'disabled-base',
        name: 'Disabled Base',
        enabled: false,
        fields: {
          type: '基础生产线',
          skill: 'disabled-skill',
        },
      },
    );
    const service = new ContentAssignmentService(repository, new ContentCommandExecutor(repository));

    const result = await service.startForEvent({
      eventId: 'event_1',
      workflowRunId: 'wrun_event',
      workflowCommandId: 'cmd_create_event',
      triggerReason: 'TR-01 top five trend',
      now: '2026-08-20T03:00:00.000Z',
    });

    expect(result).toEqual({
      createdOrReused: 1,
      skippedAccounts: [
        {
          accountId: 'operation_account_persona',
          reason: '缺少 Event Context Pack，无法进行人设账号分配判断。',
        },
      ],
    });
    expect(repository.contentTasks).toEqual([
      expect.objectContaining({
        eventId: 'event_1',
        accountId: 'operation_account_flash',
        status: 'ready_for_generation',
        skill: 'respond-with-breaking-brief',
        skillVersion: '1.0.0',
        assignmentReason: 'Base pipeline account assigned automatically for triggered Event.',
      }),
    ]);
    expect(repository.contentCandidateBatches).toHaveLength(0);
    expect(repository.contentCandidates).toHaveLength(0);
  });

  it('creates persona account tasks when the role assignment decider chooses participate', async () => {
    const repository = new InMemoryContentRepository();
    repository.events.push({
      eventId: 'event_1',
      title: 'Fed rate decision moves markets',
      oneLineSummary: 'The Fed rate decision is trending on X.',
      status: 'responding',
      confirmationLevel: 'partially_supported',
      expressionBoundary: 'Treat market interpretation as developing.',
      confirmedFacts: ['The Fed decision is a live market topic.'],
      unconfirmedFacts: [],
      evidenceRecords: [{ sourceType: 'x_trend', claim: 'Fed decision entered X trends.' }],
      sourceContexts: [],
    });
    repository.operationAccounts.push({
      id: 'operation_account_unusual_whales',
      key: 'unusual-whales',
      name: 'Unusual Whales',
      enabled: true,
      fields: {
        type: '人设账号',
        skill: 'unusual-whales-content-operator',
        personaType: '公司、监管、政治、资金与利益后果',
      },
    });
    const decider: ContentAssignmentDecider = {
      decide: jest.fn().mockResolvedValue([
        {
          accountId: 'operation_account_unusual_whales',
          decision: 'participate',
          reason: 'The event matches money, policy, and market impact.',
          priority: 'high',
        },
      ]),
    };
    const service = new ContentAssignmentService(repository, new ContentCommandExecutor(repository), decider);

    const result = await service.startForEvent({
      eventId: 'event_1',
      workflowRunId: 'wrun_event',
      workflowCommandId: 'cmd_create_event',
      triggerReason: 'TR-01 top five trend',
      now: '2026-08-20T04:00:00.000Z',
    });

    expect(decider.decide).toHaveBeenCalledWith(
      expect.objectContaining({
        eventContextPack: expect.objectContaining({
          eventId: 'event_1',
          title: 'Fed rate decision moves markets',
        }),
        accounts: [
          expect.objectContaining({
            id: 'operation_account_unusual_whales',
            name: 'Unusual Whales',
          }),
        ],
      }),
    );
    expect(result).toEqual({ createdOrReused: 1, skippedAccounts: [] });
    expect(repository.contentTasks).toEqual([
      expect.objectContaining({
        eventId: 'event_1',
        accountId: 'operation_account_unusual_whales',
        status: 'ready_for_generation',
        priority: 'high',
        skill: 'unusual-whales-content-operator',
        assignmentReason: 'The event matches money, policy, and market impact.',
      }),
    ]);
    expect(repository.contentCandidates).toHaveLength(0);
  });
});
