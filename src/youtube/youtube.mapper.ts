import type { YoutubeAnalysisResult, YoutubeAnalysisJob, YoutubeVideo } from '@prisma/client';

export interface YoutubeBoardVideoResponse {
  videoId: string;
  title: string;
  url: string;
  thumbnailUrl: string | null;
  channelTitle: string | null;
  publishedAt: string | null;
  consecutiveHotDays: number;
  boardVisibleUntil: string;
  selectionSources: unknown;
  matchedKeywords: unknown;
  keywordHitCount: number;
  discoveryLabels: unknown;
  videoMetrics: unknown;
  analysisStatus: string | null;
  transcriptStatus: string | null;
  analysis: {
    mainReason: unknown;
    execution: unknown;
    replication: unknown;
    limitations: unknown;
  } | null;
}

type YoutubeVideoWithJobs = YoutubeVideo & {
  jobs: Array<YoutubeAnalysisJob & { result: YoutubeAnalysisResult | null }>;
};

export function mapYoutubeBoardVideo(video: YoutubeVideoWithJobs): YoutubeBoardVideoResponse {
  const latestJob = video.jobs[0] ?? null;
  const result = latestJob?.result ?? null;

  return {
    videoId: video.videoId,
    title: video.title,
    url: video.videoUrl,
    thumbnailUrl: video.thumbnailUrl,
    channelTitle: video.channelTitle,
    publishedAt: video.publishedAt?.toISOString() ?? null,
    consecutiveHotDays: video.consecutiveHotDays,
    boardVisibleUntil: video.boardVisibleUntil.toISOString(),
    selectionSources: video.selectionSources,
    matchedKeywords: video.matchedKeywords,
    keywordHitCount: video.keywordHitCount,
    discoveryLabels: video.discoveryLabels,
    videoMetrics: video.lastVideoMetrics,
    analysisStatus: latestJob?.status ?? null,
    transcriptStatus: latestJob?.transcriptStatus ?? null,
    analysis: result
      ? {
          mainReason: result.mainReason,
          execution: result.execution,
          replication: result.replication,
          limitations: result.limitations,
        }
      : null,
  };
}
