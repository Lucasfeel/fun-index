# Toss Mini-App UI/UX Spec

## Product Thesis

- Visual thesis: a calm mobile briefing product that feels closer to Toss feed surfaces than to a trading dashboard.
- Content thesis: every screen should answer three questions fast: what changed, how fresh it is, and what it means in one sentence.
- Interaction thesis: keep motion quiet and functional with pull-to-refresh, sticky section headers, and short page transitions that preserve context.

## Toss Alignment

- Use a single-column mobile layout as the default pattern.
- Prefer `ListHeader`, `ListRow`, `Badge`, `Tab`, `Skeleton`, and `Toast` style behaviors over custom analytics widgets.
- Respect Apps in Toss safe areas for both the top app bar and bottom tab bar.
- Disable pinch zoom and avoid interactions that make the WebView feel browser-like or dense.
- Treat this as a read-only content product. The core interaction is scan, tap, understand, and move on.

## Public Naming Layer

- Keep the internal engineering identifiers unchanged.
- Use calmer public labels when the raw metric name may feel too sharp in consumer UI.
- Recommended mapping:

| Internal identifier | Public label | Notes |
| --- | --- | --- |
| `pizza_index` | Pizza Index | Public-safe as-is. |
| `gay_bar_index` | Nightlife Index | Preserve original internal identifier for engineering and analytics. Use `Nightlife Index` in consumer UI. |

- If product/legal wants maximum explicitness, show the internal name only in internal tooling or debug logs, not in the user-facing app.

## App Shell

- Top app bar:
  - Title: product name or `Signals`.
  - Secondary text: `As of 2:00 PM` or `Updated 18 min ago`.
  - Optional right action: refresh only if it reflects real refetch behavior.
- Bottom navigation:
  - Tabs: `Home`, `Pentagon`, `Psychology`, `SNS Feed`.
  - Fixed to the bottom safe area with generous tap targets.
  - Preserve per-tab scroll position and filter state.
- Surface:
  - Light mode: white and soft grey layers with minimal borders.
  - Dark mode: near-black neutral surfaces, not saturated dark blue.
  - Use dividers and spacing before using cards.

## Screen Architecture

### 1. Home

- Purpose: a calm landing surface that summarizes the latest state across the app.
- Structure:
  - App bar with last global update time and overall freshness.
  - `Latest across tabs` summary stack.
  - `Pentagon` snapshot section.
  - `Psychology` snapshot section.
  - `SNS Feed` snapshot section.
  - Bottom information block for methodology and revision note.
- Behavior:
  - Each section shows 1-3 rows only.
  - Tapping a row goes directly to the relevant detail page.
  - Tapping the section header goes to the parent tab feed.
- What belongs here:
  - Current reading/state label.
  - Recent change versus prior hour or prior update.
  - Freshness badge.
  - One-line explanation.
- What does not belong here:
  - Long charts.
  - Dense KPI grids.
  - Venue lists.
  - Raw social posts.

### 2. Pentagon

- Purpose: an aggregate-first feed for the Pentagon family.
- Recommended top structure:
  - Sticky screen header with `Pentagon`.
  - Lightweight segmented tab: `Pizza`, `Nightlife`.
  - Selected indicator summary row at top.
  - Reverse-chronological feed of approved hourly snapshots for the selected indicator.
- Feed rules:
  - Every row represents an aggregate update, not a venue.
  - Each row should be understandable without opening detail.
  - Avoid map entry points, place counts by venue, or hyperlocal discovery behavior.

### 3. Psychology

- Purpose: a feed of fear-and-greed style indicators presented in plain language.
- Structure:
  - Header with latest update time.
  - Optional lightweight filter only if the indicator count grows enough to make scanning hard.
  - Reverse-chronological indicator feed.
- Card emphasis:
  - Indicator name.
  - Current zone or state.
  - Change from previous reading.
  - One-line interpretation.

### 4. SNS Feed

- Purpose: a readable stream of approved signal rollups.
- Structure:
  - Header with latest approved rollup time.
  - Feed of rollups sorted newest first.
  - Each item contains theme, takeaways, and source breadth, not raw post clutter.
- Content rules:
  - Show editorially approved rollups only.
  - Do not show usernames, raw noisy snippets, or a social network-style composer surface.

### 5. Detail Pages

- Purpose: explain one signal clearly with minimal chrome.
- Shared structure:
  - Simple top bar with back button and current tab context.
  - Hero reading block.
  - `What changed` section.
  - `Why it matters` section.
  - `Recent history` section.
  - `About this signal` section.
  - Bottom information / disclaimer block.

## Information Hierarchy

### Feed level hierarchy

1. Indicator or rollup title.
2. Current reading or state label.
3. Freshness and timestamp.
4. Change from previous reading.
5. One-line explanation.
6. Secondary metadata only if it helps scanning.

### Detail level hierarchy

1. Current reading.
2. Freshness.
3. Direction of change.
4. Concise explanation.
5. Short recent history.
6. Methodology or caveat.

## Feed Row Spec

- Default pattern: divider-separated list rows, not stacked heavy cards.
- Suggested TDS mapping:
  - `ListHeader` for section titles and `See all`.
  - `ListRow` for each feed item.
  - `Badge` with `weak` variant for freshness and state.
- Anatomy:
  - Eyebrow: category label such as `Pentagon`, `Psychology`, or `SNS`.
  - Title: indicator or rollup name.
  - Meta line: `As of 2:00 PM` plus freshness badge.
  - Reading line: current state in plain language, optionally paired with a compact numeric reading.
  - Change line: `Up from last hour` / `Little changed from prior update`.
  - Explanation line: max one sentence.
- Interaction:
  - Entire row is tappable with standard Toss touch feedback.
  - No inline expansion inside the main feed.
  - No secondary menus by default.
- Density:
  - Comfortable vertical rhythm.
  - Target 2.5 to 3.5 rows visible above the fold on most devices.

## Detail Page Spec

- Hero reading block:
  - Title.
  - Public-facing subtitle if needed.
  - Current reading in plain language first, numeric second.
  - Freshness badge.
  - Absolute timestamp.
- `What changed` section:
  - Short comparison to prior hour or prior available reading.
  - Optional micro-trend chip such as `Higher than 6h average`.
- `Why it matters` section:
  - One short paragraph in factual language.
  - Avoid causal overclaiming.
- `Recent history` section:
  - Use a simple 3-5 point change list or a very quiet sparkline.
  - No advanced chart controls, overlays, or technical indicators.
- `About this signal` section:
  - Short methodology summary.
  - Update cadence: `Updated hourly`.
  - Revision note if backfills are possible.

## Freshness Model

- Freshness should be visible on every summary row and every detail hero.
- Recommended states for an hourly product:

| State | Recommended threshold | UI treatment | Example copy |
| --- | --- | --- | --- |
| Fresh | within 75 minutes of scheduled update | blue or teal weak badge | `Fresh` |
| Delayed | 75 to 180 minutes | yellow weak badge | `Update pending` |
| Stale | over 180 minutes | grey or amber weak badge | `Stale` |
| Unavailable | no usable current snapshot | muted disabled row or empty module | `Unavailable` |

- Always pair the badge with an `as of` time.
- Staleness should feel transparent, not scary.
- Recommended pattern: badge + plain sentence, not warning banners.

## Navigation Behavior

- Bottom tab bar stays visible on top-level feed screens.
- Detail pages push within the current tab stack and hide the bottom tab bar for focus.
- Back returns users to the exact prior scroll position.
- Preserve filter or segmented-tab selection when moving between feed and detail.
- Home should deep-link into tab details without forcing users through intermediate screens.
- Pull-to-refresh is acceptable on top-level feeds if it produces a quiet confirmation toast such as `Updated just now` or `No newer update yet`.

## Loading, Empty, Error, and Stale UX

### Loading

- Use skeletons shaped like the final feed, not centered spinners.
- Recommended patterns:
  - Home: `Skeleton` with `topList` or `subtitleList`.
  - Feeds: `ListRow.Loader` or `Skeleton` list patterns.
- Show the app bar and section headers immediately so the screen feels anchored.

### Empty

- Empty states should be calm and specific.
- Examples:
  - `No approved social rollups yet. Check back after the next update.`
  - `No recent reading is available for this signal.`
- Avoid illustrations unless product branding specifically needs one.

### Error

- Distinguish product emptiness from fetch failure.
- Error module pattern:
  - Short message.
  - Timestamp of last successful data if available.
  - One retry action.
- Example:
  - `We couldn't load the latest update. Last available reading is from 1:00 PM.`

### Stale

- Keep stale content visible if it is still the best available snapshot.
- Dim confidence visually, not legibility.
- Show:
  - stale badge
  - last updated time
  - one sentence explaining delay
- Example:
  - `Latest refresh is running later than usual. Showing the most recent available reading.`

## Copy Guidelines

- Tone: calm, factual, concise, non-promotional.
- Put plain-language interpretation before jargon.
- Use `reading`, `state`, `update`, `change`, and `signal`.
- Avoid `trade`, `edge`, `alpha`, `buy`, `sell`, `moon`, `crash`, or certainty language.
- Avoid framing unusual indicators as novelty. Present them with the same editorial discipline as every other signal.
- If the metric name is awkward, use a neutral display label and explain the concept, not the awkwardness.

## Example Microcopy

- Home summary:
  - `Pentagon is slightly firmer than the prior hour.`
  - `Psychology remains in a cautious range.`
  - `Social discussion is active, but the tone is mixed.`
- Feed rows:
  - `Little changed from the previous update.`
  - `Higher than the prior hour, still near the recent range.`
  - `Latest approved rollup points to steadier consumer tone.`
- Freshness:
  - `As of 2:00 PM`
  - `Updated 18 min ago`
  - `Update pending`
  - `Showing the most recent available reading`
- Detail explanation:
  - `This reading suggests conditions are warmer than usual, though still within the recent range.`
  - `The latest move is notable, but the short-term trend remains mixed.`
- Bottom information:
  - `These indicators are informational summaries and may be revised as new data arrives.`

## Visual System Guidance

- Typography:
  - Use Toss-like type scale with strong contrast between title, primary reading, and supporting text.
  - Keep numbers large only when they represent the current reading on detail pages.
- Color:
  - Use semantic color sparingly for state.
  - Most of the UI should live in neutral tones.
  - Prefer weak badges by default; reserve filled badges for truly high-priority states.
- Spacing:
  - Generous horizontal padding.
  - Clear section breaks.
  - Breathing room around timestamps and explanation text.
- Charts:
  - Optional tiny sparkline only on detail.
  - No multi-series comparisons by default.

## Rationale

- A list-first architecture makes niche indicators feel approachable because users scan them like updates, not like tools.
- Strong freshness treatment builds trust in an hourly product without adding anxiety.
- Public naming discipline keeps the product credible and mainstream while preserving engineering continuity.
- Detail pages answer the natural follow-up questions without overwhelming the main feed.
- Using familiar Toss interaction patterns such as safe-area-aware app chrome, quiet badges, list rows, skeleton loading, and restrained toast feedback helps the product feel native to Toss rather than imported from an external analytics app.

## Implementation Notes

- Prioritize mobile safe-area handling from the first layout pass.
- Keep top-level screens single-column even on large devices; increase margins rather than switching to a dashboard grid.
- Default motion should be limited to:
  - short page transition on drill-in
  - sticky header compression on scroll
  - subtle skeleton-to-content fade
- Avoid bottom sheets unless there is a clear need for a lightweight filter or explanation.
- If a chart, overlay, or control makes the screen feel like a workstation, cut it.

## Assumptions To Confirm Later

- The app publishes on an hourly cadence with occasional delays, so the freshness thresholds above are based on lag from the expected hourly update.
- `Nightlife Index` is the recommended public label for `gay_bar_index`; this should be validated with product, policy, and brand owners.
- SNS Feed items are editorially approved rollups with enough structure to support one-line summaries and timestamps.
