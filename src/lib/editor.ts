import { clearStoredAdminPassword, getStoredAdminPassword, setStoredAdminPassword } from './adminAccess';
import { saveLocalSignalOverride } from './localOverrides';
import { getSupabaseClient, useDemoData } from './supabase';
import type { ConfidenceBand, FeedMetric, PentagonSignal, SignalItem, SocialSignal } from './types';

const INLINE_EDIT_REASON = 'mini-app inline edit';
const DEFAULT_METRIC_SLOTS = 3;

type EditableTabSlug = 'pentagon' | 'psychology' | 'sns_feed';

export interface SignalMetricDraft {
  label: string;
  value: string;
  tone?: FeedMetric['tone'];
}

export interface SignalEditorDraft {
  title: string;
  subtitle: string;
  summary: string;
  classification: string;
  score: string;
  change: string;
  metrics: SignalMetricDraft[];
  driversText: string;
  categoriesText: string;
  sourcesText: string;
  approvalNote: string;
  coverageLabel: string;
  sampleSize: string;
}

export type SocialSignalEditorDraft = SignalEditorDraft;

function isSocialSignal(item: SignalItem): item is SocialSignal {
  return item.domain === 'social';
}

function isPentagonSignal(item: SignalItem): item is PentagonSignal {
  return item.domain === 'pentagon';
}

function ensureMetricSlots(metrics: FeedMetric[]): SignalMetricDraft[] {
  const seeded: SignalMetricDraft[] = metrics.map((metric) => ({
    label: metric.label,
    value: metric.value,
    tone: metric.tone,
  }));

  while (seeded.length < DEFAULT_METRIC_SLOTS) {
    seeded.push({
      label: '',
      value: '',
    });
  }

  return seeded.slice(0, Math.max(DEFAULT_METRIC_SLOTS, metrics.length));
}

function splitList(value: string) {
  return value
    .split(/\r?\n|,/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function compactMetrics(metrics: SignalMetricDraft[]) {
  return metrics
    .map((metric) => ({
      label: metric.label.trim(),
      value: metric.value.trim(),
      tone: metric.tone,
    }))
    .filter((metric) => metric.label.length > 0 && metric.value.length > 0);
}

function parseNumber(value: string, fallback: number) {
  const trimmed = value.trim();
  if (!trimmed) {
    return fallback;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getTabSlug(item: SignalItem): EditableTabSlug {
  if (item.domain === 'social') {
    return 'sns_feed';
  }

  return item.domain;
}

function getIndicatorItemKey(item: SignalItem) {
  if (item.domain === 'pentagon') {
    return `pentagon:${item.slug}`;
  }

  if (item.slug === 'us-stock-fear-greed') {
    return 'psychology:fear-greed';
  }

  if (item.slug === 'crypto-fear-greed') {
    return 'psychology:positioning-heat';
  }

  if (item.slug === 'kr-stock-fear-greed') {
    return 'psychology:market-breadth';
  }

  return `psychology:${item.slug}`;
}

function getItemKey(item: SignalItem) {
  if (item.domain === 'social') {
    return `sns:${item.slug}`;
  }

  return getIndicatorItemKey(item);
}

function confidenceBandToNumber(confidenceBand: ConfidenceBand) {
  if (confidenceBand === 'high') {
    return 0.9;
  }

  if (confidenceBand === 'medium') {
    return 0.65;
  }

  return 0.35;
}

async function resolveFunctionErrorMessage(error: unknown, fallbackMessage: string) {
  if (error && typeof error === 'object' && 'context' in error) {
    const response = (error as { context?: Response }).context;
    if (response instanceof Response) {
      try {
        const payload = (await response.clone().json()) as { error?: { message?: unknown }; message?: unknown };
        const message =
          typeof payload.error?.message === 'string'
            ? payload.error.message
            : typeof payload.message === 'string'
              ? payload.message
              : null;

        if (message && message.trim().length > 0) {
          return {
            status: response.status,
            message,
          };
        }
      } catch {
        // no-op
      }

      return {
        status: response.status,
        message: fallbackMessage,
      };
    }
  }

  if (error instanceof Error) {
    if (error.message === 'Failed to fetch') {
      return {
        status: null,
        message: '편집 서버에 연결하지 못했습니다.',
      };
    }

    if (error.message !== 'Edge Function returned a non-2xx status code') {
      return {
        status: null,
        message: error.message,
      };
    }
  }

  return {
    status: null,
    message: fallbackMessage,
  };
}

function toIndicatorPayload(item: SignalItem, draft: SignalEditorDraft) {
  const metrics = compactMetrics(draft.metrics);

  const payload: Record<string, unknown> = {
    title: draft.title.trim(),
    subtitle: draft.subtitle.trim(),
    summary: draft.summary.trim(),
    body: draft.summary.trim(),
    classification: draft.classification.trim(),
    direction: draft.classification.trim(),
    score: parseNumber(draft.score, item.score),
    valueNumeric: parseNumber(draft.score, item.score),
    change: parseNumber(draft.change, item.change),
    confidence: confidenceBandToNumber(item.confidenceBand),
    metrics,
    drivers: splitList(draft.driversText),
    cadenceHours: item.cadenceHours,
  };

  if (isPentagonSignal(item)) {
    payload.coverageLabel = draft.coverageLabel.trim() || item.coverageLabel;
    payload.sampleSize = parseNumber(draft.sampleSize, item.sampleSize);
  }

  return payload;
}

function toSocialPayload(item: SocialSignal, draft: SignalEditorDraft) {
  const sourceItems = splitList(draft.sourcesText);
  const metrics = compactMetrics(draft.metrics);

  return {
    title: draft.title.trim(),
    subtitle: draft.subtitle.trim(),
    summary: draft.summary.trim(),
    body: draft.summary.trim(),
    classification: draft.classification.trim(),
    score: parseNumber(draft.score, item.score),
    change: parseNumber(draft.change, item.change),
    confidence: confidenceBandToNumber(item.confidenceBand),
    metrics,
    drivers: splitList(draft.driversText),
    categories: splitList(draft.categoriesText),
    sourceItems,
    sourceCount: sourceItems.length,
    approvalNote: draft.approvalNote.trim(),
  };
}

function persistLocalOverride(item: SignalItem, draft: SignalEditorDraft) {
  const updatedAt = new Date().toISOString();

  saveLocalSignalOverride(item, {
    title: draft.title.trim() || item.title,
    subtitle: draft.subtitle.trim(),
    summary: draft.summary.trim(),
    classification: draft.classification.trim() || item.classification,
    score: parseNumber(draft.score, item.score),
    change: parseNumber(draft.change, item.change),
    metrics: compactMetrics(draft.metrics),
    drivers: splitList(draft.driversText),
    updatedAt,
    ...(isSocialSignal(item)
      ? {
          categories: splitList(draft.categoriesText),
          sources: splitList(draft.sourcesText),
          approvalNote: draft.approvalNote.trim(),
        }
      : {}),
    ...(isPentagonSignal(item)
      ? {
          coverageLabel: draft.coverageLabel.trim() || item.coverageLabel,
          sampleSize: parseNumber(draft.sampleSize, item.sampleSize),
        }
      : {}),
  });
}

export function canEditSignals() {
  return !useDemoData;
}

export function canEditSocialSignals() {
  return canEditSignals();
}

export function hasVerifiedAdminPassword() {
  return getStoredAdminPassword().trim().length > 0;
}

export function createSignalEditorDraft(item: SignalItem): SignalEditorDraft {
  return {
    title: item.title,
    subtitle: item.subtitle,
    summary: item.summary,
    classification: item.classification,
    score: String(item.score),
    change: String(item.change),
    metrics: ensureMetricSlots(item.metrics),
    driversText: item.drivers.join('\n'),
    categoriesText: isSocialSignal(item) ? item.categories.join(', ') : '',
    sourcesText: isSocialSignal(item) ? item.sources.join('\n') : '',
    approvalNote: isSocialSignal(item) ? item.approvalNote : '',
    coverageLabel: isPentagonSignal(item) ? item.coverageLabel : '',
    sampleSize: isPentagonSignal(item) ? String(item.sampleSize) : '',
  };
}

export function createSocialSignalEditorDraft(item: SocialSignal): SocialSignalEditorDraft {
  return createSignalEditorDraft(item);
}

export async function verifyEditorPassword(password: string) {
  if (!canEditSignals()) {
    throw new Error('현재는 라이브 편집을 사용할 수 없습니다.');
  }

  const trimmedPassword = password.trim();
  if (!trimmedPassword) {
    throw new Error('관리자 비밀번호를 입력해 주세요.');
  }

  const result = await getSupabaseClient().functions.invoke('admin-auth-check', {
    body: {},
    headers: {
      'x-admin-password': trimmedPassword,
    },
  });

  if (result.error) {
    const failure = await resolveFunctionErrorMessage(result.error, '관리자 비밀번호를 확인하지 못했습니다.');
    throw new Error(failure.message);
  }

  setStoredAdminPassword(trimmedPassword);
  return result.data;
}

export async function publishSignalEdit(item: SignalItem, draft: SignalEditorDraft) {
  if (!canEditSignals()) {
    throw new Error('현재는 라이브 편집을 사용할 수 없습니다.');
  }

  const password = getStoredAdminPassword().trim();
  if (!password) {
    throw new Error('관리자 비밀번호를 먼저 확인해 주세요.');
  }

  const payload = isSocialSignal(item) ? toSocialPayload(item, draft) : toIndicatorPayload(item, draft);
  const result = await getSupabaseClient().functions.invoke('admin-override-publish', {
    body: {
      itemKey: getItemKey(item),
      tabSlug: getTabSlug(item),
      payload,
      reason: INLINE_EDIT_REASON,
    },
    headers: {
      'x-admin-password': password,
    },
  });

  if (result.error) {
    const failure = await resolveFunctionErrorMessage(result.error, '카드 편집 내용을 저장하지 못했습니다.');
    if (failure.status === 401 || failure.status === 403) {
      clearStoredAdminPassword();
    }

    throw new Error(failure.message);
  }

  persistLocalOverride(item, draft);
  return result.data;
}

export async function publishSocialSignalEdit(item: SocialSignal, draft: SignalEditorDraft) {
  return publishSignalEdit(item, draft);
}
