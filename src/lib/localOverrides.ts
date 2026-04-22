import type { SignalItem } from './types';

const LOCAL_OVERRIDE_KEY = 'indicator-local-overrides';

interface StoredSignalOverride {
  title?: string;
  subtitle?: string;
  summary?: string;
  classification?: string;
  score?: number;
  change?: number;
  metrics?: SignalItem['metrics'];
  drivers?: string[];
  categories?: string[];
  sources?: string[];
  approvalNote?: string;
  coverageLabel?: string;
  sampleSize?: number;
  updatedAt?: string;
}

function canUseLocalStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function getStorageKey(item: SignalItem) {
  return `${item.domain}:${item.slug}`;
}

function readOverrides() {
  if (!canUseLocalStorage()) {
    return {} as Record<string, StoredSignalOverride>;
  }

  try {
    const raw = window.localStorage.getItem(LOCAL_OVERRIDE_KEY);
    if (!raw) {
      return {} as Record<string, StoredSignalOverride>;
    }

    const parsed = JSON.parse(raw) as Record<string, StoredSignalOverride>;
    return parsed ?? {};
  } catch {
    return {} as Record<string, StoredSignalOverride>;
  }
}

function writeOverrides(overrides: Record<string, StoredSignalOverride>) {
  if (!canUseLocalStorage()) {
    return;
  }

  window.localStorage.setItem(LOCAL_OVERRIDE_KEY, JSON.stringify(overrides));
}

export function saveLocalSignalOverride(item: SignalItem, override: StoredSignalOverride) {
  const overrides = readOverrides();
  overrides[getStorageKey(item)] = override;
  writeOverrides(overrides);
}

export function applyLocalSignalOverrides<T extends SignalItem>(signals: T[]) {
  const overrides = readOverrides();

  return signals.map((signal) => {
    const override = overrides[getStorageKey(signal)];
    if (!override) {
      return signal;
    }

    const nextSignal = {
      ...signal,
      title: override.title ?? signal.title,
      subtitle: override.subtitle ?? signal.subtitle,
      summary: override.summary ?? signal.summary,
      classification: override.classification ?? signal.classification,
      score: override.score ?? signal.score,
      change: override.change ?? signal.change,
      metrics: override.metrics ?? signal.metrics,
      drivers: override.drivers ?? signal.drivers,
      updatedAt: override.updatedAt ?? signal.updatedAt,
    } as T;

    if (signal.domain === 'social') {
      return {
        ...nextSignal,
        categories: override.categories ?? signal.categories,
        sources: override.sources ?? signal.sources,
        approvalNote: override.approvalNote ?? signal.approvalNote,
      } as T;
    }

    if (signal.domain === 'pentagon') {
      return {
        ...nextSignal,
        coverageLabel: override.coverageLabel ?? signal.coverageLabel,
        sampleSize: override.sampleSize ?? signal.sampleSize,
      } as T;
    }

    return nextSignal;
  });
}
