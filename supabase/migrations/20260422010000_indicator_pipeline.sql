create extension if not exists pgcrypto;

create schema if not exists ops;
create schema if not exists admin;
create schema if not exists app_public;

do $$
begin
  if not exists (select 1 from pg_type where typnamespace = 'ops'::regnamespace and typname = 'run_trigger_type') then
    create type ops.run_trigger_type as enum ('scheduled', 'manual', 'retry', 'rerun', 'backfill');
  end if;

  if not exists (select 1 from pg_type where typnamespace = 'ops'::regnamespace and typname = 'run_status') then
    create type ops.run_status as enum ('running', 'succeeded', 'failed', 'flagged', 'blocked');
  end if;

  if not exists (select 1 from pg_type where typnamespace = 'ops'::regnamespace and typname = 'publish_state') then
    create type ops.publish_state as enum ('skipped', 'published', 'withheld', 'blocked');
  end if;

  if not exists (select 1 from pg_type where typnamespace = 'ops'::regnamespace and typname = 'snapshot_parse_status') then
    create type ops.snapshot_parse_status as enum ('pending', 'parsed', 'failed');
  end if;

  if not exists (select 1 from pg_type where typnamespace = 'ops'::regnamespace and typname = 'review_status') then
    create type ops.review_status as enum ('pending', 'approved', 'corrected', 'rejected', 'ignored');
  end if;

  if not exists (select 1 from pg_type where typnamespace = 'ops'::regnamespace and typname = 'review_severity') then
    create type ops.review_severity as enum ('info', 'warning', 'critical');
  end if;
end
$$;

create or replace function ops.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists ops.provider_configs (
  id uuid primary key default gen_random_uuid(),
  provider_code text not null unique,
  provider_family text not null check (provider_family in ('pizzint', 'cnn_fear_greed', 'cmc_fear_greed', 'sns_rollup')),
  display_name text not null,
  adapter_key text not null,
  parser_version text not null,
  normalizer_version text not null default '1.0.0',
  validator_profile jsonb not null default '{}'::jsonb,
  fetch_config jsonb not null default '{}'::jsonb,
  metric_contract jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ops.indicator_streams (
  id uuid primary key default gen_random_uuid(),
  stream_code text not null unique,
  tab_code text not null check (tab_code in ('home', 'pentagon', 'psychology', 'sns_feed')),
  metric_code text not null,
  metric_name text not null,
  value_type text not null default 'numeric' check (value_type in ('numeric', 'json')),
  unit text not null default 'score',
  min_value numeric,
  max_value numeric,
  publish_mode text not null default 'automatic' check (publish_mode in ('automatic', 'review_required', 'suspended')),
  requires_approval boolean not null default false,
  is_aggregate_only boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ops.collection_jobs (
  id uuid primary key default gen_random_uuid(),
  job_code text not null unique,
  provider_config_id uuid not null constraint collection_jobs_provider_config_id_fkey references ops.provider_configs(id),
  stream_id uuid not null constraint collection_jobs_stream_id_fkey references ops.indicator_streams(id),
  schedule_cron text not null default '0 * * * *',
  request_config jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  publish_enabled boolean not null default true,
  locked_until_review boolean not null default false,
  consecutive_failure_limit integer not null default 2 check (consecutive_failure_limit >= 1),
  last_successful_run_id uuid,
  last_published_run_id uuid,
  last_attempt_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ops.pipeline_runs (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null constraint pipeline_runs_job_id_fkey references ops.collection_jobs(id),
  provider_config_id uuid not null constraint pipeline_runs_provider_config_id_fkey references ops.provider_configs(id),
  stream_id uuid not null constraint pipeline_runs_stream_id_fkey references ops.indicator_streams(id),
  trigger_type ops.run_trigger_type not null,
  idempotency_key text not null,
  requested_window_start timestamptz,
  requested_window_end timestamptz,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status ops.run_status not null default 'running',
  record_count integer not null default 0,
  publish_result ops.publish_state not null default 'skipped',
  error_reason text,
  error_code text,
  parser_version text not null,
  last_successful_run timestamptz,
  retry_of_run_id uuid constraint pipeline_runs_retry_of_run_id_fkey references ops.pipeline_runs(id),
  rerun_of_run_id uuid constraint pipeline_runs_rerun_of_run_id_fkey references ops.pipeline_runs(id),
  run_context jsonb not null default '{}'::jsonb,
  summary jsonb not null default '{}'::jsonb,
  constraint pipeline_runs_job_idempotency_key_key unique (job_id, idempotency_key)
);

create table if not exists ops.raw_snapshots (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null constraint raw_snapshots_run_id_fkey references ops.pipeline_runs(id) on delete cascade,
  job_id uuid not null constraint raw_snapshots_job_id_fkey references ops.collection_jobs(id),
  provider_config_id uuid not null constraint raw_snapshots_provider_config_id_fkey references ops.provider_configs(id),
  request_fingerprint text not null,
  checksum text not null,
  source_reference text,
  source_url text,
  http_status integer,
  observed_at timestamptz,
  fetched_at timestamptz not null default now(),
  raw_payload jsonb not null,
  parse_status ops.snapshot_parse_status not null default 'pending',
  parser_version text not null,
  parse_error text,
  meta jsonb not null default '{}'::jsonb,
  constraint raw_snapshots_job_request_fingerprint_checksum_key unique (job_id, request_fingerprint, checksum)
);

create table if not exists ops.indicator_points (
  id uuid primary key default gen_random_uuid(),
  stream_id uuid not null constraint indicator_points_stream_id_fkey references ops.indicator_streams(id),
  run_id uuid not null constraint indicator_points_run_id_fkey references ops.pipeline_runs(id) on delete cascade,
  snapshot_id uuid not null constraint indicator_points_snapshot_id_fkey references ops.raw_snapshots(id) on delete cascade,
  provider_config_id uuid not null constraint indicator_points_provider_config_id_fkey references ops.provider_configs(id),
  observed_at timestamptz not null,
  numeric_value numeric,
  normalized_payload jsonb not null,
  quality_state text not null check (quality_state in ('accepted', 'flagged', 'rejected')),
  quality_flags text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint indicator_points_stream_observed_at_key unique (stream_id, observed_at)
);

create table if not exists app_public.indicator_current_state (
  stream_id uuid primary key constraint indicator_current_state_stream_id_fkey references ops.indicator_streams(id),
  point_id uuid not null unique constraint indicator_current_state_point_id_fkey references ops.indicator_points(id),
  job_id uuid not null constraint indicator_current_state_job_id_fkey references ops.collection_jobs(id),
  provider_config_id uuid not null constraint indicator_current_state_provider_config_id_fkey references ops.provider_configs(id),
  current_value numeric,
  observed_at timestamptz not null,
  summary jsonb not null default '{}'::jsonb,
  publish_state ops.publish_state not null default 'published',
  last_run_id uuid not null constraint indicator_current_state_last_run_id_fkey references ops.pipeline_runs(id),
  published_run_id uuid not null constraint indicator_current_state_published_run_id_fkey references ops.pipeline_runs(id),
  published_at timestamptz not null default now(),
  blocked_until_review boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists app_public.tab_feed_configs (
  id uuid primary key default gen_random_uuid(),
  tab_code text not null check (tab_code in ('home', 'pentagon', 'psychology', 'sns_feed')),
  stream_id uuid not null constraint tab_feed_configs_stream_id_fkey references ops.indicator_streams(id),
  feed_card_code text not null,
  title text not null,
  subtitle text,
  description_template text,
  sort_order integer not null default 100,
  is_enabled boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tab_feed_configs_tab_stream_card_key unique (tab_code, stream_id, feed_card_code)
);

create table if not exists ops.review_queue (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null constraint review_queue_run_id_fkey references ops.pipeline_runs(id) on delete cascade,
  job_id uuid not null constraint review_queue_job_id_fkey references ops.collection_jobs(id),
  stream_id uuid not null constraint review_queue_stream_id_fkey references ops.indicator_streams(id),
  snapshot_id uuid constraint review_queue_snapshot_id_fkey references ops.raw_snapshots(id) on delete cascade,
  point_id uuid constraint review_queue_point_id_fkey references ops.indicator_points(id) on delete set null,
  reason_code text not null,
  severity ops.review_severity not null,
  status ops.review_status not null default 'pending',
  failure_streak integer not null default 0,
  candidate_payload jsonb not null default '{}'::jsonb,
  corrected_payload jsonb,
  notes text,
  assigned_to uuid,
  reviewed_by uuid,
  reviewed_at timestamptz,
  resolution_action text,
  publish_after_review boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists admin.review_actions (
  id uuid primary key default gen_random_uuid(),
  review_queue_id uuid not null constraint review_actions_review_queue_id_fkey references ops.review_queue(id) on delete cascade,
  action_by uuid,
  action_type text not null,
  action_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table ops.collection_jobs
  add constraint collection_jobs_last_successful_run_id_fkey
  foreign key (last_successful_run_id)
  references ops.pipeline_runs(id);

alter table ops.collection_jobs
  add constraint collection_jobs_last_published_run_id_fkey
  foreign key (last_published_run_id)
  references ops.pipeline_runs(id);

drop trigger if exists provider_configs_touch_updated_at on ops.provider_configs;
create trigger provider_configs_touch_updated_at
before update on ops.provider_configs
for each row execute function ops.touch_updated_at();

drop trigger if exists indicator_streams_touch_updated_at on ops.indicator_streams;
create trigger indicator_streams_touch_updated_at
before update on ops.indicator_streams
for each row execute function ops.touch_updated_at();

drop trigger if exists collection_jobs_touch_updated_at on ops.collection_jobs;
create trigger collection_jobs_touch_updated_at
before update on ops.collection_jobs
for each row execute function ops.touch_updated_at();

drop trigger if exists indicator_points_touch_updated_at on ops.indicator_points;
create trigger indicator_points_touch_updated_at
before update on ops.indicator_points
for each row execute function ops.touch_updated_at();

drop trigger if exists indicator_current_state_touch_updated_at on app_public.indicator_current_state;
create trigger indicator_current_state_touch_updated_at
before update on app_public.indicator_current_state
for each row execute function ops.touch_updated_at();

drop trigger if exists tab_feed_configs_touch_updated_at on app_public.tab_feed_configs;
create trigger tab_feed_configs_touch_updated_at
before update on app_public.tab_feed_configs
for each row execute function ops.touch_updated_at();

create index if not exists provider_configs_active_idx
  on ops.provider_configs (provider_family)
  where is_active;

create index if not exists indicator_streams_tab_active_idx
  on ops.indicator_streams (tab_code, stream_code)
  where is_active;

create index if not exists collection_jobs_active_idx
  on ops.collection_jobs (is_active, job_code)
  where is_active;

create index if not exists pipeline_runs_job_started_at_idx
  on ops.pipeline_runs (job_id, started_at desc);

create index if not exists pipeline_runs_failed_job_started_at_idx
  on ops.pipeline_runs (job_id, started_at desc)
  where status in ('failed', 'flagged', 'blocked');

create index if not exists raw_snapshots_run_idx
  on ops.raw_snapshots (run_id, fetched_at desc);

create index if not exists indicator_points_accepted_stream_observed_at_idx
  on ops.indicator_points (stream_id, observed_at desc)
  where quality_state = 'accepted';

create index if not exists indicator_current_state_published_idx
  on app_public.indicator_current_state (publish_state, observed_at desc)
  where publish_state = 'published';

create index if not exists tab_feed_configs_enabled_idx
  on app_public.tab_feed_configs (tab_code, sort_order)
  where is_enabled;

create index if not exists review_queue_pending_idx
  on ops.review_queue (status, created_at desc)
  where status = 'pending';

create or replace function app_public.get_tab_feed(p_tab_code text)
returns jsonb
language sql
stable
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'tab', cfg.tab_code,
        'feedCardCode', cfg.feed_card_code,
        'title', coalesce(cur.summary ->> 'title', cfg.title),
        'subtitle', coalesce(cur.summary ->> 'subtitle', cfg.subtitle),
        'description', coalesce(cur.summary ->> 'description', cfg.description_template),
        'streamCode', s.stream_code,
        'metricCode', s.metric_code,
        'metricName', s.metric_name,
        'value', cur.current_value,
        'unit', s.unit,
        'observedAt', cur.observed_at,
        'summary', cur.summary
      )
      order by cfg.sort_order, cfg.feed_card_code
    ),
    '[]'::jsonb
  )
  from app_public.tab_feed_configs cfg
  join ops.indicator_streams s
    on s.id = cfg.stream_id
  join app_public.indicator_current_state cur
    on cur.stream_id = cfg.stream_id
   and cur.publish_state = 'published'
   and cur.blocked_until_review = false
  where cfg.tab_code = p_tab_code
    and cfg.is_enabled = true;
$$;

create or replace view admin.pipeline_run_inspector as
select
  r.id,
  r.job_id,
  j.job_code,
  p.provider_code,
  p.display_name as provider_name,
  s.stream_code,
  s.tab_code,
  s.metric_code,
  r.trigger_type,
  r.started_at,
  r.finished_at,
  r.status,
  r.record_count,
  r.publish_result,
  r.error_code,
  r.error_reason,
  r.parser_version,
  r.last_successful_run,
  r.summary
from ops.pipeline_runs r
join ops.collection_jobs j on j.id = r.job_id
join ops.provider_configs p on p.id = r.provider_config_id
join ops.indicator_streams s on s.id = r.stream_id;

create or replace view admin.review_queue_inspector as
select
  rq.id,
  rq.run_id,
  rq.job_id,
  j.job_code,
  rq.stream_id,
  s.stream_code,
  s.tab_code,
  rq.reason_code,
  rq.severity,
  rq.status,
  rq.failure_streak,
  rq.publish_after_review,
  rq.reviewed_by,
  rq.reviewed_at,
  rq.resolution_action,
  rq.created_at,
  rq.candidate_payload,
  rq.corrected_payload,
  rq.notes
from ops.review_queue rq
join ops.collection_jobs j on j.id = rq.job_id
join ops.indicator_streams s on s.id = rq.stream_id;
