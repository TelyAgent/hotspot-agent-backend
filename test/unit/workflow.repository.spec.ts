import { InMemoryWorkflowRepository } from '../../src/workflow/in-memory-workflow.repository';

describe('InMemoryWorkflowRepository', () => {
  it('stores workflow definitions, runs, commands, events, and ignored signals', async () => {
    const repository = new InMemoryWorkflowRepository();

    const definition = await repository.saveWorkflowDefinition({
      id: 'wdef_test',
      workflowId: 'x-trend-event-formation',
      name: 'X 热搜榜生成 Event',
      type: 'event_formation',
      version: '1.0.0',
      status: 'enabled',
      markdownPath: 'workflows/event-formation/x-trend-event-formation/WORKFLOW.md',
      outputSchemaPath: 'workflows/event-formation/x-trend-event-formation/output.schema.json',
      checksum: 'checksum_test',
      createdAt: '2026-08-18T00:00:00.000Z',
      updatedAt: '2026-08-18T00:00:00.000Z',
    });

    const run = await repository.createWorkflowRun({
      id: 'wrun_test',
      workflowDefinitionId: definition.id,
      status: 'running',
      startedAt: '2026-08-18T00:00:01.000Z',
      input: { schemaVersion: 'x_trend_event_context_v1' },
    });

    await repository.saveWorkflowCommands([
      {
        id: 'cmd_test',
        workflowRunId: run.id,
        type: 'ignore',
        idempotencyKey: 'ignore:test',
        payload: { type: 'ignore', idempotencyKey: 'ignore:test', reason: 'generic', sourceRefs: [] },
        createdAt: '2026-08-18T00:00:02.000Z',
      },
    ]);

    await repository.saveIgnoredSignal({
      id: 'ignored_test',
      workflowRunId: run.id,
      reason: 'generic',
      sourceRefs: [],
      createdAt: '2026-08-18T00:00:03.000Z',
    });

    const finished = await repository.finishWorkflowRun(run.id, {
      status: 'success',
      finishedAt: '2026-08-18T00:00:04.000Z',
      output: { schemaVersion: 'event_workflow_commands_v1', commands: [] },
    });

    expect(await repository.findEnabledWorkflowDefinition('x-trend-event-formation')).toEqual(definition);
    expect(repository.workflowRuns).toEqual([finished]);
    expect(repository.workflowCommands).toHaveLength(1);
    expect(repository.ignoredSignals).toHaveLength(1);
  });
});
