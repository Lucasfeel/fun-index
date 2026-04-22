import { startTransition, useDeferredValue, useState } from 'react';
import { FeedCard, FeedSkeleton, StatePanel } from '../components/Feed';
import { NoticeStrip, PageContainer, ScreenHeader, Section } from '../components/Page';
import { SegmentedChips } from '../components/SegmentedChips';
import { getFreshnessState } from '../lib/format';
import { usePsychologySignals } from '../lib/queries';
import type { PsychologyIndicatorType } from '../lib/types';

type FilterValue = 'all' | PsychologyIndicatorType;

function getLabel(value: FilterValue) {
  if (value === 'fear-greed') {
    return 'Fear & Greed';
  }

  if (value === 'positioning-heat') {
    return 'Positioning';
  }

  if (value === 'breadth-stress') {
    return 'Breadth';
  }

  return 'All';
}

export function PsychologyScreen() {
  const query = usePsychologySignals();
  const [filter, setFilter] = useState<FilterValue>('all');
  const deferredFilter = useDeferredValue(filter);
  const items =
    deferredFilter === 'all'
      ? query.data ?? []
      : (query.data ?? []).filter((item) => item.indicatorType === deferredFilter);
  const staleCount = items.filter((item) => getFreshnessState(item.updatedAt, item.cadenceHours) === 'stale').length;

  return (
    <PageContainer>
      <ScreenHeader
        eyebrow="Sentiment and positioning"
        title="Psychology"
        description="Fear-and-greed style indicators surface as readable summaries first, with detail views that explain freshness, components, and uncertainty."
      />

      <Section
        title={`Showing ${getLabel(deferredFilter)}`}
        description="Indicators stay compact: score, classification, change, timestamp, and what the reading should be taken to mean."
        action={
          <div className="filter-control">
            <SegmentedChips
              value={filter}
              options={[
                { value: 'all', label: 'All' },
                { value: 'fear-greed', label: 'Fear & Greed' },
                { value: 'positioning-heat', label: 'Positioning' },
                { value: 'breadth-stress', label: 'Breadth' },
              ]}
              onChange={(value) => {
                startTransition(() => {
                  setFilter(value);
                });
              }}
            />
          </div>
        }
      />

      {staleCount > 0 ? (
        <NoticeStrip
          tone="warning"
          title="A few psychology inputs are behind cadence."
          description="Older snapshots are still shown, but they are explicitly marked stale so the feed never implies stronger certainty than the data warrants."
        />
      ) : null}

      {query.isLoading ? <FeedSkeleton count={3} /> : null}

      {!query.isLoading && query.isError && items.length === 0 ? (
        <StatePanel
          title="Psychology could not load"
          description="The public indicator feed did not refresh. The UI stays read-only and only consumes anon-safe access."
          actionLabel="Retry"
          onAction={() => void query.refetch()}
        />
      ) : null}

      {!query.isLoading && !query.isError && items.length === 0 ? (
        <StatePanel
          title="No psychology readings yet"
          description="As soon as structured fear-and-greed style rows land in the public view, they will appear here with the same detail pattern."
        />
      ) : null}

      {items.length > 0 ? (
        <div className="feed-stack">
          {items.map((item) => (
            <FeedCard key={item.id} item={item} />
          ))}
        </div>
      ) : null}

      <div className="disclaimer">
        These indicators reflect observed sentiment and positioning conditions. They do not guarantee direction or timing.
      </div>
    </PageContainer>
  );
}
