import { OpenAIWorkflowModelAdapter } from '../../src/workflow/openai-workflow-model.adapter';

describe('OpenAIWorkflowModelAdapter', () => {
  it('calls OpenAI Responses API with workflow markdown, schema, and context', async () => {
    const fetcher = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output_text: JSON.stringify({
          schemaVersion: 'event_workflow_commands_v1',
          workflowId: 'x-trend-event-formation',
          workflowVersion: '1.0.0',
          runId: 'wrun_test',
          commands: [],
        }),
      }),
    });
    const adapter = new OpenAIWorkflowModelAdapter({
      apiKey: 'test-key',
      model: 'gpt-test',
      fetcher,
    });

    const result = await adapter.generateCommands({
      workflowId: 'x-trend-event-formation',
      workflowVersion: '1.0.0',
      workflowMarkdown: '# 工作流',
      outputSchema: { title: 'EventWorkflowCommandsV1', type: 'object' },
      context: { workflowRunId: 'wrun_test', currentBatch: { successfulRegions: [] } },
    });

    expect(fetcher).toHaveBeenCalledWith(
      'https://api.openai.com/v1/responses',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Authorization: 'Bearer test-key',
          'Content-Type': 'application/json',
        },
      }),
    );
    const requestBody = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(requestBody).toMatchObject({
      model: 'gpt-test',
      store: false,
      text: {
        format: {
          type: 'json_schema',
          name: 'EventWorkflowCommandsV1',
          strict: true,
          schema: { title: 'EventWorkflowCommandsV1', type: 'object' },
        },
      },
    });
    expect(JSON.stringify(requestBody.input)).toContain('# 工作流');
    expect(JSON.stringify(requestBody.input)).toContain('wrun_test');
    expect(result.commands).toEqual([]);
  });

  it('throws a clear error when OPENAI_API_KEY is missing', async () => {
    const adapter = new OpenAIWorkflowModelAdapter({ apiKey: '', fetcher: jest.fn() });

    await expect(
      adapter.generateCommands({
        workflowId: 'x-trend-event-formation',
        workflowVersion: '1.0.0',
        workflowMarkdown: '# 工作流',
        outputSchema: { type: 'object' },
        context: { workflowRunId: 'wrun_test' },
      }),
    ).rejects.toThrow('OPENAI_API_KEY is required');
  });

  it('parses output text from nested Responses API content', async () => {
    const fetcher = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        output: [
          {
            content: [
              {
                type: 'output_text',
                text: JSON.stringify({
                  schemaVersion: 'event_workflow_commands_v1',
                  workflowId: 'x-trend-event-formation',
                  workflowVersion: '1.0.0',
                  runId: 'wrun_test',
                  commands: [],
                }),
              },
            ],
          },
        ],
      }),
    });
    const adapter = new OpenAIWorkflowModelAdapter({ apiKey: 'test-key', fetcher });

    const result = await adapter.generateCommands({
      workflowId: 'x-trend-event-formation',
      workflowVersion: '1.0.0',
      workflowMarkdown: '# 工作流',
      outputSchema: { type: 'object' },
      context: { workflowRunId: 'wrun_test' },
    });

    expect(result.runId).toBe('wrun_test');
  });
});
