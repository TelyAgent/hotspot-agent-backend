import { parseBlsIcsEvents } from '../../src/future-events/connectors/bls-ics.parser';

describe('parseBlsIcsEvents', () => {
  it('parses BLS iCalendar events into future source items', () => {
    const events = parseBlsIcsEvents(
      [
        'BEGIN:VCALENDAR',
        'BEGIN:VEVENT',
        'UID:bls-cpi-2026-09',
        'SUMMARY:Consumer Price Index',
        'DESCRIPTION:CPI release',
        'DTSTART:20260910T123000Z',
        'DTEND:20260910T130000Z',
        'URL:https://www.bls.gov/news.release/cpi.nr0.htm',
        'END:VEVENT',
        'END:VCALENDAR',
      ].join('\r\n'),
      {
        retrievedAt: '2026-08-19T00:00:00.000Z',
        sourceUrl: 'https://www.bls.gov/schedule/news_release/bls.ics',
        includeReleaseTypes: ['Consumer Price Index'],
      },
    );

    expect(events).toEqual([
      {
        sourceType: 'bls',
        sourceItemId: 'bls-cpi-2026-09',
        sourceUrl: 'https://www.bls.gov/news.release/cpi.nr0.htm',
        retrievedAt: '2026-08-19T00:00:00.000Z',
        title: 'Consumer Price Index',
        description: 'CPI release',
        startTime: '2026-09-10T12:30:00.000Z',
        endTime: '2026-09-10T13:00:00.000Z',
        timezone: 'UTC',
        raw: expect.objectContaining({ UID: 'bls-cpi-2026-09' }),
      },
    ]);
  });
});
