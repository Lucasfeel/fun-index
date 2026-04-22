import { startTransition, useDeferredValue, useState } from 'react';
import { FeedCard, FeedSkeleton, StatePanel } from '../components/Feed';
import { NoticeStrip, PageContainer, ScreenHeader, Section } from '../components/Page';
import { SegmentedChips } from '../components/SegmentedChips';
import { getFreshnessState } from '../lib/format';
import { usePentagonSignals } from '../lib/queries';
import type { PentagonIndexType } from '../lib/types';

type FilterValue = 'all' | PentagonIndexType;

export function PentagonScreen() {
  const query = usePentagonSignals();
  const [filter, setFilter] = useState<FilterValue>('all');
  const deferredFilter = useDeferredValue(filter);
  const items =
    deferredFilter === 'all'
      ? query.data ?? []
      : (query.data ?? []).filter((item) => item.indexType === deferredFilter);
  const staleCount = items.filter((item) => getFreshnessState(item.updatedAt, item.cadenceHours) === 'stale').length;

  return (
    <PageContainer>
      <ScreenHeader
        eyebrow="Aggregate venue activity"
        title="Pentagon"
        description="Pizza Index and Gay Bar Index stay aggregate-first here. No venue-level maps, no operational detail, just the rolled-up signal read."
      />

      <Section
        title="Indices"
        description="Each index highlights score, hourly change, freshness, and uncertainty in the same feed pattern."
        action={
          <div className="filter-control">
            <SegmentedChips
              value={filter}
              options={[
                { value: 'all', label: 'All' },
                { value: 'pizza', label: 'Pizza' },
                { value: 'gay-bar', label: 'Gay Bar' },
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
          title="Some Pentagon inputs are aging."
          description="Freshness is surfaced directly on each card so hourly lag is visible before anyone over-reads the index."
        />
      ) : null}

      {query.isLoading ? <FeedSkeleton count={2} /> : null}

      {!query.isLoading && query.isError && items.length === 0 ? (
        <StatePanel
          title="Pentagon could not load"
          description="The aggregate venue indices did not refresh. The user-facing app only reads anon-safe data and does not expose any ingestion controls."
          actionLabel="Retry"
          onAction={() => void query.refetch()}
        />
      ) : null}

      {!query.isLoading && !query.isError && items.length === 0 ? (
        <StatePanel
          title="No Pentagon items yet"
          description="Once aggregate index rows publish into the public view, they will appear here in a simple chronological feed."
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
        Pentagon indices describe aggregate activity conditions. They are designed for context, not venue calls or directional certainty.
      </div>
    </PageContainer>
  );
}
