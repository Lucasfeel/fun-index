import { parseIndicatorRows, parseSocialRows } from './adapters';
import { getDemoSignals } from './demoData';
import { sortByUpdatedAt } from './format';
import { getSupabaseClient, supabaseViews, useDemoData } from './supabase';
import type { PentagonSignal, PsychologySignal, SignalItem, SocialSignal } from './types';

const demoSignals = getDemoSignals();
const emptySignals = createEmptySignals();

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
    `${title} has not published a public snapshot yet.`,
    'The card stays visible with zero values so the feed layout remains stable.',
    'Once data lands in Supabase, the live snapshot will replace this placeholder automatically.',
  ];
}

function toZeroBaseSignal<T extends SignalItem>(signal: T, updatedAt: string) {
  return {
    ...signal,
    subtitle: 'Awaiting first public snapshot',
    summary: 'No published data is available yet, so this card stays pinned to zero until the first approved update arrives.',
    score: 0,
    classification: 'No data yet',
    change: 0,
    updatedAt,
    confidenceBand: 'limited',
    freshnessNote: 'No public snapshot has been published yet.',
    uncertaintyNote: 'Zero-value placeholders keep the read-only UI stable until the upstream feed starts publishing.',
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
      coverageLabel: 'No live coverage yet',
    })),
    psychology: demoSignals.psychology.map((signal) => toZeroBaseSignal(signal, updatedAt)),
    social: demoSignals.social.map((signal) => ({
      ...toZeroBaseSignal(signal, updatedAt),
      sourceCount: 0,
      sources: ['No sources yet'],
      approvalNote:
        'No approved social items are published yet. This placeholder remains visible so the feed shell stays readable.',
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

async function loadIndicatorSignals() {
  if (useDemoData) {
    return sortByUpdatedAt([...demoSignals.pentagon, ...demoSignals.psychology]);
  }

  const { data, error } = await getSupabaseClient()
    .from(supabaseViews.indicators)
    .select('*')
    .order('updated_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return sortByUpdatedAt(parseIndicatorRows(data));
}

export async function fetchPentagonSignals(): Promise<PentagonSignal[]> {
  if (useDemoData) {
    return sortByUpdatedAt([...demoSignals.pentagon]);
  }

  const signals = await loadIndicatorSignals();
  return mergeSignalsWithFallback(
    signals.filter((signal): signal is PentagonSignal => signal.domain === 'pentagon'),
    emptySignals.pentagon,
  );
}

export async function fetchPsychologySignals(): Promise<PsychologySignal[]> {
  if (useDemoData) {
    return sortByUpdatedAt([...demoSignals.psychology]);
  }

  const signals = await loadIndicatorSignals();
  return mergeSignalsWithFallback(
    signals.filter((signal): signal is PsychologySignal => signal.domain === 'psychology'),
    emptySignals.psychology,
  );
}

export async function fetchSocialSignals(): Promise<SocialSignal[]> {
  if (useDemoData) {
    return sortByUpdatedAt([...demoSignals.social]);
  }

  const { data, error } = await getSupabaseClient()
    .from(supabaseViews.social)
    .select('*')
    .order('updated_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return mergeSignalsWithFallback(parseSocialRows(data), emptySignals.social);
}

export async function fetchHomeSignals(): Promise<SignalItem[]> {
  const [pentagon, psychology, social] = await Promise.all([
    fetchPentagonSignals(),
    fetchPsychologySignals(),
    fetchSocialSignals(),
  ]);

  return sortByUpdatedAt<SignalItem>([...pentagon, ...psychology, ...social]).slice(0, 8);
}
