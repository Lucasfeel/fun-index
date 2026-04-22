import { requireAdminContext } from '../_shared/auth.ts';
import { publishRunToCurrentState } from '../_shared/pipeline.ts';
import { ensureMethod, handleCors, parseJsonBody, jsonResponse, errorResponse } from '../_shared/http.ts';
import { getServiceClient } from '../_shared/supabaseAdmin.ts';

interface PublishCurrentStateRequest {
  runId?: string;
  mode?: 'automatic' | 'review_approved' | 'manual_override';
  reviewQueueIds?: string[];
  actorReason?: string;
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
    const body = await parseJsonBody<PublishCurrentStateRequest>(req);

    if (!body.runId || !body.mode) {
      throw errorResponse(400, 'INVALID_REQUEST', 'runId and mode are required.');
    }

    const result = await publishRunToCurrentState(client, {
      runId: body.runId,
      mode: body.mode,
      actorUserId: admin.userId,
      actorRoles: admin.roles,
      actorReason: body.actorReason ?? null,
      reviewQueueIds: body.reviewQueueIds ?? [],
    });

    return jsonResponse(result);
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    console.error(error);
    return errorResponse(500, 'UNEXPECTED_ERROR', 'Unexpected error while publishing current state.');
  }
});
