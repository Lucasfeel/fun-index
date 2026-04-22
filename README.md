# Indicator Signal Mini-App

User-facing Toss mini-app frontend for aggregate indicator and behavior signals.

## Stack

- React 18 + TypeScript + Vite
- Apps in Toss WebView config via `@apps-in-toss/web-framework`
- TDS Mobile provider via `@toss/tds-mobile-ait`
- React Router for bottom-tab and detail navigation
- TanStack Query for async state
- Supabase public/anon client for read-only data access

## Scripts

- `npm run dev`
- `npm run build`
- `npm run check`
- `npm run lint`

## Assumptions

- This repository contains only the user-facing mini-app. Admin, ingestion, approval tooling, crawler logic, and privileged operations are intentionally excluded.
- The frontend reads from anon-safe Supabase views. By default the app expects:
  - `public_indicator_signal_snapshots`
  - `public_social_signal_feed`
- If Supabase env vars are missing, the UI falls back to local demo data so the feed and detail states are still testable.
- Detail pages are lightweight read-only screens within the same mobile shell and bottom-tab system.
- The app uses an hourly-refresh mental model. Freshness badges and stale messaging are derived from each item's `updated_at`.

## Environment

Copy `.env.example` values into a local `.env` file and provide your public Supabase credentials:

```bash
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_PUBLIC_ANON_KEY
```

## Toss Mini-App Config

`granite.config.ts` is included with placeholder brand metadata so the app can be wired into Apps in Toss without exposing private operational surfaces.

## Pipeline Layer

The repo now also contains a Supabase-native collection and publishing pipeline under [supabase](/C:/Users/lucas/Desktop/보조지표/supabase) for:

- provider adapters
- raw snapshot storage
- normalization and quality validation
- review-queue gating
- published current-state feeds

That pipeline is intentionally additive. The earlier `public.*` scaffold remains in place, while the new flow lives in `ops`, `admin`, and `app_public` so migration can happen gradually. Architecture details live in [docs/pipeline-architecture.md](/C:/Users/lucas/Desktop/보조지표/docs/pipeline-architecture.md).
