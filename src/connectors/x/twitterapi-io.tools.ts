import { XAccountPost, XGetAccountPostsToolOutput, XTrendingToolOutput } from '../../collection/collection.types';
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

interface GetAccountPostsInput {
  handle: string;
  since?: string;
  until?: string;
  maxPages?: number;
  includeReplies?: boolean;
  includeQuotes?: boolean;
  includeReposts?: boolean;
  now?: string;
}

interface TwitterApiIoUserInfoResponse {
  status?: 'success' | 'error';
  msg?: string;
  data?: {
    id?: string;
    userName?: string;
    name?: string;
  };
  message?: string;
}

interface TwitterApiIoTimelineTweet {
  type?: string;
  id?: string;
  url?: string;
  text?: string;
  retweetCount?: number;
  replyCount?: number;
  likeCount?: number;
  quoteCount?: number;
  viewCount?: number;
  bookmarkCount?: number;
  createdAt?: string;
  isReply?: boolean;
  inReplyToId?: string;
  retweeted_tweet?: unknown;
  quoted_tweet?: unknown;
  author?: {
    id?: string;
    userName?: string;
    name?: string;
  };
}

interface TwitterApiIoTimelineResponse {
  status?: 'success' | 'error';
  message?: string;
  msg?: string;
  tweets?: TwitterApiIoTimelineTweet[];
  data?: TwitterApiIoTimelineTweet[] | { tweets?: TwitterApiIoTimelineTweet[] };
  has_next_page?: boolean;
  next_cursor?: string;
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
    {
      name: 'x.getAccountPosts',
      description: 'Fetches recent X/Twitter account posts from twitterapi.io user timeline.',
      async invoke(input: unknown): Promise<XGetAccountPostsToolOutput> {
        if (!apiKey) {
          throw new Error('TWITTERAPI_IO_KEY is required for x.getAccountPosts');
        }
        if (!fetcher) {
          throw new Error('fetch is not available in this runtime');
        }

        const data = input as GetAccountPostsInput;
        const handle = normalizeHandle(data.handle);
        const user = await fetchUserInfo({ handle, baseUrl, apiKey, fetcher });
        const collectedAt = data.now ?? new Date().toISOString();
        const sinceTime = data.since ? new Date(data.since).getTime() : Number.NEGATIVE_INFINITY;
        const untilTime = data.until ? new Date(data.until).getTime() : Number.POSITIVE_INFINITY;
        const maxPages = Math.max(1, data.maxPages ?? 5);
        const posts: XAccountPost[] = [];
        let cursor = '';

        for (let page = 0; page < maxPages; page++) {
          const timeline = await fetchTimelinePage({
            userId: user.id,
            cursor,
            includeReplies: data.includeReplies ?? true,
            baseUrl,
            apiKey,
            fetcher,
          });
          const tweets = extractTweets(timeline);
          if (tweets.length === 0) break;

          let reachedOlderPost = false;
          for (const tweet of tweets) {
            const publishedAt = tweet.createdAt ? new Date(tweet.createdAt).getTime() : collectedAt ? new Date(collectedAt).getTime() : Date.now();
            if (publishedAt > untilTime) continue;
            if (publishedAt < sinceTime) {
              reachedOlderPost = true;
              continue;
            }
            const post = mapTimelineTweet(tweet, handle);
            if (!data.includeReposts && post.postType === 'repost') continue;
            if (!data.includeQuotes && post.postType === 'quote') continue;
            posts.push(post);
          }

          if (reachedOlderPost || !timeline.has_next_page || !timeline.next_cursor) break;
          cursor = timeline.next_cursor;
        }

        return {
          platform: 'x',
          sourceType: 'topic_circle_post',
          handle,
          collectedAt,
          posts,
          nextCursor: cursor || undefined,
        };
      },
    },
  ];
}

async function fetchUserInfo(input: {
  handle: string;
  baseUrl: string;
  apiKey: string;
  fetcher: Fetcher;
}) {
  const url = `${input.baseUrl}/twitter/user/info?userName=${encodeURIComponent(input.handle)}`;
  const response = await input.fetcher(url, { headers: { 'X-API-Key': input.apiKey } });
  const body = (await response.json()) as TwitterApiIoUserInfoResponse;
  if (!response.ok || body.status === 'error') {
    throw new Error(body.msg ?? body.message ?? `${response.status ?? ''} ${response.statusText ?? ''}`.trim());
  }
  if (!body.data?.id) {
    throw new Error(`twitterapi.io user info returned no id for ${input.handle}`);
  }
  return {
    id: body.data.id,
    userName: body.data.userName ?? input.handle,
    name: body.data.name,
  };
}

async function fetchTimelinePage(input: {
  userId: string;
  cursor: string;
  includeReplies: boolean;
  baseUrl: string;
  apiKey: string;
  fetcher: Fetcher;
}) {
  const params = new URLSearchParams({
    userId: input.userId,
    includeReplies: String(input.includeReplies),
    cursor: input.cursor,
  });
  const url = `${input.baseUrl}/twitter/user/tweet_timeline?${params.toString()}`;
  const response = await input.fetcher(url, { headers: { 'X-API-Key': input.apiKey } });
  const body = (await response.json()) as TwitterApiIoTimelineResponse;
  if (!response.ok || body.status === 'error') {
    throw new Error(body.msg ?? body.message ?? `${response.status ?? ''} ${response.statusText ?? ''}`.trim());
  }
  return body;
}

function extractTweets(body: TwitterApiIoTimelineResponse) {
  if (Array.isArray(body.tweets)) return body.tweets;
  if (Array.isArray(body.data)) return body.data;
  if (body.data && !Array.isArray(body.data) && Array.isArray(body.data.tweets)) return body.data.tweets;
  return [];
}

function mapTimelineTweet(tweet: TwitterApiIoTimelineTweet, fallbackHandle: string): XAccountPost {
  const authorHandle = tweet.author?.userName ?? fallbackHandle;
  return {
    postId: tweet.id ?? `missing-${fallbackHandle}-${tweet.createdAt ?? Date.now()}`,
    authorHandle,
    authorId: tweet.author?.id,
    authorName: tweet.author?.name,
    text: tweet.text ?? '',
    url: tweet.url,
    postType: resolvePostType(tweet),
    replyToPostId: tweet.inReplyToId,
    repostedPostId: tweet.retweeted_tweet ? String((tweet.retweeted_tweet as { id?: unknown }).id ?? '') || undefined : undefined,
    quotedPostId: tweet.quoted_tweet ? String((tweet.quoted_tweet as { id?: unknown }).id ?? '') || undefined : undefined,
    publishedAt: tweet.createdAt ?? new Date().toISOString(),
    metrics: {
      views: tweet.viewCount,
      likes: tweet.likeCount,
      reposts: tweet.retweetCount,
      replies: tweet.replyCount,
      quotes: tweet.quoteCount,
      bookmarks: tweet.bookmarkCount,
    },
    raw: tweet,
  };
}

function resolvePostType(tweet: TwitterApiIoTimelineTweet): XAccountPost['postType'] {
  if (tweet.retweeted_tweet) return 'repost';
  if (tweet.quoted_tweet) return 'quote';
  if (tweet.isReply || tweet.inReplyToId) return 'reply';
  return 'original';
}

function normalizeHandle(handle: string) {
  return handle.trim().replace(/^@/, '');
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
