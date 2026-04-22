import clsx from 'clsx';
import type { ReactNode } from 'react';
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
}

const gaugeBands: GaugeBand[] = [
  { color: '#D73C38', label: '\uB9E4\uC6B0 \uB0AE\uC74C' },
  { color: '#EC891C', label: '\uB0AE\uC74C' },
  { color: '#FDD52C', label: '\uBCF4\uD1B5' },
  { color: '#A1CE2D', label: '\uB192\uC74C' },
  { color: '#56B678', label: '\uB9E4\uC6B0 \uB192\uC74C' },
];

function clampScore(score: number) {
  return Math.min(100, Math.max(0, score));
}

function isWaitingSignal(item: SignalItem) {
  return item.classification === '\uB300\uAE30 \uC911';
}

function getGaugeBand(item: SignalItem) {
  if (isWaitingSignal(item)) {
    return {
      color: '#8B95A1',
      label: '\uB300\uAE30',
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
    return '\uCD5C\uC2E0';
  }

  if (state === 'aging') {
    return '\uC8FC\uC758';
  }

  return '\uC9C0\uC5F0';
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
  const cx = 128;
  const cy = 128;
  const radius = 86;
  const domeRadius = 42;
  const needleAngle = -90 + score * 1.8;
  const needleEnd = polarToCartesian(cx, cy, 70, needleAngle);
  const segmentGap = 4;
  const segmentSweep = (180 - segmentGap * (gaugeBands.length - 1)) / gaugeBands.length;

  return (
    <div className="signal-gauge" aria-hidden="true">
      <svg viewBox="0 0 256 154" className="signal-gauge__svg">
        {gaugeBands.map((segment, index) => {
          const startAngle = -90 + index * (segmentSweep + segmentGap);
          const endAngle = startAngle + segmentSweep;
          const isActive = segment.color === band.color;

          return (
            <path
              key={segment.color}
              d={describeArc(cx, cy, radius, startAngle, endAngle)}
              fill="none"
              stroke={segment.color}
              strokeWidth="24"
              strokeLinecap="butt"
              strokeOpacity={isActive ? 0.52 : 0.2}
            />
          );
        })}

        <path
          d={describeHalfDome(cx, cy, domeRadius)}
          fill={band.color}
          fillOpacity="0.16"
          stroke={band.color}
          strokeOpacity="0.42"
          strokeWidth="2"
        />

        <line
          x1={cx}
          y1={cy}
          x2={needleEnd.x}
          y2={needleEnd.y}
          stroke="#191F28"
          strokeWidth="4"
          strokeLinecap="round"
        />
        <circle cx={cx} cy={cy} r="7" fill="#FFFFFF" stroke="#191F28" strokeWidth="2" />

        <text
          x={cx}
          y={cy - domeRadius / 2 + 1}
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

function getFeedStatement(item: SignalItem) {
  if (isWaitingSignal(item)) {
    return '\uCCAB \uACF5\uAC1C \uB370\uC774\uD130 \uB300\uAE30 \uC911';
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

          <div className="feed-card__insight">
            <strong className="feed-card__band" style={{ color: band.color }}>
              {band.label}
            </strong>
            <p className="feed-card__statement">{getFeedStatement(item)}</p>
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
        <strong>{'\uD604\uC7AC \uD750\uB984\uC744 \uAC04\uB2E8\uD788 \uC77D\uC5B4\uBCF4\uC138\uC694.'}</strong>
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
