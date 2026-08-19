import { createTwitterApiIoTools } from '../../src/connectors/x/twitterapi-io.tools';
import { XTrendingToolOutput } from '../../src/collection/collection.types';

describe('TwitterApiIo tools', () => {
  it('fetches regional trends from twitterapi.io and maps them to X trending output', async () => {
    const fetcher = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'success',
        msg: 'ok',
        trends: [
          {
            name: 'OpenAI',
            target: { query: 'OpenAI' },
            rank: 1,
            meta_description: 'AI trend',
          },
          {
            name: 'Bitcoin',
            target: { query: '#Bitcoin' },
            rank: 2,
          },
        ],
      }),
    });
    const [tool] = createTwitterApiIoTools({
      apiKey: 'test-key',
      fetcher,
    });

    const output = (await tool.invoke({
      regions: ['US'],
      regionWoeids: {
        US: 23424977,
      },
      limit: 2,
      now: '2026-08-18T00:00:00.000Z',
    })) as XTrendingToolOutput[];

    expect(fetcher).toHaveBeenCalledWith(
      'https://api.twitterapi.io/twitter/trends?woeid=23424977&count=30',
      {
        headers: {
          'X-API-Key': 'test-key',
        },
      },
    );
    expect(output).toEqual([
      {
        platform: 'x',
        sourceType: 'trend',
        region: 'US',
        collectedAt: '2026-08-18T00:00:00.000Z',
        items: [
          {
            rank: 1,
            name: 'OpenAI',
            query: 'OpenAI',
            url: 'https://x.com/search?q=OpenAI',
            category: 'AI trend',
            raw: {
              name: 'OpenAI',
              target: { query: 'OpenAI' },
              rank: 1,
              meta_description: 'AI trend',
            },
          },
          {
            rank: 2,
            name: 'Bitcoin',
            query: '#Bitcoin',
            url: 'https://x.com/search?q=%23Bitcoin',
            category: undefined,
            raw: {
              name: 'Bitcoin',
              target: { query: '#Bitcoin' },
              rank: 2,
            },
          },
        ],
        raw: {
          status: 'success',
          msg: 'ok',
          trends: [
            {
              name: 'OpenAI',
              target: { query: 'OpenAI' },
              rank: 1,
              meta_description: 'AI trend',
            },
            {
              name: 'Bitcoin',
              target: { query: '#Bitcoin' },
              rank: 2,
            },
          ],
        },
      },
    ]);
  });

  it('defaults to the configured five target trend regions', async () => {
    const fetcher = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'success',
        trends: [],
      }),
    });
    const [tool] = createTwitterApiIoTools({
      apiKey: 'test-key',
      fetcher,
    });

    const output = (await tool.invoke({
      now: '2026-08-18T00:00:00.000Z',
    })) as XTrendingToolOutput[];

    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      'https://api.twitterapi.io/twitter/trends?woeid=1&count=30',
      'https://api.twitterapi.io/twitter/trends?woeid=23424977&count=30',
      'https://api.twitterapi.io/twitter/trends?woeid=23424975&count=30',
      'https://api.twitterapi.io/twitter/trends?woeid=23424856&count=30',
      'https://api.twitterapi.io/twitter/trends?woeid=23424868&count=30',
    ]);
    expect(output.map((snapshot) => snapshot.region)).toEqual([
      'global',
      'United States',
      'United Kingdom',
      'Japan',
      'Korea',
    ]);
  });

  it('maps twitterapi.io wrapped trend objects from the live response shape', async () => {
    const fetcher = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'success',
        trends: [
          {
            trend: {
              name: '#WrappedTrend',
              target: { query: '#WrappedTrend' },
              rank: 1,
            },
          },
        ],
      }),
    });
    const [tool] = createTwitterApiIoTools({
      apiKey: 'test-key',
      fetcher,
    });

    const output = (await tool.invoke({
      regions: ['global'],
      now: '2026-08-18T00:00:00.000Z',
    })) as XTrendingToolOutput[];

    expect(output[0].items[0]).toEqual({
      rank: 1,
      name: '#WrappedTrend',
      query: '#WrappedTrend',
      url: 'https://x.com/search?q=%23WrappedTrend',
      category: undefined,
      raw: {
        trend: {
          name: '#WrappedTrend',
          target: { query: '#WrappedTrend' },
          rank: 1,
        },
      },
    });
  });

  it('continues collecting other regions when one region request fails', async () => {
    const fetcher = jest
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 402,
        statusText: 'Payment Required',
        json: async () => ({ error: { message: 'Payment Required' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'success',
          trends: [{ name: 'OpenAI', rank: 1 }],
        }),
      });
    const [tool] = createTwitterApiIoTools({
      apiKey: 'test-key',
      fetcher,
    });

    const output = (await tool.invoke({
      regions: ['global', 'United States'],
      now: '2026-08-18T00:00:00.000Z',
    })) as XTrendingToolOutput[];

    expect(output.map((snapshot) => snapshot.region)).toEqual(['United States']);
    expect(output[0].items).toEqual([
      expect.objectContaining({
        rank: 1,
        name: 'OpenAI',
      }),
    ]);
  });

  it('throws all regional failures when no region can be collected', async () => {
    const fetcher = jest.fn().mockResolvedValue({
      ok: false,
      status: 402,
      statusText: 'Payment Required',
      json: async () => ({}),
    });
    const [tool] = createTwitterApiIoTools({
      apiKey: 'test-key',
      fetcher,
    });

    await expect(
      tool.invoke({
        regions: ['global', 'United States'],
        now: '2026-08-18T00:00:00.000Z',
      }),
    ).rejects.toThrow(
      'twitterapi.io x.getTrending failed for all regions: global: 402 Payment Required; United States: 402 Payment Required',
    );
  });

  it('searches top posts for a trend query through twitterapi.io advanced search', async () => {
    const fetcher = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'success',
        tweets: [
          {
            id: 'tweet_1',
            text: 'OpenAI announces a new model rollout.',
            url: 'https://x.com/OpenAI/status/tweet_1',
            createdAt: '2026-08-18T00:01:00.000Z',
            retweetCount: 10,
            replyCount: 2,
            likeCount: 40,
            quoteCount: 1,
            viewCount: 5000,
            bookmarkCount: 3,
            author: {
              id: 'user_1',
              userName: 'OpenAI',
              name: 'OpenAI',
            },
          },
        ],
      }),
    });
    const tools = createTwitterApiIoTools({
      apiKey: 'test-key',
      fetcher,
    });
    const searchTool = tools.find((tool) => tool.name === 'x.searchPosts');

    const output = await searchTool?.invoke({
      query: 'OpenAI',
      limit: 3,
      now: '2026-08-18T00:05:00.000Z',
    });

    expect(fetcher).toHaveBeenCalledWith(
      'https://api.twitterapi.io/twitter/tweet/advanced_search?query=OpenAI&queryType=Top',
      {
        headers: {
          'X-API-Key': 'test-key',
        },
      },
    );
    expect(output).toEqual({
      platform: 'x',
      sourceType: 'post',
      query: 'OpenAI',
      queryType: 'Top',
      collectedAt: '2026-08-18T00:05:00.000Z',
      posts: [
        expect.objectContaining({
          postId: 'tweet_1',
          authorHandle: 'OpenAI',
          text: 'OpenAI announces a new model rollout.',
          metrics: expect.objectContaining({ views: 5000, likes: 40 }),
        }),
      ],
    });
  });
});
