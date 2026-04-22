import { requireAdminContext } from '../_shared/auth.ts';
import { createOrReuseRun, logAuditEvent } from '../_shared/pipeline.ts';
import { ensureMethod, handleCors, parseJsonBody, jsonResponse, errorResponse } from '../_shared/http.ts';
import { getServiceClient } from '../_shared/supabaseAdmin.ts';

interface AdminRerunRequest {
  jobSlug?: string;
  mode?: 'one_shot' | 'backfill' | 'publish_only';
  idempotencyKey?: string;
  backfillStartAt?: string;
  backfillEndAt?: string;
  overridePayload?: Record<string, unknown>;
  reason?: string;
}

const triggerByMode = {
  one_shot: 'manual',
  backfill: 'backfill',
  publish_only: 'publish_only',
} as const;

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) {
    return cors;
  }

  try {
    ensureMethod(req, ['POST']);
    const client = getServiceClient();
    const admin = await requireAdminContext(req, client, ['ops', 'admin']);
    const body = await parseJsonBody<AdminRerunRequest>(req);

    if (!body.jobSlug || !body.mode || !body.idempotencyKey) {
      throw errorResponse(400, 'INVALID_REQUEST', 'jobSlug, mode, and idempotencyKey are required.');
    }

    const trigger = triggerByMode[body.mode];
    if (!trigger) {
      throw errorResponse(400, 'INVALID_MODE', 'Unsupported rerun mode.', {
        supportedModes: Object.keys(triggerByMode),
      });
    }

    const jobResult = await client
      .from('collection_jobs')
      .select('id, slug, provider_id, parser_version, pipeline_version, is_enabled')
      .eq('slug', body.jobSlug)
      .single();

    if (jobResult.error || !jobResult.data) {
      throw errorResponse(404, 'JOB_NOT_FOUND', 'Collection job not found.', {
        supabaseError: jobResult.error?.message,
      });
    }

    const run = await createOrReuseRun(client, {
      jobId: jobResult.data.id,
      jobSlug: jobResult.data.slug,
      providerId: jobResult.data.provider_id,
      parserVersion: jobResult.data.parser_version,
      pipelineVersion: jobResult.data.pipeline_version,
      idempotencyKey: body.idempotencyKey,
      trigger,
      requestedBy: admin.userId,
      requestReason: body.reason ?? null,
      backfillStartAt: body.backfillStartAt ?? null,
      backfillEndAt: body.backfillEndAt ?? null,
      overridePayload: body.overridePayload ?? null,
    });

    await logAuditEvent(client, {
      actorUserId: admin.userId,
      actorRoles: admin.roles,
      action: run.reused ? 'rerun_reused' : 'rerun_requested',
      entityType: 'collection_job',
      entityId: jobResult.data.id,
      runId: run.runId,
      requestId: run.requestId,
      metadata: {
        jobSlug: body.jobSlug,
        mode: body.mode,
        jobEnabledAtRequestTime: jobResult.data.is_enabled,
        reason: body.reason ?? null,
      },
    });

    return jsonResponse({
      requestId: run.requestId,
      runId: run.runId,
      status: run.status,
      reused: run.reused,
    });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    console.error(error);
    return errorResponse(500, 'UNEXPECTED_ERROR', 'Unexpected error while requesting a rerun.');
  }
});
