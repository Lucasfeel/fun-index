# Indicator Feed Platform Architecture

This document describes the backend and separate Admin UI architecture for an indicator-driven Toss mini-app running in a browser-like WebView, with Supabase as the persistence and edge execution platform.

## Source assumptions

- The user-facing mini-app runs inside Apps in Toss WebView and should behave like a browser client.
- Toss login guidance requires the mini-app to obtain only the authorization code on the client, while token exchange and any privileged processing happen on the server.
- Supabase guidance recommends RLS on exposed tables and explicit CORS handling for Edge Functions invoked from browser environments.

Reference links:

- [Apps in Toss WebView guide](https://developers-apps-in-toss.toss.im/tutorials/webview.md)
- [Apps in Toss `appLogin` reference](https://developers-apps-in-toss.toss.im/bedrock/reference/framework/%EB%A1%9C%EA%B7%B8%EC%9D%B8/appLogin.md)
- [Supabase RLS guide](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase Edge Functions CORS guide](https://supabase.com/docs/guides/functions/cors)
- [Supabase scheduled Edge Functions](https://supabase.com/docs/guides/functions/schedule-functions)

## Goals

- Keep the user-facing app on anon-safe credentials only.
- Put privileged logic in Edge Functions with explicit role checks.
- Separate raw collection artifacts from normalized domain data and published feed state.
- Preserve traceability from a public card back to the exact run, snapshot, and review decision.
- Make hourly operations debuggable, repeatable, and recoverable.

## High-level system

```text
Apps in Toss mini-app
  -> public Edge Function BFFs
    -> published feed state

Admin UI
  -> RLS-protected reads on operational tables/views
  -> admin Edge Functions for mutations
    -> config updates, reruns, approvals, overrides, publishing

Scheduled jobs
  -> pg_cron / pg_net
    -> Edge Function pipeline execution
      -> raw snapshots
      -> normalized points / social candidates
      -> review queue
      -> publish-current-state
```

## Database schema proposal

### Identity and authorization

- `admin_users`
  - One row per Supabase Auth user allowed into the Admin UI.
  - Stores `display_name`, `email`, `roles[]`, `is_active`.
  - Roles: `viewer`, `ops`, `reviewer`, `publisher`, `admin`.

### Provider and job configuration

- `providers`
  - Provider registry for `PizzINT`, `CNN`, `CMC`, and `X`.
  - Tracks `auth_state`, `legal_mode`, `source_health`, SLA, notes, and config JSON.

- `collection_jobs`
  - One row per recurring pipeline step.
  - Tracks parser version, cron schedule, enabled state, publish behavior, timeout, and last run summaries.

### Execution and observability

- `job_run_requests`
  - Durable queue of manual rerun, retry, backfill, and publish-only requests.
  - Holds idempotency key, request window, and operator reason.

- `run_history`
  - Canonical run record with explicit status transitions.
  - Carries `trigger`, `status`, `parser_version`, `pipeline_version`, timestamps, summary, diagnostics, and error fields.

- `run_logs`
  - Structured log lines tied to a run and stage.
  - Intended for admin-facing diagnostics and compact previews.

### Data lineage

- `raw_snapshots`
  - Exact provider payload capture with headers, checksum, source URL, and parser status.
  - Stored independently from normalized results.

- `normalized_indicator_points`
  - Per-run normalized numeric or textual indicator points.
  - Each row points back to `raw_snapshots` and `run_history`.

- `sns_rollup_candidates`
  - Review-gated social rollups prepared for the SNS Feed.
  - Separated from numeric indicator points because editorial review and publish rules differ.

### Review and publishing

- `review_queue`
  - Suspicious output gate for indicators and mandatory approval queue for SNS rollups.
  - Holds original payload, edited payload, reason code, priority, reviewer, and publish status.

- `manual_overrides`
  - Explicit operator-authored corrections with reason and approver trail.

- `feed_layout_items`
  - Tab composition, visibility, copy, item order, and card config.
  - Drives Home, Pentagon, Psychology, and SNS Feed assembly.

- `feed_current_state`
  - Append-only published layer.
  - Every publish inserts a new current row and supersedes the previous one.
  - Tracks `source_run_id`, `source_type`, `source_id`, review link, override link, and freshness deadline.

- `indicator_current_state`
  - Convenience view over `feed_current_state` for indicator cards only.
  - Satisfies the requested published-layer requirement without losing feed-level generality.

### Audit

- `publish_events`
  - One row per publish action, including automatic publish, review-approved publish, and override publish.

- `audit_log`
  - Immutable record for provider changes, job toggles, reruns, approvals, overrides, layout edits, and publish actions.

## RLS strategy

### User-facing app

- The mini-app does not query operational tables directly.
- It uses only anon-safe Edge Functions:
  - `public-feed-home`
  - `public-feed-pentagon`
  - `public-feed-psychology`
  - `public-feed-sns`
- Public tables still keep RLS enabled with no anon read policies except where a table is intentionally public-safe. In this design, public read access stays inside Edge Functions.

### Admin UI

- All operational tables are RLS-enabled.
- Admin read access is based on `admin_users.roles`.
- Role lookup uses `app_private.has_role()` and `app_private.has_any_role()` security-definer helpers.
- Recommended policy shape:
  - `viewer`, `ops`, `reviewer`, `publisher`, `admin`: read dashboards and runs.
  - `ops`, `admin`: change providers, jobs, and rerun controls.
  - `reviewer`, `publisher`, `admin`: read and act on review queue.
  - `publisher`, `admin`: publish current state and activate overrides.
  - `admin`: manage admin users and any future privileged config.

### Why table-backed roles instead of trusting user metadata

- The role source is centralized in Postgres.
- Revocation takes effect immediately on the next query.
- RLS checks do not depend on refreshed JWT claims.
- Edge Functions can still perform an explicit `admin_users` lookup for defense in depth.

## Edge Function architecture

### Public BFF functions

- `public-feed-home`
  - Returns the current Home tab cards.
- `public-feed-pentagon`
  - Returns current Pentagon cards such as Pizza Index and Gay Bar Index.
- `public-feed-psychology`
  - Returns current psychology indicators, including fear-and-greed style cards.
- `public-feed-sns`
  - Returns current, approved SNS rollups only.

Common behavior:

- Handle browser/WebView `OPTIONS` preflight.
- Accept only safe query parameters.
- Read only from current published state and active layout rows.
- Never expose raw snapshots, provider credentials, or internal diagnostics.

### Privileged admin functions

- `admin-rerun`
  - Validates job slug, mode, window, and idempotency key.
  - Inserts `job_run_requests`.
  - Creates or reuses a `run_history` row by idempotency key.
  - Intended to either enqueue work or invoke shared pipeline code inline.

- `publish-current-state`
  - Publishes approved indicator points and SNS rollups into `feed_current_state`.
  - Marks previous current records superseded instead of mutating in place.
  - Emits `publish_events` and `audit_log`.

- `admin-override-publish`
  - Stores a durable override row and publishes it as the new current state.
  - Requires `publisher` or `admin`.

- `admin-review-action`
  - Approve, reject, edit, or publish a review queue item.
  - Optionally forwards approved items to `publish-current-state`.

- `admin-config-upsert`
  - Single explicit write surface for providers, jobs, and feed layout updates.
  - Keeps audit logging and validation centralized.

### Shared implementation rules

- Use idempotency keys for any mutation that can be retried.
- Record every run and publish with explicit state transitions.
- Return admin-friendly payloads:
  - stable error code
  - human summary
  - diagnostics object
  - correlation id or run id

## Scheduled operations

- Hourly collection is driven with `pg_cron`.
- `pg_net` invokes a pipeline Edge Function or `admin-rerun`-compatible internal entrypoint.
- Supabase Vault stores project URL and auth tokens for internal function invocation.
- `collection_jobs.schedule_cron` remains the source of truth for displayed schedule, while actual cron deployment should be reconciled from the same config.

## Admin UI information architecture

- Dashboard
  - Recent runs
  - Failure rate
  - Freshness SLA violations
  - Provider/source health

- Providers
  - `PizzINT`, `CNN`, `CMC`, `X`
  - Auth state
  - Legal/data mode
  - Endpoint/config summary
  - Enable or pause provider

- Jobs
  - Hourly collectors and publish jobs
  - Cron schedule
  - Parser version
  - On/off state
  - Last run summary

- Review Queue
  - Suspicious indicators
  - Failed parser outputs
  - SNS rollups awaiting approval
  - Approve, reject, edit, publish

- Runs
  - Execution log timeline
  - Raw snapshot preview
  - Diagnostics
  - Retry / rerun affordances

- Feed Layout
  - Tab composition
  - Card order
  - Copy and visibility
  - Source binding

- Manual Rerun
  - One-shot run
  - Backfill window
  - Publish-only mode
  - Override payload tools

## API contracts

### Public feed response

```json
{
  "tab": "pentagon",
  "generatedAt": "2026-04-22T10:00:00.000Z",
  "cards": [
    {
      "itemKey": "pentagon:pizza-index",
      "title": "Pizza Index",
      "kind": "indicator_card",
      "content": {
        "score": 68.2,
        "direction": "up"
      },
      "publishedAt": "2026-04-22T10:00:00.000Z",
      "freshnessDeadlineAt": "2026-04-22T11:00:00.000Z",
      "sourceRunId": "c0d7..."
    }
  ]
}
```

### Admin rerun request

```json
{
  "jobSlug": "collect-pizzint-pizza-index",
  "mode": "one_shot",
  "idempotencyKey": "manual-rerun-20260422-1000-pizzint",
  "reason": "Parser hotfix verification"
}
```

### Admin rerun response

```json
{
  "requestId": "5a44...",
  "runId": "b98b...",
  "status": "queued"
}
```

### Publish current state request

```json
{
  "runId": "b98b...",
  "mode": "review_approved",
  "reviewQueueIds": ["b7f2..."],
  "actorReason": "Approved after manual copy correction"
}
```

### Admin error shape

```json
{
  "error": {
    "code": "REVIEW_REQUIRED",
    "message": "Run produced suspicious output and requires review before publishing.",
    "details": {
      "runId": "b98b...",
      "reviewQueueIds": ["b7f2..."]
    }
  }
}
```

## Audit and observability plan

### Audit trail

- All privileged mutations insert `audit_log`.
- Important configuration changes also capture `before_state` and `after_state`.
- Publish flow records:
  - actor
  - run id
  - review ids
  - override id if present
  - published item count

### Freshness monitoring

- `feed_current_state.freshness_deadline_at` enables direct stale-content detection.
- Dashboard exposes stale cards and providers missing SLA.
- Alerting can key off:
  - provider last success older than SLA
  - failed runs in rolling window
  - pending review queue older than threshold

### Diagnostics

- `run_logs` contains compact structured stage logs.
- `run_history.diagnostics` stores parser version, retry count, and coarse execution metrics.
- `raw_snapshots` keeps previewable evidence for operator review.

### Recommended external instrumentation

- Sentry for Admin UI and function exception capture.
- Postgres and function logs exported to a central log sink if compliance requires longer retention.
- Optional synthetic checks against public BFF endpoints to verify card freshness.

## Production-ready implementation patterns

- Use append-only publish records instead of in-place state mutation.
- Keep raw payloads and normalized points in separate tables.
- Generate a stable idempotency key for each admin-initiated mutation.
- Never trust the browser for authorization decisions.
- Keep privileged secrets only in Supabase secrets or environment variables.
- Validate every function payload with strict schemas.
- Return concise operator-facing error codes and enough structured context to recover quickly.

## Non-goals for this baseline

- Fully automated provider scrapers for every external source.
- A complete CI/CD pipeline.
- End-user mini-app UI implementation.

The current baseline is intended to give you a debuggable, secure, and extensible foundation for hourly indicator operations and a separate operational Admin UI.
