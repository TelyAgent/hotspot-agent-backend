import { ParsedFutureSourceItem } from './bls-ics.parser';
import { easternDateTimeToIso, extractTableRows, parseClock, parseMonthName, slug, stripTags } from './html-parser-utils';

export interface ParseBeaScheduleOptions {
  retrievedAt: string;
  sourceUrl: string;
  now?: Date;
}

export function parseBeaSchedule(html: string, options: ParseBeaScheduleOptions): ParsedFutureSourceItem[] {
  const rows = extractTableRows(html);
  const currentYear = (options.now ?? new Date()).getUTCFullYear();
  const parsedRows = rows.length > 0 ? rows : parseTextRows(html);

  return parsedRows
    .map((cells) => toBeaItem(cells, currentYear, options))
    .filter((item): item is ParsedFutureSourceItem => Boolean(item));
}

function parseTextRows(html: string) {
  const lines = stripTags(html)
    .split(/(?=(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}\s+\d{1,2}:\d{2}\s+(?:AM|PM))/g)
    .map((line) => line.trim())
    .filter(Boolean);

  return lines.map((line) => {
    const match = line.match(
      /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})\s+(\d{1,2}:\d{2}\s+(?:AM|PM))\s+(.+)$/i,
    );
    return match ? [`${match[1]} ${match[2]} ${match[3]}`, match[4]] : [line];
  });
}

function toBeaItem(cells: string[], year: number, options: ParseBeaScheduleOptions): ParsedFutureSourceItem | null {
  const dateCellIndex = cells.findIndex((cell) =>
    /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}/i.test(cell),
  );
  if (dateCellIndex < 0) return null;

  const dateCell = cells[dateCellIndex];
  const dateMatch = dateCell.match(
    /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:\s+(\d{1,2}:\d{2}\s+(?:AM|PM)))?/i,
  );
  if (!dateMatch) return null;
  const month = parseMonthName(dateMatch[1]);
  const day = Number(dateMatch[2]);
  const clock = parseClock(dateMatch[3] ?? '') ?? { hour: 8, minute: 30 };
  if (!month || !Number.isFinite(day)) return null;

  const title = cells
    .slice(dateCellIndex + 1)
    .reverse()
    .find((cell) => cell && !/^News$/i.test(cell));
  if (!title) return null;

  return {
    sourceType: 'bea' as const,
    sourceItemId: `bea:${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}:${slug(title)}`,
    sourceUrl: options.sourceUrl,
    retrievedAt: options.retrievedAt,
    title,
    description: cells.find((cell) => /^News$/i.test(cell)) ?? null,
    startTime: easternDateTimeToIso(year, month, day, clock.hour, clock.minute),
    endTime: null,
    timezone: 'America/New_York',
    raw: { cells: JSON.stringify(cells) },
  };
}
