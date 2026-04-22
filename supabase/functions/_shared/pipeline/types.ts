export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json }
  | Json[];

export type JsonObject = Record<string, Json>;
export type TriggerType = "scheduled" | "manual" | "retry" | "rerun" | "backfill";
export type RunStatus = "running" | "succeeded" | "failed" | "flagged" | "blocked";
export type PublishResult = "skipped" | "published" | "withheld" | "blocked";
export type QualityState = "accepted" | "flagged" | "rejected";
export type ReviewSeverity = "info" | "warning" | "critical";
export type ReviewAction = "approve" | "correct" | "reject" | "ignore";
export type ProviderFamily =
  | "pizzint"
  | "cnn_fear_greed"
  | "cmc_fear_greed"
  | "sns_rollup";

export interface ProviderConfigRow {
  id: string;
  provider_code: string;
  provider_family: ProviderFamily;
  display_name: string;
  adapter_key: string;
  parser_version: string;
  normalizer_version: string;
  validator_profile: JsonObject;
  fetch_config: JsonObject;
  metric_contract: JsonObject;
  is_active: boolean;
}

export interface IndicatorStreamRow {
  id: string;
  stream_code: string;
  tab_code: "home" | "pentagon" | "psychology" | "sns_feed";
  metric_code: string;
  metric_name: string;
  value_type: "numeric" | "json";
  unit: string;
  min_value: number | null;
  max_value: number | null;
  publish_mode: "automatic" | "review_required" | "suspended";
  requires_approval: boolean;
  is_aggregate_only: boolean;
  config: JsonObject;
  is_active: boolean;
}

export interface CollectionJobRow {
  id: string;
  job_code: string;
  provider_config_id: string;
  stream_id: string;
  schedule_cron: string;
  request_config: JsonObject;
  is_active: boolean;
  publish_enabled: boolean;
  locked_until_review: boolean;
  consecutive_failure_limit: number;
  last_successful_run_id: string | null;
  last_published_run_id: string | null;
  last_attempt_at?: string | null;
  provider_config: ProviderConfigRow;
  stream: IndicatorStreamRow;
}

export interface PipelineRunRow {
  id: string;
  job_id: string;
  provider_config_id: string;
  stream_id: string;
  trigger_type: TriggerType;
  idempotency_key: string;
  requested_window_start: string | null;
  requested_window_end: string | null;
  started_at: string;
  finished_at: string | null;
  status: RunStatus;
  record_count: number;
  publish_result: PublishResult;
  error_reason: string | null;
  error_code: string | null;
  parser_version: string;
  last_successful_run: string | null;
  run_context: JsonObject;
  summary: JsonObject;
}

export interface IndicatorPointRow {
  id: string;
  stream_id: string;
  run_id: string;
  snapshot_id: string;
  provider_config_id: string;
  observed_at: string;
  numeric_value: number | null;
  normalized_payload: JsonObject;
  quality_state: QualityState;
  quality_flags: string[];
}

export interface CurrentStateRow {
  stream_id: string;
  point_id: string;
  job_id: string;
  provider_config_id: string;
  current_value: number | null;
  observed_at: string;
  summary: JsonObject;
  publish_state: PublishResult;
  last_run_id: string;
  published_run_id: string;
  published_at: string;
  blocked_until_review: boolean;
}

export interface ProviderFetchResult {
  payload: JsonObject;
  requestFingerprint: string;
  sourceReference?: string;
  sourceUrl?: string;
  httpStatus?: number;
  observedAt?: string;
  meta?: JsonObject;
}

export interface ParsedNumericObservation {
  kind: "numeric";
  observedAt: string;
  numericValue: number;
  label?: string;
  classification?: string;
  meta?: JsonObject;
}

export interface ParsedRollupObservation {
  kind: "json";
  observedAt: string;
  title: string;
  summary: string;
  items: JsonObject[];
  meta?: JsonObject;
}

export type ParsedObservation = ParsedNumericObservation | ParsedRollupObservation;

export interface NormalizedCandidate {
  observedAt: string;
  numericValue: number | null;
  normalizedPayload: JsonObject;
  summary: JsonObject;
  reviewRequired: boolean;
}

export interface QualityEvaluation {
  state: QualityState;
  flags: string[];
  reasons: string[];
  severity: ReviewSeverity;
  requiresReview: boolean;
}

export interface RunRequest {
  jobCode?: string;
  trigger: TriggerType;
  idempotencyKey?: string;
  requestedWindowStart?: string;
  requestedWindowEnd?: string;
  retryOfRunId?: string;
  rerunOfRunId?: string;
  force?: boolean;
}

export interface RunSummary {
  provider: string;
  job_code: string;
  started_at: string;
  finished_at: string;
  status: RunStatus;
  record_count: number;
  publish_result: PublishResult;
  error_reason: string | null;
  error_code?: string | null;
  parser_version: string;
  last_successful_run: string | null;
  run_id: string;
  stream_code: string;
  quality_flags?: string[];
  notes?: string[];
}

export interface ReviewQueueRow {
  id: string;
  run_id: string;
  job_id: string;
  stream_id: string;
  snapshot_id: string | null;
  point_id: string | null;
  reason_code: string;
  severity: ReviewSeverity;
  status: "pending" | "approved" | "corrected" | "rejected" | "ignored";
  failure_streak: number;
  candidate_payload: JsonObject;
  corrected_payload: JsonObject | null;
  notes: string | null;
  publish_after_review: boolean;
}

export interface ReviewDecisionRequest {
  reviewQueueId: string;
  action: ReviewAction;
  correctedValue?: number | null;
  correctedSummary?: JsonObject;
  notes?: string;
  publish?: boolean;
  reviewedBy?: string;
  resumeAutomaticPublishing?: boolean;
}

export interface ReviewItemDetails extends ReviewQueueRow {
  job: CollectionJobRow;
  point?: IndicatorPointRow | null;
}
