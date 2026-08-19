import { AssistantController } from '../../src/assistant/assistant.controller';

describe('AssistantController', () => {
  it('returns an assistant chat response', async () => {
    const service = {
      chat: jest.fn().mockResolvedValue({ message: '收到，我来帮你看配置。' }),
    };
    const controller = new AssistantController(service as any);

    await expect(
      controller.chat({
        message: '帮我看一下 Twitter 配置',
        context: { page: 'settings', setting: 'twitter' },
      }),
    ).resolves.toEqual({ message: '收到，我来帮你看配置。' });

    expect(service.chat).toHaveBeenCalledWith({
      message: '帮我看一下 Twitter 配置',
      context: { page: 'settings', setting: 'twitter' },
    });
  });

  it('executes a confirmed assistant tool action', async () => {
    const service = {
      chat: jest.fn(),
      executeTool: jest.fn().mockResolvedValue({ message: '已更新配置。' }),
    };
    const controller = new AssistantController(service as any);

    await expect(
      controller.executeTool({
        tool: 'set_twitter_trend_schedule',
        arguments: { cron: '0 */4 * * *' },
      }),
    ).resolves.toEqual({ message: '已更新配置。' });
  });
});
