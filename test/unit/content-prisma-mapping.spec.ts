import { PrismaContentRepository } from '../../src/content/prisma-content.repository';

describe('PrismaContentRepository', () => {
  it('finds content tasks by event and account using the compound unique key', async () => {
    const findUnique = jest.fn().mockResolvedValue({
      id: 'task_1',
      eventId: 'event_1',
      accountId: 'account_flash',
      workflowRunId: null,
      assignmentCommandId: null,
      status: 'ready_for_generation',
      priority: 'normal',
      skill: 'respond-with-breaking-brief',
      skillVersion: '1.0.0',
      assignmentReason: 'Base pipeline.',
      riskStatus: 'not_checked',
      latestCandidateBatchId: null,
      createdAt: new Date('2026-08-20T01:00:00.000Z'),
      updatedAt: new Date('2026-08-20T01:00:00.000Z'),
    });
    const repository = new PrismaContentRepository({
      contentTask: { findUnique },
    } as never);

    const task = await repository.findContentTaskByEventAndAccount('event_1', 'account_flash');

    expect(findUnique).toHaveBeenCalledWith({
      where: {
        eventId_accountId: {
          eventId: 'event_1',
          accountId: 'account_flash',
        },
      },
    });
    expect(task).toEqual({
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
  });

  it('creates content tasks and maps optional ids when present', async () => {
    const create = jest.fn().mockResolvedValue({
      id: 'task_2',
      eventId: 'event_2',
      accountId: 'account_deep',
      workflowRunId: 'wrun_assign',
      assignmentCommandId: 'cmd_task',
      status: 'ready_for_generation',
      priority: 'high',
      skill: 'develop-hotspot-deep-dive',
      skillVersion: '1.0.0',
      assignmentReason: 'Deep dive account should respond.',
      riskStatus: 'not_checked',
      latestCandidateBatchId: 'batch_latest',
      createdAt: new Date('2026-08-20T02:00:00.000Z'),
      updatedAt: new Date('2026-08-20T02:00:00.000Z'),
    });
    const repository = new PrismaContentRepository({
      contentTask: { create },
    } as never);

    const task = await repository.createContentTask({
      id: 'task_2',
      eventId: 'event_2',
      accountId: 'account_deep',
      workflowRunId: 'wrun_assign',
      assignmentCommandId: 'cmd_task',
      status: 'ready_for_generation',
      priority: 'high',
      skill: 'develop-hotspot-deep-dive',
      skillVersion: '1.0.0',
      assignmentReason: 'Deep dive account should respond.',
      riskStatus: 'not_checked',
      createdAt: '2026-08-20T02:00:00.000Z',
      updatedAt: '2026-08-20T02:00:00.000Z',
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        id: 'task_2',
        eventId: 'event_2',
        accountId: 'account_deep',
        workflowRunId: 'wrun_assign',
        assignmentCommandId: 'cmd_task',
        status: 'ready_for_generation',
        priority: 'high',
        skill: 'develop-hotspot-deep-dive',
        skillVersion: '1.0.0',
        assignmentReason: 'Deep dive account should respond.',
        riskStatus: 'not_checked',
        createdAt: new Date('2026-08-20T02:00:00.000Z'),
        updatedAt: new Date('2026-08-20T02:00:00.000Z'),
      },
    });
    expect(task).toEqual({
      id: 'task_2',
      eventId: 'event_2',
      accountId: 'account_deep',
      workflowRunId: 'wrun_assign',
      assignmentCommandId: 'cmd_task',
      status: 'ready_for_generation',
      priority: 'high',
      skill: 'develop-hotspot-deep-dive',
      skillVersion: '1.0.0',
      assignmentReason: 'Deep dive account should respond.',
      riskStatus: 'not_checked',
      latestCandidateBatchId: 'batch_latest',
      createdAt: '2026-08-20T02:00:00.000Z',
      updatedAt: '2026-08-20T02:00:00.000Z',
    });
  });
});
