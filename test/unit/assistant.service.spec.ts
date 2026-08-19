import { AssistantService } from '../../src/assistant/assistant.service';
import { createDefaultCollectionState } from '../../src/collection/default-collection-state';
import { InMemoryCollectionRepository } from '../../src/collection/in-memory-collection.repository';

describe('AssistantService', () => {
  it('sends the user message with page context and platform config summary to the model', async () => {
    const repository = new InMemoryCollectionRepository(createDefaultCollectionState());
    const model = {
      chat: jest.fn().mockResolvedValue('可以在 Twitter 配置中调整目标地区。'),
    };
    const service = new AssistantService(model, repository);

    const result = await service.chat({
      message: '现在采集哪些地区？',
      context: {
        page: 'settings',
        setting: 'twitter',
        region: 'Worldwide',
        event: 'e1',
      },
    });

    expect(result).toEqual({ message: '可以在 Twitter 配置中调整目标地区。' });
    expect(model.chat).toHaveBeenCalledWith(
      expect.objectContaining({
        message: '现在采集哪些地区？',
        context: expect.objectContaining({
          page: 'settings',
          setting: 'twitter',
          platformConfig: expect.objectContaining({
            platform: 'x',
            regions: ['global', 'United States', 'United Kingdom', 'Japan', 'Korea'],
            trendCollectionCron: '0 */2 * * *',
            trendEventWorkflowId: 'x-trend-event-formation',
            topicCount: 5,
          }),
        }),
      }),
    );
  });

  it('returns proposed config changes without executing them during chat', async () => {
    const repository = new InMemoryCollectionRepository(createDefaultCollectionState());
    const model = {
      chat: jest.fn().mockResolvedValue({
        message: '我可以帮你把 X 榜单采集改为每 4 小时。',
        proposedActions: [
          {
            id: 'action-1',
            tool: 'set_twitter_trend_schedule',
            summary: '将 X 榜单采集频率改为每 4 小时',
            arguments: { cron: '0 */4 * * *' },
            requiresConfirmation: true,
          },
        ],
      }),
    };
    const service = new AssistantService(model, repository);

    const result = await service.chat({
      message: '把 Twitter 榜单采集改成每 4 小时',
      context: { page: 'settings', setting: 'twitter' },
    });
    const trendJob = repository.findJobConfig('x-trending-default');

    expect(result.proposedActions).toHaveLength(1);
    expect(result.proposedActions?.[0].tool).toBe('set_twitter_trend_schedule');
    expect(trendJob?.schedule).toEqual({ type: 'cron', value: '0 */2 * * *' });
  });

  it('executes a confirmed Twitter trend schedule change', async () => {
    const repository = new InMemoryCollectionRepository(createDefaultCollectionState());
    const model = { chat: jest.fn() };
    const service = new AssistantService(model, repository);

    const result = await service.executeTool({
      tool: 'set_twitter_trend_schedule',
      arguments: { cron: '0 */4 * * *' },
    });
    const config = repository.findPlatformConfig('x');
    const trendJob = repository.findJobConfig('x-trending-default');

    expect(result.message).toBe('已将 X 榜单采集频率更新为 0 */4 * * *。');
    expect(config?.variables.trendCollectionCron).toBe('0 */4 * * *');
    expect(trendJob?.schedule).toEqual({ type: 'cron', value: '0 */4 * * *' });
  });

  it('directly lists Twitter topics for explicit topic tracking questions', async () => {
    const repository = new InMemoryCollectionRepository(createDefaultCollectionState());
    const model = { chat: jest.fn() };
    const service = new AssistantService(model, repository);

    const result = await service.chat({
      message: '当前Twitter追踪了哪些主题',
      context: { page: 'settings', setting: 'twitter' },
    });

    expect(model.chat).not.toHaveBeenCalled();
    expect(result.message).toContain('当前 Twitter 追踪 5 个重点主题');
    expect(result.message).toContain('政治与选举');
    expect(result.message).toContain('Crypto 与 Web3');
    expect(result.message).toContain('AI 与科技');
  });

  it('adds an account to a Twitter topic without replacing existing accounts', async () => {
    const repository = new InMemoryCollectionRepository(createDefaultCollectionState());
    const model = { chat: jest.fn() };
    const service = new AssistantService(model, repository);

    const result = await service.executeTool({
      tool: 'add_twitter_topic_account',
      arguments: {
        topicName: '政治与选举',
        account: 'Jason',
      },
    });
    const config = repository.findPlatformConfig('x');
    const topic = config?.variables.topicConfigs?.find((item) => item.name === '政治与选举');

    expect(result.message).toBe('已为政治与选举添加关注账号：Jason。');
    expect(topic?.accounts).toEqual(['Reuters', 'AP', 'CNNPolitics', 'POLITICO', 'axios', 'Jason']);
    expect(config?.variables.monitoredAccounts).toContain('Jason');
  });

  it('removes an account from a Twitter topic', async () => {
    const repository = new InMemoryCollectionRepository(createDefaultCollectionState());
    const model = { chat: jest.fn() };
    const service = new AssistantService(model, repository);

    const result = await service.executeTool({
      tool: 'remove_twitter_topic_account',
      arguments: {
        topicName: '政治与选举',
        account: 'AP',
      },
    });
    const config = repository.findPlatformConfig('x');
    const topic = config?.variables.topicConfigs?.find((item) => item.name === '政治与选举');

    expect(result.message).toBe('已从政治与选举移除关注账号：AP。');
    expect(topic?.accounts).toEqual(['Reuters', 'CNNPolitics', 'POLITICO', 'axios']);
    expect(config?.variables.monitoredAccounts).not.toContain('AP');
  });

  it('proposes a fine-grained account add action for natural language requests', async () => {
    const repository = new InMemoryCollectionRepository(createDefaultCollectionState());
    const model = { chat: jest.fn() };
    const service = new AssistantService(model, repository);

    const result = await service.chat({
      message: '政治与选举 添加追踪账号 Jason',
      context: { page: 'settings', setting: 'twitter' },
    });

    expect(model.chat).not.toHaveBeenCalled();
    expect(result.message).toBe('我将为政治与选举添加关注账号：Jason。');
    expect(result.proposedActions).toEqual([
      expect.objectContaining({
        tool: 'add_twitter_topic_account',
        summary: '为政治与选举添加关注账号 Jason',
        arguments: { topicName: '政治与选举', account: 'Jason' },
        requiresConfirmation: true,
      }),
    ]);
  });
});
