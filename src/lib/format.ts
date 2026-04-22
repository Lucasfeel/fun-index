import type { ConfidenceBand, FeedDomain, FreshnessState, MetricTone, SignalItem } from './types';

const relativeFormatter = new Intl.RelativeTimeFormat('ko', { numeric: 'auto' });
const absoluteFormatter = new Intl.DateTimeFormat('ko-KR', {
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
    return '방금 전';
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
    return '높음';
  }

  if (confidenceBand === 'limited') {
    return '낮음';
  }

  return '보통';
}

export function getDomainEyebrow(item: SignalItem) {
  if (item.domain === 'pentagon') {
    return item.indexType === 'pizza' ? '펜타곤 / 피자 지수' : '펜타곤 / 바 지수';
  }

  if (item.domain === 'psychology') {
    if (item.indicatorType === 'us-stock-fear-greed') {
      return '심리 / 미국주식 공탐';
    }

    if (item.indicatorType === 'crypto-fear-greed') {
      return '심리 / 코인 공탐';
    }

    return '심리 / 한국주식 공탐';
  }

  return 'SNS 피드 / 검토 완료';
}

export function getDomainKey(domain: FeedDomain) {
  if (domain === 'social') {
    return 'sns';
  }

  return domain;
}
