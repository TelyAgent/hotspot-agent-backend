export interface ParsedFutureSourceItem {
  sourceType: 'bls' | 'bea' | 'opm' | 'fomc';
  sourceItemId: string;
  sourceUrl: string;
  retrievedAt: string;
  title: string;
  description: string | null;
  startTime: string | null;
  endTime: string | null;
  timezone: string;
  raw: Record<string, string>;
}

export interface ParseBlsIcsOptions {
  retrievedAt: string;
  sourceUrl: string;
  includeReleaseTypes?: string[];
}

export function parseBlsIcsEvents(text: string, options: ParseBlsIcsOptions): ParsedFutureSourceItem[] {
  return extractVEvents(unfoldIcs(text))
    .map((event) => toSourceItem(event, options))
    .filter((item): item is ParsedFutureSourceItem => Boolean(item))
    .filter((item) => matchesIncludeList(item, options.includeReleaseTypes ?? []));
}

function unfoldIcs(text: string) {
  return text.replace(/\r?\n[ \t]/g, '');
}

function extractVEvents(text: string): Record<string, string>[] {
  const events: Record<string, string>[] = [];
  let current: Record<string, string> | null = null;

  for (const line of text.split(/\r?\n/)) {
    if (line === 'BEGIN:VEVENT') {
      current = {};
      continue;
    }
    if (line === 'END:VEVENT') {
      if (current) events.push(current);
      current = null;
      continue;
    }
    if (!current) continue;
    const colonIndex = line.indexOf(':');
    if (colonIndex <= 0) continue;
    const rawKey = line.slice(0, colonIndex);
    const key = rawKey.split(';')[0];
    current[key] = decodeIcsText(line.slice(colonIndex + 1));
  }

  return events;
}

function toSourceItem(event: Record<string, string>, options: ParseBlsIcsOptions): ParsedFutureSourceItem | null {
  const title = event.SUMMARY?.trim();
  const sourceItemId = event.UID?.trim();
  if (!title || !sourceItemId) {
    return null;
  }

  return {
    sourceType: 'bls',
    sourceItemId,
    sourceUrl: event.URL?.trim() || options.sourceUrl,
    retrievedAt: options.retrievedAt,
    title,
    description: event.DESCRIPTION?.trim() || null,
    startTime: parseIcsDate(event.DTSTART),
    endTime: parseIcsDate(event.DTEND),
    timezone: 'UTC',
    raw: event,
  };
}

function matchesIncludeList(item: ParsedFutureSourceItem, includeReleaseTypes: string[]) {
  if (includeReleaseTypes.length === 0) {
    return true;
  }
  const haystack = `${item.title}\n${item.description ?? ''}`.toLowerCase();
  return includeReleaseTypes.some((releaseType) => haystack.includes(releaseType.toLowerCase()));
}

function parseIcsDate(value?: string) {
  if (!value) {
    return null;
  }
  const match = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})Z?)?$/);
  if (!match) {
    return null;
  }
  const [, year, month, day, hour = '00', minute = '00', second = '00'] = match;
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second))).toISOString();
}

function decodeIcsText(value: string) {
  return value.replace(/\\n/g, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\');
}
