export type FeedTab = 'home' | 'pentagon' | 'psychology' | 'sns_feed';

export type ProviderAuthState =
  | 'not_required'
  | 'valid'
  | 'expired'
  | 'invalid'
  | 'error';

export type ProviderLegalMode =
  | 'public_web'
  | 'licensed_api'
  | 'manual_upload'
  | 'restricted'
  | 'disabled';

export type SourceHealth = 'healthy' | 'degraded' | 'down' | 'paused';

export type RunTrigger =
  | 'scheduled'
  | 'manual'
  | 'retry'
  | 'backfill'
  | 'publish_only'
  | 'override';

export type RunStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'review_required'
  | 'published'
  | 'cancelled';

export type ReviewStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'edited'
  | 'published';

export type FeedItemKind =
  | 'indicator_card'
  | 'sns_rollup'
  | 'editorial'
  | 'system_notice';

export type AdminRole =
  | 'viewer'
  | 'ops'
  | 'reviewer'
  | 'publisher'
  | 'admin';

export interface ProviderRecord {
  id: string;
  code: string;
  displayName: string;
  providerKind: 'indicator' | 'sentiment' | 'social';
  authState: ProviderAuthState;
  legalMode: ProviderLegalMode;
  sourceHealth: SourceHealth;
  freshnessSlaMinutes: number;
  isEnabled: boolean;
  config: Record<string, unknown>;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
}

export interface CollectionJobRecord {
  id: string;
  slug: string;
  displayName: string;
  providerId: string | null;
  parserVersion: string;
  scheduleCron: string;
  isEnabled: boolean;
  publishBehavior: 'automatic' | 'review_gated' | 'manual';
  lastRunStatus: RunStatus | null;
  lastStartedAt: string | null;
  lastFinishedAt: string | null;
}

export interface RunSummary {
  id: string;
  jobId: string | null;
  jobSlug: string | null;
  providerCode: string | null;
  trigger: RunTrigger;
  status: RunStatus;
  startedAt: string | null;
  finishedAt: string | null;
  suspiciousCount: number;
  errorCode: string | null;
  errorMessage: string | null;
  freshnessViolation: boolean;
  idempotencyKey: string;
}

export interface DashboardSnapshot {
  recentRuns: RunSummary[];
  failureRateLast24h: number;
  freshnessViolations: number;
  providerHealth: Array<{
    providerCode: string;
    sourceHealth: SourceHealth;
    stale: boolean;
    minutesSinceSuccess: number | null;
  }>;
}

export interface ReviewQueueItem {
  id: string;
  runId: string | null;
  entityType: 'run' | 'indicator_point' | 'sns_rollup' | 'feed_state';
  status: ReviewStatus;
  priority: number;
  reasonCode: string;
  reasonDetail: string | null;
  originalPayload: Record<string, unknown>;
  editedPayload: Record<string, unknown> | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
}

export interface FeedLayoutItemRecord {
  id: string;
  tabSlug: FeedTab;
  itemKey: string;
  itemKind: FeedItemKind;
  sourceRef: string | null;
  title: string;
  subtitle: string | null;
  body: string | null;
  orderIndex: number;
  isVisible: boolean;
  config: Record<string, unknown>;
}

export interface FeedCardPayload {
  itemKey: string;
  title: string;
  subtitle?: string | null;
  body?: string | null;
  kind: FeedItemKind;
  content: Record<string, unknown>;
  publishedAt: string;
  freshnessDeadlineAt: string | null;
  sourceRunId: string | null;
}

export interface PublicFeedResponse {
  tab: FeedTab;
  generatedAt: string;
  cards: FeedCardPayload[];
}

export interface PublishCurrentStateRequest {
  runId: string;
  mode: 'automatic' | 'review_approved' | 'manual_override';
  reviewQueueIds?: string[];
  actorReason?: string;
}

export interface PublishCurrentStateResponse {
  publishEventId: string;
  publishedItemCount: number;
  runId: string;
}

export interface AdminRerunRequest {
  jobSlug: string;
  mode: 'one_shot' | 'backfill' | 'publish_only';
  idempotencyKey: string;
  backfillStartAt?: string;
  backfillEndAt?: string;
  overridePayload?: Record<string, unknown>;
  reason?: string;
}

export interface AdminRerunResponse {
  requestId: string;
  runId: string;
  status: RunStatus;
}

export interface AdminOverridePublishRequest {
  itemKey: string;
  tabSlug: FeedTab;
  payload: Record<string, unknown>;
  reason: string;
}

export interface AdminOverridePublishResponse {
  overrideId: string;
  publishEventId: string;
}
