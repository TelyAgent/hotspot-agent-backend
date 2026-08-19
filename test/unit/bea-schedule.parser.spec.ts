import { parseBeaSchedule } from '../../src/future-events/connectors/bea-schedule.parser';

describe('parseBeaSchedule', () => {
  it('extracts BEA release rows from the schedule table', () => {
    const html = `
      <table>
        <tr>
          <td>August 26 8:30 AM</td>
          <td>News</td>
          <td>GDP (Second Estimate) and Corporate Profits, 2nd Quarter 2026</td>
        </tr>
      </table>
    `;

    const result = parseBeaSchedule(html, {
      sourceUrl: 'https://www.bea.gov/news/schedule',
      retrievedAt: '2026-08-19T00:00:00.000Z',
      now: new Date('2026-08-19T00:00:00.000Z'),
    });

    expect(result).toEqual([
      expect.objectContaining({
        sourceType: 'bea',
        title: 'GDP (Second Estimate) and Corporate Profits, 2nd Quarter 2026',
        startTime: '2026-08-26T12:30:00.000Z',
        timezone: 'America/New_York',
      }),
    ]);
  });
});
