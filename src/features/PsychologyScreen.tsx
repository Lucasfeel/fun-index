import { startTransition, useDeferredValue, useState } from 'react';
import { FeedCard, FeedSkeleton, StatePanel } from '../components/Feed';
import { PageContainer, ScreenHeader, Section } from '../components/Page';
import { SegmentedChips } from '../components/SegmentedChips';
import { usePsychologySignals } from '../lib/queries';
import type { PsychologyIndicatorType } from '../lib/types';

type FilterValue = 'all' | PsychologyIndicatorType;

function getLabel(value: FilterValue) {
  if (value === 'us-stock-fear-greed') {
    return '미국주식 공탐지수';
  }

  if (value === 'crypto-fear-greed') {
    return '코인 공탐지수';
  }

  if (value === 'kr-stock-fear-greed') {
    return '한국주식 공탐지수';
  }

  return '전체';
}

export function PsychologyScreen() {
  const query = usePsychologySignals();
  const [filter, setFilter] = useState<FilterValue>('all');
  const deferredFilter = useDeferredValue(filter);
  const items =
    deferredFilter === 'all'
      ? query.data ?? []
      : (query.data ?? []).filter((item) => item.indicatorType === deferredFilter);

  return (
    <PageContainer>
      <ScreenHeader title="심리" />

      <Section
        title={getLabel(deferredFilter)}
        action={
          <div className="filter-control">
            <SegmentedChips
              value={filter}
              options={[
                { value: 'all', label: '전체' },
                { value: 'us-stock-fear-greed', label: '미국주식' },
                { value: 'crypto-fear-greed', label: '코인' },
                { value: 'kr-stock-fear-greed', label: '한국주식' },
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

      {query.isLoading ? <FeedSkeleton count={3} /> : null}

      {!query.isLoading && query.isError && items.length === 0 ? (
        <StatePanel
          title="심리 데이터를 불러올 수 없어요"
          description="최신 지표를 다시 불러와 주세요."
          actionLabel="다시 시도"
          onAction={() => void query.refetch()}
        />
      ) : null}

      {!query.isLoading && !query.isError && items.length === 0 ? (
        <StatePanel title="아직 공개된 심리 지표가 없어요" description="공개된 지표가 여기에 표시됩니다." />
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
