import { errorResponse, ensureMethod, handleCors, jsonResponse, parseJsonBody } from '../_shared/http.ts';
import { getServiceClient } from '../_shared/supabaseAdmin.ts';
import {
  createSessionToken,
  getSessionExpiry,
  hashSessionToken,
} from '../_shared/alerts.ts';

interface AlertSessionRequest {
  authorizationCode?: string;
  referrer?: string;
}

function getTossApiBaseUrl() {
  return (Deno.env.get('TOSS_API_BASE_URL') ?? 'https://apps-in-toss-api.toss.im').replace(/\/$/, '');
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

async function readJsonResponse(response: Response) {
  return await response.json().catch(() => ({}));
}

async function exchangeAuthorizationCode(authorizationCode: string, referrer: string) {
  const response = await fetch(`${getTossApiBaseUrl()}/api-partner/v1/apps-in-toss/user/oauth2/generate-token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      authorizationCode,
      referrer,
    }),
  });

  const payload = await readJsonResponse(response);
  const success = asRecord(asRecord(payload).success);
  const accessToken = typeof success.accessToken === 'string' ? success.accessToken : '';

  if (!response.ok || !accessToken) {
    throw errorResponse(502, 'TOSS_TOKEN_EXCHANGE_FAILED', '토스 로그인 토큰 교환에 실패했습니다.', {
      status: response.status,
      tossResultType: asRecord(payload).resultType ?? null,
      tossError: asRecord(payload).error ?? null,
    });
  }

  return accessToken;
}

async function fetchTossUserKey(accessToken: string) {
  const response = await fetch(`${getTossApiBaseUrl()}/api-partner/v1/apps-in-toss/user/oauth2/login-me`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  const payload = await readJsonResponse(response);
  const success = asRecord(asRecord(payload).success);
  const userKey = success.userKey;

  if (!response.ok || userKey === undefined || userKey === null) {
    throw errorResponse(502, 'TOSS_USER_LOOKUP_FAILED', '토스 사용자 식별키를 가져오지 못했습니다.', {
      status: response.status,
      tossResultType: asRecord(payload).resultType ?? null,
      tossError: asRecord(payload).error ?? null,
    });
  }

  return String(userKey);
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) {
    return cors;
  }

  try {
    ensureMethod(req, ['POST']);
    const body = await parseJsonBody<AlertSessionRequest>(req);

    if (!body.authorizationCode) {
      throw errorResponse(400, 'AUTHORIZATION_CODE_REQUIRED', 'authorizationCode is required.');
    }

    const accessToken = await exchangeAuthorizationCode(body.authorizationCode, body.referrer ?? 'DEFAULT');
    const tossUserKey = await fetchTossUserKey(accessToken);
    const client = getServiceClient();

    const userResult = await client
      .schema('app_private')
      .from('alert_users')
      .upsert(
        {
          toss_user_key: tossUserKey,
        },
        {
          onConflict: 'toss_user_key',
        },
      )
      .select('id, toss_user_key')
      .single();

    if (userResult.error) {
      throw errorResponse(500, 'ALERT_USER_SAVE_FAILED', '알림 사용자 저장에 실패했습니다.', {
        supabaseError: userResult.error.message,
      });
    }

    const sessionToken = createSessionToken();
    const sessionTokenHash = await hashSessionToken(sessionToken);
    const expiresAt = getSessionExpiry();
    const sessionResult = await client
      .schema('app_private')
      .from('alert_sessions')
      .insert({
        alert_user_id: userResult.data.id,
        session_token_hash: sessionTokenHash,
        expires_at: expiresAt,
      })
      .select('id')
      .single();

    if (sessionResult.error) {
      throw errorResponse(500, 'ALERT_SESSION_SAVE_FAILED', '알림 세션 저장에 실패했습니다.', {
        supabaseError: sessionResult.error.message,
      });
    }

    return jsonResponse({
      sessionToken,
      expiresAt,
      userKey: tossUserKey,
    });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    console.error(error);
    return errorResponse(500, 'UNEXPECTED_ERROR', 'Unexpected error while creating alert session.');
  }
});
