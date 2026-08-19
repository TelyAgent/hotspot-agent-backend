export const DEFAULT_FUTURE_SOURCE_CONFIGS = [
  {
    id: 'future-source-opm',
    sourceType: 'opm',
    displayName: 'OPM 美国联邦假日',
    connectorId: 'future.opm.fetchHolidays',
    enabled: true,
    schedule: { type: 'annual', value: '0 3 1 1 *' },
    variables: {
      url: 'https://www.opm.gov/policy-data-oversight/pay-leave/federal-holidays/',
      scope: 'current_year_remaining',
    },
  },
  {
    id: 'future-source-bea',
    sourceType: 'bea',
    displayName: 'BEA 发布时间表',
    connectorId: 'future.bea.fetchSchedule',
    enabled: true,
    schedule: { type: 'cron', value: '0 4 * * *' },
    variables: {
      url: 'https://www.bea.gov/news/schedule',
      scope: 'current_year_remaining',
    },
  },
  {
    id: 'future-source-bls',
    sourceType: 'bls',
    displayName: 'BLS 发布日历',
    connectorId: 'future.bls.fetchIcs',
    enabled: true,
    schedule: { type: 'cron', value: '0 4 * * *' },
    variables: {
      url: 'https://www.bls.gov/schedule/news_release/bls.ics',
      includeReleaseTypes: ['Employment Situation', 'CPI', 'PPI', 'JOLTS', 'ECI'],
      scope: 'current_year_remaining',
    },
  },
  {
    id: 'future-source-fomc',
    sourceType: 'fomc',
    displayName: 'FOMC 会议日历',
    connectorId: 'future.fomc.fetchCalendar',
    enabled: true,
    schedule: { type: 'cron', value: '0 4 * * *' },
    variables: {
      url: 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm',
      scope: 'current_year_remaining',
    },
  },
  {
    id: 'future-source-manual',
    sourceType: 'manual',
    displayName: '人工导入',
    connectorId: 'future.manual.import',
    enabled: true,
    schedule: { type: 'manual', value: 'manual' },
    variables: {
      sourceUrlRequired: true,
      defaultConfirmationLevel: 'needs_verification',
      defaultExpressionBoundary: 'internal_only',
    },
  },
] as const;
