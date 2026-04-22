import { handleCors, jsonResponse } from '../_shared/http.ts';
import { createServiceClient } from '../_shared/pipeline/repository.ts';

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) {
    return cors;
  }

  try {
    const client = createServiceClient();
    const [layoutResult, stateResult] = await Promise.all([
      client
        .from('feed_layout_items')
        .select('item_key, title, subtitle, body, order_index')
        .eq('tab_slug', 'psychology')
        .eq('is_visible', true)
        .order('order_index', { ascending: true }),
      client
        .from('feed_current_state')
        .select('item_key, item_kind, content, published_at, freshness_deadline_at, source_run_id')
        .eq('tab_slug', 'psychology')
        .eq('is_current', true),
    ]);

    if (layoutResult.error) {
      throw new Error(layoutResult.error.message);
    }

    if (stateResult.error) {
      throw new Error(stateResult.error.message);
    }

    const currentByKey = new Map((stateResult.data ?? []).map((row) => [row.item_key, row]));
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
      .filter((card) => card !== null);

    const payload = {
      tab: 'psychology',
      generatedAt: new Date().toISOString(),
      cards,
    };
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
          message: 'Unexpected error while loading the Psychology feed.',
        },
      },
      500,
    );
  }
});
