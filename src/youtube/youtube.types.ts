export type YoutubeSelectionType = 'youtube_trending' | 'keyword_search';

export interface YoutubeSelectionSource {
  type: YoutubeSelectionType;
  label: string;
  rank: number;
  keyword?: string;
  categoryId?: string;
}

export interface YoutubeVideoMetrics {
  viewCount: number | null;
  likeCount: number | null;
  commentCount: number | null;
}

export interface YoutubeCandidate {
  videoId: string;
  videoUrl: string;
  title: string;
  thumbnailUrl: string | null;
  publishedAt: string | null;
  duration: string | null;
  channelId: string | null;
  channelTitle: string | null;
  liveBroadcastContent: string | null;
  selectionSources: YoutubeSelectionSource[];
  matchedKeywords: string[];
  keywordHitCount: number;
  discoveryLabels: string[];
  videoMetrics: YoutubeVideoMetrics;
  raw: unknown;
}

export interface YoutubeTranscriptSegment {
  startMs: number;
  durationMs: number | null;
  text: string;
}

export interface YoutubeAnalysisJobInput {
  jobId: string;
  videoId: string;
  videoUrl: string;
  title: string;
  thumbnailUrl: string | null;
  publishedAt: string | null;
  duration: string | null;
  discovery: {
    selectionSources: YoutubeSelectionSource[];
    matchedKeywords: string[];
    keywordHitCount: number;
    discoveryLabels: string[];
  };
  videoMetrics: YoutubeVideoMetrics;
  channel: {
    channelId: string | null;
    channelTitle: string | null;
  };
}
