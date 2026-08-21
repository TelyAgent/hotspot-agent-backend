import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { YoutubeAnalysisService } from './youtube-analysis.service';
import { YoutubeApiClient } from './youtube-api.client';
import { YoutubeCandidateService } from './youtube-candidate.service';
import { YOUTUBE_KEYWORDS, YOUTUBE_TRENDING_CATEGORIES } from './youtube.constants';
import { YoutubeHistoryService, toDateKey } from './youtube-history.service';
import { mapYoutubeBoardVideo } from './youtube.mapper';
import { YoutubeTranscriptExtractor } from './transcript/youtube-transcript.extractor';

@Injectable()
export class YoutubeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly candidates: YoutubeCandidateService,
    private readonly history: YoutubeHistoryService,
    private readonly transcriptExtractor: YoutubeTranscriptExtractor,
    private readonly analysis: YoutubeAnalysisService,
  ) {}

  async runDailyCollection(now = new Date()) {
    const run = await this.prisma.youtubeRun.create({
      data: {
        id: `youtube_run_${randomUUID()}`,
        runDate: new Date(`${toDateKey(now)}T00:00:00.000Z`),
        status: 'running',
        startedAt: new Date(),
      },
    });

    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) {
      return this.prisma.youtubeRun.update({
        where: { id: run.id },
        data: {
          status: 'failed',
          errorMessage: '缺少 YOUTUBE_API_KEY',
          finishedAt: new Date(),
        },
      });
    }

    try {
      const client = new YoutubeApiClient(apiKey);
      const trendingEntries = await Promise.all(
        YOUTUBE_TRENDING_CATEGORIES.map(async (category) => [
          category.id,
          await client.listMostPopularByCategory(category.id),
        ] as const),
      );
      const publishedAfter = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const keywordEntries = await Promise.all(
        YOUTUBE_KEYWORDS.map(async (keyword) => [
          keyword,
          await client.searchRecentVideosByKeyword(keyword, publishedAfter),
        ] as const),
      );
      const videoIds = new Set<string>();
      for (const [, items] of trendingEntries) {
        items.forEach((item) => videoIds.add(item.id));
      }
      for (const [, items] of keywordEntries) {
        items.forEach((item) => {
          if (item.id?.videoId) videoIds.add(item.id.videoId);
        });
      }

      const details = await client.listVideosByIds([...videoIds]);
      const detailMap = Object.fromEntries(details.map((detail) => [detail.id, detail]));
      const builtCandidates = this.candidates.buildCandidates({
        trendingItemsByCategory: Object.fromEntries(trendingEntries),
        searchItemsByKeyword: Object.fromEntries(keywordEntries),
        videoDetailsById: detailMap,
      });
      const pushedIds = await this.history.findPushedVideoIds();
      const selected = this.candidates.selectDailyNewCandidates(builtCandidates, pushedIds);
      const result = await this.history.applyDailyObservations(now, selected);
      await this.processCreatedJobs(result.createdJobs);

      return this.prisma.youtubeRun.update({
        where: { id: run.id },
        data: {
          status: 'success',
          officialCount: trendingEntries.reduce((sum, [, items]) => sum + items.length, 0),
          keywordCount: keywordEntries.reduce((sum, [, items]) => sum + items.length, 0),
          newVideoCount: result.newCandidates.length,
          historicalCount: result.historicalCandidates.length,
          finishedAt: new Date(),
        },
      });
    } catch (error) {
      return this.prisma.youtubeRun.update({
        where: { id: run.id },
        data: {
          status: 'failed',
          errorMessage: error instanceof Error ? error.message : 'YouTube 采集失败',
          finishedAt: new Date(),
        },
      });
    }
  }

  async getLatestRun() {
    return this.prisma.youtubeRun.findFirst({
      orderBy: { startedAt: 'desc' },
    });
  }

  async getBoard() {
    const videos = await this.prisma.youtubeVideo.findMany({
      where: { boardStatus: 'active' },
      orderBy: [{ lastSeenDate: 'desc' }, { createdAt: 'desc' }],
      include: {
        jobs: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: { result: true },
        },
      },
    });

    return { videos: videos.map(mapYoutubeBoardVideo) };
  }

  private async processCreatedJobs(jobs: Array<{ id: string; videoId: string }>) {
    for (const jobRef of jobs) {
      await this.processCreatedJob(jobRef.id);
    }
  }

  private async processCreatedJob(jobId: string) {
    const job = await this.prisma.youtubeAnalysisJob.findUnique({
      where: { id: jobId },
      include: { video: true },
    });
    if (!job) return;

    await this.prisma.youtubeAnalysisJob.update({
      where: { id: job.id },
      data: { status: 'running', startedAt: new Date() },
    });

    const transcript = await this.transcriptExtractor.extract({
      videoId: job.video.videoId,
      videoUrl: job.video.videoUrl,
    });

    await this.prisma.youtubeAnalysisJob.update({
      where: { id: job.id },
      data: {
        transcriptStatus: transcript.status,
        transcriptProvider: transcript.provider,
        errorMessage: transcript.status === 'available' ? null : transcript.errorMessage,
      },
    });

    if (transcript.status !== 'available') {
      await this.prisma.youtubeAnalysisJob.update({
        where: { id: job.id },
        data: { status: transcript.status, finishedAt: new Date() },
      });
      return;
    }

    await this.prisma.youtubeVideoTranscript.create({
      data: {
        id: `youtube_transcript_${randomUUID()}`,
        jobId: job.id,
        provider: transcript.provider,
        language: transcript.language,
        segments: toJson(transcript.segments),
        plainText: transcript.plainText,
      },
    });

    try {
      const output = await this.analysis.analyzeTranscript({
        video: {
          video_id: job.video.videoId,
          video_url: job.video.videoUrl,
          title: job.video.title,
          published_at: job.video.publishedAt?.toISOString() ?? null,
          duration: job.video.duration,
        },
        discovery: {
          selection_sources: job.video.selectionSources,
          matched_keywords: job.video.matchedKeywords,
          keyword_hit_count: job.video.keywordHitCount,
          discovery_labels: job.video.discoveryLabels,
        },
        video_metrics: job.video.lastVideoMetrics,
        channel: {
          channel_id: job.video.channelId,
          channel_title: job.video.channelTitle,
          subscriber_count: null,
        },
        transcript: {
          language: transcript.language,
          plain_text: transcript.plainText,
          segments: transcript.segments,
        },
        product_profile: null,
      });

      await this.prisma.youtubeAnalysisResult.create({
        data: {
          id: `youtube_result_${randomUUID()}`,
          jobId: job.id,
          mainReason: toJson(output.main_reason),
          execution: toJson(output.execution),
          replication: toJson(output.replication),
          limitations: toJson(output.limitations),
          rawOutput: toJson(output),
        },
      });
      await this.prisma.youtubeAnalysisJob.update({
        where: { id: job.id },
        data: { status: 'success', finishedAt: new Date(), errorMessage: null },
      });
    } catch (error) {
      await this.prisma.youtubeAnalysisJob.update({
        where: { id: job.id },
        data: {
          status: 'analysis_failed',
          errorMessage: error instanceof Error ? error.message : 'YouTube 字幕拆解失败',
          finishedAt: new Date(),
        },
      });
    }
  }
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}
