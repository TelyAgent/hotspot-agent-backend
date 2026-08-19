import { RuntimeTool } from '../tool-registry';
import { XGetAccountPostsToolOutput, XTrendingToolOutput } from '../../collection/collection.types';

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
  ];
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
