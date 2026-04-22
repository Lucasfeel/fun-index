import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { DataFacts, DetailHero, DriverList, MetricGrid, StatePanel } from '../components/Feed';
import { SocialSignalEditor } from '../components/SocialSignalEditor';
import { NoticeStrip, PageContainer, DetailHeader, Section } from '../components/Page';
import { canEditSocialSignals } from '../lib/editor';
import { useSocialSignal } from '../lib/queries';

export function SnsDetailScreen() {
  const detailQuery = useSocialSignal();
  const item = detailQuery.data;
  const [editorOpen, setEditorOpen] = useState(false);
  const queryClient = useQueryClient();

  async function handleSaved() {
    await queryClient.invalidateQueries({ queryKey: ['signals'] });
  }

  return (
    <PageContainer>
      <DetailHeader
        section="SNS 피드 상세"
        title={item?.title ?? 'SNS 시그널 상세'}
        fallbackPath="/sns"
        action={
          item && canEditSocialSignals() ? (
            <button type="button" className="button button--ghost" onClick={() => setEditorOpen(true)}>
              편집
            </button>
          ) : null
        }
      />

      {detailQuery.isLoading ? (
        <StatePanel title="상세 정보를 불러오는 중이에요" description="SNS 항목과 요약 정보를 준비하고 있어요." />
      ) : null}

      {!detailQuery.isLoading && detailQuery.isError && !item ? (
        <StatePanel
          title="상세 정보를 불러오지 못했어요"
          description="현재 공개 피드에서 이 SNS 시그널을 찾지 못했습니다."
          actionLabel="다시 시도"
          onAction={() => void detailQuery.refetch()}
        />
      ) : null}

      {!detailQuery.isLoading && !detailQuery.isError && !item ? (
        <StatePanel
          title="SNS 항목을 찾을 수 없어요"
          description="현재 공개된 SNS 피드와 일치하는 항목이 없습니다."
        />
      ) : null}

      {item ? (
        <>
          <DetailHero
            item={item}
            contextualNote="검토된 SNS와 커뮤니티 흐름을 빠르게 정리해 보여주는 항목입니다. 확정 신호보다 현재 분위기를 읽는 참고용으로 봐주세요."
          />

          <NoticeStrip tone="neutral" title="검토 후 노출" description={item.approvalNote} />

          {item.uncertaintyNote ? (
            <NoticeStrip tone="warning" title="주의 사항" description={item.uncertaintyNote} />
          ) : null}

          <Section title="구성 지표" description="응답 요약만 간단히 보여줍니다." />
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

      {item && editorOpen ? (
        <SocialSignalEditor item={item} onClose={() => setEditorOpen(false)} onSaved={handleSaved} />
      ) : null}
    </PageContainer>
  );
}
