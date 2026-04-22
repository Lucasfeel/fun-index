import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { PipelineError } from "./errors.ts";
import type {
  CollectionJobRow,
  CurrentStateRow,
  IndicatorPointRow,
  JsonObject,
  PipelineRunRow,
  ReviewItemDetails,
  ReviewQueueRow,
  RunRequest,
} from "./types.ts";

export type DatabaseClient = SupabaseClient;

function requiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    throw new PipelineError("PROVIDER_CONFIG_ERROR", `Missing required environment variable '${name}'`);
  }
  return value;
}

function unwrap<T>(data: T | null, error: { message: string } | null, code = "DATABASE_ERROR"): T {
  if (error) {
    throw new PipelineError(code as never, error.message);
  }
  if (data === null) {
    throw new PipelineError(code as never, "Expected a record but received null");
  }
  return data;
}

export function createServiceClient(): DatabaseClient {
  return createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export async function fetchJobs(client: DatabaseClient, jobCode?: string): Promise<CollectionJobRow[]> {
  let query = client
    .schema("ops")
    .from("collection_jobs")
    .select(`
      id,
      job_code,
      provider_config_id,
      stream_id,
      schedule_cron,
      request_config,
      is_active,
      publish_enabled,
      locked_until_review,
      consecutive_failure_limit,
      last_successful_run_id,
      last_published_run_id,
      last_attempt_at,
      provider_config:provider_configs!collection_jobs_provider_config_id_fkey (
        id,
        provider_code,
        provider_family,
        display_name,
        adapter_key,
        parser_version,
        normalizer_version,
        validator_profile,
        fetch_config,
        metric_contract,
        is_active
      ),
      stream:indicator_streams!collection_jobs_stream_id_fkey (
        id,
        stream_code,
        tab_code,
        metric_code,
        metric_name,
        value_type,
        unit,
        min_value,
        max_value,
        publish_mode,
        requires_approval,
        is_aggregate_only,
        config,
        is_active
      )
    `)
    .eq("is_active", true);

  if (jobCode) {
    query = query.eq("job_code", jobCode);
  }

  const { data, error } = await query.order("job_code", { ascending: true });
  if (error) {
    throw new PipelineError("DATABASE_ERROR", error.message);
  }

  return (data ?? []) as unknown as CollectionJobRow[];
}

export async function getLatestSuccessfulRun(
  client: DatabaseClient,
  jobId: string,
): Promise<PipelineRunRow | null> {
  const { data, error } = await client
    .schema("ops")
    .from("pipeline_runs")
    .select("*")
    .eq("job_id", jobId)
    .eq("status", "succeeded")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new PipelineError("DATABASE_ERROR", error.message);
  }

  return (data as PipelineRunRow | null) ?? null;
}

export async function openRun(
  client: DatabaseClient,
  job: CollectionJobRow,
  request: RunRequest,
  idempotencyKey: string,
  lastSuccessfulRun: string | null,
): Promise<{ run: PipelineRunRow; reused: boolean }> {
  const existing = await client
    .schema("ops")
    .from("pipeline_runs")
    .select("*")
    .eq("job_id", job.id)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();

  if (existing.error) {
    throw new PipelineError("DATABASE_ERROR", existing.error.message);
  }

  if (existing.data) {
    return {
      run: existing.data as PipelineRunRow,
      reused: true,
    };
  }

  const payload = {
    job_id: job.id,
    provider_config_id: job.provider_config_id,
    stream_id: job.stream_id,
    trigger_type: request.trigger,
    idempotency_key: idempotencyKey,
    requested_window_start: request.requestedWindowStart ?? null,
    requested_window_end: request.requestedWindowEnd ?? null,
    parser_version: job.provider_config.parser_version,
    last_successful_run: lastSuccessfulRun,
    run_context: {
      retryOfRunId: request.retryOfRunId ?? null,
      rerunOfRunId: request.rerunOfRunId ?? null,
      force: request.force ?? false,
    },
  };

  const { data, error } = await client
    .schema("ops")
    .from("pipeline_runs")
    .upsert(payload, {
      onConflict: "job_id,idempotency_key",
      ignoreDuplicates: false,
    })
    .select("*")
    .single();

  if (error) {
    throw new PipelineError("DATABASE_ERROR", error.message);
  }

  const run = data as PipelineRunRow;
  const { error: jobError } = await client
    .schema("ops")
    .from("collection_jobs")
    .update({ last_attempt_at: run.started_at })
    .eq("id", job.id);

  if (jobError) {
    throw new PipelineError("DATABASE_ERROR", jobError.message);
  }

  return {
    run,
    reused: false,
  };
}

export async function finishRun(
  client: DatabaseClient,
  runId: string,
  patch: Partial<PipelineRunRow> & { summary: JsonObject },
): Promise<void> {
  const { error } = await client
    .schema("ops")
    .from("pipeline_runs")
    .update({
      ...patch,
      finished_at: patch.finished_at ?? new Date().toISOString(),
    })
    .eq("id", runId);

  if (error) {
    throw new PipelineError("DATABASE_ERROR", error.message);
  }
}

export async function recordRawSnapshot(
  client: DatabaseClient,
  job: CollectionJobRow,
  runId: string,
  snapshot: {
    requestFingerprint: string;
    checksum: string;
    sourceReference?: string;
    sourceUrl?: string;
    httpStatus?: number;
    observedAt?: string;
    rawPayload: JsonObject;
    meta?: JsonObject;
  },
): Promise<{ id: string }> {
  const { data, error } = await client
    .schema("ops")
    .from("raw_snapshots")
    .upsert({
      run_id: runId,
      job_id: job.id,
      provider_config_id: job.provider_config_id,
      request_fingerprint: snapshot.requestFingerprint,
      checksum: snapshot.checksum,
      source_reference: snapshot.sourceReference ?? null,
      source_url: snapshot.sourceUrl ?? null,
      http_status: snapshot.httpStatus ?? null,
      observed_at: snapshot.observedAt ?? null,
      raw_payload: snapshot.rawPayload,
      parser_version: job.provider_config.parser_version,
      meta: snapshot.meta ?? {},
    }, {
      onConflict: "job_id,request_fingerprint,checksum",
      ignoreDuplicates: false,
    })
    .select("id")
    .single();

  if (error) {
    throw new PipelineError("DATABASE_ERROR", error.message);
  }

  return unwrap(data, null) as { id: string };
}

export async function updateRawSnapshotParseOutcome(
  client: DatabaseClient,
  snapshotId: string,
  patch: {
    parseStatus: "pending" | "parsed" | "failed";
    parseError?: string | null;
    observedAt?: string | null;
  },
): Promise<void> {
  const { error } = await client
    .schema("ops")
    .from("raw_snapshots")
    .update({
      parse_status: patch.parseStatus,
      parse_error: patch.parseError ?? null,
      observed_at: patch.observedAt ?? null,
    })
    .eq("id", snapshotId);

  if (error) {
    throw new PipelineError("DATABASE_ERROR", error.message);
  }
}

export async function getLatestAcceptedPoint(
  client: DatabaseClient,
  streamId: string,
): Promise<IndicatorPointRow | null> {
  const { data, error } = await client
    .schema("ops")
    .from("indicator_points")
    .select("*")
    .eq("stream_id", streamId)
    .eq("quality_state", "accepted")
    .order("observed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new PipelineError("DATABASE_ERROR", error.message);
  }

  return (data as IndicatorPointRow | null) ?? null;
}

export async function getCurrentState(
  client: DatabaseClient,
  streamId: string,
): Promise<CurrentStateRow | null> {
  const { data, error } = await client
    .schema("app_public")
    .from("indicator_current_state")
    .select("*")
    .eq("stream_id", streamId)
    .maybeSingle();

  if (error) {
    throw new PipelineError("DATABASE_ERROR", error.message);
  }

  return (data as CurrentStateRow | null) ?? null;
}

export async function upsertIndicatorPoint(
  client: DatabaseClient,
  job: CollectionJobRow,
  values: {
    runId: string;
    snapshotId: string;
    observedAt: string;
    numericValue: number | null;
    normalizedPayload: JsonObject;
    qualityState: "accepted" | "flagged" | "rejected";
    qualityFlags: string[];
  },
): Promise<IndicatorPointRow> {
  const { data: existing, error: existingError } = await client
    .schema("ops")
    .from("indicator_points")
    .select("*")
    .eq("stream_id", job.stream_id)
    .eq("observed_at", values.observedAt)
    .maybeSingle();

  if (existingError) {
    throw new PipelineError("DATABASE_ERROR", existingError.message);
  }

  if (existing && existing.quality_state === "accepted" && values.qualityState !== "accepted") {
    return existing as IndicatorPointRow;
  }

  const { data, error } = await client
    .schema("ops")
    .from("indicator_points")
    .upsert({
      stream_id: job.stream_id,
      run_id: values.runId,
      snapshot_id: values.snapshotId,
      provider_config_id: job.provider_config_id,
      observed_at: values.observedAt,
      numeric_value: values.numericValue,
      normalized_payload: values.normalizedPayload,
      quality_state: values.qualityState,
      quality_flags: values.qualityFlags,
    }, {
      onConflict: "stream_id,observed_at",
      ignoreDuplicates: false,
    })
    .select("*")
    .single();

  if (error) {
    throw new PipelineError("DATABASE_ERROR", error.message);
  }

  return data as IndicatorPointRow;
}

export async function markJobSuccess(
  client: DatabaseClient,
  jobId: string,
  runId: string,
  published: boolean,
): Promise<void> {
  const payload: Record<string, unknown> = {
    last_successful_run_id: runId,
  };
  if (published) {
    payload.last_published_run_id = runId;
  }

  const { error } = await client
    .schema("ops")
    .from("collection_jobs")
    .update(payload)
    .eq("id", jobId);

  if (error) {
    throw new PipelineError("DATABASE_ERROR", error.message);
  }
}

export async function getConsecutiveParserFailures(client: DatabaseClient, jobId: string): Promise<number> {
  const { data, error } = await client
    .schema("ops")
    .from("pipeline_runs")
    .select("status,error_code")
    .eq("job_id", jobId)
    .order("started_at", { ascending: false })
    .limit(10);

  if (error) {
    throw new PipelineError("DATABASE_ERROR", error.message);
  }

  let count = 0;
  for (const row of data ?? []) {
    if (row.error_code === "PARSER_ERROR" && row.status === "failed") {
      count += 1;
      continue;
    }
    break;
  }
  return count;
}

export async function lockJobForReview(
  client: DatabaseClient,
  jobId: string,
  streamId: string,
): Promise<void> {
  const [{ error: jobError }, { error: currentError }] = await Promise.all([
    client.schema("ops").from("collection_jobs").update({ locked_until_review: true }).eq("id", jobId),
    client.schema("app_public").from("indicator_current_state").update({ blocked_until_review: true }).eq("stream_id", streamId),
  ]);

  if (jobError) {
    throw new PipelineError("DATABASE_ERROR", jobError.message);
  }
  if (currentError) {
    throw new PipelineError("DATABASE_ERROR", currentError.message);
  }
}

export async function clearJobReviewLock(
  client: DatabaseClient,
  jobId: string,
  streamId: string,
): Promise<void> {
  const [{ error: jobError }, { error: currentError }] = await Promise.all([
    client.schema("ops").from("collection_jobs").update({ locked_until_review: false }).eq("id", jobId),
    client.schema("app_public").from("indicator_current_state").update({ blocked_until_review: false }).eq("stream_id", streamId),
  ]);

  if (jobError) {
    throw new PipelineError("DATABASE_ERROR", jobError.message);
  }
  if (currentError) {
    throw new PipelineError("DATABASE_ERROR", currentError.message);
  }
}

export async function enqueueReviewItem(
  client: DatabaseClient,
  values: {
    runId: string;
    jobId: string;
    streamId: string;
    snapshotId?: string | null;
    pointId?: string | null;
    reasonCode: string;
    severity: "info" | "warning" | "critical";
    failureStreak?: number;
    candidatePayload: JsonObject;
    notes?: string;
    publishAfterReview?: boolean;
  },
): Promise<ReviewQueueRow> {
  const { data, error } = await client
    .schema("ops")
    .from("review_queue")
    .insert({
      run_id: values.runId,
      job_id: values.jobId,
      stream_id: values.streamId,
      snapshot_id: values.snapshotId ?? null,
      point_id: values.pointId ?? null,
      reason_code: values.reasonCode,
      severity: values.severity,
      failure_streak: values.failureStreak ?? 0,
      candidate_payload: values.candidatePayload,
      notes: values.notes ?? null,
      publish_after_review: values.publishAfterReview ?? false,
    })
    .select("*")
    .single();

  if (error) {
    throw new PipelineError("DATABASE_ERROR", error.message);
  }

  return data as ReviewQueueRow;
}

export async function upsertCurrentState(
  client: DatabaseClient,
  values: {
    streamId: string;
    pointId: string;
    jobId: string;
    providerConfigId: string;
    currentValue: number | null;
    observedAt: string;
    summary: JsonObject;
    publishState: "skipped" | "published" | "withheld" | "blocked";
    lastRunId: string;
    publishedRunId: string;
    blockedUntilReview?: boolean;
  },
): Promise<void> {
  const { error } = await client
    .schema("app_public")
    .from("indicator_current_state")
    .upsert({
      stream_id: values.streamId,
      point_id: values.pointId,
      job_id: values.jobId,
      provider_config_id: values.providerConfigId,
      current_value: values.currentValue,
      observed_at: values.observedAt,
      summary: values.summary,
      publish_state: values.publishState,
      last_run_id: values.lastRunId,
      published_run_id: values.publishedRunId,
      published_at: new Date().toISOString(),
      blocked_until_review: values.blockedUntilReview ?? false,
    }, {
      onConflict: "stream_id",
      ignoreDuplicates: false,
    });

  if (error) {
    throw new PipelineError("DATABASE_ERROR", error.message);
  }
}

export async function getReviewItem(client: DatabaseClient, reviewQueueId: string): Promise<ReviewItemDetails> {
  const { data, error } = await client
    .schema("ops")
    .from("review_queue")
    .select(`
      id,
      run_id,
      job_id,
      stream_id,
      snapshot_id,
      point_id,
      reason_code,
      severity,
      status,
      failure_streak,
      candidate_payload,
      corrected_payload,
      notes,
      publish_after_review,
      job:collection_jobs!review_queue_job_id_fkey (
        id,
        job_code,
        provider_config_id,
        stream_id,
        schedule_cron,
        request_config,
        is_active,
        publish_enabled,
        locked_until_review,
        consecutive_failure_limit,
        last_successful_run_id,
        last_published_run_id,
        last_attempt_at,
        provider_config:provider_configs!collection_jobs_provider_config_id_fkey (
          id,
          provider_code,
          provider_family,
          display_name,
          adapter_key,
          parser_version,
          normalizer_version,
          validator_profile,
          fetch_config,
          metric_contract,
          is_active
        ),
        stream:indicator_streams!collection_jobs_stream_id_fkey (
          id,
          stream_code,
          tab_code,
          metric_code,
          metric_name,
          value_type,
          unit,
          min_value,
          max_value,
          publish_mode,
          requires_approval,
          is_aggregate_only,
          config,
          is_active
        )
      ),
      point:indicator_points!review_queue_point_id_fkey (
        id,
        stream_id,
        run_id,
        snapshot_id,
        provider_config_id,
        observed_at,
        numeric_value,
        normalized_payload,
        quality_state,
        quality_flags
      )
    `)
    .eq("id", reviewQueueId)
    .single();

  if (error) {
    throw new PipelineError("DATABASE_ERROR", error.message);
  }

  return data as unknown as ReviewItemDetails;
}

export async function updateReviewQueue(
  client: DatabaseClient,
  reviewQueueId: string,
  patch: {
    status: "pending" | "approved" | "corrected" | "rejected" | "ignored";
    correctedPayload?: JsonObject | null;
    notes?: string;
    resolutionAction?: string;
    reviewedBy?: string;
  },
): Promise<void> {
  const { error } = await client
    .schema("ops")
    .from("review_queue")
    .update({
      status: patch.status,
      corrected_payload: patch.correctedPayload ?? null,
      notes: patch.notes ?? null,
      resolution_action: patch.resolutionAction ?? null,
      reviewed_by: patch.reviewedBy ?? null,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", reviewQueueId);

  if (error) {
    throw new PipelineError("DATABASE_ERROR", error.message);
  }
}

export async function recordReviewAction(
  client: DatabaseClient,
  reviewQueueId: string,
  actionType: string,
  actionPayload: JsonObject,
  actionBy?: string,
): Promise<void> {
  const { error } = await client
    .schema("admin")
    .from("review_actions")
    .insert({
      review_queue_id: reviewQueueId,
      action_by: actionBy ?? null,
      action_type: actionType,
      action_payload: actionPayload,
    });

  if (error) {
    throw new PipelineError("DATABASE_ERROR", error.message);
  }
}
