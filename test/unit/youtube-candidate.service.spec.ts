import { YoutubeCandidateService } from '../../src/youtube/youtube-candidate.service';
import type { YoutubeApiSearchItem, YoutubeApiVideoItem } from '../../src/youtube/youtube-api.client';

describe('YoutubeCandidateService', () => {
  it('dedupes by video id and preserves multiple selection sources', () => {
    const service = new YoutubeCandidateService();
    const candidates = service.buildCandidates({
      trendingItemsByCategory: {
        '28': [
          videoItem('v1', {
            title: 'A',
            liveBroadcastContent: 'none',
            viewCount: '100',
          }),
        ],
      },
      searchItemsByKeyword: {
        web3: [searchItem('v1', { title: 'A', liveBroadcastContent: 'none' })],
      },
      videoDetailsById: {
        v1: videoItem('v1', {
          title: 'A',
          channelId: 'c1',
          channelTitle: 'C',
          duration: 'PT1M',
          viewCount: '100',
        }),
      },
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0].videoUrl).toBe('https://www.youtube.com/watch?v=v1');
    expect(candidates[0].selectionSources).toEqual([
      { type: 'youtube_trending', label: 'YouTube官方热门-科技', rank: 1, categoryId: '28' },
      { type: 'keyword_search', label: '关键词-web3', rank: 1, keyword: 'web3' },
    ]);
    expect(candidates[0].matchedKeywords).toEqual(['web3']);
    expect(candidates[0].keywordHitCount).toBe(1);
  });

  it('marks videos that match multiple keywords', () => {
    const service = new YoutubeCandidateService();
    const candidates = service.buildCandidates({
      trendingItemsByCategory: {},
      searchItemsByKeyword: {
        web3: [searchItem('v1', { title: 'A', liveBroadcastContent: 'none' })],
        Polymarket: [searchItem('v1', { title: 'A', liveBroadcastContent: 'none' })],
      },
      videoDetailsById: {
        v1: videoItem('v1', { title: 'A', viewCount: '100' }),
      },
    });

    expect(candidates[0].matchedKeywords).toEqual(['web3', 'Polymarket']);
    expect(candidates[0].keywordHitCount).toBe(2);
    expect(candidates[0].discoveryLabels).toContain('多关键词命中');
  });

  it('skips live videos and already pushed videos when selecting new daily candidates', () => {
    const service = new YoutubeCandidateService();
    const candidates = service.buildCandidates({
      trendingItemsByCategory: {
        '28': [
          videoItem('old', { title: 'Old', liveBroadcastContent: 'none' }),
          videoItem('new', { title: 'New', liveBroadcastContent: 'none' }),
          videoItem('live', { title: 'Live', liveBroadcastContent: 'live' }),
        ],
      },
      searchItemsByKeyword: {},
      videoDetailsById: {
        old: videoItem('old', { title: 'Old' }),
        new: videoItem('new', { title: 'New' }),
        live: videoItem('live', { title: 'Live' }),
      },
    });

    const selected = service.selectDailyNewCandidates(candidates, new Set(['old']));
    expect(selected.map((item) => item.videoId)).toEqual(['new']);
  });
});

function videoItem(
  id: string,
  input: {
    title: string;
    liveBroadcastContent?: string;
    channelId?: string;
    channelTitle?: string;
    duration?: string;
    viewCount?: string;
    likeCount?: string;
    commentCount?: string;
  },
): YoutubeApiVideoItem {
  return {
    id,
    snippet: {
      title: input.title,
      liveBroadcastContent: input.liveBroadcastContent,
      channelId: input.channelId,
      channelTitle: input.channelTitle,
      publishedAt: '2026-08-20T00:00:00Z',
      thumbnails: { high: { url: `https://img.youtube.com/${id}.jpg` } },
    },
    statistics: {
      viewCount: input.viewCount,
      likeCount: input.likeCount,
      commentCount: input.commentCount,
    },
    contentDetails: {
      duration: input.duration,
    },
  };
}

function searchItem(
  videoId: string,
  input: { title: string; liveBroadcastContent?: string },
): YoutubeApiSearchItem {
  return {
    id: { videoId },
    snippet: {
      title: input.title,
      liveBroadcastContent: input.liveBroadcastContent,
      publishedAt: '2026-08-20T00:00:00Z',
      thumbnails: { high: { url: `https://img.youtube.com/${videoId}.jpg` } },
    },
  };
}
