import { requireAdminContext } from '../_shared/auth.ts';
import { ensureMethod, handleCors, jsonResponse, errorResponse } from '../_shared/http.ts';
import { getServiceClient } from '../_shared/supabaseAdmin.ts';

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) {
    return cors;
  }

  try {
    ensureMethod(req, ['GET', 'POST']);
    const client = getServiceClient();
    await requireAdminContext(req, client, ['viewer', 'ops', 'reviewer', 'publisher', 'admin']);

    const [layoutResult, stateResult] = await Promise.all([
      client
        .from('feed_layout_items')
        .select('*')
        .eq('tab_slug', 'sns_feed')
        .order('order_index', { ascending: true }),
      client
        .from('feed_current_state')
        .select('item_key, content, published_at, source_run_id')
        .eq('tab_slug', 'sns_feed')
        .eq('is_current', true)
        .order('published_at', { ascending: false }),
    ]);

    if (layoutResult.error) {
      throw errorResponse(500, 'LAYOUT_READ_FAILED', 'SNS 레이아웃을 불러오지 못했습니다.', {
        supabaseError: layoutResult.error.message,
      });
    }

    if (stateResult.error) {
      throw errorResponse(500, 'STATE_READ_FAILED', 'SNS 현재 상태를 불러오지 못했습니다.', {
        supabaseError: stateResult.error.message,
      });
    }

    return jsonResponse({
      layout: layoutResult.data ?? [],
      state: stateResult.data ?? [],
    });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    console.error(error);
    return errorResponse(500, 'UNEXPECTED_ERROR', 'SNS 관리 데이터를 불러오는 중 예기치 못한 오류가 발생했습니다.');
  }
});
