import { requireAdminContext } from '../_shared/auth.ts';
import { publishOverride } from '../_shared/pipeline.ts';
import { ensureMethod, handleCors, parseJsonBody, jsonResponse, errorResponse } from '../_shared/http.ts';
import { getServiceClient } from '../_shared/supabaseAdmin.ts';

interface OverrideRequest {
  itemKey?: string;
  tabSlug?: 'home' | 'pentagon' | 'psychology' | 'sns_feed';
  payload?: Record<string, unknown>;
  reason?: string;
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) {
    return cors;
  }

  try {
    ensureMethod(req, ['POST']);
    const client = getServiceClient();
    const admin = await requireAdminContext(req, client, ['publisher', 'admin']);
    const body = await parseJsonBody<OverrideRequest>(req);

    if (!body.itemKey || !body.tabSlug || !body.payload || !body.reason) {
      throw errorResponse(400, 'INVALID_REQUEST', 'itemKey, tabSlug, payload, and reason are required.');
    }

    const result = await publishOverride(client, {
      itemKey: body.itemKey,
      tabSlug: body.tabSlug,
      payload: body.payload,
      reason: body.reason,
      actorUserId: admin.userId,
      actorRoles: admin.roles,
    });

    return jsonResponse(result);
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    console.error(error);
    return errorResponse(500, 'UNEXPECTED_ERROR', 'Unexpected error while publishing an override.');
  }
});
