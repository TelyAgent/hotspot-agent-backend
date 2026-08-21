import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import type { YoutubeCandidate } from './youtube.types';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface YoutubeHistoryUpdateResult {
  newCandidates: YoutubeCandidate[];
  historicalCandidates: YoutubeCandidate[];
  createdJobs: Array<{ id: string; jobKey: string; videoId: string }>;
  expiredCount: number;
}

export function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function toUtcDate(date: Date): Date {
  return new Date(`${toDateKey(date)}T00:00:00.000Z`);
}

export function daysBetween(previous: Date, current: Date): number {
  return Math.round((toUtcDate(current).getTime() - toUtcDate(previous).getTime()) / DAY_MS);
}

export function computeConsecutiveHotDays(input: {
  previousLastSeen: Date;
  currentDate: Date;
  previousValue: number;
}): number {
  return daysBetween(input.previousLastSeen, input.currentDate) === 1 ? input.previousValue + 1 : 1;
}

export function computeReappearanceGapDays(input: { previousLastSeen: Date; currentDate: Date }): number | null {
  const gap = daysBetween(input.previousLastSeen, input.currentDate);
  return gap > 1 ? gap : null;
}

export function computeBoardVisibleUntil(currentDate: Date): Date {
  return new Date(toUtcDate(currentDate).getTime() + 6 * DAY_MS);
}

export function mergeDiscoveryLabels(labels: string[], reappearanceGapDays: number | null): string[] {
  const merged = [...labels];
  if (reappearanceGapDays != null) {
    const label = `${reappearanceGapDays}天后再次上榜`;
    if (!merged.includes(label)) {
      merged.push(label);
    }
  }
  return merged;
}

@Injectable()
export class YoutubeHistoryService {
  constructor(private readonly prisma: PrismaService) {}

  async findPushedVideoIds(): Promise<Set<string>> {
    const videos = await this.prisma.youtubeVideo.findMany({
      where: { pushedAt: { not: null } },
      select: { videoId: true },
    });
    return new Set(videos.map((video) => video.videoId));
  }

  async applyDailyObservations(date: Date, candidates: YoutubeCandidate[]): Promise<YoutubeHistoryUpdateResult> {
    const currentDate = toUtcDate(date);
    const newCandidates: YoutubeCandidate[] = [];
    const historicalCandidates: YoutubeCandidate[] = [];
    const createdJobs: Array<{ id: string; jobKey: string; videoId: string }> = [];

    for (const candidate of candidates) {
      const existing = await this.prisma.youtubeVideo.findUnique({
        where: { videoId: candidate.videoId },
      });
      const reappearanceGapDays = existing
        ? computeReappearanceGapDays({ previousLastSeen: existing.lastSeenDate, currentDate })
        : null;
      const discoveryLabels = mergeDiscoveryLabels(candidate.discoveryLabels, reappearanceGapDays);

      if (!existing) {
        const video = await this.prisma.youtubeVideo.create({
          data: {
            id: `youtube_video_${randomUUID()}`,
            videoId: candidate.videoId,
            videoUrl: candidate.videoUrl,
            title: candidate.title,
            thumbnailUrl: candidate.thumbnailUrl,
            publishedAt: candidate.publishedAt ? new Date(candidate.publishedAt) : null,
            duration: candidate.duration,
            channelId: candidate.channelId,
            channelTitle: candidate.channelTitle,
            firstSeenDate: currentDate,
            lastSeenDate: currentDate,
            boardStatus: 'active',
            boardVisibleUntil: computeBoardVisibleUntil(currentDate),
            lastVideoMetrics: toJson(candidate.videoMetrics),
            selectionSources: toJson(candidate.selectionSources),
            matchedKeywords: toJson(candidate.matchedKeywords),
            keywordHitCount: candidate.keywordHitCount,
            discoveryLabels: toJson(discoveryLabels),
            pushedAt: new Date(),
          },
        });
        await this.createObservation(video.id, currentDate, candidate, discoveryLabels);

        const jobKey = `youtube:${candidate.videoId}:${toDateKey(currentDate)}`;
        const job = await this.prisma.youtubeAnalysisJob.create({
          data: {
            id: `youtube_job_${randomUUID()}`,
            youtubeVideoId: video.id,
            jobKey,
            status: 'pending',
          },
        });
        newCandidates.push(candidate);
        createdJobs.push({ id: job.id, jobKey, videoId: candidate.videoId });
        continue;
      }

      const nextConsecutiveHotDays = computeConsecutiveHotDays({
        previousLastSeen: existing.lastSeenDate,
        currentDate,
        previousValue: existing.consecutiveHotDays,
      });
      await this.prisma.youtubeVideo.update({
        where: { id: existing.id },
        data: {
          title: candidate.title,
          thumbnailUrl: candidate.thumbnailUrl,
          publishedAt: candidate.publishedAt ? new Date(candidate.publishedAt) : existing.publishedAt,
          duration: candidate.duration,
          channelId: candidate.channelId,
          channelTitle: candidate.channelTitle,
          lastSeenDate: currentDate,
          consecutiveHotDays: nextConsecutiveHotDays,
          boardStatus: 'active',
          boardVisibleUntil: computeBoardVisibleUntil(currentDate),
          reappearanceCount: reappearanceGapDays != null ? { increment: 1 } : undefined,
          lastReappearanceGapDays: reappearanceGapDays,
          lastVideoMetrics: toJson(candidate.videoMetrics),
          selectionSources: toJson(candidate.selectionSources),
          matchedKeywords: toJson(candidate.matchedKeywords),
          keywordHitCount: candidate.keywordHitCount,
          discoveryLabels: toJson(discoveryLabels),
        },
      });
      await this.createObservation(existing.id, currentDate, candidate, discoveryLabels);
      historicalCandidates.push(candidate);
    }

    const expired = await this.prisma.youtubeVideo.updateMany({
      where: {
        boardStatus: 'active',
        boardVisibleUntil: { lt: currentDate },
      },
      data: { boardStatus: 'expired' },
    });

    return { newCandidates, historicalCandidates, createdJobs, expiredCount: expired.count };
  }

  private async createObservation(
    youtubeVideoId: string,
    observedDate: Date,
    candidate: YoutubeCandidate,
    discoveryLabels: string[],
  ) {
    await this.prisma.youtubeVideoObservation.upsert({
      where: {
        youtubeVideoId_observedDate: {
          youtubeVideoId,
          observedDate,
        },
      },
      update: {
        selectionSources: toJson(candidate.selectionSources),
        matchedKeywords: toJson(candidate.matchedKeywords),
        keywordHitCount: candidate.keywordHitCount,
        discoveryLabels: toJson(discoveryLabels),
        videoMetrics: toJson(candidate.videoMetrics),
        raw: toJson(candidate.raw),
      },
      create: {
        id: `youtube_observation_${randomUUID()}`,
        youtubeVideoId,
        observedDate,
        selectionSources: toJson(candidate.selectionSources),
        matchedKeywords: toJson(candidate.matchedKeywords),
        keywordHitCount: candidate.keywordHitCount,
        discoveryLabels: toJson(discoveryLabels),
        videoMetrics: toJson(candidate.videoMetrics),
        raw: toJson(candidate.raw),
      },
    });
  }
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}
