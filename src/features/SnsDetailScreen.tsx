import { DataFacts, DetailHero, DriverList, MetricGrid, StatePanel } from '../components/Feed';
import { NoticeStrip, PageContainer, DetailHeader, Section } from '../components/Page';
import { useSocialSignal } from '../lib/queries';

export function SnsDetailScreen() {
  const detailQuery = useSocialSignal();
  const item = detailQuery.data;

  return (
    <PageContainer>
      <DetailHeader section="SNS 피드 상세" title={item?.title ?? 'SNS 시그널 상세'} fallbackPath="/sns" />

      {detailQuery.isLoading ? (
        <StatePanel
          title="상세 정보를 불러오는 중이에요"
          description="승인된 SNS 항목과 요약 정보를 준비하고 있어요."
        />
      ) : null}

      {!detailQuery.isLoading && detailQuery.isError && !item ? (
        <StatePanel
          title="상세 정보를 불러올 수 없어요"
          description="승인된 공개 피드에서 이 SNS 시그널을 찾지 못했습니다."
          actionLabel="다시 시도"
          onAction={() => void detailQuery.refetch()}
        />
      ) : null}

      {!detailQuery.isLoading && !detailQuery.isError && !item ? (
        <StatePanel
          title="SNS 항목을 찾을 수 없어요"
          description="현재 공개된 SNS 피드 항목과 일치하지 않습니다."
        />
      ) : null}

      {item ? (
        <>
          <DetailHero
            item={item}
            contextualNote="검토된 SNS 대화와 행동 흐름을 집계한 항목입니다. 확정 신호보다는 현재 분위기를 읽는 참고용으로 보세요."
          />

          <NoticeStrip
            tone="neutral"
            title="승인 후 노출"
            description={item.approvalNote}
          />

          {item.uncertaintyNote ? (
            <NoticeStrip tone="warning" title="유의 사항" description={item.uncertaintyNote} />
          ) : null}

          <Section
            title="구성 지표"
            description="핵심 요약만 간단히 보여줍니다."
          />
          <MetricGrid metrics={item.metrics} />

          <DriverList title="노출 이유" items={item.drivers} />

          <DataFacts>
            <div className="facts-panel__row">
              <span>검토 출처 수</span>
              <strong>{item.sourceCount}</strong>
            </div>
            <div className="facts-panel__row">
              <span>카테고리</span>
              <strong>{item.categories.join(', ')}</strong>
            </div>
            <div className="facts-panel__row">
              <span>출처</span>
              <strong>{item.sources.join(', ')}</strong>
            </div>
          </DataFacts>
        </>
      ) : null}
    </PageContainer>
  );
}
