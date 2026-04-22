import type {
  AdminOverridePublishRequest,
  AdminOverridePublishResponse,
  CollectionJobRecord,
  DashboardSnapshot,
  FeedLayoutItemRecord,
  MetricTone,
  ProviderRecord,
  ReviewQueueItem,
  RunSummary,
  SnsAdminContentRecord,
  SnsAdminItemRecord,
  SnsAdminMetricRecord,
} from './shared-types';

import {
  demoDashboard,
  demoFeedLayout,
  demoJobs,
  demoProviders,
  demoReviewQueue,
  demoRuns,
  demoSnsControlItems,
} from './demoData';
import { clearStoredAdminPassword, getStoredAdminPassword } from './adminAccess';
import { hasLiveSupabaseConfig, supabase } from './supabase';

function formatError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return '알 수 없는 오류';
}

async function resolveFunctionErrorMessage(error: unknown, fallbackMessage: string) {
  if (error && typeof error === 'object' && 'context' in error) {
    const response = (error as { context?: Response }).context;
    if (response instanceof Response) {
      try {
        const payload = (await response.clone().json()) as { message?: unknown };
        if (typeof payload.message === 'string' && payload.message.trim().length > 0) {
          return {
            status: response.status,
            message: payload.message,
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
        message: '관리자 서비스에 연결하지 못했습니다.',
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

function cloneDemoSnsItem(item: SnsAdminItemRecord): SnsAdminItemRecord {
  return {
    ...item,
    config: { ...item.config },
    currentContent: {
      ...item.currentContent,
      metrics: item.currentContent.metrics.map((metric) => ({ ...metric })),
      drivers: [...item.currentContent.drivers],
      categories: [...item.currentContent.categories],
      sourceItems: [...item.currentContent.sourceItems],
    },
  };
}

let demoSnsControlState = demoSnsControlItems.map(cloneDemoSnsItem);

function toNullableString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function toStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => (typeof item === 'string' ? item.trim() : String(item)))
    .filter(Boolean);
}

function toMetricTone(value: unknown): MetricTone | null {
  return value === 'cool' || value === 'neutral' || value === 'warm' ? value : null;
}

function toMetrics(value: unknown): SnsAdminMetricRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((metric) => {
      if (!metric || typeof metric !== 'object') {
        return null;
      }

      const record = metric as Record<string, unknown>;
      const label = toNullableString(record.label);
      const metricValue = toNullableString(record.value);

      if (!label || !metricValue) {
        return null;
      }

      return {
        label,
        value: metricValue,
        tone: toMetricTone(record.tone),
      } satisfies SnsAdminMetricRecord;
    })
    .filter((metric): metric is SnsAdminMetricRecord => metric !== null);
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

function toContentPayload(value: unknown) {
  if (!value || typeof value !== 'object') {
    return {} as Record<string, unknown>;
  }

  const record = value as Record<string, unknown>;
  const override =
    record.override && typeof record.override === 'object' ? (record.override as Record<string, unknown>) : null;

  return override ? { ...record, ...override } : record;
}

function toSnsContentRecord(
  content: unknown,
  fallback: Pick<SnsAdminItemRecord, 'title' | 'subtitle' | 'body'>,
): SnsAdminContentRecord {
  const payload = toContentPayload(content);

  return {
    title: toNullableString(payload.title) ?? fallback.title,
    subtitle: toNullableString(payload.subtitle) ?? fallback.subtitle,
    summary: toNullableString(payload.summary) ?? toNullableString(payload.body) ?? fallback.body ?? '',
    score: toNumber(payload.score ?? payload.valueNumeric, 0),
    classification: toNullableString(payload.classification) ?? '승인됨',
    change: toNumber(payload.change, 0),
    metrics: toMetrics(payload.metrics),
    drivers: toStringArray(payload.drivers),
    categories: toStringArray(payload.categories),
    sourceItems: toStringArray(payload.sourceItems),
    approvalNote:
      toNullableString(payload.approvalNote) ??
      '검토를 통과한 SNS 항목만 사용자용 피드에 노출됩니다.',
  };
}

function toFeedLayoutItemRecord(row: Record<string, unknown>): FeedLayoutItemRecord {
  return {
    id: String(row.id),
    tabSlug: row.tab_slug as FeedLayoutItemRecord['tabSlug'],
    itemKey: String(row.item_key),
    itemKind: row.item_kind as FeedLayoutItemRecord['itemKind'],
    sourceRef: (row.source_ref as string | null) ?? null,
    title: String(row.title),
    subtitle: (row.subtitle as string | null) ?? null,
    body: (row.body as string | null) ?? null,
    orderIndex: Number(row.order_index),
    isVisible: Boolean(row.is_visible),
    config: (row.config as Record<string, unknown>) ?? {},
  };
}

const snsControlDefaults = demoSnsControlItems.map(cloneDemoSnsItem);

function mergeSnsControlItems(
  layoutItems: FeedLayoutItemRecord[],
  currentState: Array<{ itemKey: string; content: unknown; publishedAt: string | null; sourceRunId: string | null }>,
) {
  const layoutByKey = new Map(layoutItems.map((item) => [item.itemKey, item]));
  const stateByKey = new Map(currentState.map((item) => [item.itemKey, item]));

  return snsControlDefaults
    .map((defaultItem) => {
      const layout = layoutByKey.get(defaultItem.itemKey);
      const state = stateByKey.get(defaultItem.itemKey);
      const base = layout
        ? {
            ...defaultItem,
            layoutId: layout.id,
            sourceRef: layout.sourceRef,
            title: layout.title,
            subtitle: layout.subtitle,
            body: layout.body,
            orderIndex: layout.orderIndex,
            isVisible: layout.isVisible,
            config: layout.config,
          }
        : defaultItem;

      return {
        ...base,
        currentContent: state ? toSnsContentRecord(state.content, base) : base.currentContent,
        publishedAt: state?.publishedAt ?? base.publishedAt,
        sourceRunId: state?.sourceRunId ?? base.sourceRunId,
        hasPublishedState: Boolean(state) || base.hasPublishedState,
      } satisfies SnsAdminItemRecord;
    })
    .sort((left, right) => left.orderIndex - right.orderIndex);
}

function toProviderRecord(row: Record<string, unknown>): ProviderRecord {
  return {
    id: String(row.id),
    code: String(row.code),
    displayName: String(row.display_name),
    providerKind: row.provider_kind as ProviderRecord['providerKind'],
    authState: row.auth_state as ProviderRecord['authState'],
    legalMode: row.legal_mode as ProviderRecord['legalMode'],
    sourceHealth: row.source_health as ProviderRecord['sourceHealth'],
    freshnessSlaMinutes: Number(row.freshness_sla_minutes),
    isEnabled: Boolean(row.is_enabled),
    config: (row.config as Record<string, unknown>) ?? {},
    lastSuccessAt: (row.last_success_at as string | null) ?? null,
    lastFailureAt: (row.last_failure_at as string | null) ?? null,
  };
}

function toJobRecord(row: Record<string, unknown>): CollectionJobRecord {
  return {
    id: String(row.id),
    slug: String(row.slug),
    displayName: String(row.display_name),
    providerId: (row.provider_id as string | null) ?? null,
    parserVersion: String(row.parser_version),
    scheduleCron: String(row.schedule_cron),
    isEnabled: Boolean(row.is_enabled),
    publishBehavior: row.publish_behavior as CollectionJobRecord['publishBehavior'],
    lastRunStatus: (row.last_run_status as CollectionJobRecord['lastRunStatus']) ?? null,
    lastStartedAt: (row.last_started_at as string | null) ?? null,
    lastFinishedAt: (row.last_finished_at as string | null) ?? null,
  };
}

function toRunSummary(row: Record<string, unknown>): RunSummary {
  return {
    id: String(row.id),
    jobId: (row.job_id as string | null) ?? null,
    jobSlug: (row.job_slug as string | null) ?? null,
    providerCode: (row.provider_code as string | null) ?? null,
    trigger: row.trigger as RunSummary['trigger'],
    status: row.status as RunSummary['status'],
    startedAt: (row.started_at as string | null) ?? null,
    finishedAt: (row.finished_at as string | null) ?? null,
    suspiciousCount: Number(row.suspicious_count ?? 0),
    errorCode: (row.error_code as string | null) ?? null,
    errorMessage: (row.error_message as string | null) ?? null,
    freshnessViolation: Boolean(row.freshness_violation),
    idempotencyKey: String(row.idempotency_key),
  };
}

export async function fetchDashboardSnapshot(): Promise<DashboardSnapshot> {
  if (!hasLiveSupabaseConfig || !supabase) {
    return demoDashboard;
  }

  try {
    const [runsResult, providersResult] = await Promise.all([
      supabase
        .from('run_history')
        .select('id, job_id, trigger, status, started_at, finished_at, suspicious_count, error_code, error_message, freshness_violation, idempotency_key')
        .order('created_at', { ascending: false })
        .limit(8),
      supabase
        .from('providers')
        .select('code, source_health, freshness_sla_minutes, last_success_at')
        .order('code', { ascending: true }),
    ]);

    if (runsResult.error) {
      throw runsResult.error;
    }

    if (providersResult.error) {
      throw providersResult.error;
    }

    const recentRuns = (runsResult.data ?? []).map((row) =>
      toRunSummary({
        ...row,
        job_slug: null,
        provider_code: null,
      }),
    );

    const now = Date.now();
    const providerHealth = (providersResult.data ?? []).map((provider) => {
      const minutesSinceSuccess = provider.last_success_at
        ? Math.round((now - new Date(provider.last_success_at).getTime()) / 60000)
        : null;

      return {
        providerCode: provider.code,
        sourceHealth: provider.source_health as DashboardSnapshot['providerHealth'][number]['sourceHealth'],
        stale:
          minutesSinceSuccess !== null &&
          minutesSinceSuccess > Number(provider.freshness_sla_minutes),
        minutesSinceSuccess,
      };
    });

    const failedRuns = recentRuns.filter((run) => run.status === 'failed').length;
    const freshnessViolations = recentRuns.filter((run) => run.freshnessViolation).length;

    return {
      recentRuns,
      failureRateLast24h: recentRuns.length > 0 ? failedRuns / recentRuns.length : 0,
      freshnessViolations,
      providerHealth,
    };
  } catch (error) {
    console.warn('Dashboard query fell back to demo data:', formatError(error));
    return demoDashboard;
  }
}

export async function fetchProviders(): Promise<ProviderRecord[]> {
  if (!hasLiveSupabaseConfig || !supabase) {
    return demoProviders;
  }

  try {
    const result = await supabase
      .from('providers')
      .select('*')
      .order('code', { ascending: true });

    if (result.error) {
      throw result.error;
    }

    return (result.data ?? []).map((row) => toProviderRecord(row as Record<string, unknown>));
  } catch (error) {
    console.warn('Providers query fell back to demo data:', formatError(error));
    return demoProviders;
  }
}

export async function fetchJobs(): Promise<CollectionJobRecord[]> {
  if (!hasLiveSupabaseConfig || !supabase) {
    return demoJobs;
  }

  try {
    const result = await supabase
      .from('collection_jobs')
      .select('*')
      .order('display_name', { ascending: true });

    if (result.error) {
      throw result.error;
    }

    return (result.data ?? []).map((row) => toJobRecord(row as Record<string, unknown>));
  } catch (error) {
    console.warn('Jobs query fell back to demo data:', formatError(error));
    return demoJobs;
  }
}

export async function fetchRuns(): Promise<RunSummary[]> {
  if (!hasLiveSupabaseConfig || !supabase) {
    return demoRuns;
  }

  try {
    const result = await supabase
      .from('run_history')
      .select('id, job_id, trigger, status, started_at, finished_at, suspicious_count, error_code, error_message, freshness_violation, idempotency_key')
      .order('created_at', { ascending: false })
      .limit(25);

    if (result.error) {
      throw result.error;
    }

    return (result.data ?? []).map((row) =>
      toRunSummary({
        ...(row as Record<string, unknown>),
        job_slug: null,
        provider_code: null,
      }),
    );
  } catch (error) {
    console.warn('Runs query fell back to demo data:', formatError(error));
    return demoRuns;
  }
}

export async function fetchReviewQueue(): Promise<ReviewQueueItem[]> {
  if (!hasLiveSupabaseConfig || !supabase) {
    return demoReviewQueue;
  }

  try {
    const result = await supabase
      .from('review_queue')
      .select('*')
      .order('priority', { ascending: true })
      .order('created_at', { ascending: false });

    if (result.error) {
      throw result.error;
    }

    return (result.data ?? []).map((row) => ({
      id: String(row.id),
      runId: (row.run_id as string | null) ?? null,
      entityType: row.entity_type as ReviewQueueItem['entityType'],
      status: row.status as ReviewQueueItem['status'],
      priority: Number(row.priority),
      reasonCode: String(row.reason_code),
      reasonDetail: (row.reason_detail as string | null) ?? null,
      originalPayload: (row.original_payload as Record<string, unknown>) ?? {},
      editedPayload: (row.edited_payload as Record<string, unknown> | null) ?? null,
      reviewedBy: (row.reviewed_by as string | null) ?? null,
      reviewedAt: (row.reviewed_at as string | null) ?? null,
    }));
  } catch (error) {
    console.warn('Review queue query fell back to demo data:', formatError(error));
    return demoReviewQueue;
  }
}

export async function fetchFeedLayout(): Promise<FeedLayoutItemRecord[]> {
  if (!hasLiveSupabaseConfig || !supabase) {
    return demoFeedLayout;
  }

  try {
    const result = await supabase
      .from('feed_layout_items')
      .select('*')
      .order('tab_slug', { ascending: true })
      .order('order_index', { ascending: true });

    if (result.error) {
      throw result.error;
    }

    return (result.data ?? []).map((row) => ({
      id: String(row.id),
      tabSlug: row.tab_slug as FeedLayoutItemRecord['tabSlug'],
      itemKey: String(row.item_key),
      itemKind: row.item_kind as FeedLayoutItemRecord['itemKind'],
      sourceRef: (row.source_ref as string | null) ?? null,
      title: String(row.title),
      subtitle: (row.subtitle as string | null) ?? null,
      body: (row.body as string | null) ?? null,
      orderIndex: Number(row.order_index),
      isVisible: Boolean(row.is_visible),
      config: (row.config as Record<string, unknown>) ?? {},
    }));
  } catch (error) {
    console.warn('Feed layout query fell back to demo data:', formatError(error));
    return demoFeedLayout;
  }
}

export async function fetchSnsControlItems(): Promise<SnsAdminItemRecord[]> {
  if (!hasLiveSupabaseConfig || !supabase) {
    return demoSnsControlState.map(cloneDemoSnsItem);
  }

  try {
    const payload = (await invokeAdminFunction('admin-sns-control', {})) as {
      layout: Record<string, unknown>[];
      state: Array<Record<string, unknown>>;
    };

    const layoutItems = (payload.layout ?? []).map((row) => toFeedLayoutItemRecord(row));
    const currentState = (payload.state ?? []).map((row) => ({
      itemKey: String(row.item_key),
      content: row.content,
      publishedAt: (row.published_at as string | null) ?? null,
      sourceRunId: (row.source_run_id as string | null) ?? null,
    }));

    return mergeSnsControlItems(layoutItems, currentState);
  } catch (error) {
    console.warn('SNS control query fell back to demo data:', formatError(error));
    return demoSnsControlState.map(cloneDemoSnsItem);
  }
}

export async function upsertFeedLayoutItem(record: FeedLayoutItemRecord): Promise<FeedLayoutItemRecord> {
  if (!hasLiveSupabaseConfig || !supabase) {
    const existingIndex = demoSnsControlState.findIndex((item) => item.itemKey === record.itemKey);
    const fallbackBase = existingIndex >= 0 ? demoSnsControlState[existingIndex] : snsControlDefaults[0];

    if (!fallbackBase) {
      throw new Error('데모 SNS 슬롯을 찾지 못했습니다.');
    }

    const base = existingIndex >= 0 ? demoSnsControlState[existingIndex] ?? fallbackBase : fallbackBase;

    const next: SnsAdminItemRecord = {
      ...base,
      layoutId: base.layoutId ?? `demo-${record.itemKey}`,
      tabSlug: 'sns_feed',
      itemKey: record.itemKey,
      itemKind: record.itemKind,
      sourceRef: record.sourceRef,
      title: record.title,
      subtitle: record.subtitle,
      body: record.body,
      orderIndex: record.orderIndex,
      isVisible: record.isVisible,
      config: record.config,
    };

    if (existingIndex >= 0) {
      demoSnsControlState[existingIndex] = cloneDemoSnsItem(next);
    } else {
      demoSnsControlState = [...demoSnsControlState, cloneDemoSnsItem(next)];
    }

    return {
      ...record,
      id: next.layoutId ?? `demo-${record.itemKey}`,
    };
  }

  const data = await invokeAdminFunction('admin-config-upsert', {
    entity: 'feed_layout',
    record: {
      tabSlug: record.tabSlug,
      itemKey: record.itemKey,
      itemKind: record.itemKind,
      sourceRef: record.sourceRef,
      title: record.title,
      subtitle: record.subtitle,
      body: record.body,
      orderIndex: record.orderIndex,
      isVisible: record.isVisible,
      config: record.config,
    },
  });

  return toFeedLayoutItemRecord(data as Record<string, unknown>);
}

export async function publishSnsOverride(
  request: AdminOverridePublishRequest,
): Promise<AdminOverridePublishResponse> {
  if (!hasLiveSupabaseConfig || !supabase) {
    const index = demoSnsControlState.findIndex((item) => item.itemKey === request.itemKey);

    if (index < 0) {
      throw new Error('데모 상태에서 SNS 슬롯을 찾지 못했습니다.');
    }

    const current = demoSnsControlState[index];
    if (!current) {
      throw new Error('SNS 슬롯 상태가 비어 있습니다.');
    }

    demoSnsControlState[index] = {
      ...current,
      currentContent: toSnsContentRecord(request.payload, current),
      publishedAt: new Date().toISOString(),
      sourceRunId: null,
      hasPublishedState: true,
    };

    return {
      overrideId: `demo-override-${request.itemKey}-${Date.now()}`,
      publishEventId: `demo-publish-${request.itemKey}-${Date.now()}`,
    };
  }

  return invokeAdminFunction('admin-override-publish', { ...request }) as Promise<AdminOverridePublishResponse>;
}

export async function invokeAdminFunction(functionName: string, body: Record<string, unknown>) {
  if (!hasLiveSupabaseConfig || !supabase) {
    return {
      live: false,
      functionName,
      body,
      at: new Date().toISOString(),
    };
  }

  const headers = getStoredAdminPassword()
    ? {
        'x-admin-password': getStoredAdminPassword(),
      }
    : undefined;

  const result = await supabase.functions.invoke(functionName, {
    body,
    headers,
  });

  if (result.error) {
    const failure = await resolveFunctionErrorMessage(result.error, '관리자 요청을 처리하지 못했습니다.');
    if (failure.status === 401 || failure.status === 403) {
      clearStoredAdminPassword();
    }

    throw new Error(failure.message);
  }

  return result.data;
}

export async function verifyAdminPassword(password: string) {
  if (!hasLiveSupabaseConfig || !supabase) {
    return { ok: true, demo: true };
  }

  const result = await supabase.functions.invoke('admin-auth-check', {
    body: {},
    headers: {
      'x-admin-password': password,
    },
  });

  if (result.error) {
    const failure = await resolveFunctionErrorMessage(result.error, '관리자 비밀번호를 확인하지 못했습니다.');
    throw new Error(failure.message);
  }

  return result.data;
}
