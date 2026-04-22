import { clearStoredAdminPassword, getStoredAdminPassword } from './adminAccess';
import { hasLiveSupabaseConfig, supabase } from './supabase';
import type { AdminSignalItem, ConfidenceBand, FeedMetric } from './feedTypes';

export interface FeedEditorDraft {
  title: string;
  subtitle: string;
  classification: string;
  summary: string;
  score: string;
  change: string;
  coverageLabel: string;
  sampleSize: string;
  categoriesText: string;
  sourcesText: string;
  approvalNote: string;
}

function confidenceBandToNumber(value: ConfidenceBand) {
  if (value === 'high') {
    return 0.9;
  }

  if (value === 'medium') {
    return 0.65;
  }

  return 0.35;
}

function parseNumber(value: string, fallback: number) {
  const trimmed = value.trim();
  if (!trimmed) {
    return fallback;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function splitList(value: string) {
  return value
    .split(/\r?\n|,/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function cloneMetrics(metrics: FeedMetric[]) {
  return metrics.map((metric) => ({
    label: metric.label,
    value: metric.value,
    tone: metric.tone,
  }));
}

async function resolveFunctionErrorMessage(error: unknown, fallbackMessage: string) {
  if (error && typeof error === 'object' && 'context' in error) {
    const response = (error as { context?: Response }).context;
    if (response instanceof Response) {
      try {
        const payload = (await response.clone().json()) as { message?: unknown; error?: { message?: unknown } };
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
        message: '관리자 서버에 연결하지 못했습니다.',
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

export function createFeedEditorDraft(item: AdminSignalItem): FeedEditorDraft {
  return {
    title: item.title,
    subtitle: item.subtitle,
    classification: item.classification,
    summary: item.summary,
    score: String(item.score),
    change: String(item.change),
    coverageLabel: item.domain === 'pentagon' ? item.coverageLabel : '',
    sampleSize: item.domain === 'pentagon' ? String(item.sampleSize) : '',
    categoriesText: item.domain === 'social' ? item.categories.join(', ') : '',
    sourcesText: item.domain === 'social' ? item.sources.join('\n') : '',
    approvalNote: item.domain === 'social' ? item.approvalNote : '',
  };
}

function buildPayload(item: AdminSignalItem, draft: FeedEditorDraft) {
  const title = draft.title.trim() || item.title;
  const subtitle = draft.subtitle.trim();
  const classification = draft.classification.trim() || item.classification;
  const summary = draft.summary.trim() || item.summary;
  const score = parseNumber(draft.score, item.score);
  const change = parseNumber(draft.change, item.change);

  const payload: Record<string, unknown> = {
    title,
    subtitle,
    summary,
    body: summary,
    classification,
    direction: classification,
    score,
    valueNumeric: score,
    change,
    confidence: confidenceBandToNumber(item.confidenceBand),
    metrics: cloneMetrics(item.metrics),
    drivers: [...item.drivers],
    cadenceHours: item.cadenceHours,
  };

  if (item.domain === 'pentagon') {
    payload.coverageLabel = draft.coverageLabel.trim() || item.coverageLabel;
    payload.sampleSize = parseNumber(draft.sampleSize, item.sampleSize);
  }

  if (item.domain === 'social') {
    const sourceItems = splitList(draft.sourcesText);
    payload.categories = splitList(draft.categoriesText);
    payload.sourceItems = sourceItems;
    payload.sourceCount = sourceItems.length;
    payload.approvalNote = draft.approvalNote.trim() || item.approvalNote;
  }

  return payload;
}

export async function publishFeedEdit(item: AdminSignalItem, draft: FeedEditorDraft) {
  if (!hasLiveSupabaseConfig || !supabase) {
    return {
      demo: true,
    };
  }

  const password = getStoredAdminPassword().trim();
  if (!password) {
    throw new Error('관리자 비밀번호를 다시 입력해 주세요.');
  }

  const result = await supabase.functions.invoke('admin-override-publish', {
    body: {
      itemKey: item.itemKey,
      tabSlug: item.tabSlug,
      payload: buildPayload(item, draft),
      reason: 'admin side panel edit',
    },
    headers: {
      'x-admin-password': password,
    },
  });

  if (result.error) {
    const failure = await resolveFunctionErrorMessage(result.error, '편집 내용을 저장하지 못했습니다.');
    if (failure.status === 401 || failure.status === 403) {
      clearStoredAdminPassword();
    }

    throw new Error(failure.message);
  }

  return result.data;
}
