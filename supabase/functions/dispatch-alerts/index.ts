import { dispatchAlerts } from '../_shared/alerts.ts';
import { errorResponse, ensureMethod, handleCors, jsonResponse, parseJsonBody } from '../_shared/http.ts';
import { getServiceClient } from '../_shared/supabaseAdmin.ts';

interface DispatchAlertsRequest {
  itemKeys?: string[];
  streamId?: string;
}

function assertDispatchSecret(req: Request) {
  const expected = Deno.env.get('ALERT_DISPATCH_SECRET');
  const received = req.headers.get('x-alert-dispatch-secret');

  if (!expected || received !== expected) {
    throw errorResponse(401, 'UNAUTHORIZED_DISPATCH', 'Alert dispatch secret is invalid.');
  }
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) {
    return cors;
  }

  try {
    ensureMethod(req, ['POST']);
    assertDispatchSecret(req);

    const body = await parseJsonBody<DispatchAlertsRequest>(req);
    const result = await dispatchAlerts(getServiceClient(), {
      itemKeys: body.itemKeys,
      streamId: body.streamId,
    });

    return jsonResponse({
      ok: true,
      ...result,
    });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    console.error(error);
    return errorResponse(500, 'UNEXPECTED_ERROR', 'Unexpected error while dispatching alerts.');
  }
});
