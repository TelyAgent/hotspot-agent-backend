import { YoutubeApiClient } from '../../src/youtube/youtube-api.client';

describe('YoutubeApiClient', () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [{ id: 'abc123', snippet: { title: 'A' }, statistics: {} }] }),
    } as unknown as Response);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('calls videos.list for US mostPopular category', async () => {
    const client = new YoutubeApiClient('secret-key');
    await client.listMostPopularByCategory('28');

    const url = new URL(String((global.fetch as jest.Mock).mock.calls[0][0]));
    expect(url.pathname).toBe('/youtube/v3/videos');
    expect(url.searchParams.get('part')).toBe('snippet,statistics');
    expect(url.searchParams.get('chart')).toBe('mostPopular');
    expect(url.searchParams.get('regionCode')).toBe('US');
    expect(url.searchParams.get('videoCategoryId')).toBe('28');
    expect(url.searchParams.get('maxResults')).toBe('10');
    expect(url.searchParams.get('key')).toBe('secret-key');
  });

  it('calls search.list for recent keyword videos', async () => {
    const client = new YoutubeApiClient('secret-key');
    await client.searchRecentVideosByKeyword('web3', '2026-08-14T00:00:00.000Z');

    const url = new URL(String((global.fetch as jest.Mock).mock.calls[0][0]));
    expect(url.pathname).toBe('/youtube/v3/search');
    expect(url.searchParams.get('part')).toBe('snippet');
    expect(url.searchParams.get('q')).toBe('web3');
    expect(url.searchParams.get('type')).toBe('video');
    expect(url.searchParams.get('order')).toBe('viewCount');
    expect(url.searchParams.get('publishedAfter')).toBe('2026-08-14T00:00:00.000Z');
    expect(url.searchParams.get('regionCode')).toBe('US');
    expect(url.searchParams.get('relevanceLanguage')).toBe('en');
  });

  it('does not include the api key in thrown errors', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 403,
      statusText: 'Forbidden secret-key',
      text: async () =>
        JSON.stringify({
          error: {
            code: 403,
            message: 'secret-key quota exceeded',
            status: 'PERMISSION_DENIED',
            errors: [{ reason: 'quotaExceeded', message: 'secret-key quota exceeded' }],
          },
        }),
    } as unknown as Response);

    const client = new YoutubeApiClient('secret-key');

    await expect(client.listMostPopularByCategory('28')).rejects.toThrow(
      'YouTube API 请求失败：videos.list，HTTP 403，reason=quotaExceeded',
    );
    await expect(client.listMostPopularByCategory('28')).rejects.not.toThrow('secret-key');
  });

  it('chunks videos.list detail requests to at most 50 ids', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [] }),
    } as unknown as Response);
    const client = new YoutubeApiClient('secret-key');
    const ids = Array.from({ length: 51 }, (_, index) => `video_${index}`);

    await client.listVideosByIds(ids);

    expect(global.fetch).toHaveBeenCalledTimes(2);
    const firstUrl = new URL(String((global.fetch as jest.Mock).mock.calls[0][0]));
    const secondUrl = new URL(String((global.fetch as jest.Mock).mock.calls[1][0]));
    expect(firstUrl.searchParams.get('id')?.split(',')).toHaveLength(50);
    expect(secondUrl.searchParams.get('id')).toBe('video_50');
  });
});
