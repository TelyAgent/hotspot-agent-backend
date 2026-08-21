import { ToolRegistry } from '../../src/connectors/tool-registry';
import { ToolRegistryPublicationMetricsCollector } from '../../src/content/publication-metrics.collector';

describe('ToolRegistryPublicationMetricsCollector', () => {
  it('collects metrics for the published X status from account timeline', async () => {
    const tools = new ToolRegistry();
    const invoke = jest.fn().mockResolvedValue({
      platform: 'x',
      sourceType: 'topic_circle_post',
      handle: 'account_flash',
      collectedAt: '2026-08-20T03:30:00.000Z',
      posts: [
        {
          postId: '1234567890',
          authorHandle: 'account_flash',
          text: 'Published post',
          url: 'https://x.com/account_flash/status/1234567890',
          postType: 'original',
          publishedAt: '2026-08-20T01:30:00.000Z',
          metrics: {
            likes: 12,
            replies: 3,
            reposts: 4,
            quotes: 1,
            views: 1200,
          },
          raw: { id: '1234567890' },
        },
      ],
    });
    tools.register({
      name: 'x.getAccountPosts',
      description: 'mock',
      invoke,
    });
    const collector = new ToolRegistryPublicationMetricsCollector(tools);

    await expect(
      collector.collect(
        {
          id: 'publication_1',
          taskId: 'task_1',
          candidateId: 'candidate_1',
          eventId: 'event_1',
          accountId: 'account_1',
          url: 'https://x.com/account_flash/status/1234567890',
          status: 'published',
          publishedAt: '2026-08-20T01:30:00.000Z',
          trackingStatus: 'tracking',
          trackingEndsAt: '2026-08-27T01:30:00.000Z',
          wellPerforming: false,
          trackingRuleVersion: 'publication-tracking-v1',
          trackingFailureCount: 0,
          createdAt: '2026-08-20T01:30:00.000Z',
        },
        '2026-08-20T03:30:00.000Z',
      ),
    ).resolves.toEqual({
      capturedAt: '2026-08-20T03:30:00.000Z',
      likes: 12,
      replies: 3,
      reposts: 4,
      quotes: 1,
      views: 1200,
      raw: { id: '1234567890' },
    });
    expect(invoke).toHaveBeenCalledWith({
      handle: 'account_flash',
      since: '2026-08-06T01:30:00.000Z',
      until: '2026-08-20T03:30:00.000Z',
      maxPages: 10,
      includeReplies: true,
      includeQuotes: true,
      includeReposts: true,
      now: '2026-08-20T03:30:00.000Z',
    });
  });

  it('records missing timeline matches as tracking errors instead of silently skipping metrics', async () => {
    const tools = new ToolRegistry();
    tools.register({
      name: 'x.getAccountPosts',
      description: 'mock',
      invoke: jest.fn().mockResolvedValue({
        platform: 'x',
        sourceType: 'topic_circle_post',
        handle: 'account_flash',
        collectedAt: '2026-08-20T03:30:00.000Z',
        posts: [],
      }),
    });
    const collector = new ToolRegistryPublicationMetricsCollector(tools);

    await expect(
      collector.collect(
        {
          id: 'publication_1',
          taskId: 'task_1',
          candidateId: 'candidate_1',
          eventId: 'event_1',
          accountId: 'account_1',
          url: 'https://x.com/account_flash/status/1234567890',
          status: 'published',
          publishedAt: '2026-08-20T01:30:00.000Z',
          trackingStatus: 'tracking',
          trackingEndsAt: '2026-08-27T01:30:00.000Z',
          wellPerforming: false,
          trackingRuleVersion: 'publication-tracking-v1',
          trackingFailureCount: 0,
          createdAt: '2026-08-20T01:30:00.000Z',
        },
        '2026-08-20T03:30:00.000Z',
      ),
    ).rejects.toThrow('未在账号 account_flash 最近 14 天时间线中找到回填帖子 1234567890');
  });
});
