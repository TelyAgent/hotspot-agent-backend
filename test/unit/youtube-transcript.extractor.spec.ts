import { normalizeYoutubeTranscriptRows } from '../../src/youtube/transcript/youtube-transcript.extractor';

describe('normalizeYoutubeTranscriptRows', () => {
  it('converts transcript rows to milliseconds and plain text', () => {
    const result = normalizeYoutubeTranscriptRows([
      { offset: 1.5, duration: 2, text: 'Hello' },
      { offset: 3.5, duration: 1, text: 'world' },
    ]);

    expect(result.segments).toEqual([
      { startMs: 1500, durationMs: 2000, text: 'Hello' },
      { startMs: 3500, durationMs: 1000, text: 'world' },
    ]);
    expect(result.plainText).toBe('Hello\nworld');
  });

  it('removes blank text rows', () => {
    const result = normalizeYoutubeTranscriptRows([
      { offset: 1, duration: 1, text: '  ' },
      { offset: 2, duration: 1, text: 'A useful sentence.' },
    ]);

    expect(result.segments).toEqual([{ startMs: 2000, durationMs: 1000, text: 'A useful sentence.' }]);
    expect(result.plainText).toBe('A useful sentence.');
  });
});
