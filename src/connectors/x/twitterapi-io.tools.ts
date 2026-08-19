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
  'United States': 23424977,
  'United Kingdom': 23424975,
  Japan: 23424856,
  Korea: 23424868,
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
        const regions = data.regions?.length ? data.regions : Object.keys(DEFAULT_REGION_WOEIDS);
        const regionWoeids = {
          ...defaultRegionWoeids,
          ...data.regionWoeids,
        };
        const collectedAt = data.now ?? new Date().toISOString();
        const requestCount = Math.max(30, data.count ?? data.limit ?? 30);
        const outputLimit = data.limit ?? requestCount;

        const results = await Promise.allSettled(
          regions.map((region, index) =>
            fetchRegionTrends({
              region,
              woeid: data.woeids?.[index] ?? regionWoeids[region],
              baseUrl,
              requestCount,
              outputLimit,
              collectedAt,
              apiKey,
              fetcher,
            }),
          ),
        );
        const successful = results
          .filter((result): result is PromiseFulfilledResult<XTrendingToolOutput> => result.status === 'fulfilled')
          .map((result) => result.value);
        if (successful.length > 0) {
          return successful;
        }

        throw new Error(
          `twitterapi.io x.getTrending failed for all regions: ${results
            .map((result, index) => formatRegionalFailure(regions[index], result))
            .join('; ')}`,
        );
      },
    },
  ];
}

async function fetchRegionTrends(input: {
  region: string;
  woeid?: number;
  baseUrl: string;
  requestCount: number;
  outputLimit: number;
  collectedAt: string;
  apiKey: string;
  fetcher: Fetcher;
}): Promise<XTrendingToolOutput> {
  if (!input.woeid) {
    throw new Error(`No WOEID configured`);
  }

  const url = `${input.baseUrl}/twitter/trends?woeid=${input.woeid}&count=${input.requestCount}`;
  const response = await input.fetcher(url, {
    headers: {
      'X-API-Key': input.apiKey,
    },
  });
  if (!response.ok) {
    throw new Error(`${response.status ?? ''} ${response.statusText ?? ''}`.trim());
  }

  const body = (await response.json()) as TwitterApiIoTrendResponse;
  if (body.status === 'error') {
    throw new Error(body.msg ?? 'unknown error');
  }

  const trends = Array.isArray(body.trends) ? body.trends : [];
  return {
    platform: 'x',
    sourceType: 'trend',
    region: input.region,
    collectedAt: input.collectedAt,
    items: trends.slice(0, input.outputLimit).map((item, itemIndex) => {
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
}

function formatRegionalFailure(
  region: string,
  result: PromiseSettledResult<XTrendingToolOutput>,
) {
  if (result.status === 'fulfilled') {
    return `${region}: success`;
  }

  const reason = result.reason instanceof Error ? result.reason.message : String(result.reason);
  return `${region}: ${reason}`;
}
