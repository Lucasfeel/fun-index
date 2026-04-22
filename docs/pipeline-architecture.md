# Pipeline Architecture

## Overview

This project treats collection, normalization, validation, and publishing as separate concerns so the Toss mini-app can stay fresh without letting unstable upstream data leak into the user feed.

The design is optimized for:

- hourly scheduled execution
- explicit publishing control
- deterministic transformations
- easy backfills
- admin review for suspicious or policy-sensitive outputs

## Migration Position

The repository already includes an earlier `public.*` platform scaffold for admin operations and feed publishing. The pipeline described here is additive rather than destructive:

- `ops` holds ingestion, normalization, validation, and publish control
- `admin` holds review history and inspection views for the Admin UI
- `app_public` holds frontend-safe published state and tab feed configuration

That separation lets the current app keep working while you migrate specific feed readers and admin tools onto the stricter pipeline path.

## Data Model

### `ops.provider_configs`

Defines how to talk to each source family:

- provider identity and family
- adapter key
- parser and normalizer versions
- fetch configuration
- metric contract overrides

### `ops.indicator_streams`

Defines the logical stream shown to users:

- stream code
- target tab
- metric metadata
- bounds and value type
- publish mode
- whether approval is required

### `ops.collection_jobs`

Represents scheduled work units. Each job points to one provider config and one stream so failure locks and publishing decisions remain stream-specific.

### `ops.pipeline_runs`

The canonical run ledger. Every scheduled run, retry, rerun, or backfill writes one row with:

- trigger type
- idempotency key
- status
- record count
- publish result
- error reason and code
- parser version
- last successful run
- machine-readable summary JSON

### `ops.raw_snapshots`

Stores immutable raw evidence before parsing:

- request fingerprint
- checksum
- raw payload
- observed and fetched times
- parser status and errors

### `ops.indicator_points`

Normalized points after parsing and validation:

- one logical point per stream and `observed_at`
- numeric values for bounded metrics
- JSON payload for structured rollups
- quality state and flags

### `app_public.indicator_current_state`

The frontend-facing published pointer per stream. This is the only state the feed function uses.

### `app_public.tab_feed_configs`

Config-driven feed layout that maps streams into tab cards. It lets product and admin tooling control ordering and presentation without rewriting pipeline code.

### `ops.review_queue`

A work queue for parser failures, suspicious data, timestamp regressions, and SNS approval-gated content.

### `admin.review_actions`

Append-only audit trail of manual decisions.

## Quality Rules

Numeric indicator streams default to `0..100`, unless the provider or stream explicitly overrides the bounds. Validation applies these rules:

- reject out-of-range values
- flag timestamp regressions against the last accepted point
- require review for approval-gated streams such as SNS rollups
- lock auto-publish after two consecutive parser failures

## Publish Contract

Publishing is allowed only when:

- the normalized candidate is accepted
- the job is publish-enabled
- the job is not locked for review
- the new point is not older than the current published state

Publishing writes a single upsert into `app_public.indicator_current_state`.

## Retry And Backfill Strategy

Idempotency is enforced through:

- `ops.pipeline_runs(job_id, idempotency_key)` unique constraint
- `ops.raw_snapshots(job_id, request_fingerprint, checksum)` unique constraint
- `ops.indicator_points(stream_id, observed_at)` unique constraint
- current-state upserts keyed by `stream_id`

That means:

- retrying the same job window is safe
- rerunning a historical window does not create duplicate points
- backfills remain explicit because the window is part of the idempotency key

## Error Taxonomy

The shared pipeline code uses explicit error codes so the Admin UI can filter and diagnose failures quickly:

- `PROVIDER_CONFIG_ERROR`
- `FETCH_HTTP_ERROR`
- `FETCH_AUTH_ERROR`
- `PARSER_ERROR`
- `NORMALIZATION_ERROR`
- `VALIDATION_ERROR`
- `PUBLISH_BLOCKED`
- `REVIEW_REQUIRED`
- `DATABASE_ERROR`
- `IDEMPOTENCY_CONFLICT`

## Admin UI Surface

The Admin UI can build around:

- `admin.pipeline_run_inspector`
- `admin.review_queue_inspector`
- `ops.pipeline_runs.summary`
- `ops.review_queue.candidate_payload`
- `app_public.tab_feed_configs`

These surfaces are intentionally easy to inspect, filter, and rerun against.

## Source Policy Notes

- Pentagon streams must stay aggregate-only.
- Provider adapters must never infer venue-level details from Google Maps.
- SNS content must enter the app only through approved rollups, not raw source events.
