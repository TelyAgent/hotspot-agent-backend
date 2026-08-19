import { OpenAIAssistantModelAdapter } from '../../src/assistant/openai-assistant-model.adapter';

describe('OpenAIAssistantModelAdapter', () => {
  it('calls the Responses API and returns output text', async () => {
    const fetcher = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ output_text: '这是模型回复。' }),
    });
    const adapter = new OpenAIAssistantModelAdapter({
      apiKey: 'test-key',
      model: 'gpt-test',
      baseUrl: 'https://api.example.com/v1/',
      fetcher,
    });

    const result = await adapter.chat({
      message: '帮我解释配置',
      context: { page: 'settings', setting: 'twitter' },
    });

    expect(result).toBe('这是模型回复。');
    expect(fetcher).toHaveBeenCalledWith(
      'https://api.example.com/v1/responses',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-key',
          'Content-Type': 'application/json',
        }),
      }),
    );
    const body = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(body.model).toBe('gpt-test');
    expect(body.input[1].content[0].text).toContain('帮我解释配置');
    expect(body.input[1].content[0].text).toContain('"page": "settings"');
  });

  it('throws a clear error when OPENAI_API_KEY is missing', async () => {
    const adapter = new OpenAIAssistantModelAdapter({ apiKey: '', fetcher: jest.fn() });

    await expect(
      adapter.chat({
        message: 'hello',
        context: { page: 'settings' },
      }),
    ).rejects.toThrow('OPENAI_API_KEY is required for assistant chat');
  });
});
