import type { YoutubeTranscriptSegment } from '../youtube.types';

export function parseVttTranscript(vtt: string): YoutubeTranscriptSegment[] {
  const segments: YoutubeTranscriptSegment[] = [];
  const blocks = vtt
    .replace(/\r/g, '')
    .split('\n\n')
    .map((block) => block.trim())
    .filter(Boolean);

  for (const block of blocks) {
    const lines = block.split('\n').filter(Boolean);
    const timingLine = lines.find((line) => line.includes('-->'));
    if (!timingLine) continue;

    const [start, end] = timingLine.split('-->').map((part) => part.trim().split(/\s+/)[0]);
    const text = lines
      .slice(lines.indexOf(timingLine) + 1)
      .join(' ')
      .replace(/<[^>]+>/g, '')
      .trim();
    if (!text) continue;

    const startMs = parseVttTimestamp(start);
    const endMs = parseVttTimestamp(end);
    segments.push({
      startMs,
      durationMs: endMs > startMs ? endMs - startMs : null,
      text,
    });
  }

  return segments;
}

function parseVttTimestamp(value: string): number {
  const parts = value.split(':');
  const secondsPart = parts.pop() ?? '0';
  const minutes = Number(parts.pop() ?? 0);
  const hours = Number(parts.pop() ?? 0);
  const seconds = Number(secondsPart.replace(',', '.'));
  return Math.round((hours * 3600 + minutes * 60 + seconds) * 1000);
}
