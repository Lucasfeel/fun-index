import { requireAdminContext } from '../_shared/auth.ts';
import { logAuditEvent, publishRunToCurrentState } from '../_shared/pipeline.ts';
import { ensureMethod, handleCors, parseJsonBody, jsonResponse, errorResponse } from '../_shared/http.ts';
import { getServiceClient } from '../_shared/supabaseAdmin.ts';

interface ReviewActionRequest {
  reviewQueueId?: string;
  action?: 'approve' | 'reject' | 'edit' | 'publish';
  editedPayload?: Record<string, unknown>;
  decisionNote?: string;
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) {
    return cors;
  }

  try {
    ensureMethod(req, ['POST']);
    const client = getServiceClient();
    const admin = await requireAdminContext(req, client, ['reviewer', 'publisher', 'admin']);
    const body = await parseJsonBody<ReviewActionRequest>(req);

    if (!body.reviewQueueId || !body.action) {
      throw errorResponse(400, 'INVALID_REQUEST', 'reviewQueueId and action are required.');
    }

    if (body.action === 'publish' && !admin.roles.some((role) => role === 'publisher' || role === 'admin')) {
      throw errorResponse(403, 'ROLE_NOT_ALLOWED', 'Publishing from the review queue requires publisher role.');
    }

    const currentItem = await client
      .from('review_queue')
      .select('*')
      .eq('id', body.reviewQueueId)
      .single();

    if (currentItem.error || !currentItem.data) {
      throw errorResponse(404, 'REVIEW_ITEM_NOT_FOUND', 'Review queue item not found.', {
        supabaseError: currentItem.error?.message,
      });
    }

    const nextStatus =
      body.action === 'reject'
        ? 'rejected'
        : body.action === 'edit'
          ? 'edited'
          : body.action === 'publish'
            ? 'approved'
            : 'approved';

    const updateResult = await client
      .from('review_queue')
      .update({
        status: nextStatus,
        edited_payload: body.editedPayload ?? currentItem.data.edited_payload,
        decision_note: body.decisionNote ?? null,
        reviewed_by: admin.userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', body.reviewQueueId)
      .select('*')
      .single();

    if (updateResult.error || !updateResult.data) {
      throw errorResponse(500, 'REVIEW_UPDATE_FAILED', 'Could not update review queue item.', {
        supabaseError: updateResult.error?.message,
      });
    }

    let publishResult: Record<string, unknown> | null = null;

    if (body.action === 'publish' && currentItem.data.run_id) {
      publishResult = await publishRunToCurrentState(client, {
        runId: currentItem.data.run_id,
        mode: 'review_approved',
        actorUserId: admin.userId,
        actorRoles: admin.roles,
        actorReason: body.decisionNote ?? 'Published from review queue.',
        reviewQueueIds: [body.reviewQueueId],
      });
    }

    await logAuditEvent(client, {
      actorUserId: admin.userId,
      actorRoles: admin.roles,
      action: `review_${body.action}`,
      entityType: 'review_queue',
      entityId: body.reviewQueueId,
      runId: currentItem.data.run_id,
      beforeState: currentItem.data,
      afterState: updateResult.data,
      metadata: {
        decisionNote: body.decisionNote ?? null,
      },
    });

    return jsonResponse({
      reviewItem: updateResult.data,
      publishResult,
    });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    console.error(error);
    return errorResponse(500, 'UNEXPECTED_ERROR', 'Unexpected error while processing review action.');
  }
});
