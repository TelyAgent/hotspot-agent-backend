import { BlsIcsConnector } from '../../src/future-events/connectors/bls-ics.connector';

describe('BlsIcsConnector', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('fetches BLS iCalendar from source config variables', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: jest.fn().mockResolvedValue(
        [
          'BEGIN:VCALENDAR',
          'BEGIN:VEVENT',
          'UID:bls-cpi-2026-09',
          'SUMMARY:Consumer Price Index',
          'DTSTART:20260910T123000Z',
          'END:VEVENT',
          'END:VCALENDAR',
        ].join('\r\n'),
      ),
    }) as never;
    const connector = new BlsIcsConnector();

    const result = await connector.fetch({
      sourceType: 'bls',
      variables: {
        url: 'https://www.bls.gov/schedule/news_release/bls.ics',
        includeReleaseTypes: ['Consumer Price Index'],
      },
      retrievedAt: '2026-08-19T00:00:00.000Z',
    });

    expect(global.fetch).toHaveBeenCalledWith('https://www.bls.gov/schedule/news_release/bls.ics');
    expect(result).toEqual([
      expect.objectContaining({
        sourceType: 'bls',
        sourceItemId: 'bls-cpi-2026-09',
        title: 'Consumer Price Index',
      }),
    ]);
  });
});
