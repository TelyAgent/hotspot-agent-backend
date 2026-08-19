import { ParsedFutureSourceItem } from './bls-ics.parser';
import { parseBeaSchedule } from './bea-schedule.parser';
import { parseFomcCalendar } from './fomc-calendar.parser';
import { parseOpmHolidays } from './opm-holidays.parser';

export interface OfficialHtmlConnectorInput {
  sourceType: string;
  variables: Record<string, unknown>;
  retrievedAt: string;
}

export class BeaScheduleConnector {
  async fetch(input: OfficialHtmlConnectorInput): Promise<ParsedFutureSourceItem[]> {
    const url = requiredString(input.variables.url, 'variables.url');
    const html = await fetchText(url, 'BEA schedule');
    return parseBeaSchedule(html, { sourceUrl: url, retrievedAt: input.retrievedAt });
  }
}

export class OpmHolidaysConnector {
  async fetch(input: OfficialHtmlConnectorInput): Promise<ParsedFutureSourceItem[]> {
    const url = requiredString(input.variables.url, 'variables.url');
    const html = await fetchText(url, 'OPM holidays');
    return parseOpmHolidays(html, { sourceUrl: url, retrievedAt: input.retrievedAt });
  }
}

export class FomcCalendarConnector {
  async fetch(input: OfficialHtmlConnectorInput): Promise<ParsedFutureSourceItem[]> {
    const url = requiredString(input.variables.url, 'variables.url');
    const html = await fetchText(url, 'FOMC calendar');
    return parseFomcCalendar(html, { sourceUrl: url, retrievedAt: input.retrievedAt });
  }
}

async function fetchText(url: string, label: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${label} fetch failed: ${response.status}`);
  }
  return response.text();
}

function requiredString(value: unknown, name: string) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${name} is required`);
  }
  return value.trim();
}
