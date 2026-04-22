import { buildPublicFeed } from '../_shared/pipeline.ts';
import { handleCors, jsonResponse } from '../_shared/http.ts';
import { getServiceClient } from '../_shared/supabaseAdmin.ts';

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) {
    return cors;
  }

  try {
    const client = getServiceClient();
    const payload = await buildPublicFeed(client, 'pentagon');
    return jsonResponse(payload);
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    console.error(error);
    return jsonResponse(
      {
        error: {
          code: 'UNEXPECTED_ERROR',
          message: 'Unexpected error while loading the Pentagon feed.',
        },
      },
      500,
    );
  }
});
