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

function describeArc(centerX: number, centerY: number, radius: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(centerX, centerY, radius, endAngle);
  const end = polarToCartesian(centerX, centerY, radius, startAngle);

  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 0 0 ${end.x} ${end.y}`;
}

function describeHalfDome(centerX: number, centerY: number, radius: number) {
  return `M ${centerX - radius} ${centerY} A ${radius} ${radius} 0 0 1 ${centerX + radius} ${centerY} Z`;
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
  const cx = 180;
  const cy = 174;
  const radius = 136;
  const baseRadius = 46;
  const needleAngle = -90 + score * 1.8;
  const needleEnd = polarToCartesian(cx, cy, 108, needleAngle);
  const segmentGap = 3;
  const segmentSweep = (180 - segmentGap * (gaugeBands.length - 1)) / gaugeBands.length;
  const activeIndex = score === 100 ? gaugeBands.length - 1 : Math.floor(score / 20);
  const tickValues = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  const tickLabels = [0, 25, 50, 75, 100];

  return (
    <div className="signal-gauge" aria-hidden="true">
      <svg viewBox="0 0 360 232" className="signal-gauge__svg">
        {gaugeBands.map((segment, index) => {
          const startAngle = -90 + index * (segmentSweep + segmentGap);
          const endAngle = startAngle + segmentSweep;
          const isActive = index === Math.min(activeIndex, gaugeBands.length - 1);
          const labelAngle = startAngle + segmentSweep / 2;
          const labelPoint = polarToCartesian(cx, cy, 126, labelAngle);

          return (
            <g key={segment.color}>
              <path
                d={describeArc(cx, cy, radius, startAngle, endAngle)}
                fill="none"
                stroke={segment.color}
                strokeWidth="48"
                strokeLinecap="butt"
                strokeOpacity={isActive ? 0.34 : 0.08}
              />
              {isActive ? (
                <path
                  d={describeArc(cx, cy, radius, startAngle, endAngle)}
                  fill="none"
                  stroke={segment.color}
                  strokeWidth="2"
                  strokeLinecap="butt"
                  strokeOpacity="0.72"
                />
              ) : null}
              <text
                x={labelPoint.x}
                y={labelPoint.y}
                textAnchor="middle"
                dominantBaseline="middle"
                className="signal-gauge__arc-label"
                transform={`rotate(${labelAngle * 0.62} ${labelPoint.x} ${labelPoint.y})`}
              >
                {gaugeArcLabels[index]}
              </text>
            </g>
          );
        })}

        {tickValues.map((value) => {
          const tickPoint = polarToCartesian(cx, cy, 92, -90 + value * 1.8);
          return <circle key={value} cx={tickPoint.x} cy={tickPoint.y} r="2.2" fill="#8B95A1" opacity="0.78" />;
        })}

        {tickLabels.map((value) => {
          const labelPoint = polarToCartesian(cx, cy, 76, -90 + value * 1.8);
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

        <path d={describeHalfDome(cx, cy, baseRadius)} fill={band.color} fillOpacity="0.12" />

        <line
          x1={cx}
          y1={cy}
          x2={needleEnd.x}
          y2={needleEnd.y}
          stroke="#191F28"
          strokeWidth="6"
          strokeLinecap="round"
        />
        <circle cx={cx} cy={cy} r="4.5" fill="#FFFFFF" stroke="#191F28" strokeWidth="1.8" />

        <text
          x={cx}
          y={cy + 34}
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
        return (
          <div key={comparison.key} className="history-row">
            <div className="history-row__copy">
              <span className="history-row__label">
                {comparison.label}
                {comparison.isApproximate ? ' 근사' : ''}
              </span>
              <strong>{comparison.classification}</strong>
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

  return (
    <article className="feed-card">
      <Link to={item.detailPath} className="feed-card__link">
        <h2 className="feed-card__title">{item.title}</h2>

        <div className="feed-card__gauge-row">
          <SignalGauge item={item} />

          <div className="feed-card__side">
            <div className="feed-card__insight">
              <strong className="feed-card__band" style={{ color: band.color }}>
                {band.label}
              </strong>
              <p className="feed-card__statement">{getFeedStatement(item)}</p>
            </div>
            <HistoryList item={item} />
          </div>
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
              <strong>{item.classification}</strong>
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
