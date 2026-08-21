export const YOUTUBE_REGION_CODE = 'US';
export const YOUTUBE_DAILY_OFFICIAL_LIMIT = 5;
export const YOUTUBE_DAILY_KEYWORD_LIMIT = 5;
export const YOUTUBE_BOARD_WINDOW_DAYS = 7;

export const YOUTUBE_TRENDING_CATEGORIES = [
  { id: '22', label: 'YouTube官方热门-人物与博客' },
  { id: '25', label: 'YouTube官方热门-新闻与政治' },
  { id: '28', label: 'YouTube官方热门-科技' },
] as const;

export const YOUTUBE_KEYWORDS = ['Polymarket', 'web3', 'politics', 'prediction market'] as const;

export function buildYoutubeVideoUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

export function isValidYoutubeWatchUrl(url: string, videoId: string): boolean {
  return url === buildYoutubeVideoUrl(videoId);
}
