import { startTransition, useDeferredValue, useState } from 'react';
import { FeedCard, FeedSkeleton, StatePanel } from '../components/Feed';
import { PageContainer, ScreenHeader, Section } from '../components/Page';
import { SegmentedChips } from '../components/SegmentedChips';
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

  return (
    <PageContainer width="feed">
      <ScreenHeader title="펜타곤" />

      <Section
        title="지수"
        action={
          <div className="filter-control">
            <SegmentedChips
              value={filter}
              options={[
                { value: 'all', label: '전체' },
                { value: 'pizza', label: '피자 지수' },
                { value: 'gay-bar', label: '바 지수' },
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

      {query.isLoading ? <FeedSkeleton count={2} /> : null}

      {!query.isLoading && query.isError && items.length === 0 ? (
        <StatePanel
          title="펜타곤 데이터를 불러올 수 없어요"
          description="최신 지수를 다시 불러와 주세요."
          actionLabel="다시 시도"
          onAction={() => void query.refetch()}
        />
      ) : null}

      {!query.isLoading && !query.isError && items.length === 0 ? (
        <StatePanel title="아직 공개된 지수가 없어요" description="공개된 지수가 여기에 표시됩니다." />
      ) : null}

      {items.length > 0 ? (
        <div className="feed-stack">
          {items.map((item) => (
            <FeedCard key={item.id} item={item} />
          ))}
        </div>
      ) : null}
    </PageContainer>
  );
}
