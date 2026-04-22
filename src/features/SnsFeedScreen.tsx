import { startTransition, useDeferredValue, useState } from 'react';
import { FeedCard, FeedSkeleton, StatePanel } from '../components/Feed';
import { NoticeStrip, PageContainer, ScreenHeader, Section } from '../components/Page';
import { SegmentedChips } from '../components/SegmentedChips';
import { getFreshnessState } from '../lib/format';
import { useSocialSignals } from '../lib/queries';

type FilterValue = 'all' | 'Behavior' | 'Macro' | 'Consumer' | 'Flows';

export function SnsFeedScreen() {
  const query = useSocialSignals();
  const [filter, setFilter] = useState<FilterValue>('all');
  const deferredFilter = useDeferredValue(filter);

  const items =
    deferredFilter === 'all'
      ? query.data ?? []
      : (query.data ?? []).filter((item) => item.categories.includes(deferredFilter));

  const staleCount = items.filter((item) => getFreshnessState(item.updatedAt, item.cadenceHours) === 'stale').length;

  return (
    <PageContainer>
      <ScreenHeader
        eyebrow="Reviewed social flow"
        title="SNS Feed"
        description="Only approved, aggregate social signal items surface here. The goal is calm readability, not a noisy real-time stream."
      />

      <Section
        title="Published items"
        description="Approval-gated social signals, grouped into a lightweight feed instead of an ops console."
        action={
          <div className="filter-control">
            <SegmentedChips
              value={filter}
              options={[
                { value: 'all', label: 'All' },
                { value: 'Behavior', label: 'Behavior' },
                { value: 'Macro', label: 'Macro' },
                { value: 'Consumer', label: 'Consumer' },
                { value: 'Flows', label: 'Flows' },
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
          title="Some social items are older than the target cadence."
          description="That is shown explicitly so the feed stays honest about freshness even when reviewed content trails the hourly rhythm."
        />
      ) : null}

      {query.isLoading ? <FeedSkeleton count={4} /> : null}

      {!query.isLoading && query.isError && items.length === 0 ? (
        <StatePanel
          title="SNS Feed could not load"
          description="The reviewed social items are unavailable right now. This screen intentionally avoids any admin or moderation controls."
          actionLabel="Retry"
          onAction={() => void query.refetch()}
        />
      ) : null}

      {!query.isLoading && !query.isError && items.length === 0 ? (
        <StatePanel
          title="No reviewed social items yet"
          description="This feed only shows approved aggregate items, so empty is a valid quiet state until publishing catches up."
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
        SNS Feed items summarize reviewed social behavior and chatter. They are context signals, not instructions or certainty claims.
      </div>
    </PageContainer>
  );
}
