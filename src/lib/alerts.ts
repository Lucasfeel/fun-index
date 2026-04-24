import { appLogin } from '@apps-in-toss/web-framework';

import { getSupabaseClient, useDemoData } from './supabase';
import type { AlertStage } from './alertStages';

const ALERT_SESSION_STORAGE_KEY = 'indicator-alert-session-v1';

export interface AlertSubscription {
  id: string;
  itemKey: string;
  tabSlug: 'home' | 'pentagon' | 'psychology' | 'sns_feed';
  signalName: string;
  thresholdStage: AlertStage;
  enabled: boolean;
  updatedAt: string;
}

interface StoredAlertSession {
  sessionToken: string;
  expiresAt: string;
}

function readStoredSession(): StoredAlertSession | null {
  try {
    const rawValue = window.localStorage.getItem(ALERT_SESSION_STORAGE_KEY);
    if (!rawValue) {
      return null;
    }

    const parsed = JSON.parse(rawValue) as Partial<StoredAlertSession>;
    if (!parsed.sessionToken || !parsed.expiresAt || Date.parse(parsed.expiresAt) <= Date.now()) {
      window.localStorage.removeItem(ALERT_SESSION_STORAGE_KEY);
      return null;
    }

    return {
      sessionToken: parsed.sessionToken,
      expiresAt: parsed.expiresAt,
    };
  } catch {
    window.localStorage.removeItem(ALERT_SESSION_STORAGE_KEY);
    return null;
  }
}

function saveStoredSession(session: StoredAlertSession) {
  window.localStorage.setItem(ALERT_SESSION_STORAGE_KEY, JSON.stringify(session));
}

function clearStoredSession() {
  window.localStorage.removeItem(ALERT_SESSION_STORAGE_KEY);
}

export function hasAlertSession() {
  return readStoredSession() !== null;
}

async function createAlertSession() {
  const { authorizationCode, referrer } = await appLogin();
  const result = await getSupabaseClient().functions.invoke('alert-session', {
    body: {
      authorizationCode,
      referrer,
    },
  });

  if (result.error) {
    throw result.error;
  }

  const payload = result.data as Partial<StoredAlertSession>;
  if (!payload.sessionToken || !payload.expiresAt) {
    throw new Error('알림 세션 응답이 올바르지 않습니다.');
  }

  const session = {
    sessionToken: payload.sessionToken,
    expiresAt: payload.expiresAt,
  };
  saveStoredSession(session);
  return session;
}

async function ensureAlertSession() {
  const stored = readStoredSession();
  if (stored) {
    return stored;
  }

  if (useDemoData) {
    throw new Error('데모 모드에서는 알림을 설정할 수 없습니다.');
  }

  return createAlertSession();
}

async function invokeAlertSubscriptions<T>(body: Record<string, unknown>, requireSession: boolean) {
  if (useDemoData) {
    return { subscriptions: [] } as T;
  }

  const stored = requireSession ? await ensureAlertSession() : readStoredSession();
  if (!stored) {
    return { subscriptions: [] } as T;
  }

  const result = await getSupabaseClient().functions.invoke('alert-subscriptions', {
    body,
    headers: {
      Authorization: `Bearer ${stored.sessionToken}`,
    },
  });

  if (result.error) {
    if (!requireSession) {
      clearStoredSession();
    }
    throw result.error;
  }

  return result.data as T;
}

export async function listAlertSubscriptions(itemKeys?: string[]) {
  if (!hasAlertSession() || useDemoData) {
    return [];
  }

  const payload = await invokeAlertSubscriptions<{ subscriptions: AlertSubscription[] }>(
    {
      action: 'list',
      itemKeys,
    },
    false,
  );
  return payload.subscriptions ?? [];
}

export async function saveAlertSubscription(input: {
  itemKey: string;
  tabSlug: AlertSubscription['tabSlug'];
  signalName: string;
  thresholdStage: AlertStage;
}) {
  const payload = await invokeAlertSubscriptions<{ subscription: AlertSubscription }>(
    {
      action: 'upsert',
      ...input,
    },
    true,
  );

  if (!payload.subscription) {
    throw new Error('알림 설정 저장 결과를 확인할 수 없습니다.');
  }

  return payload.subscription;
}

export async function disableAlertSubscription(itemKey: string) {
  await invokeAlertSubscriptions(
    {
      action: 'disable',
      itemKey,
    },
    true,
  );
}
