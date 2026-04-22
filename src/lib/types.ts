export type ConfidenceBand = 'high' | 'medium' | 'limited';
export type FreshnessState = 'fresh' | 'aging' | 'stale';
export type MetricTone = 'cool' | 'neutral' | 'warm';
export type FeedDomain = 'pentagon' | 'psychology' | 'social';
export type PentagonIndexType = 'pizza' | 'gay-bar';
export type PsychologyIndicatorType =
  | 'us-stock-fear-greed'
  | 'crypto-fear-greed'
  | 'kr-stock-fear-greed';
export type IndicatorDomain = 'pentagon' | 'psychology';

export interface FeedMetric {
  label: string;
  value: string;
  tone?: MetricTone | undefined;
}

export interface SignalBase {
  id: string;
  slug: string;
  domain: FeedDomain;
  title: string;
  subtitle: string;
  summary: string;
  score: number;
  classification: string;
  change: number;
  updatedAt: string;
  confidenceBand: ConfidenceBand;
  freshnessNote?: string | undefined;
  uncertaintyNote?: string | undefined;
  detailPath: string;
  metrics: FeedMetric[];
  drivers: string[];
  cadenceHours: number;
}

export interface PentagonSignal extends SignalBase {
  domain: 'pentagon';
  indexType: PentagonIndexType;
  sampleSize: number;
  coverageLabel: string;
}

export interface PsychologySignal extends SignalBase {
  domain: 'psychology';
  indicatorType: PsychologyIndicatorType;
}

export interface SocialSignal extends SignalBase {
  domain: 'social';
  sourceCount: number;
  categories: string[];
  sources: string[];
  approvalNote: string;
}

export type IndexSignal = PentagonSignal | PsychologySignal;
export type SignalItem = PentagonSignal | PsychologySignal | SocialSignal;
