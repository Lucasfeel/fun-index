import { DataFacts, DetailHero, DriverList, MetricGrid, StatePanel } from '../components/Feed';
import { NoticeStrip, PageContainer, DetailHeader, Section } from '../components/Page';
import { useSocialSignal } from '../lib/queries';

export function SnsDetailScreen() {
  const detailQuery = useSocialSignal();
  const item = detailQuery.data;

  return (
    <PageContainer>
      <DetailHeader section="SNS Feed detail" title={item?.title ?? 'Social signal detail'} fallbackPath="/sns" />

      {detailQuery.isLoading ? (
        <StatePanel
          title="Loading detail"
          description="The reviewed social item is being loaded with its freshness and source summary."
        />
      ) : null}

      {!detailQuery.isLoading && detailQuery.isError && !item ? (
        <StatePanel
          title="Detail unavailable"
          description="This social signal could not be loaded from the approved public feed."
          actionLabel="Retry"
          onAction={() => void detailQuery.refetch()}
        />
      ) : null}

      {!detailQuery.isLoading && !detailQuery.isError && !item ? (
        <StatePanel
          title="Social item not found"
          description="The route does not match a currently published SNS Feed item."
        />
      ) : null}

      {item ? (
        <>
          <DetailHero
            item={item}
            contextualNote="This item is a reviewed aggregation of social behavior and chatter. It should be read as context about conversation and behavior, not as an instruction or certainty claim."
          />

          <NoticeStrip
            tone="neutral"
            title="Approval-gated by design"
            description={item.approvalNote}
          />

          {item.uncertaintyNote ? (
            <NoticeStrip tone="warning" title="Uncertainty callout" description={item.uncertaintyNote} />
          ) : null}

          <Section
            title="Signal composition"
            description="A few summary components help explain why the item surfaced without turning the screen into moderation tooling."
          />
          <MetricGrid metrics={item.metrics} />

          <DriverList title="Why this item surfaced" items={item.drivers} />

          <DataFacts>
            <div className="facts-panel__row">
              <span>Reviewed sources</span>
              <strong>{item.sourceCount}</strong>
            </div>
            <div className="facts-panel__row">
              <span>Categories</span>
              <strong>{item.categories.join(', ')}</strong>
            </div>
            <div className="facts-panel__row">
              <span>Source set</span>
              <strong>{item.sources.join(', ')}</strong>
            </div>
          </DataFacts>
        </>
      ) : null}
    </PageContainer>
  );
}
