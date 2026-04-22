import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { DataFacts, DetailHero, DriverList, MetricGrid, StatePanel } from '../components/Feed';
import { SignalEditorSheet } from '../components/SignalEditorSheet';
import { NoticeStrip, PageContainer, DetailHeader, Section } from '../components/Page';
import { canEditSignals } from '../lib/editor';
import { getConfidenceLabel } from '../lib/format';
import { usePentagonSignal, usePsychologySignal } from '../lib/queries';
import type { IndicatorDomain, IndexSignal } from '../lib/types';

interface IndicatorDetailScreenProps {
  domain: IndicatorDomain;
}

function getContextualNote(signal: IndexSignal) {
  if (signal.domain === 'pentagon') {
    return '집계된 생활 흐름을 보여주는 지표입니다. 개별 변수의 방향보다 전체 분위기를 읽는 용도로 보세요.';
  }

  return '수집 시점의 시장 심리 상태를 보여주는 지표입니다. 확정 신호보다 현재 분위기를 읽는 참고용으로 보세요.';
}

export function IndicatorDetailScreen({ domain }: IndicatorDetailScreenProps) {
  const detailQuery = domain === 'pentagon' ? usePentagonSignal() : usePsychologySignal();
  const item = detailQuery.data;
  const [editorOpen, setEditorOpen] = useState(false);
  const queryClient = useQueryClient();

  async function handleSaved() {
    await queryClient.invalidateQueries({ queryKey: ['signals'] });
  }

  return (
    <PageContainer>
      <DetailHeader
        section={domain === 'pentagon' ? '펜타곤 상세' : '심리 상세'}
        title={item?.title ?? '시그널 상세'}
        subtitle={item?.subtitle}
        fallbackPath={domain === 'pentagon' ? '/pentagon' : '/psychology'}
        action={
          item && canEditSignals() ? (
            <button type="button" className="button button--ghost" onClick={() => setEditorOpen(true)}>
              편집
            </button>
          ) : null
        }
      />

      {detailQuery.isLoading ? (
        <StatePanel
          title="상세 정보를 불러오는 중이에요"
          description="최신 흐름과 지표 구성을 준비하고 있어요."
        />
      ) : null}

      {!detailQuery.isLoading && detailQuery.isError && !item ? (
        <StatePanel
          title="상세 정보를 불러올 수 없어요"
          description="공개 피드에서 이 시그널을 찾지 못했습니다. 다시 시도하거나 목록으로 돌아가 주세요."
          actionLabel="다시 시도"
          onAction={() => void detailQuery.refetch()}
        />
      ) : null}

      {!detailQuery.isLoading && !detailQuery.isError && !item ? (
        <StatePanel title="시그널을 찾을 수 없어요" description="요청한 경로와 일치하는 공개 시그널이 없습니다." />
      ) : null}

      {item ? (
        <>
          <DetailHero item={item} contextualNote={getContextualNote(item)} />

          {item.uncertaintyNote ? (
            <NoticeStrip tone="warning" title="주의 사항" description={item.uncertaintyNote} />
          ) : null}

          <Section title="구성 지표" description="핵심 구성만 간단히 보여줍니다." />
          <MetricGrid metrics={item.metrics} />

          <DriverList title="변동 요인" items={item.drivers} />

          <DataFacts>
            <div className="facts-panel__row">
              <span>갱신 주기</span>
              <strong>대체로 1시간</strong>
            </div>
            <div className="facts-panel__row">
              <span>최신성</span>
              <strong>{item.freshnessNote ?? '가장 최근 공개 스냅샷 기준'}</strong>
            </div>
            <div className="facts-panel__row">
              <span>신뢰도</span>
              <strong>{getConfidenceLabel(item.confidenceBand)}</strong>
            </div>
            {'coverageLabel' in item ? (
              <div className="facts-panel__row">
                <span>커버리지</span>
                <strong>{item.coverageLabel}</strong>
              </div>
            ) : null}
            {'sampleSize' in item ? (
              <div className="facts-panel__row">
                <span>표본 수</span>
                <strong>{item.sampleSize.toLocaleString()}</strong>
              </div>
            ) : null}
          </DataFacts>
        </>
      ) : null}

      {item && editorOpen ? (
        <SignalEditorSheet item={item} onClose={() => setEditorOpen(false)} onSaved={handleSaved} />
      ) : null}
    </PageContainer>
  );
}
