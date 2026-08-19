import { FakeWorkflowModelAdapter } from '../../src/workflow/fake-workflow-model.adapter';

describe('FakeWorkflowModelAdapter', () => {
  it('returns an empty command output using the workflow metadata and context run id', async () => {
    const adapter = new FakeWorkflowModelAdapter();

    await expect(
      adapter.generateCommands({
        workflowId: 'x-trend-event-formation',
        workflowVersion: '1.0.0',
        workflowMarkdown: '# 工作流',
        outputSchema: { type: 'object' },
        context: { workflowRunId: 'wrun_test' },
      }),
    ).resolves.toEqual({
      schemaVersion: 'event_workflow_commands_v1',
      workflowId: 'x-trend-event-formation',
      workflowVersion: '1.0.0',
      runId: 'wrun_test',
      commands: [],
      diagnostics: [{ level: 'info', message: 'FakeWorkflowModelAdapter returned no commands.' }],
    });
  });
});
