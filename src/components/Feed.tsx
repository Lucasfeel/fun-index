import type { ReactNode } from 'react';
import clsx from 'clsx';

import type { FreshnessState, SignalItem } from '../lib/types';
import {
  formatAbsoluteTime,
  formatDelta,
  getConfidenceLabel,
  getFreshnessState,
  getMetricToneClass,
  getScoreTone,
} from '../lib/format';

interface StatePanelProps {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

interface DetailHeroProps {
  item: SignalItem;
  contextualNote: string;
}

interface GaugeBand {
  color: string;
  label: string;
  arcLabel?: string;
}

interface FeedHelpCopy {
  description: string;
  cadence: string;
}

const gaugeBands: GaugeBand[] = [
  { color: '#D73C38', label: '매우 낮음' },
  { color: '#EC891C', label: '낮음' },
  { color: '#FDD52C', label: '보통' },
  { color: '#A1CE2D', label: '높음' },
  { color: '#56B678', label: '매우 높음' },
];

const gaugeArcLabels = ['EXTREME FEAR', 'FEAR', 'NEUTRAL', 'GREED', 'EXTREME GREED'];

const classificationLabelMap: Record<string, string> = {
  'extreme fear': '극단적 공포',
  fear: '공포',
  neutral: '중립',
  greed: '탐욕',
  'extreme greed': '극단적 탐욕',
  stable: '안정',
  approved: '승인됨',
  waiting: '대기 중',
  'venue data unavailable': '장소 데이터 없음',
};

function clampScore(score: number) {
  return Math.min(100, Math.max(0, score));
}

function isWaitingSignal(item: SignalItem) {
  return item.classification === '대기 중';
}

function isLimitedVenueClassification(classification: string | undefined) {
  return classification?.trim().toLowerCase() === 'limited venue data';
}

function normalizeDisplayLabel(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function getDisplayClassification(classification: string | undefined) {
  if (!classification || isLimitedVenueClassification(classification)) {
    return undefined;
  }

  const doughconMatch = classification.trim().match(/^doughcon\s*(\d+)$/i);
  if (doughconMatch) {
    return `도우콘 ${doughconMatch[1]}`;
  }

  return classificationLabelMap[normalizeDisplayLabel(classification)] ?? classification;
}

function getDisplayTitle(item: SignalItem) {
  if (item.domain === 'pentagon') {
    return item.indexType === 'pizza' ? '피자 지수' : '바 지수';
  }

  if (item.domain === 'psychology') {
    if (item.indicatorType === 'us-stock-fear-greed') {
      return '미국 주식 공포탐욕지수';
    }

    if (item.indicatorType === 'crypto-fear-greed') {
      return '코인 공포탐욕지수';
    }

    return '한국 주식 공포탐욕지수';
  }

  if (item.slug.includes('trump')) {
    return '트럼프';
  }

  if (item.slug.includes('elon')) {
    return '일론 머스크';
  }

  if (item.slug.includes('kr-stock')) {
    return '국내 주식 커뮤니티';
  }

  if (item.slug.includes('global-stock')) {
    return '해외 주식 커뮤니티';
  }

  return item.title;
}

function formatCadenceHelp(cadenceHours: number) {
  if (!Number.isFinite(cadenceHours) || cadenceHours <= 1) {
    return '1시간마다 업데이트됩니다.';
  }

  const roundedHours = Math.round(cadenceHours);
  return `${roundedHours}시간마다 업데이트됩니다.`;
}

function getFeedHelpDescription(item: SignalItem) {
  if (item.domain === 'pentagon') {
    if (item.indexType === 'pizza') {
      return '국제정세가 불안해지는 일이 발생하면 펜타곤 근처의 피자 주문량이 늘어나 피자인덱스가 증가합니다.';
    }

    return '펜타곤 주변 바가 평소보다 조용해지면 야간 업무가 늘어난 신호로 보고 바지수가 낮아집니다.';
  }

  if (item.domain === 'psychology') {
    if (item.indicatorType === 'us-stock-fear-greed') {
      return '씨엔엔 방식의 7개 시장 지표를 모아 미국 주식시장의 공포와 탐욕을 0~100점으로 보여줍니다.';
    }

    if (item.indicatorType === 'crypto-fear-greed') {
      return '코인마켓캡의 코인 공포탐욕지수로 가상자산 시장 심리가 공포인지 탐욕인지 보여줍니다.';
    }

    return '국내 주식시장 데이터를 모아 한국 주식시장의 공포와 탐욕을 0~100점으로 보여줍니다.';
  }

  if (item.slug.includes('trump')) {
    return '트럼프 관련 발언과 소셜 언급 흐름을 모아 시장이 얼마나 민감하게 반응하는지 보여줍니다.';
  }

  if (item.slug.includes('elon')) {
    return '일론 머스크 관련 발언과 소셜 반응을 모아 시장 관심도와 확산 강도를 보여줍니다.';
  }

  if (item.slug.includes('kr-stock')) {
    return '국내 주식 커뮤니티의 토론량과 반복되는 키워드를 모아 개인투자자 관심 흐름을 보여줍니다.';
  }

  if (item.slug.includes('global-stock')) {
    return '해외 주식 커뮤니티의 토론량과 반복되는 키워드를 모아 글로벌 투자자 심리 흐름을 보여줍니다.';
  }

  return `${getDisplayTitle(item)}의 최근 흐름을 모아 시장 반응을 간단히 보여줍니다.`;
}

function getFeedHelpCopy(item: SignalItem): FeedHelpCopy {
  return {
    description: getFeedHelpDescription(item),
    cadence: formatCadenceHelp(item.cadenceHours),
  };
}

function getGaugeBand(item: SignalItem) {
  if (isWaitingSignal(item)) {
    return {
      color: '#8B95A1',
      label: '대기',
    } satisfies GaugeBand;
  }

  const score = clampScore(item.score);
  const index = score === 100 ? gaugeBands.length - 1 : Math.floor(score / 20);
  return gaugeBands[Math.min(index, gaugeBands.length - 1)]!;
}

function polarToCartesian(centerX: number, centerY: number, radius: number, angleInDegrees: number) {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;

  return {
    x: centerX + radius * Math.cos(angleInRadians),
    y: centerY + radius * Math.sin(angleInRadians),
  };
}

function describeHalfDome(centerX: number, centerY: number, radius: number) {
  return `M ${centerX - radius} ${centerY} A ${radius} ${radius} 0 0 1 ${centerX + radius} ${centerY} Z`;
}

function describeGaugeSegment(
  centerX: number,
  centerY: number,
  outerRadius: number,
  innerRadius: number,
  startAngle: number,
  endAngle: number,
) {
  const steps = 14;
  const outerPoints = Array.from({ length: steps + 1 }, (_, index) =>
    polarToCartesian(centerX, centerY, outerRadius, startAngle + ((endAngle - startAngle) * index) / steps),
  );
  const innerPoints = Array.from({ length: steps + 1 }, (_, index) =>
    polarToCartesian(centerX, centerY, innerRadius, endAngle - ((endAngle - startAngle) * index) / steps),
  );
  const [firstPoint, ...restPoints] = [...outerPoints, ...innerPoints];

  return [
    `M ${firstPoint!.x} ${firstPoint!.y}`,
    ...restPoints.map((point) => `L ${point.x} ${point.y}`),
    'Z',
  ].join(' ');
}

function describeNeedle(centerX: number, centerY: number, angleInDegrees: number, length: number) {
  const tip = polarToCartesian(centerX, centerY, length, angleInDegrees);
  const perpendicular = ((angleInDegrees + 90 - 90) * Math.PI) / 180.0;
  const baseHalfWidth = 15;
  const tipHalfWidth = 3.5;
  const dx = Math.cos(perpendicular);
  const dy = Math.sin(perpendicular);

  const points = [
    { x: centerX + dx * baseHalfWidth, y: centerY + dy * baseHalfWidth },
    { x: tip.x + dx * tipHalfWidth, y: tip.y + dy * tipHalfWidth },
    { x: tip.x - dx * tipHalfWidth, y: tip.y - dy * tipHalfWidth },
    { x: centerX - dx * baseHalfWidth, y: centerY - dy * baseHalfWidth },
  ];

  return points.map((point) => `${point.x},${point.y}`).join(' ');
}

function FreshnessBadge({
  updatedAt,
  cadenceHours,
}: {
  updatedAt: string;
  cadenceHours: number;
}) {
  const state = getFreshnessState(updatedAt, cadenceHours);

  return (
    <span className={clsx('freshness-badge', `freshness-badge--${state}`)}>
      {getFreshnessLabel(state)}
    </span>
  );
}

function getFreshnessLabel(state: FreshnessState) {
  if (state === 'fresh') {
    return '최신';
  }

  if (state === 'aging') {
    return '주의';
  }

  return '지연';
}

function ScoreBubble({ score }: { score: number }) {
  const tone = getScoreTone(score);

  return (
    <div className={clsx('score-bubble', `score-bubble--${tone}`)}>
      <span className="score-bubble__value">{Math.round(score)}</span>
    </div>
  );
}

function DeltaPill({ delta }: { delta: number }) {
  const deltaClass = delta === 0 ? 'flat' : delta > 0 ? 'up' : 'down';

  return <span className={clsx('delta-pill', `delta-pill--${deltaClass}`)}>{formatDelta(delta)}</span>;
}

function SignalGauge({ item }: { item: SignalItem }) {
  const score = clampScore(item.score);
  const band = getGaugeBand(item);
  const cx = 460;
  const cy = 500;
  const outerRadius = 420;
  const innerRadius = 280;
  const labelRadius = 350;
  const tickRadius = 258;
  const tickLabelRadius = 226;
  const centerRadius = 96;
  const needleAngle = -90 + score * 1.8;
  const segmentGap = 1.6;
  const segmentSweep = (180 - segmentGap * (gaugeBands.length - 1)) / gaugeBands.length;
  const activeIndex = score === 100 ? gaugeBands.length - 1 : Math.floor(score / 20);
  const tickValues = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  const tickLabels = [0, 25, 50, 75, 100];

  return (
    <div className="signal-gauge" aria-hidden="true">
      <svg viewBox="0 0 920 520" className="signal-gauge__svg">
        {gaugeBands.map((segment, index) => {
          const startAngle = -90 + index * (segmentSweep + segmentGap);
          const endAngle = startAngle + segmentSweep;
          const isActive = index === Math.min(activeIndex, gaugeBands.length - 1);
          const labelAngle = startAngle + segmentSweep / 2;
          const labelPoint = polarToCartesian(cx, cy, labelRadius, labelAngle);
          const labelRotation = labelAngle * 0.88;

          return (
            <g key={segment.color}>
              <path
                d={describeGaugeSegment(cx, cy, outerRadius, innerRadius, startAngle, endAngle)}
                fill={isActive ? segment.color : '#F2F2F2'}
                fillOpacity={isActive ? 0.32 : 0.72}
              />
              {isActive ? (
                <path
                  d={describeGaugeSegment(cx, cy, outerRadius, innerRadius, startAngle, endAngle)}
                  fill="transparent"
                  stroke={segment.color}
                  strokeWidth="5"
                  strokeOpacity="0.72"
                />
              ) : null}
              <text
                x={labelPoint.x}
                y={labelPoint.y}
                textAnchor="middle"
                dominantBaseline="middle"
                className={clsx('signal-gauge__arc-label', isActive && 'signal-gauge__arc-label--active')}
                transform={`rotate(${labelRotation} ${labelPoint.x} ${labelPoint.y})`}
              >
                {gaugeArcLabels[index]!.split(' ').map((word, wordIndex, words) => (
                  <tspan
                    key={word}
                    x={labelPoint.x}
                    dy={words.length === 1 ? 0 : wordIndex === 0 ? -16 : 32}
                  >
                    {word}
                  </tspan>
                ))}
              </text>
            </g>
          );
        })}

        {tickValues.map((value) => {
          const tickPoint = polarToCartesian(cx, cy, tickRadius, -90 + value * 1.8);
          return <circle key={value} cx={tickPoint.x} cy={tickPoint.y} r="4.4" fill="#8B95A1" opacity="0.58" />;
        })}

        {tickLabels.map((value) => {
          const labelPoint = polarToCartesian(cx, cy, tickLabelRadius, -90 + value * 1.8);
          return (
            <text
              key={value}
              x={labelPoint.x}
              y={labelPoint.y}
              textAnchor="middle"
              dominantBaseline="middle"
              className="signal-gauge__tick-label"
            >
              {value}
            </text>
          );
        })}

        <polygon points={describeNeedle(cx, cy, needleAngle, 342)} fill="#191F28" />
        <circle cx={cx} cy={cy} r={centerRadius} fill="#FFFFFF" />
        <path d={describeHalfDome(cx, cy, centerRadius)} fill={band.color} fillOpacity="0.05" />

        <text
          x={cx}
          y={cy - 34}
          textAnchor="middle"
          dominantBaseline="middle"
          className="signal-gauge__score"
        >
          {Math.round(score)}
        </text>
      </svg>
    </div>
  );
}

function FeedHelp({ item }: { item: SignalItem }) {
  const help = getFeedHelpCopy(item);
  const title = getDisplayTitle(item);
  const tooltipId = `feed-help-${item.domain}-${item.id}`;

  return (
    <span className="feed-help">
      <button type="button" className="feed-help__trigger" aria-label={`${title} 설명`} aria-describedby={tooltipId}>
        ?
      </button>
      <span id={tooltipId} role="tooltip" className="feed-help__panel">
        <span>{help.description}</span>
        <span>{help.cadence}</span>
      </span>
    </span>
  );
}

function HistoryList({ item }: { item: SignalItem }) {
  const comparisons = item.historicalComparisons ?? [];

  if (comparisons.length === 0) {
    return null;
  }

  return (
    <div className="feed-card__history" aria-label="과거 비교">
      {comparisons.map((comparison) => {
        const tone = getScoreTone(comparison.score);
        const classification = getDisplayClassification(comparison.classification);
        return (
          <div key={comparison.key} className="history-row">
            <div className="history-row__copy">
              <span className="history-row__label">{comparison.label}</span>
              {classification ? <strong>{classification}</strong> : null}
            </div>
            <span className={clsx('history-row__score', `history-row__score--${tone}`)}>
              {Math.round(comparison.score)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function getFeedStatement(item: SignalItem) {
  if (isWaitingSignal(item)) {
    return '첫 공개 데이터 대기 중';
  }

  return item.classification;
}

export function FeedCard({ item }: { item: SignalItem }) {
  const band = getGaugeBand(item);
  const title = getDisplayTitle(item);
  const statement = item.domain === 'psychology' ? undefined : getDisplayClassification(getFeedStatement(item));

  return (
    <article className="feed-card">
      <div className="feed-card__body">
        <div className="feed-card__title-row">
          <h2 className="feed-card__title">{title}</h2>
          <FeedHelp item={item} />
        </div>

        <div className="feed-card__gauge-row">
          <div className="feed-card__gauge-stack">
            <SignalGauge item={item} />
            <div className="feed-card__insight" aria-label="현재 지표 상태">
              <strong className="feed-card__band" style={{ color: band.color }}>
                {band.label}
              </strong>
              {statement ? <p className="feed-card__statement">{statement}</p> : null}
            </div>
          </div>

          <HistoryList item={item} />
        </div>
      </div>
    </article>
  );
}

export function DetailHero({ item, contextualNote }: DetailHeroProps) {
  return (
    <section className="detail-hero">
      <div className="detail-hero__surface">
        <div className="detail-hero__topline">
          <FreshnessBadge updatedAt={item.updatedAt} cadenceHours={item.cadenceHours} />
          <span className="detail-hero__timestamp">{formatAbsoluteTime(item.updatedAt)}</span>
        </div>

        <div className="detail-hero__main">
          <ScoreBubble score={item.score} />
          <div className="detail-hero__copy">
            <div className="detail-hero__classification">
              <strong>{getDisplayClassification(item.classification) ?? getGaugeBand(item).label}</strong>
              <DeltaPill delta={item.change} />
            </div>
            <p>{item.summary}</p>
            <div className="detail-hero__meta">
              <span>{getConfidenceLabel(item.confidenceBand)}</span>
              {item.freshnessNote ? <span>{item.freshnessNote}</span> : null}
            </div>
          </div>
        </div>
      </div>

      <div className="detail-note">
        <strong>현재 흐름을 간단히 읽어보세요.</strong>
        <p>{contextualNote}</p>
      </div>
    </section>
  );
}

export function MetricGrid({ metrics }: { metrics: SignalItem['metrics'] }) {
  return (
    <div className="metric-grid">
      {metrics.map((metric) => (
        <div key={`${metric.label}-${metric.value}`} className="metric-tile">
          <span className="metric-tile__label">{metric.label}</span>
          <strong className={clsx('metric-tile__value', metric.tone && getMetricToneClass(metric.tone))}>
            {metric.value}
          </strong>
        </div>
      ))}
    </div>
  );
}

export function DriverList({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="driver-list">
      <h3 className="section-block__title">{title}</h3>
      <ul className="driver-list__items">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

export function DataFacts({ children }: { children: ReactNode }) {
  return <section className="facts-panel">{children}</section>;
}

export function StatePanel({ title, description, actionLabel, onAction }: StatePanelProps) {
  return (
    <div className="state-panel">
      <strong>{title}</strong>
      <p>{description}</p>
      {actionLabel && onAction ? (
        <button type="button" className="button" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

export function FeedSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="feed-stack" aria-hidden="true">
      {Array.from({ length: count }).map((_, index) => (
        <div key={`skeleton-${index}`} className="feed-card feed-card--skeleton">
          <div className="skeleton skeleton--title" />
          <div className="skeleton skeleton--metrics" />
          <div className="skeleton skeleton--line skeleton--medium" />
        </div>
      ))}
    </div>
  );
}
