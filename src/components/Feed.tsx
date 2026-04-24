import type { ReactNode } from 'react';
import clsx from 'clsx';
import { Link } from 'react-router-dom';

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

const gaugeBands: GaugeBand[] = [
  { color: '#D73C38', label: '매우 낮음' },
  { color: '#EC891C', label: '낮음' },
  { color: '#FDD52C', label: '보통' },
  { color: '#A1CE2D', label: '높음' },
  { color: '#56B678', label: '매우 높음' },
];

const gaugeArcLabels = ['EXTREME FEAR', 'FEAR', 'NEUTRAL', 'GREED', 'EXTREME GREED'];

function clampScore(score: number) {
  return Math.min(100, Math.max(0, score));
}

function isWaitingSignal(item: SignalItem) {
  return item.classification === '대기 중';
}

function isLimitedVenueClassification(classification: string | undefined) {
  return classification?.trim().toLowerCase() === 'limited venue data';
}

function getDisplayClassification(classification: string | undefined) {
  return isLimitedVenueClassification(classification) ? undefined : classification;
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
  const statement = getDisplayClassification(getFeedStatement(item));

  return (
    <article className="feed-card">
      <Link to={item.detailPath} className="feed-card__link">
        <h2 className="feed-card__title">{item.title}</h2>

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
      </Link>
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
