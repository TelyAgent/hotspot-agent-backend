import { parseFomcCalendar } from '../../src/future-events/connectors/fomc-calendar.parser';

describe('parseFomcCalendar', () => {
  it('extracts FOMC meeting date ranges for the current year', () => {
    const html = `
      <section>
        <h3>2026 FOMC Meetings</h3>
        <p>January</p>
        <p>27-28*</p>
        <p>Statement:</p>
        <p>March</p>
        <p>17-18</p>
        <p>Statement:</p>
      </section>
      <section><h3>2027 FOMC Meetings</h3><p>January 26-27</p></section>
    `;

    const result = parseFomcCalendar(html, {
      sourceUrl: 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm',
      retrievedAt: '2026-08-19T00:00:00.000Z',
      now: new Date('2026-08-19T00:00:00.000Z'),
    });

    expect(result).toEqual([
      expect.objectContaining({
        sourceType: 'fomc',
        title: 'FOMC meeting January 27-28, 2026',
        startTime: '2026-01-27T00:00:00.000Z',
        endTime: '2026-01-28T23:59:59.000Z',
      }),
      expect.objectContaining({
        title: 'FOMC meeting March 17-18, 2026',
      }),
    ]);
  });
});
