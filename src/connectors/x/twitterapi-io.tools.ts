import { XTrendingToolOutput } from '../../collection/collection.types';
import { RuntimeTool } from '../tool-registry';

type Fetcher = (url: string, init?: { headers?: Record<string, string> }) => Promise<ResponseLike>;

interface ResponseLike {
  ok: boolean;
  status?: number;
  statusText?: string;
  json(): Promise<unknown>;
}

interface TwitterApiIoTrend {
  name?: string;
  target?: {
    query?: string;
  };
  rank?: number;
  meta_description?: string;
  trend?: TwitterApiIoTrend;
}

interface TwitterApiIoTrendResponse {
  status?: 'success' | 'error';
  msg?: string;
  trends?: TwitterApiIoTrend[];
}

interface GetTrendingInput {
  regions?: string[];
  woeids?: number[];
  regionWoeids?: Record<string, number>;
  limit?: number;
  count?: number;
  now?: string;
}

export interface TwitterApiIoToolOptions {
  apiKey?: string;
  baseUrl?: string;
  fetcher?: Fetcher;
  regionWoeids?: Record<string, number>;
}

const DEFAULT_BASE_URL = 'https://api.twitterapi.io';

const DEFAULT_REGION_WOEIDS: Record<string, number> = {
  global: 1,
};

export function createTwitterApiIoTools(options: TwitterApiIoToolOptions = {}): RuntimeTool[] {
  const apiKey = options.apiKey ?? process.env.TWITTERAPI_IO_KEY;
  const baseUrl = (options.baseUrl ?? process.env.TWITTERAPI_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/$/, '');
  const fetcher = options.fetcher ?? globalThis.fetch;
  const defaultRegionWoeids = {
    ...DEFAULT_REGION_WOEIDS,
    ...options.regionWoeids,
  };

  return [
    {
      name: 'x.getTrending',
      description: 'Fetches X/Twitter regional trending topics from twitterapi.io.',
      async invoke(input: unknown): Promise<XTrendingToolOutput[]> {
        if (!apiKey) {
          throw new Error('TWITTERAPI_IO_KEY is required for x.getTrending');
        }
        if (!fetcher) {
          throw new Error('fetch is not available in this runtime');
        }

        const data = input as GetTrendingInput;
        const regions = data.regions?.length ? data.regions : ['global'];
        const regionWoeids = {
          ...defaultRegionWoeids,
          ...data.regionWoeids,
        };
        const collectedAt = data.now ?? new Date().toISOString();
        const requestCount = Math.max(30, data.count ?? data.limit ?? 30);
        const outputLimit = data.limit ?? requestCount;

        return Promise.all(
          regions.map(async (region, index) => {
            const woeid = data.woeids?.[index] ?? regionWoeids[region];
            if (!woeid) {
              throw new Error(`No WOEID configured for X trend region: ${region}`);
            }

            const url = `${baseUrl}/twitter/trends?woeid=${woeid}&count=${requestCount}`;
            const response = await fetcher(url, {
              headers: {
                'X-API-Key': apiKey,
              },
            });
            if (!response.ok) {
              throw new Error(
                `twitterapi.io x.getTrending failed for ${region}: ${response.status ?? ''} ${
                  response.statusText ?? ''
                }`.trim(),
              );
            }

            const body = (await response.json()) as TwitterApiIoTrendResponse;
            if (body.status === 'error') {
              throw new Error(`twitterapi.io x.getTrending failed for ${region}: ${body.msg ?? 'unknown error'}`);
            }

            const trends = Array.isArray(body.trends) ? body.trends : [];
            return {
              platform: 'x',
              sourceType: 'trend',
              region,
              collectedAt,
              items: trends.slice(0, outputLimit).map((item, itemIndex) => {
                const trend = item.trend ?? item;
                const name = trend.name ?? trend.target?.query ?? `trend-${itemIndex + 1}`;
                const query = trend.target?.query ?? name;

                return {
                  rank: trend.rank ?? itemIndex + 1,
                  name,
                  query,
                  url: `https://x.com/search?q=${encodeURIComponent(query)}`,
                  category: trend.meta_description,
                  raw: item,
                };
              }),
              raw: body,
            };
          }),
        );
      },
    },
  ];
}
