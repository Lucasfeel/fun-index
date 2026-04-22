import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.49.8';

import { errorResponse } from './http.ts';

type FeedTab = 'home' | 'pentagon' | 'psychology' | 'sns_feed';

export async function logAuditEvent(
  client: SupabaseClient,
  input: {
    actorUserId: string | null;
    actorRoles: string[];
    action: string;
    entityType: string;
    entityId: string;
    runId?: string | null;
    requestId?: string | null;
    beforeState?: Record<string, unknown> | null;
    afterState?: Record<string, unknown> | null;
    metadata?: Record<string, unknown>;
  },
) {
  const { error } = await client.from('audit_log').insert({
    actor_user_id: input.actorUserId,
    actor_roles: input.actorRoles,
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId,
    run_id: input.runId ?? null,
    request_id: input.requestId ?? null,
    before_state: input.beforeState ?? null,
    after_state: input.afterState ?? null,
    metadata: input.metadata ?? {},
  });

  if (error) {
    console.error('audit_log insert failed', error);
  }
}

export async function buildPublicFeed(client: SupabaseClient, tab: FeedTab) {
  const [layoutResult, stateResult] = await Promise.all([
    client
      .from('feed_layout_items')
      .select('id, tab_slug, item_key, item_kind, title, subtitle, body, order_index, is_visible, config')
      .eq('tab_slug', tab)
      .eq('is_visible', true)
      .order('order_index', { ascending: true }),
    client
      .from('feed_current_state')
      .select('item_key, item_kind, content, published_at, freshness_deadline_at, source_run_id')
      .eq('tab_slug', tab)
      .eq('is_current', true),
  ]);

  if (layoutResult.error) {
    throw errorResponse(500, 'LAYOUT_READ_FAILED', 'Could not load feed layout.', {
      supabaseError: layoutResult.error.message,
    });
  }

  if (stateResult.error) {
    throw errorResponse(500, 'CURRENT_STATE_READ_FAILED', 'Could not load published state.', {
      supabaseError: stateResult.error.message,
    });
  }

  const currentByKey = new Map(
    (stateResult.data ?? []).map((row) => [
      row.item_key,
      row,
    ]),
  );

  const cards = (layoutResult.data ?? [])
    .map((layoutRow) => {
      const current = currentByKey.get(layoutRow.item_key);

      if (!current) {
        return null;
      }

      return {
        itemKey: layoutRow.item_key,
        title: layoutRow.title,
        subtitle: layoutRow.subtitle,
        body: layoutRow.body,
        kind: current.item_kind,
        content: current.content ?? {},
        publishedAt: current.published_at,
        freshnessDeadlineAt: current.freshness_deadline_at,
        sourceRunId: current.source_run_id,
      };
    })
    .filter(Boolean);

  return {
    tab,
    generatedAt: new Date().toISOString(),
    cards,
  };
}

export async function createOrReuseRun(
  client: SupabaseClient,
  input: {
    jobId: string;
    jobSlug: string;
    providerId: string | null;
    parserVersion: string;
    pipelineVersion: string;
    idempotencyKey: string;
    trigger: 'manual' | 'backfill' | 'publish_only' | 'retry';
    requestedBy: string;
    requestReason?: string | null;
    backfillStartAt?: string | null;
    backfillEndAt?: string | null;
    overridePayload?: Record<string, unknown> | null;
  },
) {
  const existing = await client
    .from('run_history')
    .select('id, status, request_id')
    .eq('idempotency_key', input.idempotencyKey)
    .maybeSingle();

  if (existing.error) {
    throw errorResponse(500, 'RUN_LOOKUP_FAILED', 'Could not resolve idempotent run.', {
      supabaseError: existing.error.message,
    });
  }

  if (existing.data) {
    return {
      requestId: existing.data.request_id,
      runId: existing.data.id,
      status: existing.data.status,
      reused: true,
    };
  }

  const requestInsert = await client
    .from('job_run_requests')
    .insert({
      job_id: input.jobId,
      requested_by: input.requestedBy,
      request_mode: input.trigger,
      idempotency_key: input.idempotencyKey,
      backfill_start_at: input.backfillStartAt ?? null,
      backfill_end_at: input.backfillEndAt ?? null,
      override_payload: input.overridePayload ?? null,
      request_reason: input.requestReason ?? null,
      request_status: 'queued',
    })
    .select('id')
    .single();

  if (requestInsert.error) {
    throw errorResponse(500, 'REQUEST_CREATE_FAILED', 'Could not create the run request.', {
      supabaseError: requestInsert.error.message,
    });
  }

  const runInsert = await client
    .from('run_history')
    .insert({
      request_id: requestInsert.data.id,
      job_id: input.jobId,
      provider_id: input.providerId,
      initiated_by: input.requestedBy,
      trigger: input.trigger,
      status: 'queued',
      idempotency_key: input.idempotencyKey,
      parser_version: input.parserVersion,
      pipeline_version: input.pipelineVersion,
      source_window_start_at: input.backfillStartAt ?? null,
      source_window_end_at: input.backfillEndAt ?? null,
      summary: {
        enqueuedByFunction: 'admin-rerun',
        jobSlug: input.jobSlug,
      },
    })
    .select('id, status')
    .single();

  if (runInsert.error) {
    throw errorResponse(500, 'RUN_CREATE_FAILED', 'Could not create the run history entry.', {
      supabaseError: runInsert.error.message,
    });
  }

  await client
    .from('collection_jobs')
    .update({
      last_enqueued_at: new Date().toISOString(),
    })
    .eq('id', input.jobId);

  return {
    requestId: requestInsert.data.id,
    runId: runInsert.data.id,
    status: runInsert.data.status,
    reused: false,
  };
}

function coerceIndicatorContent(point: Record<string, unknown>) {
  return {
    indicatorKey: point.indicator_key,
    metricKey: point.metric_key,
    asOfAt: point.as_of_at,
    observedAt: point.observed_at,
    valueNumeric: point.value_numeric,
    valueText: point.value_text,
    unit: point.unit,
    direction: point.direction,
    confidence: point.confidence,
    payload: point.payload ?? {},
  };
}

function coerceRollupContent(rollup: Record<string, unknown>) {
  return {
    headline: rollup.headline,
    summary: rollup.summary,
    sourceItems: rollup.source_items ?? [],
    payload: rollup.payload ?? {},
  };
}

async function supersedeCurrentState(
  client: SupabaseClient,
  row: {
    tabSlug: FeedTab;
    itemKey: string;
    itemKind: string;
    sourceType: 'indicator_point' | 'sns_rollup' | 'manual_override';
    sourceId: string | null;
    sourceRunId: string | null;
    layoutItemId: string | null;
    reviewQueueId?: string | null;
    overrideId?: string | null;
    content: Record<string, unknown>;
    publishedBy: string | null;
    freshnessDeadlineAt?: string | null;
  },
) {
  const prior = await client
    .from('feed_current_state')
    .select('id')
    .eq('tab_slug', row.tabSlug)
    .eq('item_key', row.itemKey)
    .eq('is_current', true);

  if (!prior.error) {
    for (const currentRow of prior.data ?? []) {
      await client
        .from('feed_current_state')
        .update({
          is_current: false,
          superseded_at: new Date().toISOString(),
        })
        .eq('id', currentRow.id);
    }
  }

  const insertResult = await client
    .from('feed_current_state')
    .insert({
      tab_slug: row.tabSlug,
      item_key: row.itemKey,
      item_kind: row.itemKind,
      source_type: row.sourceType,
      source_id: row.sourceId,
      source_run_id: row.sourceRunId,
      layout_item_id: row.layoutItemId,
      review_queue_id: row.reviewQueueId ?? null,
      override_id: row.overrideId ?? null,
      content: row.content,
      published_by: row.publishedBy,
      freshness_deadline_at: row.freshnessDeadlineAt ?? null,
      is_current: true,
    })
    .select('id')
    .single();

  if (insertResult.error) {
    throw errorResponse(500, 'CURRENT_STATE_WRITE_FAILED', 'Could not write published state.', {
      supabaseError: insertResult.error.message,
      itemKey: row.itemKey,
    });
  }

  return insertResult.data.id;
}

export async function publishRunToCurrentState(
  client: SupabaseClient,
  input: {
    runId: string;
    mode: 'automatic' | 'review_approved' | 'manual_override';
    actorUserId: string;
    actorRoles: string[];
    actorReason?: string | null;
    reviewQueueIds?: string[];
  },
) {
  const runResult = await client
    .from('run_history')
    .select('id, status')
    .eq('id', input.runId)
    .single();

  if (runResult.error || !runResult.data) {
    throw errorResponse(404, 'RUN_NOT_FOUND', 'Run could not be found.', {
      supabaseError: runResult.error?.message,
    });
  }

  const [layoutResult, pointsResult, rollupsResult, reviewResult] = await Promise.all([
    client.from('feed_layout_items').select('id, tab_slug, item_key, item_kind, source_ref, title, subtitle, body, config').eq('is_visible', true),
    client.from('normalized_indicator_points').select('*').eq('run_id', input.runId).order('as_of_at', { ascending: false }),
    client.from('sns_rollup_candidates').select('*').eq('run_id', input.runId).order('created_at', { ascending: false }),
    client.from('review_queue').select('id, entity_id, status, entity_type').eq('run_id', input.runId),
  ]);

  if (layoutResult.error || pointsResult.error || rollupsResult.error || reviewResult.error) {
    throw errorResponse(500, 'PUBLISH_PREREQ_READ_FAILED', 'Could not load publish prerequisites.', {
      layoutError: layoutResult.error?.message,
      pointsError: pointsResult.error?.message,
      rollupsError: rollupsResult.error?.message,
      reviewError: reviewResult.error?.message,
    });
  }

  const approvedReviewIds = new Set(
    (reviewResult.data ?? [])
      .filter((row) => row.status === 'approved' || row.status === 'published')
      .map((row) => row.id),
  );
  const explicitReviewIds = new Set(input.reviewQueueIds ?? []);

  const indicatorByKey = new Map<string, Record<string, unknown>>();
  for (const point of pointsResult.data ?? []) {
    if (!indicatorByKey.has(point.indicator_key)) {
      indicatorByKey.set(point.indicator_key, point);
    }
  }

  const rollupByKey = new Map<string, Record<string, unknown>>();
  for (const rollup of rollupsResult.data ?? []) {
    if (!rollupByKey.has(rollup.rollup_key)) {
      rollupByKey.set(rollup.rollup_key, rollup);
    }
  }

  const publishRows: Array<Promise<string>> = [];
  let publishedItemCount = 0;

  for (const layoutItem of layoutResult.data ?? []) {
    if (layoutItem.item_kind === 'indicator_card' && layoutItem.source_ref) {
      const point = indicatorByKey.get(layoutItem.source_ref);
      if (!point) {
        continue;
      }

      const relatedReview = (reviewResult.data ?? []).find(
        (row) => row.entity_type === 'indicator_point' && row.entity_id === point.id,
      );
      const reviewSatisfied =
        !point.is_suspicious ||
        input.mode === 'manual_override' ||
        (relatedReview && (approvedReviewIds.has(relatedReview.id) || explicitReviewIds.has(relatedReview.id)));

      if (!reviewSatisfied) {
        throw errorResponse(409, 'REVIEW_REQUIRED', 'Run produced suspicious indicators that are not approved.', {
          runId: input.runId,
          indicatorKey: point.indicator_key,
          reviewQueueId: relatedReview?.id ?? null,
        });
      }

      publishedItemCount += 1;
      publishRows.push(
        supersedeCurrentState(client, {
          tabSlug: layoutItem.tab_slug as FeedTab,
          itemKey: layoutItem.item_key,
          itemKind: layoutItem.item_kind,
          sourceType: 'indicator_point',
          sourceId: point.id,
          sourceRunId: input.runId,
          layoutItemId: layoutItem.id,
          reviewQueueId: relatedReview?.id ?? null,
          content: {
            title: layoutItem.title,
            subtitle: layoutItem.subtitle,
            body: layoutItem.body,
            ...coerceIndicatorContent(point),
          },
          publishedBy: input.actorUserId,
        }),
      );
    }

    if (layoutItem.item_kind === 'sns_rollup') {
      const rollup =
        (layoutItem.source_ref && rollupByKey.get(layoutItem.source_ref)) ??
        Array.from(rollupByKey.values())[0];

      if (!rollup) {
        continue;
      }

      const relatedReview = (reviewResult.data ?? []).find(
        (row) => row.entity_type === 'sns_rollup' && row.entity_id === rollup.id,
      );
      const reviewSatisfied =
        input.mode === 'manual_override' ||
        (relatedReview && (approvedReviewIds.has(relatedReview.id) || explicitReviewIds.has(relatedReview.id)));

      if (!reviewSatisfied) {
        throw errorResponse(409, 'SNS_REVIEW_REQUIRED', 'SNS rollups require explicit review approval.', {
          runId: input.runId,
          rollupKey: rollup.rollup_key,
          reviewQueueId: relatedReview?.id ?? null,
        });
      }

      publishedItemCount += 1;
      publishRows.push(
        supersedeCurrentState(client, {
          tabSlug: layoutItem.tab_slug as FeedTab,
          itemKey: layoutItem.item_key,
          itemKind: layoutItem.item_kind,
          sourceType: 'sns_rollup',
          sourceId: rollup.id,
          sourceRunId: input.runId,
          layoutItemId: layoutItem.id,
          reviewQueueId: relatedReview?.id ?? null,
          content: {
            title: layoutItem.title,
            subtitle: layoutItem.subtitle,
            body: layoutItem.body,
            ...coerceRollupContent(rollup),
          },
          publishedBy: input.actorUserId,
        }),
      );
    }
  }

  await Promise.all(publishRows);

  const publishEventResult = await client
    .from('publish_events')
    .insert({
      run_id: input.runId,
      mode: input.mode === 'manual_override' ? 'manual_override' : input.mode,
      item_count: publishedItemCount,
      actor_user_id: input.actorUserId,
      actor_reason: input.actorReason ?? null,
      review_queue_ids: input.reviewQueueIds ?? [],
      metadata: {
        publishedFromFunction: 'publish-current-state',
      },
    })
    .select('id')
    .single();

  if (publishEventResult.error) {
    throw errorResponse(500, 'PUBLISH_EVENT_FAILED', 'Could not create the publish event.', {
      supabaseError: publishEventResult.error.message,
    });
  }

  await client
    .from('run_history')
    .update({
      status: 'published',
      published_item_count: publishedItemCount,
      finished_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.runId);

  if ((input.reviewQueueIds ?? []).length > 0) {
    await client
      .from('review_queue')
      .update({
        status: 'published',
        published_at: new Date().toISOString(),
        reviewed_by: input.actorUserId,
        reviewed_at: new Date().toISOString(),
      })
      .in('id', input.reviewQueueIds ?? []);
  }

  await logAuditEvent(client, {
    actorUserId: input.actorUserId,
    actorRoles: input.actorRoles,
    action: 'publish_current_state',
    entityType: 'run_history',
    entityId: input.runId,
    runId: input.runId,
    metadata: {
      mode: input.mode,
      publishedItemCount,
      reviewQueueIds: input.reviewQueueIds ?? [],
    },
  });

  return {
    publishEventId: publishEventResult.data.id,
    publishedItemCount,
    runId: input.runId,
  };
}

export async function publishOverride(
  client: SupabaseClient,
  input: {
    tabSlug: FeedTab;
    itemKey: string;
    payload: Record<string, unknown>;
    reason: string;
    actorUserId: string;
    actorRoles: string[];
  },
) {
  const layoutResult = await client
    .from('feed_layout_items')
    .select('id, tab_slug, item_key, item_kind, title, subtitle, body')
    .eq('tab_slug', input.tabSlug)
    .eq('item_key', input.itemKey)
    .maybeSingle();

  if (layoutResult.error || !layoutResult.data) {
    throw errorResponse(404, 'LAYOUT_ITEM_NOT_FOUND', 'Feed layout item was not found.', {
      supabaseError: layoutResult.error?.message,
      itemKey: input.itemKey,
    });
  }

  const overrideInsert = await client
    .from('manual_overrides')
    .insert({
      target_tab_slug: input.tabSlug,
      item_key: input.itemKey,
      payload: input.payload,
      reason: input.reason,
      created_by: input.actorUserId,
      approved_by: input.actorUserId,
      published_at: new Date().toISOString(),
      is_active: true,
    })
    .select('id')
    .single();

  if (overrideInsert.error) {
    throw errorResponse(500, 'OVERRIDE_CREATE_FAILED', 'Could not create the manual override.', {
      supabaseError: overrideInsert.error.message,
    });
  }

  await supersedeCurrentState(client, {
    tabSlug: input.tabSlug,
    itemKey: input.itemKey,
    itemKind: layoutResult.data.item_kind,
    sourceType: 'manual_override',
    sourceId: overrideInsert.data.id,
    sourceRunId: null,
    layoutItemId: layoutResult.data.id,
    overrideId: overrideInsert.data.id,
    content: {
      title: layoutResult.data.title,
      subtitle: layoutResult.data.subtitle,
      body: layoutResult.data.body,
      override: input.payload,
    },
    publishedBy: input.actorUserId,
  });

  const publishEvent = await client
    .from('publish_events')
    .insert({
      mode: 'manual_override',
      item_count: 1,
      actor_user_id: input.actorUserId,
      actor_reason: input.reason,
      override_id: overrideInsert.data.id,
      metadata: {
        tabSlug: input.tabSlug,
        itemKey: input.itemKey,
      },
    })
    .select('id')
    .single();

  if (publishEvent.error) {
    throw errorResponse(500, 'OVERRIDE_PUBLISH_EVENT_FAILED', 'Could not record the override publish event.', {
      supabaseError: publishEvent.error.message,
    });
  }

  await logAuditEvent(client, {
    actorUserId: input.actorUserId,
    actorRoles: input.actorRoles,
    action: 'override_publish',
    entityType: 'manual_override',
    entityId: overrideInsert.data.id,
    metadata: {
      tabSlug: input.tabSlug,
      itemKey: input.itemKey,
      publishEventId: publishEvent.data.id,
      reason: input.reason,
    },
  });

  return {
    overrideId: overrideInsert.data.id,
    publishEventId: publishEvent.data.id,
  };
}
