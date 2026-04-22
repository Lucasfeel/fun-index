begin;

create extension if not exists pgcrypto;

create schema if not exists app_private;
revoke all on schema app_private from public;
grant usage on schema app_private to postgres, service_role;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'feed_tab') then
    create type public.feed_tab as enum ('home', 'pentagon', 'psychology', 'sns_feed');
  end if;
  if not exists (select 1 from pg_type where typname = 'provider_kind') then
    create type public.provider_kind as enum ('indicator', 'sentiment', 'social');
  end if;
  if not exists (select 1 from pg_type where typname = 'provider_auth_state') then
    create type public.provider_auth_state as enum ('not_required', 'valid', 'expired', 'invalid', 'error');
  end if;
  if not exists (select 1 from pg_type where typname = 'provider_legal_mode') then
    create type public.provider_legal_mode as enum ('public_web', 'licensed_api', 'manual_upload', 'restricted', 'disabled');
  end if;
  if not exists (select 1 from pg_type where typname = 'source_health') then
    create type public.source_health as enum ('healthy', 'degraded', 'down', 'paused');
  end if;
  if not exists (select 1 from pg_type where typname = 'run_trigger') then
    create type public.run_trigger as enum ('scheduled', 'manual', 'retry', 'backfill', 'publish_only', 'override');
  end if;
  if not exists (select 1 from pg_type where typname = 'run_status') then
    create type public.run_status as enum ('queued', 'running', 'succeeded', 'failed', 'review_required', 'published', 'cancelled');
  end if;
  if not exists (select 1 from pg_type where typname = 'review_status') then
    create type public.review_status as enum ('pending', 'approved', 'rejected', 'edited', 'published');
  end if;
  if not exists (select 1 from pg_type where typname = 'review_entity_type') then
    create type public.review_entity_type as enum ('run', 'indicator_point', 'sns_rollup', 'feed_state');
  end if;
  if not exists (select 1 from pg_type where typname = 'feed_item_kind') then
    create type public.feed_item_kind as enum ('indicator_card', 'sns_rollup', 'editorial', 'system_notice');
  end if;
  if not exists (select 1 from pg_type where typname = 'publish_mode') then
    create type public.publish_mode as enum ('automatic', 'review_gated', 'manual', 'manual_override', 'review_approved');
  end if;
end $$;

create or replace function app_private.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create or replace function app_private.current_user_id()
returns uuid
language sql
stable
as $$
  select auth.uid();
$$;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  display_name text not null,
  roles text[] not null default array['viewer']::text[],
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create or replace function app_private.has_role(required_role text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select exists (
    select 1
    from public.admin_users au
    where au.user_id = auth.uid()
      and au.is_active
      and required_role = any (au.roles)
  );
$$;

create or replace function app_private.has_any_role(required_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select exists (
    select 1
    from public.admin_users au
    where au.user_id = auth.uid()
      and au.is_active
      and au.roles && required_roles
  );
$$;

create or replace function app_private.can_read_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select app_private.has_any_role(array['viewer', 'ops', 'reviewer', 'publisher', 'admin']);
$$;

create or replace function app_private.can_operate()
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select app_private.has_any_role(array['ops', 'admin']);
$$;

create or replace function app_private.can_review()
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select app_private.has_any_role(array['reviewer', 'publisher', 'admin']);
$$;

create or replace function app_private.can_publish()
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select app_private.has_any_role(array['publisher', 'admin']);
$$;

create or replace function app_private.can_manage_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select app_private.has_role('admin');
$$;

create table if not exists public.providers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  display_name text not null,
  provider_kind public.provider_kind not null,
  auth_state public.provider_auth_state not null default 'not_required',
  legal_mode public.provider_legal_mode not null default 'public_web',
  source_health public.source_health not null default 'healthy',
  freshness_sla_minutes integer not null default 120 check (freshness_sla_minutes > 0),
  base_url text,
  config jsonb not null default '{}'::jsonb,
  notes text,
  is_enabled boolean not null default true,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  last_checked_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.collection_jobs (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  display_name text not null,
  provider_id uuid references public.providers (id) on delete set null,
  job_type text not null,
  schedule_cron text not null,
  parser_version text not null,
  pipeline_version text not null default '1',
  publish_behavior public.publish_mode not null default 'review_gated',
  timeout_seconds integer not null default 120 check (timeout_seconds > 0),
  retry_limit integer not null default 2 check (retry_limit >= 0),
  is_enabled boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  last_run_status public.run_status,
  last_enqueued_at timestamptz,
  last_started_at timestamptz,
  last_finished_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.job_run_requests (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.collection_jobs (id) on delete cascade,
  requested_by uuid references auth.users (id) on delete set null,
  request_mode public.run_trigger not null,
  idempotency_key text not null unique,
  backfill_start_at timestamptz,
  backfill_end_at timestamptz,
  override_payload jsonb,
  request_reason text,
  request_status public.run_status not null default 'queued',
  summary jsonb not null default '{}'::jsonb,
  requested_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz
);

create table if not exists public.run_history (
  id uuid primary key default gen_random_uuid(),
  request_id uuid unique references public.job_run_requests (id) on delete set null,
  job_id uuid references public.collection_jobs (id) on delete set null,
  provider_id uuid references public.providers (id) on delete set null,
  initiated_by uuid references auth.users (id) on delete set null,
  retry_of_run_id uuid references public.run_history (id) on delete set null,
  trigger public.run_trigger not null,
  status public.run_status not null default 'queued',
  idempotency_key text not null unique,
  correlation_id uuid not null default gen_random_uuid(),
  parser_version text not null,
  pipeline_version text not null default '1',
  source_window_start_at timestamptz,
  source_window_end_at timestamptz,
  summary jsonb not null default '{}'::jsonb,
  diagnostics jsonb not null default '{}'::jsonb,
  suspicious_count integer not null default 0 check (suspicious_count >= 0),
  published_item_count integer not null default 0 check (published_item_count >= 0),
  freshness_violation boolean not null default false,
  error_code text,
  error_message text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.run_logs (
  id bigint generated always as identity primary key,
  run_id uuid not null references public.run_history (id) on delete cascade,
  level text not null check (level in ('info', 'warning', 'error')),
  stage text not null,
  message text not null,
  context jsonb not null default '{}'::jsonb,
  logged_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.raw_snapshots (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.run_history (id) on delete cascade,
  provider_id uuid not null references public.providers (id) on delete cascade,
  snapshot_key text not null,
  source_url text,
  fetched_at timestamptz not null default timezone('utc', now()),
  http_status integer,
  content_type text,
  raw_headers jsonb not null default '{}'::jsonb,
  payload_json jsonb,
  raw_body text,
  checksum_sha256 text,
  parser_version text not null,
  parser_status text not null default 'pending' check (parser_status in ('pending', 'parsed', 'failed', 'quarantined')),
  parse_error text,
  is_suspicious boolean not null default false,
  suspicious_reasons jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  unique (run_id, snapshot_key)
);

create table if not exists public.normalized_indicator_points (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.run_history (id) on delete cascade,
  provider_id uuid not null references public.providers (id) on delete cascade,
  source_snapshot_id uuid references public.raw_snapshots (id) on delete set null,
  indicator_key text not null,
  tab_slug public.feed_tab not null,
  metric_key text not null default 'value',
  as_of_at timestamptz not null,
  observed_at timestamptz,
  value_numeric numeric(20, 6),
  value_text text,
  unit text,
  direction text check (direction in ('up', 'down', 'flat', 'unknown')),
  confidence numeric(5, 4),
  normalization_version text not null,
  is_suspicious boolean not null default false,
  suspicious_reasons jsonb not null default '[]'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  dedupe_key text not null unique,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.sns_rollup_candidates (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.run_history (id) on delete cascade,
  provider_id uuid not null references public.providers (id) on delete cascade,
  source_snapshot_id uuid references public.raw_snapshots (id) on delete set null,
  rollup_key text not null unique,
  tab_slug public.feed_tab not null default 'sns_feed',
  headline text not null,
  summary text not null,
  source_items jsonb not null default '[]'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  is_suspicious boolean not null default true,
  suspicious_reasons jsonb not null default '[]'::jsonb,
  review_status public.review_status not null default 'pending',
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.review_queue (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references public.run_history (id) on delete cascade,
  entity_type public.review_entity_type not null,
  entity_id uuid not null,
  status public.review_status not null default 'pending',
  priority integer not null default 2 check (priority between 0 and 3),
  reason_code text not null,
  reason_detail text,
  original_payload jsonb not null default '{}'::jsonb,
  edited_payload jsonb,
  publish_after_approval boolean not null default true,
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  decision_note text,
  published_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.manual_overrides (
  id uuid primary key default gen_random_uuid(),
  target_tab_slug public.feed_tab not null,
  item_key text not null,
  payload jsonb not null,
  reason text not null,
  source_run_id uuid references public.run_history (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  approved_by uuid references auth.users (id) on delete set null,
  is_active boolean not null default true,
  published_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.feed_layout_items (
  id uuid primary key default gen_random_uuid(),
  tab_slug public.feed_tab not null,
  item_key text not null,
  item_kind public.feed_item_kind not null,
  source_ref text,
  title text not null,
  subtitle text,
  body text,
  order_index integer not null default 100,
  is_visible boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (tab_slug, item_key)
);

create table if not exists public.feed_current_state (
  id uuid primary key default gen_random_uuid(),
  tab_slug public.feed_tab not null,
  item_key text not null,
  item_kind public.feed_item_kind not null,
  source_type text not null check (source_type in ('indicator_point', 'sns_rollup', 'manual_override')),
  source_id uuid,
  source_run_id uuid references public.run_history (id) on delete set null,
  layout_item_id uuid references public.feed_layout_items (id) on delete set null,
  review_queue_id uuid references public.review_queue (id) on delete set null,
  override_id uuid references public.manual_overrides (id) on delete set null,
  content jsonb not null default '{}'::jsonb,
  published_at timestamptz not null default timezone('utc', now()),
  published_by uuid references auth.users (id) on delete set null,
  freshness_deadline_at timestamptz,
  is_current boolean not null default true,
  superseded_at timestamptz,
  superseded_by uuid references public.feed_current_state (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.publish_events (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references public.run_history (id) on delete set null,
  mode public.publish_mode not null,
  item_count integer not null default 0 check (item_count >= 0),
  actor_user_id uuid references auth.users (id) on delete set null,
  actor_reason text,
  review_queue_ids uuid[] not null default array[]::uuid[],
  override_id uuid references public.manual_overrides (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default timezone('utc', now()),
  actor_user_id uuid references auth.users (id) on delete set null,
  actor_roles text[] not null default array[]::text[],
  action text not null,
  entity_type text not null,
  entity_id text not null,
  run_id uuid references public.run_history (id) on delete set null,
  request_id uuid references public.job_run_requests (id) on delete set null,
  before_state jsonb,
  after_state jsonb,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_providers_health on public.providers (source_health, is_enabled);
create index if not exists idx_collection_jobs_provider on public.collection_jobs (provider_id, is_enabled);
create index if not exists idx_collection_jobs_last_status on public.collection_jobs (last_run_status, last_finished_at desc);
create index if not exists idx_job_run_requests_job_requested_at on public.job_run_requests (job_id, requested_at desc);
create index if not exists idx_run_history_job_created_at on public.run_history (job_id, created_at desc);
create index if not exists idx_run_history_provider_created_at on public.run_history (provider_id, created_at desc);
create index if not exists idx_run_history_status_created_at on public.run_history (status, created_at desc);
create index if not exists idx_run_logs_run_id_logged_at on public.run_logs (run_id, logged_at desc);
create index if not exists idx_raw_snapshots_run_id on public.raw_snapshots (run_id, fetched_at desc);
create index if not exists idx_raw_snapshots_provider_fetched_at on public.raw_snapshots (provider_id, fetched_at desc);
create index if not exists idx_normalized_indicator_points_run_id on public.normalized_indicator_points (run_id, created_at desc);
create index if not exists idx_normalized_indicator_points_indicator_as_of on public.normalized_indicator_points (indicator_key, as_of_at desc);
create index if not exists idx_sns_rollup_candidates_run_id on public.sns_rollup_candidates (run_id, created_at desc);
create index if not exists idx_review_queue_status_priority on public.review_queue (status, priority, created_at desc);
create index if not exists idx_feed_layout_items_tab_order on public.feed_layout_items (tab_slug, order_index, is_visible);
create index if not exists idx_feed_current_state_tab_current on public.feed_current_state (tab_slug, published_at desc) where is_current;
create unique index if not exists uq_feed_current_state_current on public.feed_current_state (tab_slug, item_key) where is_current;
create index if not exists idx_publish_events_run_created on public.publish_events (run_id, created_at desc);
create index if not exists idx_audit_log_entity on public.audit_log (entity_type, entity_id, occurred_at desc);

create or replace view public.indicator_current_state
with (security_invoker = true) as
select
  fcs.id,
  fcs.tab_slug,
  fcs.item_key,
  fcs.source_run_id,
  fcs.source_id as normalized_point_id,
  fcs.content,
  fcs.published_at,
  fcs.freshness_deadline_at
from public.feed_current_state fcs
where fcs.is_current
  and fcs.item_kind = 'indicator_card';

grant usage on schema public to anon, authenticated, service_role;
grant select on
  public.admin_users,
  public.providers,
  public.collection_jobs,
  public.job_run_requests,
  public.run_history,
  public.run_logs,
  public.raw_snapshots,
  public.normalized_indicator_points,
  public.sns_rollup_candidates,
  public.review_queue,
  public.manual_overrides,
  public.feed_layout_items,
  public.feed_current_state,
  public.publish_events,
  public.audit_log,
  public.indicator_current_state
to authenticated;

create trigger set_admin_users_updated_at
before update on public.admin_users
for each row execute procedure app_private.set_updated_at();

create trigger set_providers_updated_at
before update on public.providers
for each row execute procedure app_private.set_updated_at();

create trigger set_collection_jobs_updated_at
before update on public.collection_jobs
for each row execute procedure app_private.set_updated_at();

create trigger set_run_history_updated_at
before update on public.run_history
for each row execute procedure app_private.set_updated_at();

create trigger set_review_queue_updated_at
before update on public.review_queue
for each row execute procedure app_private.set_updated_at();

create trigger set_feed_layout_items_updated_at
before update on public.feed_layout_items
for each row execute procedure app_private.set_updated_at();

alter table public.admin_users enable row level security;
alter table public.providers enable row level security;
alter table public.collection_jobs enable row level security;
alter table public.job_run_requests enable row level security;
alter table public.run_history enable row level security;
alter table public.run_logs enable row level security;
alter table public.raw_snapshots enable row level security;
alter table public.normalized_indicator_points enable row level security;
alter table public.sns_rollup_candidates enable row level security;
alter table public.review_queue enable row level security;
alter table public.manual_overrides enable row level security;
alter table public.feed_layout_items enable row level security;
alter table public.feed_current_state enable row level security;
alter table public.publish_events enable row level security;
alter table public.audit_log enable row level security;

create policy "admin users can read own profile or admin list"
on public.admin_users
for select
using (
  auth.uid() = user_id
  or app_private.can_manage_admin()
);

create policy "admins can read providers"
on public.providers
for select
using (app_private.can_read_admin());

create policy "admins can read jobs"
on public.collection_jobs
for select
using (app_private.can_read_admin());

create policy "admins can read job run requests"
on public.job_run_requests
for select
using (app_private.can_read_admin());

create policy "admins can read run history"
on public.run_history
for select
using (app_private.can_read_admin());

create policy "admins can read run logs"
on public.run_logs
for select
using (app_private.can_read_admin());

create policy "admins can read raw snapshots"
on public.raw_snapshots
for select
using (app_private.can_read_admin());

create policy "admins can read normalized points"
on public.normalized_indicator_points
for select
using (app_private.can_read_admin());

create policy "admins can read sns rollups"
on public.sns_rollup_candidates
for select
using (app_private.can_read_admin());

create policy "review roles can read queue"
on public.review_queue
for select
using (app_private.can_review() or app_private.can_publish());

create policy "admins can read overrides"
on public.manual_overrides
for select
using (app_private.can_read_admin());

create policy "admins can read feed layout"
on public.feed_layout_items
for select
using (app_private.can_read_admin());

create policy "admins can read published state"
on public.feed_current_state
for select
using (app_private.can_read_admin());

create policy "admins can read publish events"
on public.publish_events
for select
using (app_private.can_read_admin());

create policy "admins can read audit log"
on public.audit_log
for select
using (app_private.can_read_admin());

comment on table public.providers is 'Registry of upstream data providers and their auth/legal/health state.';
comment on table public.collection_jobs is 'Operator-controlled collector and publish jobs with parser versioning.';
comment on table public.job_run_requests is 'Idempotent rerun and backfill requests initiated by admins.';
comment on table public.run_history is 'Explicit run state machine and top-level diagnostics for each execution.';
comment on table public.raw_snapshots is 'Raw provider payloads stored independently from normalized points.';
comment on table public.normalized_indicator_points is 'Canonical per-run indicator points used for publish decisions.';
comment on table public.sns_rollup_candidates is 'Review-gated social feed candidates prepared from raw snapshots.';
comment on table public.review_queue is 'Suspicious output and SNS approval queue.';
comment on table public.feed_current_state is 'Append-only published state used by public feed BFFs.';
comment on table public.audit_log is 'Immutable privileged action trail for config, review, rerun, and publish operations.';

commit;
