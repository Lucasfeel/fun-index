import clsx from 'clsx';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { FreshnessState, IndexSignal, MetricTone, SignalItem, SocialSignal } from '../lib/types';
import {
  formatAbsoluteTime,
  formatDelta,
  formatRelativeTime,
  getConfidenceLabel,
  getDomainEyebrow,
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

function isSocialSignal(item: SignalItem): item is SocialSignal {
  return item.domain === 'social';
}

function isIndexSignal(item: SignalItem): item is IndexSignal {
  return item.domain === 'pentagon' || item.domain === 'psychology';
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
    return 'Fresh';
  }

  if (state === 'aging') {
    return 'Aging';
  }

  return 'Stale';
}

function ScoreBubble({ score }: { score: number }) {
  const tone = getScoreTone(score);

  return (
    <div className={clsx('score-bubble', `score-bubble--${tone}`)}>
      <span className="score-bubble__value">{Math.round(score)}</span>
      <span className="score-bubble__label">score</span>
    </div>
  );
}

function DeltaPill({ delta }: { delta: number }) {
  const deltaClass = delta === 0 ? 'flat' : delta > 0 ? 'up' : 'down';

  return <span className={clsx('delta-pill', `delta-pill--${deltaClass}`)}>{formatDelta(delta)}</span>;
}

function MetricPreview({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: MetricTone | undefined;
}) {
  return (
    <div className="metric-preview">
      <span className="metric-preview__label">{label}</span>
      <strong className={clsx('metric-preview__value', tone && getMetricToneClass(tone))}>{value}</strong>
    </div>
  );
}

export function FeedCard({ item }: { item: SignalItem }) {
  const freshnessState = getFreshnessState(item.updatedAt, item.cadenceHours);

  return (
    <article className={clsx('feed-card', freshnessState === 'stale' && 'feed-card--stale')}>
      <Link to={item.detailPath} className="feed-card__link">
        <div className="feed-card__head">
          <span className="feed-card__eyebrow">{getDomainEyebrow(item)}</span>
          <FreshnessBadge updatedAt={item.updatedAt} cadenceHours={item.cadenceHours} />
        </div>

        <div className="feed-card__summary">
          <div className="feed-card__title-wrap">
            <h2 className="feed-card__title">{item.title}</h2>
            {item.subtitle ? <p className="feed-card__subtitle">{item.subtitle}</p> : null}
          </div>
          <ScoreBubble score={item.score} />
        </div>

        <div className="feed-card__classification">
          <strong>{item.classification}</strong>
          <DeltaPill delta={item.change} />
        </div>

        <p className="feed-card__body">{item.summary}</p>

        <div className="feed-card__meta">
          <span>{formatRelativeTime(item.updatedAt)}</span>
          <span>{getConfidenceLabel(item.confidenceBand)}</span>
          {isSocialSignal(item) ? <span>{item.sourceCount} reviewed sources</span> : null}
          {isIndexSignal(item) ? <span>{item.metrics.length} tracked components</span> : null}
        </div>

        <div className="feed-card__metrics">
          {item.metrics.slice(0, 3).map((metric) => (
            <MetricPreview key={`${item.id}-${metric.label}`} {...metric} />
          ))}
        </div>

        {isSocialSignal(item) ? (
          <div className="feed-card__tags">
            {item.categories.map((category) => (
              <span key={`${item.id}-${category}`} className="tag">
                {category}
              </span>
            ))}
          </div>
        ) : null}
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
        <strong>Read this as an activity snapshot.</strong>
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
          <div className="skeleton skeleton--line skeleton--short" />
          <div className="skeleton skeleton--title" />
          <div className="skeleton skeleton--line" />
          <div className="skeleton skeleton--line skeleton--medium" />
          <div className="skeleton skeleton--metrics" />
        </div>
      ))}
    </div>
  );
}
