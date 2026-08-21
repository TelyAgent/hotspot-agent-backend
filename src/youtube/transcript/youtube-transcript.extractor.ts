import { Injectable } from '@nestjs/common';
import { fetchTranscript, type TranscriptResponse } from 'youtube-transcript';
import type { YoutubeTranscriptSegment } from '../youtube.types';
import type { TranscriptExtractor, YoutubeTranscriptResult } from './transcript-extractor';

export interface NormalizedYoutubeTranscript {
  language: string | null;
  segments: YoutubeTranscriptSegment[];
  plainText: string;
}

export function normalizeYoutubeTranscriptRows(rows: TranscriptResponse[]): NormalizedYoutubeTranscript {
  const segments = rows
    .map((row) => ({
      startMs: Math.round(row.offset * 1000),
      durationMs: Number.isFinite(row.duration) ? Math.round(row.duration * 1000) : null,
      text: row.text.trim(),
      language: row.lang ?? null,
    }))
    .filter((row) => row.text.length > 0);

  return {
    language: segments.find((segment) => segment.language)?.language ?? null,
    segments: segments.map(({ startMs, durationMs, text }) => ({ startMs, durationMs, text })),
    plainText: segments.map((segment) => segment.text).join('\n'),
  };
}

@Injectable()
export class YoutubeTranscriptExtractor implements TranscriptExtractor {
  async extract(input: { videoId: string; videoUrl: string }): Promise<YoutubeTranscriptResult> {
    try {
      const rows = await fetchTranscript(input.videoUrl || input.videoId);
      const normalized = normalizeYoutubeTranscriptRows(rows);
      if (normalized.segments.length === 0) {
        return {
          status: 'transcript_unavailable',
          provider: 'youtube-transcript',
          language: null,
          segments: [],
          plainText: '',
          errorMessage: '未提取到可用字幕文本',
        };
      }

      return {
        status: 'available',
        provider: 'youtube-transcript',
        ...normalized,
      };
    } catch (error) {
      return {
        status: classifyTranscriptError(error),
        provider: 'youtube-transcript',
        language: null,
        segments: [],
        plainText: '',
        errorMessage: error instanceof Error ? error.message : '字幕提取失败',
      };
    }
  }
}

function classifyTranscriptError(error: unknown): 'transcript_unavailable' | 'content_unavailable' {
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  if (message.includes('unavailable') || message.includes('disabled') || message.includes('not available')) {
    return 'transcript_unavailable';
  }
  return 'content_unavailable';
}
