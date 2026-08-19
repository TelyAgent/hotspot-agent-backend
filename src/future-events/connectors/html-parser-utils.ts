export function decodeHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

export function stripTags(value: string) {
  return normalizeWhitespace(decodeHtmlEntities(value.replace(/<[^>]*>/g, ' ')));
}

export function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

export function extractTableRows(html: string) {
  return [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((row) =>
    [...row[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cell) => stripTags(cell[1])).filter(Boolean),
  );
}

export function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function easternDateTimeToIso(year: number, month: number, day: number, hour: number, minute: number) {
  const offsetHours = month >= 3 && month <= 11 ? 4 : 5;
  return new Date(Date.UTC(year, month - 1, day, hour + offsetHours, minute, 0)).toISOString();
}

export function parseMonthName(value: string) {
  const months = [
    'january',
    'february',
    'march',
    'april',
    'may',
    'june',
    'july',
    'august',
    'september',
    'october',
    'november',
    'december',
  ];
  const index = months.indexOf(value.toLowerCase());
  return index >= 0 ? index + 1 : undefined;
}

export function parseClock(value: string) {
  const match = value.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/i);
  if (!match) return undefined;
  let hour = Number(match[1]);
  const minute = Number(match[2] ?? '0');
  const meridiem = match[3].toUpperCase();
  if (meridiem === 'PM' && hour < 12) hour += 12;
  if (meridiem === 'AM' && hour === 12) hour = 0;
  return { hour, minute };
}
