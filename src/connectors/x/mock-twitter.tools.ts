import { RuntimeTool } from '../tool-registry';
import { XGetAccountPostsToolOutput, XSearchPostsToolOutput, XTrendingToolOutput } from '../../collection/collection.types';

interface GetTrendingInput {
  regions?: string[];
  limit?: number;
  now?: string;
}

interface GetAccountPostsInput {
  handle: string;
  now?: string;
  since?: string;
  maxPages?: number;
}

interface SearchPostsInput {
  query: string;
  queryType?: 'Top' | 'Latest';
  limit?: number;
  now?: string;
}

export function createMockTwitterTools(): RuntimeTool[] {
  return [
    {
      name: 'x.getTrending',
      description: 'Returns deterministic mock X trending data for local development.',
      async invoke(input: unknown): Promise<XTrendingToolOutput[]> {
        const data = input as GetTrendingInput;
        const regions = data.regions?.length ? data.regions : ['US'];
        const limit = data.limit ?? 10;
        const collectedAt = data.now ?? '2026-08-18T00:00:00.000Z';

        return regions.map((region) => ({
          platform: 'x',
          sourceType: 'trend',
          region,
          collectedAt,
          items: Array.from({ length: limit }, (_, index) => ({
            rank: index + 1,
            name: index === 0 ? `OpenAI ${region}` : `${region} trend ${index + 1}`,
            query: index === 0 ? `OpenAI ${region}` : `${region} trend ${index + 1}`,
            url: `https://x.com/search?q=${encodeURIComponent(
              index === 0 ? `OpenAI ${region}` : `${region} trend ${index + 1}`,
            )}`,
            volume: 1000 - index * 10,
            category: 'technology',
            raw: { mock: true, region, index },
          })),
          raw: { mock: true, region },
        }));
      },
    },
    {
      name: 'x.getAccountPosts',
      description: 'Returns deterministic mock X account posts for local topic-circle development.',
      async invoke(input: unknown): Promise<XGetAccountPostsToolOutput> {
        const data = input as GetAccountPostsInput;
        const handle = data.handle.replace(/^@/, '');
        const collectedAt = data.now ?? new Date().toISOString();
        const baseTime = new Date(collectedAt).getTime();
        const topicKeyword = mockTopicKeyword(handle);
        const posts = Array.from({ length: Math.min(3, Math.max(1, data.maxPages ?? 3)) }, (_, index) => ({
          postId: `mock_${handle}_${baseTime}_${index + 1}`,
          authorHandle: handle,
          authorId: `mock_user_${handle.toLowerCase()}`,
          authorName: handle,
          text: `${handle} mock topic-circle post ${index + 1}: ${topicKeyword} remains an active discussion point.`,
          url: `https://x.com/${handle}/status/mock_${baseTime}_${index + 1}`,
          postType: 'original' as const,
          publishedAt: new Date(baseTime - index * 30 * 60 * 1000).toISOString(),
          metrics: {
            views: 1000 - index * 100,
            likes: 100 - index * 10,
            reposts: 20 - index,
            replies: 5 + index,
            quotes: 2,
          },
          raw: { mock: true, handle, index },
        }));

        return {
          platform: 'x',
          sourceType: 'topic_circle_post',
          handle,
          collectedAt,
          posts,
        };
      },
    },
    {
      name: 'x.searchPosts',
      description: 'Returns deterministic mock X top posts for local trend evidence development.',
      async invoke(input: unknown): Promise<XSearchPostsToolOutput> {
        const data = input as SearchPostsInput;
        const query = data.query;
        const collectedAt = data.now ?? new Date().toISOString();
        const baseTime = new Date(collectedAt).getTime();
        const limit = Math.max(1, data.limit ?? 3);

        return {
          platform: 'x',
          sourceType: 'post',
          query,
          queryType: data.queryType ?? 'Top',
          collectedAt,
          posts: Array.from({ length: limit }, (_, index) => ({
            postId: `mock_search_${normalizeForId(query)}_${baseTime}_${index + 1}`,
            authorHandle: `mock_source_${index + 1}`,
            authorId: `mock_search_user_${index + 1}`,
            authorName: `Mock Source ${index + 1}`,
            text: `${query} representative post ${index + 1}: people are discussing a concrete development around this trend.`,
            url: `https://x.com/mock_source_${index + 1}/status/mock_search_${baseTime}_${index + 1}`,
            postType: 'original' as const,
            publishedAt: new Date(baseTime - index * 20 * 60 * 1000).toISOString(),
            metrics: {
              views: 5000 - index * 500,
              likes: 200 - index * 20,
              reposts: 40 - index * 5,
              replies: 10 + index,
              quotes: 3,
            },
            raw: { mock: true, query, index },
          })),
        };
      },
    },
  ];
}

function normalizeForId(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'query';
}

function mockTopicKeyword(handle: string) {
  const normalized = handle.toLowerCase();
  if (['openai', 'anthropicai', 'googledeepmind', 'aiatmeta', 'huggingface'].includes(normalized)) return 'AI';
  if (['coindesk', 'cointelegraph', 'crypto', 'tier10k', 'watcherguru'].includes(normalized)) return 'Bitcoin';
  if (['reuters', 'ap', 'cnnpolitics', 'politico', 'axios'].includes(normalized)) return 'election';
  if (['business', 'reutersbiz', 'cnbc', 'financialtimes', 'wsj'].includes(normalized)) return 'FOMC';
  if (['polymarket', 'kalshi', 'manifoldmarkets', 'metaculus'].includes(normalized)) return 'prediction market';
  return 'market';
}
