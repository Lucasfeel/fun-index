import { clearStoredAdminPassword, getStoredAdminPassword, setStoredAdminPassword } from './adminAccess';
import { getSupabaseClient, useDemoData } from './supabase';
import type { ConfidenceBand, FeedMetric, SocialSignal } from './types';

const INLINE_EDIT_REASON = 'mini-app inline edit';
const DEFAULT_METRIC_SLOTS = 3;

export interface SocialSignalMetricDraft {
  label: string;
  value: string;
  tone?: FeedMetric['tone'];
}

export interface SocialSignalEditorDraft {
  title: string;
  subtitle: string;
  summary: string;
  classification: string;
  score: string;
  change: string;
  metrics: SocialSignalMetricDraft[];
  driversText: string;
  categoriesText: string;
  sourcesText: string;
  approvalNote: string;
}

function ensureMetricSlots(metrics: FeedMetric[]): SocialSignalMetricDraft[] {
  const seeded: SocialSignalMetricDraft[] = metrics.map((metric) => ({
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

function parseNumber(value: string, fallback: number) {
  const trimmed = value.trim();
  if (!trimmed) {
    return fallback;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeSocialSlug(slug: string) {
  return slug.startsWith('sns-') ? slug.slice('sns-'.length) : slug;
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

      try {
        const text = (await response.clone().text()).trim();
        if (text.length > 0) {
          return {
            status: response.status,
            message: text,
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

export function canEditSocialSignals() {
  return !useDemoData;
}

export function hasVerifiedAdminPassword() {
  return getStoredAdminPassword().trim().length > 0;
}

export function createSocialSignalEditorDraft(item: SocialSignal): SocialSignalEditorDraft {
  return {
    title: item.title,
    subtitle: item.subtitle,
    summary: item.summary,
    classification: item.classification,
    score: String(item.score),
    change: String(item.change),
    metrics: ensureMetricSlots(item.metrics),
    driversText: item.drivers.join('\n'),
    categoriesText: item.categories.join(', '),
    sourcesText: item.sources.join('\n'),
    approvalNote: item.approvalNote,
  };
}

export async function verifyEditorPassword(password: string) {
  if (!canEditSocialSignals()) {
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

export async function publishSocialSignalEdit(item: SocialSignal, draft: SocialSignalEditorDraft) {
  if (!canEditSocialSignals()) {
    throw new Error('현재는 라이브 편집을 사용할 수 없습니다.');
  }

  const password = getStoredAdminPassword().trim();
  if (!password) {
    throw new Error('관리자 비밀번호를 먼저 확인해 주세요.');
  }

  const sourceItems = splitList(draft.sourcesText);
  const metrics = draft.metrics
    .map((metric) => ({
      label: metric.label.trim(),
      value: metric.value.trim(),
      tone: metric.tone,
    }))
    .filter((metric) => metric.label.length > 0 && metric.value.length > 0);

  const payload = {
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

  const result = await getSupabaseClient().functions.invoke('admin-override-publish', {
    body: {
      itemKey: `sns:${normalizeSocialSlug(item.slug)}`,
      tabSlug: 'sns_feed',
      payload,
      reason: INLINE_EDIT_REASON,
    },
    headers: {
      'x-admin-password': password,
    },
  });

  if (result.error) {
    const failure = await resolveFunctionErrorMessage(result.error, 'SNS 편집 내용을 저장하지 못했습니다.');
    if (failure.status === 401 || failure.status === 403) {
      clearStoredAdminPassword();
    }

    throw new Error(failure.message);
  }

  return result.data;
}
