import { requireAdminContext } from '../_shared/auth.ts';
import { logAuditEvent } from '../_shared/pipeline.ts';
import { ensureMethod, handleCors, parseJsonBody, jsonResponse, errorResponse } from '../_shared/http.ts';
import { getServiceClient } from '../_shared/supabaseAdmin.ts';

interface ConfigUpsertRequest {
  entity?: 'provider' | 'job' | 'feed_layout';
  record?: Record<string, unknown>;
}

async function upsertProvider(client: ReturnType<typeof getServiceClient>, record: Record<string, unknown>) {
  const code = typeof record.code === 'string' ? record.code : null;
  if (!code) {
    throw errorResponse(400, 'INVALID_PROVIDER', 'Provider record must include a code.');
  }

  const before = await client.from('providers').select('*').eq('code', code).maybeSingle();
  if (before.error) {
    throw errorResponse(500, 'PROVIDER_READ_FAILED', 'Could not read provider state.', {
      supabaseError: before.error.message,
    });
  }

  const payload = {
    code,
    display_name: record.display_name ?? record.displayName,
    provider_kind: record.provider_kind ?? record.providerKind,
    auth_state: record.auth_state ?? record.authState ?? 'not_required',
    legal_mode: record.legal_mode ?? record.legalMode ?? 'public_web',
    source_health: record.source_health ?? record.sourceHealth ?? 'healthy',
    freshness_sla_minutes: record.freshness_sla_minutes ?? record.freshnessSlaMinutes ?? 120,
    base_url: record.base_url ?? record.baseUrl ?? null,
    config: record.config ?? {},
    notes: record.notes ?? null,
    is_enabled: record.is_enabled ?? record.isEnabled ?? true,
  };

  const after = await client.from('providers').upsert(payload, { onConflict: 'code' }).select('*').single();
  if (after.error) {
    throw errorResponse(500, 'PROVIDER_WRITE_FAILED', 'Could not upsert provider.', {
      supabaseError: after.error.message,
    });
  }

  return { before: before.data, after: after.data, entityId: after.data.id };
}

async function upsertJob(client: ReturnType<typeof getServiceClient>, record: Record<string, unknown>) {
  const slug = typeof record.slug === 'string' ? record.slug : null;
  if (!slug) {
    throw errorResponse(400, 'INVALID_JOB', 'Job record must include a slug.');
  }

  const before = await client.from('collection_jobs').select('*').eq('slug', slug).maybeSingle();
  if (before.error) {
    throw errorResponse(500, 'JOB_READ_FAILED', 'Could not read job state.', {
      supabaseError: before.error.message,
    });
  }

  const payload = {
    slug,
    display_name: record.display_name ?? record.displayName,
    provider_id: record.provider_id ?? record.providerId ?? null,
    job_type: record.job_type ?? record.jobType,
    schedule_cron: record.schedule_cron ?? record.scheduleCron,
    parser_version: record.parser_version ?? record.parserVersion,
    pipeline_version: record.pipeline_version ?? record.pipelineVersion ?? '1',
    publish_behavior: record.publish_behavior ?? record.publishBehavior ?? 'review_gated',
    timeout_seconds: record.timeout_seconds ?? record.timeoutSeconds ?? 120,
    retry_limit: record.retry_limit ?? record.retryLimit ?? 2,
    is_enabled: record.is_enabled ?? record.isEnabled ?? true,
    config: record.config ?? {},
  };

  const after = await client
    .from('collection_jobs')
    .upsert(payload, { onConflict: 'slug' })
    .select('*')
    .single();

  if (after.error) {
    throw errorResponse(500, 'JOB_WRITE_FAILED', 'Could not upsert collection job.', {
      supabaseError: after.error.message,
    });
  }

  return { before: before.data, after: after.data, entityId: after.data.id };
}

async function upsertFeedLayout(client: ReturnType<typeof getServiceClient>, record: Record<string, unknown>) {
  const itemKey = typeof record.item_key === 'string' ? record.item_key : record.itemKey;
  const tabSlug = typeof record.tab_slug === 'string' ? record.tab_slug : record.tabSlug;

  if (!itemKey || !tabSlug) {
    throw errorResponse(400, 'INVALID_LAYOUT_ITEM', 'Feed layout record must include tabSlug and itemKey.');
  }

  const before = await client
    .from('feed_layout_items')
    .select('*')
    .eq('tab_slug', tabSlug)
    .eq('item_key', itemKey)
    .maybeSingle();

  if (before.error) {
    throw errorResponse(500, 'LAYOUT_READ_FAILED', 'Could not read feed layout state.', {
      supabaseError: before.error.message,
    });
  }

  const payload = {
    tab_slug: tabSlug,
    item_key: itemKey,
    item_kind: record.item_kind ?? record.itemKind,
    source_ref: record.source_ref ?? record.sourceRef ?? null,
    title: record.title,
    subtitle: record.subtitle ?? null,
    body: record.body ?? null,
    order_index: record.order_index ?? record.orderIndex ?? 100,
    is_visible: record.is_visible ?? record.isVisible ?? true,
    config: record.config ?? {},
  };

  const after = await client
    .from('feed_layout_items')
    .upsert(payload, { onConflict: 'tab_slug,item_key' })
    .select('*')
    .single();

  if (after.error) {
    throw errorResponse(500, 'LAYOUT_WRITE_FAILED', 'Could not upsert feed layout.', {
      supabaseError: after.error.message,
    });
  }

  return { before: before.data, after: after.data, entityId: after.data.id };
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) {
    return cors;
  }

  try {
    ensureMethod(req, ['POST']);
    const client = getServiceClient();
    const admin = await requireAdminContext(req, client, ['ops', 'admin']);
    const body = await parseJsonBody<ConfigUpsertRequest>(req);

    if (!body.entity || !body.record) {
      throw errorResponse(400, 'INVALID_REQUEST', 'entity and record are required.');
    }

    const result =
      body.entity === 'provider'
        ? await upsertProvider(client, body.record)
        : body.entity === 'job'
          ? await upsertJob(client, body.record)
          : body.entity === 'feed_layout'
            ? await upsertFeedLayout(client, body.record)
            : null;

    if (!result) {
      throw errorResponse(400, 'INVALID_ENTITY', 'Unsupported config entity.', {
        supportedEntities: ['provider', 'job', 'feed_layout'],
      });
    }

    await logAuditEvent(client, {
      actorUserId: admin.userId,
      actorRoles: admin.roles,
      action: `config_upsert_${body.entity}`,
      entityType: body.entity,
      entityId: result.entityId,
      beforeState: result.before ?? null,
      afterState: result.after,
    });

    return jsonResponse(result.after);
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    console.error(error);
    return errorResponse(500, 'UNEXPECTED_ERROR', 'Unexpected error while upserting configuration.');
  }
});
