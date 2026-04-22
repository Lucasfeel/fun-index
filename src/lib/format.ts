import type { ConfidenceBand, FeedDomain, FreshnessState, MetricTone, SignalItem } from './types';

const relativeFormatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
const absoluteFormatter = new Intl.DateTimeFormat('en', {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

export function sortByUpdatedAt<T extends { updatedAt: string }>(items: T[]) {
  return [...items].sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
}

export function formatRelativeTime(updatedAt: string) {
  const elapsedMinutes = Math.round((Date.now() - Date.parse(updatedAt)) / 60000);

  if (elapsedMinutes < 1) {
    return 'just now';
  }

  if (elapsedMinutes < 60) {
    return relativeFormatter.format(-elapsedMinutes, 'minute');
  }

  const elapsedHours = Math.round(elapsedMinutes / 60);

  if (elapsedHours < 24) {
    return relativeFormatter.format(-elapsedHours, 'hour');
  }

  const elapsedDays = Math.round(elapsedHours / 24);
  return relativeFormatter.format(-elapsedDays, 'day');
}

export function formatAbsoluteTime(updatedAt: string) {
  return absoluteFormatter.format(new Date(updatedAt));
}

export function formatDelta(delta: number) {
  if (delta === 0) {
    return '0.0';
  }

  return `${delta > 0 ? '+' : ''}${delta.toFixed(1)}`;
}

export function getFreshnessState(updatedAt: string, cadenceHours: number): FreshnessState {
  const ageMs = Date.now() - Date.parse(updatedAt);
  const cadenceMs = cadenceHours * 60 * 60 * 1000;

  if (ageMs <= cadenceMs * 0.9) {
    return 'fresh';
  }

  if (ageMs <= cadenceMs * 1.7) {
    return 'aging';
  }

  return 'stale';
}

export function getScoreTone(score: number) {
  if (score <= 35) {
    return 'cool';
  }

  if (score >= 65) {
    return 'warm';
  }

  return 'neutral';
}

export function getMetricToneClass(tone: MetricTone) {
  if (tone === 'cool') {
    return 'metric-tone--cool';
  }

  if (tone === 'warm') {
    return 'metric-tone--warm';
  }

  return 'metric-tone--neutral';
}

export function getConfidenceLabel(confidenceBand: ConfidenceBand) {
  if (confidenceBand === 'high') {
    return 'High confidence';
  }

  if (confidenceBand === 'limited') {
    return 'Limited confidence';
  }

  return 'Moderate confidence';
}

export function getDomainEyebrow(item: SignalItem) {
  if (item.domain === 'pentagon') {
    return item.indexType === 'pizza' ? 'Pentagon / Pizza Index' : 'Pentagon / Gay Bar Index';
  }

  if (item.domain === 'psychology') {
    if (item.indicatorType === 'fear-greed') {
      return 'Psychology / Fear & Greed';
    }

    if (item.indicatorType === 'positioning-heat') {
      return 'Psychology / Positioning';
    }

    return 'Psychology / Breadth';
  }

  return 'SNS Feed / Reviewed';
}

export function getDomainKey(domain: FeedDomain) {
  if (domain === 'social') {
    return 'sns';
  }

  return domain;
}
