import type {
  CollectionJobRecord,
  FeedItemKind,
  FeedTab,
  ProviderAuthState,
  ProviderLegalMode,
  ProviderRecord,
  ReviewQueueItem,
  ReviewStatus,
  RunStatus,
  RunTrigger,
  SourceHealth,
} from './shared-types';

const feedTabLabels: Record<FeedTab, string> = {
  home: '홈',
  pentagon: '펜타곤',
  psychology: '심리',
  sns_feed: 'SNS',
};

const feedItemKindLabels: Record<FeedItemKind, string> = {
  indicator_card: '지표 카드',
  sns_rollup: 'SNS 피드',
  editorial: '운영 문구',
  system_notice: '시스템 안내',
};

const providerKindLabels: Record<ProviderRecord['providerKind'], string> = {
  indicator: '지표',
  sentiment: '심리',
  social: 'SNS',
};

const providerAuthStateLabels: Record<ProviderAuthState, string> = {
  not_required: '불필요',
  valid: '정상',
  expired: '만료',
  invalid: '오류',
  error: '오류',
};

const providerLegalModeLabels: Record<ProviderLegalMode, string> = {
  public_web: '공개 웹',
  licensed_api: '계약 API',
  manual_upload: '수동 업로드',
  restricted: '제한됨',
  disabled: '비활성',
};

const sourceHealthLabels: Record<SourceHealth, string> = {
  healthy: '정상',
  degraded: '불안정',
  down: '중단',
  paused: '일시중지',
};

const runTriggerLabels: Record<RunTrigger, string> = {
  scheduled: '정기 실행',
  manual: '수동 실행',
  retry: '재시도',
  backfill: '백필',
  publish_only: '게시만',
  override: '수동 수정',
};

const runStatusLabels: Record<RunStatus, string> = {
  queued: '대기',
  running: '실행 중',
  succeeded: '성공',
  failed: '실패',
  review_required: '검토 필요',
  published: '게시 완료',
  cancelled: '취소',
};

const reviewStatusLabels: Record<ReviewStatus, string> = {
  pending: '대기',
  approved: '승인',
  rejected: '반려',
  edited: '수정됨',
  published: '게시됨',
};

const reviewEntityLabels: Record<ReviewQueueItem['entityType'], string> = {
  run: '실행',
  indicator_point: '지표 값',
  sns_rollup: 'SNS 요약',
  feed_state: '피드 상태',
};

const publishBehaviorLabels: Record<CollectionJobRecord['publishBehavior'], string> = {
  automatic: '자동 게시',
  review_gated: '검토 후 게시',
  manual: '수동 게시',
};

export function labelForFeedTab(value: FeedTab) {
  return feedTabLabels[value];
}

export function labelForFeedItemKind(value: FeedItemKind) {
  return feedItemKindLabels[value];
}

export function labelForProviderKind(value: ProviderRecord['providerKind']) {
  return providerKindLabels[value];
}

export function labelForProviderAuthState(value: ProviderAuthState) {
  return providerAuthStateLabels[value];
}

export function labelForProviderLegalMode(value: ProviderLegalMode) {
  return providerLegalModeLabels[value];
}

export function labelForSourceHealth(value: SourceHealth) {
  return sourceHealthLabels[value];
}

export function labelForRunTrigger(value: RunTrigger) {
  return runTriggerLabels[value];
}

export function labelForRunStatus(value: RunStatus | null) {
  if (!value) {
    return '없음';
  }

  return runStatusLabels[value];
}

export function labelForReviewStatus(value: ReviewStatus) {
  return reviewStatusLabels[value];
}

export function labelForReviewEntity(value: ReviewQueueItem['entityType']) {
  return reviewEntityLabels[value];
}

export function labelForPublishBehavior(value: CollectionJobRecord['publishBehavior']) {
  return publishBehaviorLabels[value];
}

export function labelForRoute(pathname: string) {
  const normalizedPath = pathname === '/' ? '/dashboard' : pathname;
  const item = [
    { to: '/dashboard', label: '대시보드' },
    { to: '/providers', label: '소스 상태' },
    { to: '/jobs', label: '수집 작업' },
    { to: '/review-queue', label: '검토 대기열' },
    { to: '/runs', label: '실행 이력' },
    { to: '/feed-layout', label: '피드 구성' },
    { to: '/sns-control', label: 'SNS 관리' },
    { to: '/manual-rerun', label: '수동 실행' },
  ].find((route) => route.to === normalizedPath);

  return item?.label ?? '대시보드';
}
