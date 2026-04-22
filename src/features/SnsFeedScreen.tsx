import { startTransition, useDeferredValue, useState } from 'react';
import { FeedCard, FeedSkeleton, StatePanel } from '../components/Feed';
import { PageContainer, ScreenHeader, Section } from '../components/Page';
import { SegmentedChips } from '../components/SegmentedChips';
import { useSocialSignals } from '../lib/queries';

type FilterValue = 'all' | '트럼프' | '일론' | '국내 주식 커뮤니티' | '해외주식 커뮤니티';

export function SnsFeedScreen() {
  const query = useSocialSignals();
  const [filter, setFilter] = useState<FilterValue>('all');
  const deferredFilter = useDeferredValue(filter);

  const items =
    deferredFilter === 'all'
      ? query.data ?? []
      : (query.data ?? []).filter((item) => item.categories.includes(deferredFilter));

  return (
    <PageContainer>
      <ScreenHeader title="SNS 피드" />

      <Section
        title="피드"
        action={
          <div className="filter-control">
            <SegmentedChips
              value={filter}
              options={[
                { value: 'all', label: '전체' },
                { value: '트럼프', label: '트럼프' },
                { value: '일론', label: '일론' },
                { value: '국내 주식 커뮤니티', label: '국내 커뮤' },
                { value: '해외주식 커뮤니티', label: '해외 커뮤' },
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

      {query.isLoading ? <FeedSkeleton count={4} /> : null}

      {!query.isLoading && query.isError && items.length === 0 ? (
        <StatePanel
          title="SNS 피드를 불러올 수 없어요"
          description="승인된 항목을 다시 불러와 주세요."
          actionLabel="다시 시도"
          onAction={() => void query.refetch()}
        />
      ) : null}

      {!query.isLoading && !query.isError && items.length === 0 ? (
        <StatePanel title="아직 승인된 항목이 없어요" description="승인된 SNS 시그널이 여기에 표시됩니다." />
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
