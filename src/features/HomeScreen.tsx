import { FeedCard, FeedSkeleton, StatePanel } from '../components/Feed';
import { PageContainer } from '../components/Page';
import { useHomeSignals } from '../lib/queries';

export function HomeScreen() {
  const query = useHomeSignals();
  const items = query.data ?? [];

  return (
    <PageContainer emphasis="hero">
      {query.isLoading ? <FeedSkeleton count={5} /> : null}

      {!query.isLoading && query.isError && items.length === 0 ? (
        <StatePanel
          title="피드를 불러올 수 없어요"
          description="최신 시그널을 다시 불러와 주세요."
          actionLabel="다시 시도"
          onAction={() => void query.refetch()}
        />
      ) : null}

      {!query.isLoading && !query.isError && items.length === 0 ? (
        <StatePanel title="아직 공개된 시그널이 없어요" description="승인된 시그널이 여기에 표시됩니다." />
      ) : null}

      {items.length > 0 ? (
        <div className="feed-stack">
          {items.map((item) => (
            <FeedCard key={`${item.domain}-${item.id}`} item={item} />
          ))}
        </div>
      ) : null}
    </PageContainer>
  );
}
