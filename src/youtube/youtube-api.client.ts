import { YOUTUBE_REGION_CODE } from './youtube.constants';

const YOUTUBE_API_BASE_URL = 'https://www.googleapis.com/youtube/v3';

export interface YoutubeApiVideoItem {
  id: string;
  snippet?: {
    title?: string;
    publishedAt?: string;
    channelId?: string;
    channelTitle?: string;
    liveBroadcastContent?: string;
    thumbnails?: Record<string, { url?: string }>;
  };
  statistics?: {
    viewCount?: string;
    likeCount?: string;
    commentCount?: string;
  };
  contentDetails?: {
    duration?: string;
  };
}

export interface YoutubeApiSearchItem {
  id?: {
    videoId?: string;
  };
  snippet?: {
    title?: string;
    publishedAt?: string;
    channelId?: string;
    channelTitle?: string;
    liveBroadcastContent?: string;
    thumbnails?: Record<string, { url?: string }>;
  };
}

export interface YoutubeApiChannelItem {
  id: string;
  statistics?: {
    subscriberCount?: string;
    hiddenSubscriberCount?: boolean;
  };
}

interface YoutubeApiListResponse<T> {
  items?: T[];
}

export class YoutubeApiClient {
  constructor(private readonly apiKey: string) {}

  async listMostPopularByCategory(categoryId: string): Promise<YoutubeApiVideoItem[]> {
    return this.getList<YoutubeApiVideoItem>('videos', 'videos.list', {
      part: 'snippet,statistics',
      chart: 'mostPopular',
      regionCode: YOUTUBE_REGION_CODE,
      videoCategoryId: categoryId,
      maxResults: '10',
    });
  }

  async searchRecentVideosByKeyword(keyword: string, publishedAfter: string): Promise<YoutubeApiSearchItem[]> {
    return this.getList<YoutubeApiSearchItem>('search', 'search.list', {
      part: 'snippet',
      q: keyword,
      type: 'video',
      order: 'viewCount',
      publishedAfter,
      regionCode: YOUTUBE_REGION_CODE,
      relevanceLanguage: 'en',
      maxResults: '10',
    });
  }

  async listVideosByIds(videoIds: string[]): Promise<YoutubeApiVideoItem[]> {
    if (videoIds.length === 0) {
      return [];
    }

    const chunks = chunk(videoIds, 50);
    const results = await Promise.all(
      chunks.map((ids) =>
        this.getList<YoutubeApiVideoItem>('videos', 'videos.list', {
          part: 'snippet,statistics,contentDetails',
          id: ids.join(','),
        }),
      ),
    );
    return results.flat();
  }

  async listChannelsByIds(channelIds: string[]): Promise<YoutubeApiChannelItem[]> {
    if (channelIds.length === 0) {
      return [];
    }

    const chunks = chunk(channelIds, 50);
    const results = await Promise.all(
      chunks.map((ids) =>
        this.getList<YoutubeApiChannelItem>('channels', 'channels.list', {
          part: 'statistics',
          id: ids.join(','),
        }),
      ),
    );
    return results.flat();
  }

  private async getList<T>(resource: string, operation: string, params: Record<string, string>): Promise<T[]> {
    const url = new URL(`${YOUTUBE_API_BASE_URL}/${resource}`);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
    url.searchParams.set('key', this.apiKey);

    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(await buildYoutubeApiErrorMessage(operation, response));
    }

    const payload = (await response.json()) as YoutubeApiListResponse<T>;
    return payload.items ?? [];
  }
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function buildYoutubeApiErrorMessage(operation: string, response: Response): Promise<string> {
  const parts = [`YouTube API 请求失败：${operation}`, `HTTP ${response.status}`];
  try {
    const body = JSON.parse(await response.text()) as {
      error?: {
        status?: string;
        errors?: Array<{ reason?: string }>;
      };
    };
    const reason = body.error?.errors?.find((item) => item.reason)?.reason;
    if (reason) {
      parts.push(`reason=${reason}`);
    }
    if (body.error?.status) {
      parts.push(`status=${body.error.status}`);
    }
  } catch {
    // 保持安全摘要，不回显原始响应体，避免 API Key 或供应商细节进入前端。
  }
  return parts.join('，');
}
