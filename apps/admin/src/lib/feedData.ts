import { hasLiveSupabaseConfig, supabase } from './supabase';
import type {
  AdminSignalItem,
  ConfidenceBand,
  FeedMetric,
  FeedSnapshot,
  PentagonSignalItem,
  PsychologySignalItem,
  SocialSignalItem,
} from './feedTypes';

interface PublicFeedCard {
  itemKey: string;
  title?: string;
  subtitle?: string;
  body?: string;
  publishedAt?: string;
  content?: Record<string, unknown>;
}

interface PublicFeedResponse {
  cards?: PublicFeedCard[];
}

function hoursAgo(hours: number) {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

function sortByUpdatedAt<T extends { updatedAt: string }>(items: T[]) {
  return [...items].sort((left, right) => {
    return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
  });
}

function toStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : String(entry)))
    .filter(Boolean);
}

function toMetrics(value: unknown): FeedMetric[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const metrics: FeedMetric[] = [];

  value.forEach((entry) => {
    if (!entry || typeof entry !== 'object') {
      return;
    }

    const record = entry as Record<string, unknown>;
    const label = typeof record.label === 'string' ? record.label.trim() : '';
    const metricValue =
      typeof record.value === 'string' || typeof record.value === 'number' ? String(record.value).trim() : '';

    if (!label || !metricValue) {
      return;
    }

    const tone = record.tone === 'cool' || record.tone === 'neutral' || record.tone === 'warm' ? record.tone : undefined;

    metrics.push({
      label,
      value: metricValue,
      tone,
    });
  });

  return metrics;
}

function toNumber(value: unknown, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  return fallback;
}

function normalizeConfidenceBand(value: unknown): ConfidenceBand {
  const numericValue = typeof value === 'number' ? value : Number(value);

  if (Number.isFinite(numericValue)) {
    if (numericValue >= 0.8) {
      return 'high';
    }

    if (numericValue >= 0.5) {
      return 'medium';
    }
  }

  if (value === 'high' || value === 'medium' || value === 'limited') {
    return value;
  }

  return 'limited';
}

function stripPrefix(value: string, prefix: string) {
  return value.startsWith(prefix) ? value.slice(prefix.length) : value;
}

function replaceSlug(itemKey: string) {
  return itemKey.replaceAll(':', '-');
}

function normalizeIndicatorSlug(domain: 'pentagon' | 'psychology', slug: string) {
  const baseSlug = domain === 'pentagon' ? stripPrefix(slug, 'pentagon-') : stripPrefix(slug, 'psychology-');

  if (domain !== 'psychology') {
    return baseSlug;
  }

  if (baseSlug === 'fear-greed') {
    return 'us-stock-fear-greed';
  }

  if (baseSlug === 'positioning-heat') {
    return 'crypto-fear-greed';
  }

  if (baseSlug === 'breadth-stress' || baseSlug === 'market-breadth') {
    return 'kr-stock-fear-greed';
  }

  return baseSlug;
}

function normalizeSocialSlug(slug: string) {
  return stripPrefix(slug, 'sns-');
}

function createFallbackPentagonSignal(
  id: string,
  title: string,
  coverageLabel: string,
): PentagonSignalItem {
  return {
    id,
    slug: id,
    itemKey: `pentagon:${id}`,
    tabSlug: 'pentagon',
    domain: 'pentagon',
    title,
    subtitle: '',
    summary: '첫 공개 데이터 대기 중',
    score: 0,
    classification: '대기',
    change: 0,
    updatedAt: hoursAgo(2),
    confidenceBand: 'limited',
    metrics: [],
    drivers: [],
    cadenceHours: 1,
    coverageLabel,
    sampleSize: 0,
  };
}

function createFallbackPsychologySignal(id: string, itemKey: string, title: string): PsychologySignalItem {
  return {
    id,
    slug: id,
    itemKey,
    tabSlug: 'psychology',
    domain: 'psychology',
    title,
    subtitle: '',
    summary: '첫 공개 데이터 대기 중',
    score: 0,
    classification: '대기',
    change: 0,
    updatedAt: hoursAgo(2),
    confidenceBand: 'limited',
    metrics: [],
    drivers: [],
    cadenceHours: 1,
  };
}

function createFallbackSocialSignal(
  id: string,
  title: string,
  categories: string[],
): SocialSignalItem {
  return {
    id,
    slug: id,
    itemKey: `sns:${id}`,
    tabSlug: 'sns_feed',
    domain: 'social',
    title,
    subtitle: '',
    summary: '첫 공개 데이터 대기 중',
    score: 0,
    classification: '대기',
    change: 0,
    updatedAt: hoursAgo(2),
    confidenceBand: 'limited',
    metrics: [],
    drivers: [],
    cadenceHours: 1,
    sourceCount: 0,
    categories,
    sources: [],
    approvalNote: '검토 후 노출됩니다.',
  };
}

const fallbackSignals = {
  pentagon: [
    createFallbackPentagonSignal('pizza-index', '피자 지수', '도시 전체'),
    createFallbackPentagonSignal('gay-bar-index', '바 지수', '도시 전체'),
  ],
  psychology: [
    createFallbackPsychologySignal('us-stock-fear-greed', 'psychology:fear-greed', '미국주식 공탐지수'),
    createFallbackPsychologySignal('crypto-fear-greed', 'psychology:positioning-heat', '코인 공탐지수'),
    createFallbackPsychologySignal('kr-stock-fear-greed', 'psychology:market-breadth', '한국주식 공탐지수'),
  ],
  social: [
    createFallbackSocialSignal('trump', '트럼프', ['트럼프']),
    createFallbackSocialSignal('elon', '일론', ['일론']),
    createFallbackSocialSignal('kr-stock-community', '국내 주식 커뮤니티', ['국내 주식 커뮤니티']),
    createFallbackSocialSignal('global-stock-community', '해외주식 커뮤니티', ['해외주식 커뮤니티']),
  ],
} satisfies {
  pentagon: PentagonSignalItem[];
  psychology: PsychologySignalItem[];
  social: SocialSignalItem[];
};

function mergeWithFallback<T extends AdminSignalItem>(liveItems: T[], fallbackItems: T[]) {
  const liveBySlug = new Map(liveItems.map((item) => [item.slug, item]));

  return sortByUpdatedAt(
    fallbackItems.map((item) => liveBySlug.get(item.slug) ?? item),
  );
}

function toIndicatorSignal(
  tab: 'pentagon' | 'psychology',
  card: PublicFeedCard,
): PentagonSignalItem | PsychologySignalItem {
  const content = card.content ?? {};
  const rawSlug = replaceSlug(card.itemKey);
  const slug = normalizeIndicatorSlug(tab, rawSlug);
  const base = {
    id: card.itemKey,
    slug,
    itemKey: card.itemKey,
    tabSlug: tab,
    domain: tab,
    title: typeof content.title === 'string' ? content.title : card.title ?? slug,
    subtitle: typeof content.subtitle === 'string' ? content.subtitle : card.subtitle ?? '',
    summary:
      typeof content.summary === 'string'
        ? content.summary
        : typeof content.body === 'string'
          ? content.body
          : card.body ?? '',
    score: toNumber(content.score ?? content.valueNumeric, 0),
    classification:
      typeof content.classification === 'string'
        ? content.classification
        : typeof content.direction === 'string'
          ? content.direction
          : '대기',
    change: toNumber(content.change, 0),
    updatedAt: card.publishedAt ?? new Date().toISOString(),
    confidenceBand: normalizeConfidenceBand(content.confidence),
    metrics: toMetrics(content.metrics),
    drivers: toStringArray(content.drivers),
    cadenceHours: toNumber(content.cadenceHours, 1),
  } as const;

  if (tab === 'pentagon') {
    return {
      ...base,
      domain: 'pentagon',
      coverageLabel:
        typeof content.coverageLabel === 'string' && content.coverageLabel.trim().length > 0
          ? content.coverageLabel
          : '도시 전체',
      sampleSize: toNumber(content.sampleSize, 0),
    };
  }

  return {
    ...base,
    domain: 'psychology',
  };
}

function toSocialSignal(card: PublicFeedCard): SocialSignalItem {
  const content = card.content ?? {};

  return {
    id: card.itemKey,
    slug: normalizeSocialSlug(replaceSlug(card.itemKey)),
    itemKey: card.itemKey,
    tabSlug: 'sns_feed',
    domain: 'social',
    title: typeof content.title === 'string' ? content.title : card.title ?? card.itemKey,
    subtitle: typeof content.subtitle === 'string' ? content.subtitle : card.subtitle ?? '',
    summary:
      typeof content.summary === 'string'
        ? content.summary
        : typeof content.body === 'string'
          ? content.body
          : card.body ?? '',
    score: toNumber(content.score ?? content.valueNumeric, 0),
    classification: typeof content.classification === 'string' ? content.classification : '대기',
    change: toNumber(content.change, 0),
    updatedAt: card.publishedAt ?? new Date().toISOString(),
    confidenceBand: normalizeConfidenceBand(content.confidence),
    metrics: toMetrics(content.metrics),
    drivers: toStringArray(content.drivers),
    cadenceHours: toNumber(content.cadenceHours, 1),
    sourceCount: toNumber(content.sourceCount, 0),
    categories: toStringArray(content.categories),
    sources: toStringArray(content.sourceItems),
    approvalNote:
      typeof content.approvalNote === 'string' && content.approvalNote.trim().length > 0
        ? content.approvalNote
        : '검토 후 노출됩니다.',
  };
}

async function invokePublicFeed(functionName: 'public-feed-pentagon' | 'public-feed-psychology-v2' | 'public-feed-sns') {
  if (!hasLiveSupabaseConfig || !supabase) {
    return null;
  }

  const result = await supabase.functions.invoke(functionName, {
    body: {},
  });

  if (result.error) {
    throw result.error;
  }

  return (result.data ?? null) as PublicFeedResponse | null;
}

async function fetchPentagonSignals() {
  if (!hasLiveSupabaseConfig || !supabase) {
    return fallbackSignals.pentagon;
  }

  try {
    const payload = await invokePublicFeed('public-feed-pentagon');
    const liveItems = (payload?.cards ?? []).map((card) => toIndicatorSignal('pentagon', card));
    return mergeWithFallback(
      liveItems.filter((item): item is PentagonSignalItem => item.domain === 'pentagon'),
      fallbackSignals.pentagon,
    );
  } catch (error) {
    console.warn('펜타곤 피드를 불러오지 못해 기본값을 사용합니다.', error);
    return fallbackSignals.pentagon;
  }
}

async function fetchPsychologySignals() {
  if (!hasLiveSupabaseConfig || !supabase) {
    return fallbackSignals.psychology;
  }

  try {
    const payload = await invokePublicFeed('public-feed-psychology-v2');
    const liveItems = (payload?.cards ?? []).map((card) => toIndicatorSignal('psychology', card));
    return mergeWithFallback(
      liveItems.filter((item): item is PsychologySignalItem => item.domain === 'psychology'),
      fallbackSignals.psychology,
    );
  } catch (error) {
    console.warn('심리 피드를 불러오지 못해 기본값을 사용합니다.', error);
    return fallbackSignals.psychology;
  }
}

async function fetchSocialSignals() {
  if (!hasLiveSupabaseConfig || !supabase) {
    return fallbackSignals.social;
  }

  try {
    const payload = await invokePublicFeed('public-feed-sns');
    const liveItems = (payload?.cards ?? []).map((card) => toSocialSignal(card));
    return mergeWithFallback(liveItems, fallbackSignals.social);
  } catch (error) {
    console.warn('SNS 피드를 불러오지 못해 기본값을 사용합니다.', error);
    return fallbackSignals.social;
  }
}

export async function fetchFeedSnapshot(): Promise<FeedSnapshot> {
  const [pentagon, psychology, social] = await Promise.all([
    fetchPentagonSignals(),
    fetchPsychologySignals(),
    fetchSocialSignals(),
  ]);

  return {
    pentagon,
    psychology,
    social,
    home: sortByUpdatedAt<AdminSignalItem>([...pentagon, ...psychology, ...social]),
  };
}
