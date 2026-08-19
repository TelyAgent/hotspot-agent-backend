import { ParsedFutureSourceItem } from './bls-ics.parser';
import { parseMonthName, slug, stripTags } from './html-parser-utils';

export interface ParseFomcCalendarOptions {
  retrievedAt: string;
  sourceUrl: string;
  now?: Date;
}

export function parseFomcCalendar(html: string, options: ParseFomcCalendarOptions): ParsedFutureSourceItem[] {
  const year = (options.now ?? new Date()).getUTCFullYear();
  const text = stripTags(html);
  const yearSection = extractYearSection(text, year);
  const meetingMatches = [
    ...yearSection.matchAll(
      /(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}(?:-\d{1,2})?)\*?\s+Statement:/gi,
    ),
  ];

  return meetingMatches.map((match) => {
    const month = parseMonthName(match[1])!;
    const [startDayRaw, endDayRaw] = match[2].split('-');
    const startDay = Number(startDayRaw);
    const endDay = Number(endDayRaw ?? startDayRaw);
    const startDate = `${year}-${String(month).padStart(2, '0')}-${String(startDay).padStart(2, '0')}`;
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`;
    const title = `FOMC meeting ${match[1]} ${startDay}${endDay !== startDay ? `-${endDay}` : ''}, ${year}`;
    return {
      sourceType: 'fomc' as const,
      sourceItemId: `fomc:${startDate}:${slug(title)}`,
      sourceUrl: options.sourceUrl,
      retrievedAt: options.retrievedAt,
      title,
      description: 'Federal Open Market Committee meeting',
      startTime: `${startDate}T00:00:00.000Z`,
      endTime: `${endDate}T23:59:59.000Z`,
      timezone: 'America/New_York',
      raw: { match: match[0], year: String(year) },
    };
  });
}

function extractYearSection(text: string, year: number) {
  const start = text.indexOf(String(year));
  if (start < 0) return text;
  const rest = text.slice(start);
  const nextYear = rest.search(new RegExp(`\\b${year + 1}\\b`));
  return nextYear > 0 ? rest.slice(0, nextYear) : rest;
}
