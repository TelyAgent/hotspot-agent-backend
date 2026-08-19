import { parseBlsIcsEvents, ParsedFutureSourceItem } from './bls-ics.parser';

export interface FutureSourceConnectorInput {
  sourceType: string;
  variables: Record<string, unknown>;
  retrievedAt: string;
}

export class BlsIcsConnector {
  async fetch(input: FutureSourceConnectorInput): Promise<ParsedFutureSourceItem[]> {
    const url = this.requiredString(input.variables.url, 'variables.url');
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`BLS iCalendar fetch failed: ${response.status}`);
    }
    const text = await response.text();
    return parseBlsIcsEvents(text, {
      sourceUrl: url,
      retrievedAt: input.retrievedAt,
      includeReleaseTypes: this.stringArray(input.variables.includeReleaseTypes),
    });
  }

  private requiredString(value: unknown, name: string) {
    if (typeof value !== 'string' || !value.trim()) {
      throw new Error(`${name} is required`);
    }
    return value.trim();
  }

  private stringArray(value: unknown) {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.length > 0) : [];
  }
}
