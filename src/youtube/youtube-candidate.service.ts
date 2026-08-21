import type { YoutubeApiSearchItem, YoutubeApiVideoItem } from './youtube-api.client';
import {
  YOUTUBE_DAILY_KEYWORD_LIMIT,
  YOUTUBE_DAILY_OFFICIAL_LIMIT,
  YOUTUBE_TRENDING_CATEGORIES,
  buildYoutubeVideoUrl,
} from './youtube.constants';
import type { YoutubeCandidate, YoutubeSelectionSource } from './youtube.types';

export interface BuildYoutubeCandidatesInput {
  trendingItemsByCategory: Record<string, YoutubeApiVideoItem[]>;
  searchItemsByKeyword: Record<string, YoutubeApiSearchItem[]>;
  videoDetailsById: Record<string, YoutubeApiVideoItem>;
}

interface CandidateAccumulator {
  videoId: string;
  sourceItem: YoutubeApiVideoItem | YoutubeApiSearchItem;
  detail: YoutubeApiVideoItem | undefined;
  selectionSources: YoutubeSelectionSource[];
  matchedKeywords: string[];
}

export class YoutubeCandidateService {
  buildCandidates(input: BuildYoutubeCandidatesInput): YoutubeCandidate[] {
    const byVideoId = new Map<string, CandidateAccumulator>();

    for (const [categoryId, items] of Object.entries(input.trendingItemsByCategory)) {
      const categoryLabel = getCategoryLabel(categoryId);
      items.forEach((item, index) => {
        if (!item.id) return;
        this.addSource(byVideoId, item.id, item, input.videoDetailsById[item.id], {
          type: 'youtube_trending',
          label: categoryLabel,
          rank: index + 1,
          categoryId,
        });
      });
    }

    for (const [keyword, items] of Object.entries(input.searchItemsByKeyword)) {
      items.forEach((item, index) => {
        const videoId = item.id?.videoId;
        if (!videoId) return;
        this.addSource(byVideoId, videoId, item, input.videoDetailsById[videoId], {
          type: 'keyword_search',
          label: `关键词-${keyword}`,
          rank: index + 1,
          keyword,
        });
      });
    }

    return [...byVideoId.values()]
      .map((accumulator) => this.toCandidate(accumulator))
      .filter((candidate) => !isLiveOrUpcoming(candidate.liveBroadcastContent));
  }

  selectDailyNewCandidates(candidates: YoutubeCandidate[], pushedVideoIds: Set<string>): YoutubeCandidate[] {
    const selected = new Map<string, YoutubeCandidate>();

    for (const candidate of candidates) {
      if (selected.size >= YOUTUBE_DAILY_OFFICIAL_LIMIT) break;
      if (pushedVideoIds.has(candidate.videoId)) continue;
      if (!candidate.selectionSources.some((source) => source.type === 'youtube_trending')) continue;
      selected.set(candidate.videoId, candidate);
    }

    let keywordCount = 0;
    for (const candidate of candidates) {
      if (keywordCount >= YOUTUBE_DAILY_KEYWORD_LIMIT) break;
      if (pushedVideoIds.has(candidate.videoId)) continue;
      if (!candidate.selectionSources.some((source) => source.type === 'keyword_search')) continue;
      if (!selected.has(candidate.videoId)) {
        selected.set(candidate.videoId, candidate);
      }
      keywordCount += 1;
    }

    return [...selected.values()];
  }

  private addSource(
    byVideoId: Map<string, CandidateAccumulator>,
    videoId: string,
    sourceItem: YoutubeApiVideoItem | YoutubeApiSearchItem,
    detail: YoutubeApiVideoItem | undefined,
    source: YoutubeSelectionSource,
  ) {
    const accumulator =
      byVideoId.get(videoId) ??
      ({
        videoId,
        sourceItem,
        detail,
        selectionSources: [],
        matchedKeywords: [],
      } satisfies CandidateAccumulator);

    accumulator.detail ??= detail;
    accumulator.selectionSources.push(source);
    if (source.keyword && !accumulator.matchedKeywords.includes(source.keyword)) {
      accumulator.matchedKeywords.push(source.keyword);
    }
    byVideoId.set(videoId, accumulator);
  }

  private toCandidate(accumulator: CandidateAccumulator): YoutubeCandidate {
    const detail = accumulator.detail;
    const snippet = detail?.snippet ?? accumulator.sourceItem.snippet;
    const liveBroadcastContent =
      accumulator.sourceItem.snippet?.liveBroadcastContent ?? detail?.snippet?.liveBroadcastContent ?? null;
    const keywordHitCount = accumulator.matchedKeywords.length;
    const discoveryLabels = keywordHitCount >= 2 ? ['多关键词命中'] : [];

    return {
      videoId: accumulator.videoId,
      videoUrl: buildYoutubeVideoUrl(accumulator.videoId),
      title: snippet?.title ?? '',
      thumbnailUrl: pickThumbnailUrl(snippet?.thumbnails),
      publishedAt: snippet?.publishedAt ?? null,
      duration: detail?.contentDetails?.duration ?? null,
      channelId: snippet?.channelId ?? null,
      channelTitle: snippet?.channelTitle ?? null,
      liveBroadcastContent,
      selectionSources: accumulator.selectionSources,
      matchedKeywords: accumulator.matchedKeywords,
      keywordHitCount,
      discoveryLabels,
      videoMetrics: {
        viewCount: parseMetric(detail?.statistics?.viewCount),
        likeCount: parseMetric(detail?.statistics?.likeCount),
        commentCount: parseMetric(detail?.statistics?.commentCount),
      },
      raw: {
        sourceItem: accumulator.sourceItem,
        detail,
      },
    };
  }
}

function getCategoryLabel(categoryId: string): string {
  return YOUTUBE_TRENDING_CATEGORIES.find((category) => category.id === categoryId)?.label ?? `YouTube官方热门-${categoryId}`;
}

function pickThumbnailUrl(thumbnails: Record<string, { url?: string }> | undefined): string | null {
  return thumbnails?.maxres?.url ?? thumbnails?.high?.url ?? thumbnails?.medium?.url ?? thumbnails?.default?.url ?? null;
}

function parseMetric(value: string | undefined): number | null {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isLiveOrUpcoming(liveBroadcastContent: string | null): boolean {
  return liveBroadcastContent === 'live' || liveBroadcastContent === 'upcoming';
}
