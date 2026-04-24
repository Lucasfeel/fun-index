import {
  AlertAuthError,
  getAlertSession,
  getCurrentAlertState,
  readBearerToken,
} from '../_shared/alerts.ts';
import { errorResponse, ensureMethod, handleCors, jsonResponse, parseJsonBody } from '../_shared/http.ts';
import { getServiceClient } from '../_shared/supabaseAdmin.ts';

type AlertAction = 'list' | 'upsert' | 'disable';
type AlertTabSlug = 'home' | 'pentagon' | 'psychology' | 'sns_feed';

interface AlertSubscriptionsRequest {
  action?: AlertAction;
  sessionToken?: string;
  itemKeys?: string[];
  itemKey?: string;
  tabSlug?: AlertTabSlug;
  signalName?: string;
  thresholdStage?: number;
}

function isValidStage(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 5;
}

function readSessionToken(req: Request, body: AlertSubscriptionsRequest) {
  return readBearerToken(req) || body.sessionToken || '';
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) {
    return cors;
  }

  try {
    ensureMethod(req, ['POST']);
    const body = await parseJsonBody<AlertSubscriptionsRequest>(req);
    const action = body.action ?? 'list';
    const client = getServiceClient();
    const session = await getAlertSession(client, readSessionToken(req, body));

    if (action === 'list') {
      let query = client
        .schema('app_private')
        .from('alert_subscriptions')
        .select('id, item_key, tab_slug, signal_name, threshold_stage, enabled, updated_at')
        .eq('alert_user_id', session.alertUserId)
        .eq('enabled', true)
        .order('updated_at', { ascending: false });

      if (body.itemKeys && body.itemKeys.length > 0) {
        query = query.in('item_key', body.itemKeys);
      }

      const { data, error } = await query;
      if (error) {
        throw errorResponse(500, 'ALERT_SUBSCRIPTIONS_READ_FAILED', '알림 설정을 불러오지 못했습니다.', {
          supabaseError: error.message,
        });
      }

      return jsonResponse({
        subscriptions: (data ?? []).map((row) => ({
          id: row.id,
          itemKey: row.item_key,
          tabSlug: row.tab_slug,
          signalName: row.signal_name,
          thresholdStage: row.threshold_stage,
          enabled: row.enabled,
          updatedAt: row.updated_at,
        })),
      });
    }

    if (!body.itemKey) {
      throw errorResponse(400, 'ITEM_KEY_REQUIRED', 'itemKey is required.');
    }

    if (action === 'disable') {
      const { error } = await client
        .schema('app_private')
        .from('alert_subscriptions')
        .update({ enabled: false })
        .eq('alert_user_id', session.alertUserId)
        .eq('item_key', body.itemKey);

      if (error) {
        throw errorResponse(500, 'ALERT_SUBSCRIPTION_DISABLE_FAILED', '알림 설정을 해제하지 못했습니다.', {
          supabaseError: error.message,
        });
      }

      return jsonResponse({ ok: true });
    }

    if (action !== 'upsert') {
      throw errorResponse(400, 'INVALID_ALERT_ACTION', '지원하지 않는 알림 작업입니다.');
    }

    if (!isValidStage(body.thresholdStage)) {
      throw errorResponse(400, 'INVALID_ALERT_STAGE', 'thresholdStage must be an integer from 1 to 5.');
    }

    const currentState = await getCurrentAlertState(client, body.itemKey);
    if (!currentState) {
      throw errorResponse(409, 'CURRENT_STATE_UNAVAILABLE', '아직 공개된 데이터가 없어 알림을 설정할 수 없습니다.');
    }

    const { data, error } = await client
      .schema('app_private')
      .from('alert_subscriptions')
      .upsert(
        {
          alert_user_id: session.alertUserId,
          item_key: body.itemKey,
          tab_slug: body.tabSlug ?? currentState.tabSlug,
          signal_name: body.signalName ?? currentState.signalName,
          threshold_stage: body.thresholdStage,
          enabled: true,
          last_observed_stage: currentState.stage,
          last_seen_state_key: currentState.stateKey,
        },
        {
          onConflict: 'alert_user_id,item_key',
        },
      )
      .select('id, item_key, tab_slug, signal_name, threshold_stage, enabled, updated_at')
      .single();

    if (error) {
      throw errorResponse(500, 'ALERT_SUBSCRIPTION_SAVE_FAILED', '알림 설정을 저장하지 못했습니다.', {
        supabaseError: error.message,
      });
    }

    return jsonResponse({
      subscription: {
        id: data.id,
        itemKey: data.item_key,
        tabSlug: data.tab_slug,
        signalName: data.signal_name,
        thresholdStage: data.threshold_stage,
        enabled: data.enabled,
        updatedAt: data.updated_at,
      },
    });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    if (error instanceof AlertAuthError) {
      return errorResponse(error.status, error.code, error.message);
    }

    console.error(error);
    return errorResponse(500, 'UNEXPECTED_ERROR', 'Unexpected error while updating alert subscriptions.');
  }
});
