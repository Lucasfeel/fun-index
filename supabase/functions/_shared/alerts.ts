import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.49.8';

const SESSION_TTL_DAYS = 180;

export interface AlertSession {
  sessionId: string;
  alertUserId: string;
  tossUserKey: string;
}

export interface CurrentAlertState {
  itemKey: string;
  tabSlug: 'home' | 'pentagon' | 'psychology' | 'sns_feed';
  stateKey: string;
  score: number;
  stage: number;
  stageLabel: string;
  signalName: string;
  observedAt: string;
}

interface AlertSubscriptionRow {
  id: string;
  alert_user_id: string;
  item_key: string;
  tab_slug: 'home' | 'pentagon' | 'psychology' | 'sns_feed';
  signal_name: string;
  threshold_stage: number;
  enabled: boolean;
  last_observed_stage: number | null;
  last_seen_state_key: string | null;
  last_notified_state_key: string | null;
  alert_user?: {
    toss_user_key?: string | number | null;
  } | null;
}

interface DispatchResult {
  evaluatedCount: number;
  sentCount: number;
  failedCount: number;
  skippedCount: number;
}

export const alertStages = [
  { stage: 1, label: '매우 낮음', color: '#D73C38', min: 0, max: 19 },
  { stage: 2, label: '낮음', color: '#EC891C', min: 20, max: 39 },
  { stage: 3, label: '보통', color: '#FDD52C', min: 40, max: 59 },
  { stage: 4, label: '높음', color: '#A1CE2D', min: 60, max: 79 },
  { stage: 5, label: '매우 높음', color: '#56B678', min: 80, max: 100 },
] as const;

export class AlertAuthError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function getRequiredEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`Missing ${name}`);
  }
  return value;
}

function getOptionalEnv(name: string, fallback: string) {
  const value = Deno.env.get(name);
  return value && value.trim().length > 0 ? value : fallback;
}

function toBase64Url(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function sha256Hex(input: string) {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function createSessionToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

export function getSessionExpiry() {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + SESSION_TTL_DAYS);
  return expiresAt.toISOString();
}

export async function hashSessionToken(token: string) {
  return sha256Hex(`${getRequiredEnv('ALERT_SESSION_SECRET')}:${token}`);
}

export function readBearerToken(req: Request) {
  const header = req.headers.get('authorization') ?? '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? '';
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asNumber(value: unknown, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  return fallback;
}

function asString(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim().length > 0 ? value : fallback;
}

export function scoreToAlertStage(score: number) {
  const clamped = Math.max(0, Math.min(100, score));
  return clamped === 100 ? 5 : Math.floor(clamped / 20) + 1;
}

export function getAlertStageLabel(stage: number) {
  return alertStages.find((item) => item.stage === stage)?.label ?? '보통';
}

export async function getAlertSession(client: SupabaseClient, sessionToken: string): Promise<AlertSession> {
  if (!sessionToken) {
    throw new AlertAuthError(401, 'ALERT_SESSION_REQUIRED', '알림 세션이 필요합니다.');
  }

  const sessionTokenHash = await hashSessionToken(sessionToken);
  const { data: session, error: sessionError } = await client
    .schema('app_private')
    .from('alert_sessions')
    .select('id, alert_user_id, expires_at, revoked_at')
    .eq('session_token_hash', sessionTokenHash)
    .maybeSingle();

  if (sessionError) {
    throw new Error(sessionError.message);
  }

  if (!session || session.revoked_at || Date.parse(String(session.expires_at)) <= Date.now()) {
    throw new AlertAuthError(401, 'ALERT_SESSION_EXPIRED', '알림 세션이 만료되었습니다.');
  }

  const { data: user, error: userError } = await client
    .schema('app_private')
    .from('alert_users')
    .select('toss_user_key')
    .eq('id', session.alert_user_id)
    .single();

  if (userError) {
    throw new Error(userError.message);
  }

  await client
    .schema('app_private')
    .from('alert_sessions')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', session.id);

  return {
    sessionId: String(session.id),
    alertUserId: String(session.alert_user_id),
    tossUserKey: String(user.toss_user_key),
  };
}

export async function getCurrentAlertState(
  client: SupabaseClient,
  itemKey: string,
): Promise<CurrentAlertState | null> {
  const { data: config, error: configError } = await client
    .schema('app_public')
    .from('tab_feed_configs')
    .select('tab_code, stream_id, feed_card_code, title')
    .eq('feed_card_code', itemKey)
    .eq('is_enabled', true)
    .maybeSingle();

  if (configError) {
    throw new Error(configError.message);
  }

  if (config) {
    const { data: current, error: currentError } = await client
      .schema('app_public')
      .from('indicator_current_state')
      .select('stream_id, point_id, current_value, observed_at, summary, published_at, blocked_until_review, publish_state')
      .eq('stream_id', config.stream_id)
      .eq('publish_state', 'published')
      .eq('blocked_until_review', false)
      .maybeSingle();

    if (currentError) {
      throw new Error(currentError.message);
    }

    if (!current) {
      return null;
    }

    const summary = asRecord(current.summary);
    const score = asNumber(current.current_value ?? summary.score ?? summary.valueNumeric, 0);
    const stage = scoreToAlertStage(score);
    return {
      itemKey,
      tabSlug: String(config.tab_code) as CurrentAlertState['tabSlug'],
      stateKey: `${current.stream_id}:${current.point_id}`,
      score,
      stage,
      stageLabel: getAlertStageLabel(stage),
      signalName: asString(summary.title, asString(config.title, itemKey)),
      observedAt: asString(current.observed_at, asString(current.published_at, new Date().toISOString())),
    };
  }

  const { data: legacy, error: legacyError } = await client
    .from('feed_current_state')
    .select('id, tab_slug, item_key, source_id, source_run_id, content, published_at')
    .eq('item_key', itemKey)
    .eq('is_current', true)
    .maybeSingle();

  if (legacyError) {
    throw new Error(legacyError.message);
  }

  if (!legacy) {
    return null;
  }

  const content = asRecord(legacy.content);
  const score = asNumber(content.score ?? content.valueNumeric, 0);
  const stage = scoreToAlertStage(score);
  return {
    itemKey,
    tabSlug: String(legacy.tab_slug) as CurrentAlertState['tabSlug'],
    stateKey: `${legacy.item_key}:${legacy.source_id ?? legacy.source_run_id ?? legacy.id}`,
    score,
    stage,
    stageLabel: getAlertStageLabel(stage),
    signalName: asString(content.title, itemKey),
    observedAt: asString(legacy.published_at, new Date().toISOString()),
  };
}

async function sendTossMessage(
  tossUserKey: string,
  context: Record<string, unknown>,
) {
  const templateSetCode = Deno.env.get('TOSS_SMART_MESSAGE_TEMPLATE_SET_CODE');
  if (!templateSetCode) {
    return {
      status: 'skipped' as const,
      response: {},
      errorMessage: 'TOSS_SMART_MESSAGE_TEMPLATE_SET_CODE is not configured.',
    };
  }

  const baseUrl = getOptionalEnv('TOSS_API_BASE_URL', 'https://apps-in-toss-api.toss.im').replace(/\/$/, '');
  const response = await fetch(`${baseUrl}/api-partner/v1/apps-in-toss/messenger/send-message`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-toss-user-key': tossUserKey,
    },
    body: JSON.stringify({
      templateSetCode,
      context,
    }),
  });

  const responsePayload = await response.json().catch(() => ({}));
  const resultType = asString(asRecord(responsePayload).resultType).toUpperCase();
  const sent = response.ok && resultType === 'SUCCESS';

  return {
    status: sent ? 'sent' as const : 'failed' as const,
    response: responsePayload,
    errorMessage: sent ? null : `Toss message send failed with ${response.status}.`,
  };
}

export async function dispatchAlerts(
  client: SupabaseClient,
  options: { itemKeys?: string[]; streamId?: string } = {},
): Promise<DispatchResult> {
  let itemKeys = options.itemKeys?.filter((item) => item.length > 0) ?? [];

  if (itemKeys.length === 0 && options.streamId) {
    const { data, error } = await client
      .schema('app_public')
      .from('tab_feed_configs')
      .select('feed_card_code')
      .eq('stream_id', options.streamId)
      .eq('is_enabled', true);

    if (error) {
      throw new Error(error.message);
    }

    itemKeys = (data ?? []).map((row) => String(row.feed_card_code));
  }

  let query = client
    .schema('app_private')
    .from('alert_subscriptions')
    .select(`
      id,
      alert_user_id,
      item_key,
      tab_slug,
      signal_name,
      threshold_stage,
      enabled,
      last_observed_stage,
      last_seen_state_key,
      last_notified_state_key,
      alert_user:alert_users!alert_subscriptions_alert_user_id_fkey (
        toss_user_key
      )
    `)
    .eq('enabled', true);

  if (itemKeys.length > 0) {
    query = query.in('item_key', itemKeys);
  }

  const { data: subscriptions, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  const currentByItemKey = new Map<string, CurrentAlertState | null>();
  const result: DispatchResult = {
    evaluatedCount: 0,
    sentCount: 0,
    failedCount: 0,
    skippedCount: 0,
  };

  for (const subscription of (subscriptions ?? []) as unknown as AlertSubscriptionRow[]) {
    result.evaluatedCount += 1;

    if (!currentByItemKey.has(subscription.item_key)) {
      currentByItemKey.set(subscription.item_key, await getCurrentAlertState(client, subscription.item_key));
    }

    const current = currentByItemKey.get(subscription.item_key);
    if (!current) {
      result.skippedCount += 1;
      continue;
    }

    const crossedThreshold =
      current.stage >= subscription.threshold_stage &&
      (subscription.last_observed_stage ?? current.stage) < subscription.threshold_stage;
    const alreadyAttemptedState = subscription.last_notified_state_key === current.stateKey;
    const shouldNotify = crossedThreshold && !alreadyAttemptedState;
    const updatePayload: Record<string, unknown> = {
      tab_slug: current.tabSlug,
      signal_name: current.signalName,
      last_observed_stage: current.stage,
      last_seen_state_key: current.stateKey,
    };

    if (shouldNotify) {
      const context = {
        signalName: current.signalName,
        stageLabel: current.stageLabel,
        stageNumber: current.stage,
        score: Math.round(current.score),
        observedAt: current.observedAt,
      };

      const reservation = await client
        .schema('app_private')
        .from('alert_events')
        .insert({
          subscription_id: subscription.id,
          alert_user_id: subscription.alert_user_id,
          item_key: subscription.item_key,
          tab_slug: current.tabSlug,
          state_key: current.stateKey,
          observed_stage: current.stage,
          threshold_stage: subscription.threshold_stage,
          score: current.score,
          signal_name: current.signalName,
          message_context: context,
          delivery_status: 'skipped',
          error_message: 'Reserved before Toss delivery.',
        })
        .select('id')
        .maybeSingle();

      if (reservation.error) {
        if (reservation.error.code === '23505') {
          result.skippedCount += 1;
          continue;
        }
        throw new Error(reservation.error.message);
      }

      const delivery = await sendTossMessage(String(subscription.alert_user?.toss_user_key ?? ''), context);
      await client
        .schema('app_private')
        .from('alert_events')
        .update({
          delivery_status: delivery.status,
          toss_response: delivery.response,
          error_message: delivery.errorMessage,
        })
        .eq('id', reservation.data?.id);

      updatePayload.last_notified_state_key = current.stateKey;
      updatePayload.last_notified_at = new Date().toISOString();

      if (delivery.status === 'sent') {
        result.sentCount += 1;
      } else if (delivery.status === 'failed') {
        result.failedCount += 1;
      } else {
        result.skippedCount += 1;
      }
    }

    const updateResult = await client
      .schema('app_private')
      .from('alert_subscriptions')
      .update(updatePayload)
      .eq('id', subscription.id);

    if (updateResult.error) {
      throw new Error(updateResult.error.message);
    }
  }

  return result;
}
