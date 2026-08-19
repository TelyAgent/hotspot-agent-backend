import { ParsedFutureSourceItem } from './bls-ics.parser';
import { parseMonthName, slug, stripTags } from './html-parser-utils';

export interface ParseOpmHolidaysOptions {
  retrievedAt: string;
  sourceUrl: string;
  now?: Date;
}

export function parseOpmHolidays(html: string, options: ParseOpmHolidaysOptions): ParsedFutureSourceItem[] {
  const year = (options.now ?? new Date()).getUTCFullYear();
  return parseTextRows(html, year)
    .map((row) => toHolidayItem(row, year, options))
    .filter((item): item is ParsedFutureSourceItem => Boolean(item));
}

function parseTextRows(html: string, year: number) {
  const text = stripTags(html);
  const section = extractYearSection(text, year);
  const rows: Array<{ dateText: string; title: string }> = [];
  const pattern =
    /((?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2})(?:,?\s+\d{4})?\s*\*{0,3}\s+(.+?)(?=(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}|$)/gi;
  for (const match of section.matchAll(pattern)) {
    const title = match[2]
      .replace(/^\s*\|\s*/, '')
      .replace(/\s*\*+\s*$/g, '')
      .trim();
    if (title && !/^(Date|Holiday|-)+$/i.test(title)) {
      rows.push({ dateText: match[1], title });
    }
  }
  return rows;
}

function extractYearSection(text: string, year: number) {
  const marker = `${year} Holiday Schedule`;
  const start = text.indexOf(marker);
  if (start < 0) return text;
  const rest = text.slice(start + marker.length);
  const next = rest.search(/\b\d{4}\s+Holiday Schedule\b/);
  return next > 0 ? rest.slice(0, next) : rest;
}

function toHolidayItem(row: { dateText: string; title: string }, year: number, options: ParseOpmHolidaysOptions): ParsedFutureSourceItem | null {
  const dateMatch = row.dateText.match(
    /(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})/i,
  );
  if (!dateMatch) return null;
  const month = parseMonthName(dateMatch[2]);
  const day = Number(dateMatch[3]);
  if (!month || !Number.isFinite(day)) return null;

  const title = row.title;
  if (!title) return null;

  const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return {
    sourceType: 'opm' as const,
    sourceItemId: `opm:${date}:${slug(title)}`,
    sourceUrl: options.sourceUrl,
    retrievedAt: options.retrievedAt,
    title,
    description: 'U.S. federal holiday',
    startTime: `${date}T00:00:00.000Z`,
    endTime: null,
    timezone: 'America/New_York',
    raw: { dateText: row.dateText, title },
  };
}
