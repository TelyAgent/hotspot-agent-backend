import { EventCommandExecutor } from '../../src/workflow/event-command.executor';
import { InMemoryWorkflowRepository } from '../../src/workflow/in-memory-workflow.repository';
import { CreateEventCommand, IgnoreSignalCommand, UpdateEventContextCommand } from '../../src/workflow/workflow.types';

describe('EventCommandExecutor', () => {
  it('creates events with intake, context, evidence, and execution records', async () => {
    const repository = new InMemoryWorkflowRepository();
    const executor = new EventCommandExecutor(repository);
    const command: CreateEventCommand = {
      type: 'create_event',
      idempotencyKey: 'create:ai:tr01',
      eventCandidate: {
        title: 'AI enters top trends',
        oneLineSummary: 'AI enters the United States X trend top five.',
        normalizedEventKey: 'ai-enters-top-trends',
        confidence: 'high',
      },
      eventIntake: {
        schemaVersion: 'event_intake_v1',
        entryMode: 'x_trend',
        observedAt: '2026-08-18T02:05:00.000Z',
        t0: '2026-08-18T02:05:00.000Z',
        title: 'AI enters top trends',
        oneLineSummary: 'AI enters the United States X trend top five.',
        confirmationLevel: 'unconfirmed',
        expressionBoundary: 'X trend only',
        confirmedFacts: [],
        unconfirmedFacts: ['AI is trending on X'],
        evidenceRecords: [],
        trendContext: { regions: [] },
        trigger: {
          ruleId: 'TR-01',
          reason: 'Top five',
          t0: '2026-08-18T02:05:00.000Z',
          observedAt: '2026-08-18T02:05:00.000Z',
        },
        candidateEventIds: [],
        dedupeKey: 'ai-enters-top-trends',
      },
      trigger: {
        ruleId: 'TR-01',
        reason: 'Top five',
        t0: '2026-08-18T02:05:00.000Z',
        observedAt: '2026-08-18T02:05:00.000Z',
      },
      sourceContext: { regions: [{ region: 'United States', rank: 4, snapshotId: 'snapshot_us_new', representativePosts: [] }] },
      evidenceRecords: [{ sourceType: 'x_trend', claim: 'AI ranked #4 on United States trends' }],
      startResponsePipeline: true,
    };

    const execution = await executor.execute({
      workflowRunId: 'wrun_test',
      workflowCommandId: 'cmd_create',
      command,
      now: '2026-08-18T02:06:00.000Z',
    });

    expect(execution).toMatchObject({
      workflowRunId: 'wrun_test',
      workflowCommandId: 'cmd_create',
      commandType: 'create_event',
      idempotencyKey: 'create:ai:tr01',
      status: 'success',
    });
    expect(repository.events).toEqual([
      expect.objectContaining({
        title: 'AI enters top trends',
        normalizedEventKey: 'ai-enters-top-trends',
        status: 'responding',
      }),
    ]);
    expect(repository.eventIntakes).toHaveLength(1);
    expect(repository.eventSourceContexts).toHaveLength(1);
    expect(repository.eventEvidence).toHaveLength(1);
  });

  it('updates existing event context and skips duplicate idempotency keys', async () => {
    const repository = new InMemoryWorkflowRepository();
    const executor = new EventCommandExecutor(repository);
    repository.events.push({
      id: 'event_existing',
      title: 'AI enters top trends',
      normalizedEventKey: 'ai-enters-top-trends',
      status: 'responding',
      confidence: 'high',
      formedAt: '2026-08-18T02:05:00.000Z',
      updatedAt: '2026-08-18T02:05:00.000Z',
    });
    const command: UpdateEventContextCommand = {
      type: 'update_event_context',
      idempotencyKey: 'update:event_existing:tr04',
      targetEventId: 'event_existing',
      reason: 'Appeared in another region',
      sourceContextPatch: { regions: [{ region: 'Japan', rank: 7, snapshotId: 'snapshot_jp_new', representativePosts: [] }] },
      evidenceRecords: [{ sourceType: 'x_trend', claim: 'AI ranked #7 on Japan trends' }],
      startResponsePipeline: false,
    };

    const first = await executor.execute({
      workflowRunId: 'wrun_test',
      workflowCommandId: 'cmd_update',
      command,
      now: '2026-08-18T02:06:00.000Z',
    });
    const second = await executor.execute({
      workflowRunId: 'wrun_test',
      workflowCommandId: 'cmd_update_2',
      command,
      now: '2026-08-18T02:07:00.000Z',
    });

    expect(first.status).toBe('success');
    expect(second.status).toBe('skipped');
    expect(repository.eventSourceContexts).toHaveLength(1);
    expect(repository.eventEvidence).toHaveLength(1);
  });

  it('persists ignored signals', async () => {
    const repository = new InMemoryWorkflowRepository();
    const executor = new EventCommandExecutor(repository);
    const command: IgnoreSignalCommand = {
      type: 'ignore',
      idempotencyKey: 'ignore:no-event',
      reason: 'Not a concrete event',
      sourceRefs: [{ platform: 'x', sourceType: 'trend', id: 'item_noise' }],
    };

    await executor.execute({
      workflowRunId: 'wrun_test',
      workflowCommandId: 'cmd_ignore',
      command,
      now: '2026-08-18T02:06:00.000Z',
    });

    expect(repository.ignoredSignals).toEqual([
      expect.objectContaining({ workflowRunId: 'wrun_test', reason: 'Not a concrete event' }),
    ]);
  });
});
