import type { YoutubeTranscriptSegment } from '../youtube.types';

export type TranscriptStatus = 'available' | 'transcript_unavailable' | 'content_unavailable';

export interface YoutubeTranscriptResult {
  status: TranscriptStatus;
  provider: string;
  language: string | null;
  segments: YoutubeTranscriptSegment[];
  plainText: string;
  errorMessage?: string;
}

export interface TranscriptExtractor {
  extract(input: { videoId: string; videoUrl: string }): Promise<YoutubeTranscriptResult>;
}
