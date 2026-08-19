import { parseOpmHolidays } from '../../src/future-events/connectors/opm-holidays.parser';

describe('parseOpmHolidays', () => {
  it('extracts current-year U.S. federal holidays', () => {
    const html = `
      <h3>2026 Holiday Schedule</h3>
      <p>Date | Holiday</p>
      <p>Monday, September 07 | Labor Day</p>
      <p>Friday, December 25 | Christmas Day</p>
      <h3>2027 Holiday Schedule</h3>
      <p>Monday, January 18 | Birthday of Martin Luther King, Jr.</p>
    `;

    const result = parseOpmHolidays(html, {
      sourceUrl: 'https://www.opm.gov/policy-data-oversight/pay-leave/federal-holidays/',
      retrievedAt: '2026-08-19T00:00:00.000Z',
      now: new Date('2026-08-19T00:00:00.000Z'),
    });

    expect(result).toEqual([
      expect.objectContaining({
        sourceType: 'opm',
        title: 'Labor Day',
        startTime: '2026-09-07T00:00:00.000Z',
      }),
      expect.objectContaining({
        title: 'Christmas Day',
        startTime: '2026-12-25T00:00:00.000Z',
      }),
    ]);
  });
});
