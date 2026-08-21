import {
  YOUTUBE_KEYWORDS,
  YOUTUBE_TRENDING_CATEGORIES,
  buildYoutubeVideoUrl,
  isValidYoutubeWatchUrl,
} from '../../src/youtube/youtube.constants';

describe('youtube constants', () => {
  it('uses the PRD categories and keywords', () => {
    expect(YOUTUBE_TRENDING_CATEGORIES).toEqual([
      { id: '22', label: 'YouTube官方热门-人物与博客' },
      { id: '25', label: 'YouTube官方热门-新闻与政治' },
      { id: '28', label: 'YouTube官方热门-科技' },
    ]);
    expect(YOUTUBE_KEYWORDS).toEqual(['Polymarket', 'web3', 'politics', 'prediction market']);
  });

  it('builds and validates canonical watch urls', () => {
    const url = buildYoutubeVideoUrl('abc123');
    expect(url).toBe('https://www.youtube.com/watch?v=abc123');
    expect(isValidYoutubeWatchUrl(url, 'abc123')).toBe(true);
    expect(isValidYoutubeWatchUrl('https://youtu.be/abc123', 'abc123')).toBe(false);
  });
});
