import { parseIndicatorRows, parseSocialRows } from './adapters';
import { getDemoSignals } from './demoData';
import { sortByUpdatedAt } from './format';
import { applyLocalSignalOverrides } from './localOverrides';
import { getSupabaseClient, useDemoData } from './supabase';
import type { ConfidenceBand, PentagonSignal, PsychologySignal, SignalItem, SocialSignal } from './types';

const demoSignals = getDemoSignals();
const emptySignals = createEmptySignals();

interface PublicFeedCard {
  itemKey: string;
  title?: string;
  subtitle?: string;
  body?: string;
  content?: Record<string, unknown>;
  publishedAt?: string;
}

interface PublicFeedResponse {
  tab: string;
  generatedAt: string;
  cards: PublicFeedCard[];
}

function getPlaceholderTimestamp() {
  return new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
}

function toZeroMetrics(metrics: SignalItem['metrics']) {
  return metrics.map((metric) => ({
    ...metric,
    value: '0',
    tone: undefined,
  }));
}

function toZeroDrivers(title: string) {
  return [
    `${title} 항목은 아직 공개 스냅샷이 없습니다.`,
    '데이터가 없어도 피드 레이아웃은 안정적으로 유지됩니다.',
    '추후 Supabase 데이터가 들어오면 자동으로 실시간 값으로 바뀝니다.',
  ];
}

function toZeroBaseSignal<T extends SignalItem>(signal: T, updatedAt: string) {
  return {
    ...signal,
    subtitle: '첫 공개 스냅샷 대기 중',
    summary: '아직 공개 데이터가 없어 첫 업데이트가 들어오기 전까지 대기 상태로 표시됩니다.',
    score: 0,
    classification: '대기 중',
    change: 0,
    updatedAt,
    confidenceBand: 'limited',
    freshnessNote: '아직 공개된 스냅샷이 없습니다.',
    uncertaintyNote: '상위 피드에서 공개가 시작될 때까지 읽기 전용 UI를 안정적으로 유지하는 값입니다.',
    metrics: toZeroMetrics(signal.metrics),
    drivers: toZeroDrivers(signal.title),
  } as T;
}

function createEmptySignals() {
  const updatedAt = getPlaceholderTimestamp();

  return {
    pentagon: demoSignals.pentagon.map((signal) => ({
      ...toZeroBaseSignal(signal, updatedAt),
      sampleSize: 0,
      coverageLabel: '아직 실시간 커버리지가 없습니다',
    })),
    psychology: demoSignals.psychology.map((signal) => toZeroBaseSignal(signal, updatedAt)),
    social: demoSignals.social.map((signal) => ({
      ...toZeroBaseSignal(signal, updatedAt),
      sourceCount: 0,
      sources: ['출처 없음'],
      approvalNote: '아직 승인된 SNS 항목이 없어 대기 상태로 표시됩니다.',
    })),
  };
}

function mergeSignalsWithFallback<T extends SignalItem>(signals: T[], fallback: T[]) {
  const fallbackBySlug = new Map(fallback.map((signal) => [signal.slug, signal]));
  const liveBySlug = new Map(signals.map((signal) => [signal.slug, signal]));
  const extras = signals.filter((signal) => !fallbackBySlug.has(signal.slug));

  return sortByUpdatedAt([
    ...fallback.map((signal) => liveBySlug.get(signal.slug) ?? signal),
    ...extras,
  ]);
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

function replaceSlug(itemKey: string) {
  return itemKey.replaceAll(':', '-');
}

function toIndicatorRowFromCard(tab: 'pentagon' | 'psychology', card: PublicFeedCard) {
  const content = card.content ?? {};

  return {
    id: card.itemKey,
    slug: replaceSlug(card.itemKey),
    domain: tab,
    title: typeof content.title === 'string' ? content.title : card.title ?? card.itemKey,
    subtitle: typeof content.subtitle === 'string' ? content.subtitle : card.subtitle ?? '',
    summary:
      typeof content.summary === 'string'
        ? content.summary
        : typeof content.body === 'string'
          ? content.body
          : card.body ?? '',
    score:
      typeof content.score === 'number'
        ? content.score
        : typeof content.valueNumeric === 'number'
          ? content.valueNumeric
          : Number(content.score ?? content.valueNumeric ?? 0),
    classification:
      typeof content.classification === 'string'
        ? content.classification
        : typeof content.direction === 'string'
          ? content.direction
          : 'stable',
    change: Number(content.change ?? 0),
    updated_at: card.publishedAt ?? new Date().toISOString(),
    confidence_band: normalizeConfidenceBand(content.confidence),
    freshness_note: typeof content.freshnessNote === 'string' ? content.freshnessNote : undefined,
    uncertainty_note: typeof content.uncertaintyNote === 'string' ? content.uncertaintyNote : undefined,
    detail_path: `/${tab}/${replaceSlug(card.itemKey)}`,
    metrics: Array.isArray(content.metrics) ? content.metrics : [],
    drivers: Array.isArray(content.drivers) ? content.drivers : [],
    cadence_hours: Number(content.cadenceHours ?? 1),
    sample_size: Number(content.sampleSize ?? 0),
    coverage_label: typeof content.coverageLabel === 'string' ? content.coverageLabel : 'Aggregate sample',
  };
}

function toSocialRowFromCard(card: PublicFeedCard) {
  const content = card.content ?? {};

  return {
    id: card.itemKey,
    slug: replaceSlug(card.itemKey),
    title: typeof content.title === 'string' ? content.title : card.title ?? card.itemKey,
    subtitle: typeof content.subtitle === 'string' ? content.subtitle : card.subtitle ?? '',
    summary:
      typeof content.summary === 'string'
        ? content.summary
        : typeof content.body === 'string'
          ? content.body
          : card.body ?? '',
    score: Number(content.score ?? content.valueNumeric ?? 0),
    classification: typeof content.classification === 'string' ? content.classification : 'approved',
    change: Number(content.change ?? 0),
    updated_at: card.publishedAt ?? new Date().toISOString(),
    confidence_band: normalizeConfidenceBand(content.confidence),
    freshness_note: typeof content.freshnessNote === 'string' ? content.freshnessNote : undefined,
    uncertainty_note: typeof content.uncertaintyNote === 'string' ? content.uncertaintyNote : undefined,
    detail_path: `/sns/${replaceSlug(card.itemKey)}`,
    metrics: Array.isArray(content.metrics) ? content.metrics : [],
    drivers: Array.isArray(content.drivers) ? content.drivers : [],
    cadence_hours: Number(content.cadenceHours ?? 1),
    source_count: Number(content.sourceCount ?? 0),
    categories: Array.isArray(content.categories) ? content.categories : [],
    sources: Array.isArray(content.sourceItems) ? content.sourceItems : [],
    approval_note: typeof content.approvalNote === 'string' ? content.approvalNote : '',
  };
}

async function invokePublicFeed(functionName: 'public-feed-pentagon' | 'public-feed-psychology-v2' | 'public-feed-sns') {
  const result = await getSupabaseClient().functions.invoke(functionName, {
    body: {},
  });

  if (result.error) {
    throw result.error;
  }

  return result.data as PublicFeedResponse;
}

async function loadIndicatorSignalsFromFunctions(tab: 'pentagon' | 'psychology') {
  const functionName = tab === 'pentagon' ? 'public-feed-pentagon' : 'public-feed-psychology-v2';
  const payload = await invokePublicFeed(functionName);
  const rows = (payload.cards ?? []).map((card) => toIndicatorRowFromCard(tab, card));
  return sortByUpdatedAt(parseIndicatorRows(rows));
}

async function loadSocialSignalsFromFunctions() {
  const payload = await invokePublicFeed('public-feed-sns');
  const rows = (payload.cards ?? []).map((card) => toSocialRowFromCard(card));
  return sortByUpdatedAt(parseSocialRows(rows));
}

export async function fetchPentagonSignals(): Promise<PentagonSignal[]> {
  if (useDemoData) {
    return sortByUpdatedAt([...demoSignals.pentagon]);
  }

  try {
    const signals = await loadIndicatorSignalsFromFunctions('pentagon');
    return applyLocalSignalOverrides(mergeSignalsWithFallback(
      signals.filter((signal): signal is PentagonSignal => signal.domain === 'pentagon'),
      emptySignals.pentagon,
    ));
  } catch (error) {
    console.warn('Falling back after pentagon public feed read failed', error);
    return applyLocalSignalOverrides(mergeSignalsWithFallback([], emptySignals.pentagon));
  }
}

export async function fetchPsychologySignals(): Promise<PsychologySignal[]> {
  if (useDemoData) {
    return sortByUpdatedAt([...demoSignals.psychology]);
  }

  try {
    const signals = await loadIndicatorSignalsFromFunctions('psychology');
    return applyLocalSignalOverrides(mergeSignalsWithFallback(
      signals.filter((signal): signal is PsychologySignal => signal.domain === 'psychology'),
      emptySignals.psychology,
    ));
  } catch (error) {
    console.warn('Falling back after psychology public feed read failed', error);
    return applyLocalSignalOverrides(mergeSignalsWithFallback([], emptySignals.psychology));
  }
}

export async function fetchSocialSignals(): Promise<SocialSignal[]> {
  if (useDemoData) {
    return sortByUpdatedAt([...demoSignals.social]);
  }

  try {
    const signals = await loadSocialSignalsFromFunctions();
    return applyLocalSignalOverrides(mergeSignalsWithFallback(signals, emptySignals.social));
  } catch (error) {
    console.warn('Falling back after social public feed read failed', error);
    return applyLocalSignalOverrides(mergeSignalsWithFallback([], emptySignals.social));
  }
}

export async function fetchHomeSignals(): Promise<SignalItem[]> {
  const [pentagon, psychology, social] = await Promise.all([
    fetchPentagonSignals(),
    fetchPsychologySignals(),
    fetchSocialSignals(),
  ]);

  return sortByUpdatedAt<SignalItem>([...pentagon, ...psychology, ...social]);
}
