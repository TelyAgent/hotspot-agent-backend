import { RuntimeTool } from '../tool-registry';
import { XTrendingToolOutput } from '../../collection/collection.types';

interface GetTrendingInput {
  regions?: string[];
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
  ];
}
