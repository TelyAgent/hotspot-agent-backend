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

  it('defaults to the global trends WOEID only', async () => {
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

    expect(fetcher).toHaveBeenCalledWith(
      'https://api.twitterapi.io/twitter/trends?woeid=1&count=30',
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
        region: 'global',
        collectedAt: '2026-08-18T00:00:00.000Z',
        items: [],
        raw: {
          status: 'success',
          trends: [],
        },
      },
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
});
