import { DataFacts, DetailHero, DriverList, MetricGrid, StatePanel } from '../components/Feed';
import { NoticeStrip, PageContainer, DetailHeader, Section } from '../components/Page';
import { usePentagonSignal, usePsychologySignal } from '../lib/queries';
import type { IndicatorDomain, IndexSignal } from '../lib/types';

interface IndicatorDetailScreenProps {
  domain: IndicatorDomain;
}

function getContextualNote(signal: IndexSignal) {
  if (signal.domain === 'pentagon') {
    return 'This is a rolled-up activity read. It can help frame how busy or restrained the monitored footprint looks, but it should not be taken as a venue map or a directional market call.';
  }

  return 'This reflects sentiment and positioning conditions at the time of collection. It is best used as context for mood and participation, not as a certainty signal.';
}

export function IndicatorDetailScreen({ domain }: IndicatorDetailScreenProps) {
  const detailQuery = domain === 'pentagon' ? usePentagonSignal() : usePsychologySignal();
  const item = detailQuery.data;

  return (
    <PageContainer>
      <DetailHeader
        section={domain === 'pentagon' ? 'Pentagon detail' : 'Psychology detail'}
        title={item?.title ?? 'Signal detail'}
        subtitle={item?.subtitle}
        fallbackPath={domain === 'pentagon' ? '/pentagon' : '/psychology'}
      />

      {detailQuery.isLoading ? (
        <StatePanel
          title="Loading detail"
          description="The latest snapshot is being prepared with its freshness and metric breakdown."
        />
      ) : null}

      {!detailQuery.isLoading && detailQuery.isError && !item ? (
        <StatePanel
          title="Detail unavailable"
          description="This signal could not be loaded from the public feed. Try again or return to the main feed."
          actionLabel="Retry"
          onAction={() => void detailQuery.refetch()}
        />
      ) : null}

      {!detailQuery.isLoading && !detailQuery.isError && !item ? (
        <StatePanel
          title="Signal not found"
          description="The requested detail route does not match a currently published signal item."
        />
      ) : null}

      {item ? (
        <>
          <DetailHero item={item} contextualNote={getContextualNote(item)} />

          {item.uncertaintyNote ? (
            <NoticeStrip
              tone="warning"
              title="Uncertainty callout"
              description={item.uncertaintyNote}
            />
          ) : null}

          <Section
            title="Component read"
            description="The detail view stays lightweight: a few component snapshots, not a dense dashboard."
          />
          <MetricGrid metrics={item.metrics} />

          <DriverList title="What moved the reading" items={item.drivers} />

          <DataFacts>
            <div className="facts-panel__row">
              <span>Cadence</span>
              <strong>Roughly hourly</strong>
            </div>
            <div className="facts-panel__row">
              <span>Freshness note</span>
              <strong>{item.freshnessNote ?? 'Using the latest published snapshot'}</strong>
            </div>
            <div className="facts-panel__row">
              <span>Confidence</span>
              <strong>{item.confidenceBand}</strong>
            </div>
            {'coverageLabel' in item ? (
              <div className="facts-panel__row">
                <span>Coverage</span>
                <strong>{item.coverageLabel}</strong>
              </div>
            ) : null}
            {'sampleSize' in item ? (
              <div className="facts-panel__row">
                <span>Sample size</span>
                <strong>{item.sampleSize.toLocaleString()}</strong>
              </div>
            ) : null}
          </DataFacts>
        </>
      ) : null}
    </PageContainer>
  );
}
