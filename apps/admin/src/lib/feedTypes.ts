export type ConfidenceBand = 'high' | 'medium' | 'limited';
export type MetricTone = 'cool' | 'neutral' | 'warm';
export type FeedTab = 'home' | 'pentagon' | 'psychology' | 'sns';
export type PublishTabSlug = 'pentagon' | 'psychology' | 'sns_feed';

export interface FeedMetric {
  label: string;
  value: string;
  tone?: MetricTone | undefined;
}

export interface BaseSignalItem {
  id: string;
  slug: string;
  itemKey: string;
  tabSlug: PublishTabSlug;
  domain: 'pentagon' | 'psychology' | 'social';
  title: string;
  subtitle: string;
  summary: string;
  score: number;
  classification: string;
  change: number;
  updatedAt: string;
  confidenceBand: ConfidenceBand;
  metrics: FeedMetric[];
  drivers: string[];
  cadenceHours: number;
}

export interface PentagonSignalItem extends BaseSignalItem {
  domain: 'pentagon';
  coverageLabel: string;
  sampleSize: number;
}

export interface PsychologySignalItem extends BaseSignalItem {
  domain: 'psychology';
}

export interface SocialSignalItem extends BaseSignalItem {
  domain: 'social';
  sourceCount: number;
  categories: string[];
  sources: string[];
  approvalNote: string;
}

export type AdminSignalItem = PentagonSignalItem | PsychologySignalItem | SocialSignalItem;

export interface FeedSnapshot {
  home: AdminSignalItem[];
  pentagon: PentagonSignalItem[];
  psychology: PsychologySignalItem[];
  social: SocialSignalItem[];
}
