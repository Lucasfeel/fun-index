create schema if not exists app_private;

revoke all on schema app_private from public;
revoke all on schema app_private from anon;
revoke all on schema app_private from authenticated;
grant usage on schema app_private to service_role;

create table if not exists app_private.alert_users (
  id uuid primary key default gen_random_uuid(),
  toss_user_key text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists app_private.alert_sessions (
  id uuid primary key default gen_random_uuid(),
  alert_user_id uuid not null references app_private.alert_users(id) on delete cascade,
  session_token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_used_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists app_private.alert_subscriptions (
  id uuid primary key default gen_random_uuid(),
  alert_user_id uuid not null references app_private.alert_users(id) on delete cascade,
  item_key text not null,
  tab_slug text not null check (tab_slug in ('home', 'pentagon', 'psychology', 'sns_feed')),
  signal_name text not null default '',
  threshold_stage integer not null check (threshold_stage between 1 and 5),
  enabled boolean not null default true,
  last_observed_stage integer check (last_observed_stage between 1 and 5),
  last_seen_state_key text,
  last_notified_state_key text,
  last_notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint alert_subscriptions_user_item_key unique (alert_user_id, item_key)
);

create table if not exists app_private.alert_events (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid references app_private.alert_subscriptions(id) on delete set null,
  alert_user_id uuid not null references app_private.alert_users(id) on delete cascade,
  item_key text not null,
  tab_slug text not null check (tab_slug in ('home', 'pentagon', 'psychology', 'sns_feed')),
  state_key text not null,
  observed_stage integer not null check (observed_stage between 1 and 5),
  threshold_stage integer not null check (threshold_stage between 1 and 5),
  score numeric,
  signal_name text not null default '',
  message_context jsonb not null default '{}'::jsonb,
  delivery_status text not null check (delivery_status in ('sent', 'failed', 'skipped')),
  toss_response jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now()
);

drop trigger if exists alert_users_touch_updated_at on app_private.alert_users;
create trigger alert_users_touch_updated_at
before update on app_private.alert_users
for each row execute function ops.touch_updated_at();

drop trigger if exists alert_sessions_touch_updated_at on app_private.alert_sessions;
create trigger alert_sessions_touch_updated_at
before update on app_private.alert_sessions
for each row execute function ops.touch_updated_at();

drop trigger if exists alert_subscriptions_touch_updated_at on app_private.alert_subscriptions;
create trigger alert_subscriptions_touch_updated_at
before update on app_private.alert_subscriptions
for each row execute function ops.touch_updated_at();

create index if not exists alert_sessions_active_hash_idx
  on app_private.alert_sessions (session_token_hash)
  where revoked_at is null;

create index if not exists alert_sessions_user_idx
  on app_private.alert_sessions (alert_user_id, expires_at desc);

create index if not exists alert_subscriptions_enabled_item_idx
  on app_private.alert_subscriptions (item_key, enabled, threshold_stage)
  where enabled;

create index if not exists alert_subscriptions_user_enabled_idx
  on app_private.alert_subscriptions (alert_user_id, enabled, updated_at desc);

create index if not exists alert_events_user_created_idx
  on app_private.alert_events (alert_user_id, created_at desc);

create unique index if not exists alert_events_subscription_state_idx
  on app_private.alert_events (subscription_id, state_key)
  where subscription_id is not null;

alter table app_private.alert_users enable row level security;
alter table app_private.alert_sessions enable row level security;
alter table app_private.alert_subscriptions enable row level security;
alter table app_private.alert_events enable row level security;

grant select, insert, update, delete on
  app_private.alert_users,
  app_private.alert_sessions,
  app_private.alert_subscriptions,
  app_private.alert_events
to service_role;
