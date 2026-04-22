import type {
  CollectionJobRecord,
  DashboardSnapshot,
  FeedLayoutItemRecord,
  ProviderRecord,
  ReviewQueueItem,
  RunSummary,
} from '@indicator/shared';

import {
  demoDashboard,
  demoFeedLayout,
  demoJobs,
  demoProviders,
  demoReviewQueue,
  demoRuns,
} from './demoData';
import { hasLiveSupabaseConfig, supabase } from './supabase';

function formatError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Unknown error';
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

export async function invokeAdminFunction(functionName: string, body: Record<string, unknown>) {
  if (!hasLiveSupabaseConfig || !supabase) {
    return {
      live: false,
      functionName,
      body,
      at: new Date().toISOString(),
    };
  }

  const result = await supabase.functions.invoke(functionName, {
    body,
  });

  if (result.error) {
    throw result.error;
  }

  return result.data;
}
