import { PublicationMetricRecord, PublicationRecord } from './content.types';
import { CollectedPublicationMetrics } from './publication-metrics.collector';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export const DEFAULT_PUBLICATION_TRACKING_RULE = {
  version: 'publication-tracking-v1',
  earlyWindowHours: 24,
  earlyIntervalHours: 2,
  normalIntervalHours: 5,
  minimumTrackingDays: 7,
  wellPerformingWindowHours: 48,
  wellPerformingViewsThreshold: 1000,
  extendedTrackingDays: 14,
};

export function defaultTrackingEndsAt(publishedAt: string) {
  return addMs(publishedAt, DEFAULT_PUBLICATION_TRACKING_RULE.minimumTrackingDays * DAY_MS);
}

export function extendedTrackingEndsAt(publication: PublicationRecord) {
  return addMs(publication.publishedAt, DEFAULT_PUBLICATION_TRACKING_RULE.extendedTrackingDays * DAY_MS);
}

export function resolveTrackingIntervalMs(publication: PublicationRecord, now: string) {
  const ageMs = new Date(now).getTime() - new Date(publication.publishedAt).getTime();
  return ageMs < DEFAULT_PUBLICATION_TRACKING_RULE.earlyWindowHours * HOUR_MS
    ? DEFAULT_PUBLICATION_TRACKING_RULE.earlyIntervalHours * HOUR_MS
    : DEFAULT_PUBLICATION_TRACKING_RULE.normalIntervalHours * HOUR_MS;
}

export function isPublicationMetricDue(
  publication: PublicationRecord,
  latestMetric: PublicationMetricRecord | undefined,
  now: string,
) {
  if (!latestMetric) {
    return true;
  }
  const elapsedMs = new Date(now).getTime() - new Date(latestMetric.capturedAt).getTime();
  return elapsedMs >= resolveTrackingIntervalMs(publication, now);
}

export function isPublicationTrackingExpired(publication: PublicationRecord, now: string) {
  return publication.trackingEndsAt ? new Date(publication.trackingEndsAt).getTime() <= new Date(now).getTime() : false;
}

export function isWellPerformingMetric(
  publication: PublicationRecord,
  metric: PublicationMetricRecord | CollectedPublicationMetrics,
) {
  if (publication.wellPerforming) {
    return false;
  }
  if ((metric.views ?? 0) < DEFAULT_PUBLICATION_TRACKING_RULE.wellPerformingViewsThreshold) {
    return false;
  }
  const metricAgeMs = new Date(metric.capturedAt).getTime() - new Date(publication.publishedAt).getTime();
  return metricAgeMs >= 0 && metricAgeMs <= DEFAULT_PUBLICATION_TRACKING_RULE.wellPerformingWindowHours * HOUR_MS;
}

function addMs(value: string, ms: number) {
  return new Date(new Date(value).getTime() + ms).toISOString();
}
