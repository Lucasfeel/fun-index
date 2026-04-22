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
    `${title} \uD56D\uBAA9\uC740 \uC544\uC9C1 \uACF5\uAC1C \uC2A4\uB0C5\uC0F7\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.`,
    '\uB370\uC774\uD130\uAC00 \uC5C6\uC5B4\uB3C4 \uD53C\uB4DC \uB808\uC774\uC544\uC6C3\uC740 \uC548\uC815\uC801\uC73C\uB85C \uC720\uC9C0\uB429\uB2C8\uB2E4.',
    '\uCD94\uD6C4 Supabase \uB370\uC774\uD130\uAC00 \uB4E4\uC5B4\uC624\uBA74 \uC790\uB3D9\uC73C\uB85C \uC2E4\uC2DC\uAC04 \uAC12\uC73C\uB85C \uBC14\uB01D\uB2C8\uB2E4.',
  ];
}

function toZeroBaseSignal<T extends SignalItem>(signal: T, updatedAt: string) {
  return {
    ...signal,
    subtitle: '\uCCAB \uACF5\uAC1C \uC2A4\uB0C5\uC0F7 \uB300\uAE30 \uC911',
    summary: '\uC544\uC9C1 \uACF5\uAC1C \uB370\uC774\uD130\uAC00 \uC5C6\uC5B4 \uCCAB \uC5C5\uB370\uC774\uD2B8\uAC00 \uB4E4\uC5B4\uC624\uAE30 \uC804\uAE4C\uC9C0 \uB300\uAE30 \uC0C1\uD0DC\uB85C \uD45C\uC2DC\uB429\uB2C8\uB2E4.',
    score: 0,
    classification: '\uB300\uAE30 \uC911',
    change: 0,
    updatedAt,
    confidenceBand: 'limited',
    freshnessNote: '\uC544\uC9C1 \uACF5\uAC1C\uB41C \uC2A4\uB0C5\uC0F7\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.',
    uncertaintyNote:
      '\uC0C1\uC704 \uD53C\uB4DC\uC5D0\uC11C \uACF5\uAC1C\uAC00 \uC2DC\uC791\uB420 \uB54C\uAE4C\uC9C0 \uC77D\uAE30 \uC804\uC6A9 UI\uB97C \uC548\uC815\uC801\uC73C\uB85C \uC720\uC9C0\uD558\uB294 \uAC12\uC785\uB2C8\uB2E4.',
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
      coverageLabel: '\uC544\uC9C1 \uC2E4\uC2DC\uAC04 \uCEE4\uBC84\uB9AC\uC9C0\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4',
    })),
    psychology: demoSignals.psychology.map((signal) => toZeroBaseSignal(signal, updatedAt)),
    social: demoSignals.social.map((signal) => ({
      ...toZeroBaseSignal(signal, updatedAt),
      sourceCount: 0,
      sources: ['\uCD9C\uCC98 \uC5C6\uC74C'],
      approvalNote:
        '\uC544\uC9C1 \uC2B9\uC778\uB41C SNS \uD56D\uBAA9\uC774 \uC5C6\uC5B4 \uB300\uAE30 \uC0C1\uD0DC\uB85C \uD45C\uC2DC\uB429\uB2C8\uB2E4.',
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
