import { ContentCommandExecutor } from '../../src/content/content-command.executor';
import { InMemoryContentRepository } from '../../src/content/in-memory-content.repository';
import { CreateContentTaskCommand } from '../../src/content/content.types';

describe('ContentCommandExecutor', () => {
  it('creates a content task without creating candidates', async () => {
    const repository = new InMemoryContentRepository();
    const executor = new ContentCommandExecutor(repository);
    const command: CreateContentTaskCommand = {
      type: 'create_content_task',
      idempotencyKey: 'task:event_1:account_flash',
      eventId: 'event_1',
      accountId: 'account_flash',
      skill: 'respond-with-breaking-brief',
      skillVersion: '1.0.0',
      assignmentReason: 'Base pipeline accounts respond to triggered events.',
      priority: 'high',
      source: {
        workflowRunId: 'wrun_event',
        commandId: 'cmd_create_event',
        triggerReason: 'TR-01 top five trend',
      },
    };

    const execution = await executor.execute({
      workflowRunId: 'wrun_assign',
      workflowCommandId: 'cmd_task',
      command,
      now: '2026-08-20T01:00:00.000Z',
    });

    expect(execution).toMatchObject({
      workflowRunId: 'wrun_assign',
      workflowCommandId: 'cmd_task',
      commandType: 'create_content_task',
      idempotencyKey: 'task:event_1:account_flash',
      status: 'success',
      targetTaskId: expect.any(String),
    });
    expect(repository.contentTasks).toEqual([
      expect.objectContaining({
        eventId: 'event_1',
        accountId: 'account_flash',
        status: 'ready_for_generation',
        priority: 'high',
        skill: 'respond-with-breaking-brief',
        skillVersion: '1.0.0',
        assignmentReason: 'Base pipeline accounts respond to triggered events.',
        riskStatus: 'not_checked',
        workflowRunId: 'wrun_assign',
        assignmentCommandId: 'cmd_task',
      }),
    ]);
    expect(repository.contentCandidateBatches).toHaveLength(0);
    expect(repository.contentCandidates).toHaveLength(0);
  });

  it('skips duplicate idempotency keys and does not create another task', async () => {
    const repository = new InMemoryContentRepository();
    const executor = new ContentCommandExecutor(repository);
    const command: CreateContentTaskCommand = {
      type: 'create_content_task',
      idempotencyKey: 'task:event_1:account_flash',
      eventId: 'event_1',
      accountId: 'account_flash',
      skill: 'respond-with-breaking-brief',
      skillVersion: '1.0.0',
      assignmentReason: 'Base pipeline accounts respond to triggered events.',
      priority: 'normal',
      source: {
        workflowRunId: 'wrun_event',
        triggerReason: 'TR-01 top five trend',
      },
    };

    const first = await executor.execute({
      workflowRunId: 'wrun_assign',
      workflowCommandId: 'cmd_task',
      command,
      now: '2026-08-20T01:00:00.000Z',
    });
    const second = await executor.execute({
      workflowRunId: 'wrun_assign',
      workflowCommandId: 'cmd_task_duplicate',
      command,
      now: '2026-08-20T01:01:00.000Z',
    });

    expect(first.status).toBe('success');
    expect(second).toMatchObject({
      status: 'skipped',
      targetTaskId: first.targetTaskId,
    });
    expect(repository.contentTasks).toHaveLength(1);
  });

  it('reuses an existing event account task even when the assignment command has a new idempotency key', async () => {
    const repository = new InMemoryContentRepository();
    const executor = new ContentCommandExecutor(repository);
    const firstCommand: CreateContentTaskCommand = {
      type: 'create_content_task',
      idempotencyKey: 'task:event_1:account_flash:first',
      eventId: 'event_1',
      accountId: 'account_flash',
      skill: 'respond-with-breaking-brief',
      skillVersion: '1.0.0',
      assignmentReason: 'Initial trigger.',
      priority: 'normal',
      source: {
        workflowRunId: 'wrun_event',
        triggerReason: 'TR-01 top five trend',
      },
    };
    const secondCommand: CreateContentTaskCommand = {
      ...firstCommand,
      idempotencyKey: 'task:event_1:account_flash:second',
      assignmentReason: 'Later duplicate trigger.',
    };

    const first = await executor.execute({
      workflowRunId: 'wrun_assign',
      workflowCommandId: 'cmd_task_first',
      command: firstCommand,
      now: '2026-08-20T01:00:00.000Z',
    });
    const second = await executor.execute({
      workflowRunId: 'wrun_assign',
      workflowCommandId: 'cmd_task_second',
      command: secondCommand,
      now: '2026-08-20T01:02:00.000Z',
    });

    expect(first.status).toBe('success');
    expect(second).toMatchObject({
      status: 'skipped',
      targetTaskId: first.targetTaskId,
    });
    expect(repository.contentTasks).toHaveLength(1);
    expect(repository.commandExecutions).toHaveLength(2);
  });
});
