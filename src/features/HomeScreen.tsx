import { FeedCard, FeedSkeleton, StatePanel } from '../components/Feed';
import { NoticeStrip, PageContainer, ScreenHeader, Section } from '../components/Page';
import { getFreshnessState } from '../lib/format';
import { useHomeSignals } from '../lib/queries';

export function HomeScreen() {
  const query = useHomeSignals();
  const items = query.data ?? [];
  const featured = items[0];

  const freshCount = items.filter((item) => getFreshnessState(item.updatedAt, item.cadenceHours) === 'fresh').length;
  const staleCount = items.filter((item) => getFreshnessState(item.updatedAt, item.cadenceHours) === 'stale').length;

  return (
    <PageContainer emphasis="hero">
      <ScreenHeader
        eyebrow="Hourly read-only feed"
        title="Signal Feed"
        description="Aggregate market, behavior, and reviewed social signals in a calm hourly surface built for scanning."
        aside={
          featured ? (
            <div className="hero-chip">
              <strong>{freshCount}</strong>
              <span>fresh now</span>
            </div>
          ) : null
        }
      />

      {featured ? (
        <section className="hero-panel">
          <div className="hero-panel__content">
            <span className="hero-panel__eyebrow">Most recent movement</span>
            <h2>{featured.title}</h2>
            <p>{featured.summary}</p>
          </div>
          <div className="hero-panel__stats">
            <div className="hero-panel__stat">
              <span>Classification</span>
              <strong>{featured.classification}</strong>
            </div>
            <div className="hero-panel__stat">
              <span>Hourly delta</span>
              <strong>{featured.change >= 0 ? '+' : ''}{featured.change.toFixed(1)}</strong>
            </div>
          </div>
        </section>
      ) : null}

      {staleCount > 0 ? (
        <NoticeStrip
          tone="warning"
          title="Freshness is mixed right now."
          description={`${staleCount} signal${staleCount > 1 ? 's are' : ' is'} running past the normal hourly cadence, so uncertainty is shown more prominently.`}
        />
      ) : null}

      <Section
        title="Latest across the stack"
        description="One feed, ordered by recency, with Pentagon, Psychology, and approved social items in the same shell."
      />

      {query.isLoading ? <FeedSkeleton count={5} /> : null}

      {!query.isLoading && query.isError && items.length === 0 ? (
        <StatePanel
          title="Home feed unavailable"
          description="The read-only feed could not refresh. Check the public Supabase views or continue with demo data during development."
          actionLabel="Retry"
          onAction={() => void query.refetch()}
        />
      ) : null}

      {!query.isLoading && !query.isError && items.length === 0 ? (
        <StatePanel
          title="Nothing has been published yet"
          description="Home stays intentionally lightweight, so it waits for approved index or social items instead of showing placeholders."
        />
      ) : null}

      {items.length > 0 ? (
        <div className="feed-stack">
          {items.map((item) => (
            <FeedCard key={`${item.domain}-${item.id}`} item={item} />
          ))}
        </div>
      ) : null}

      {query.isError && items.length > 0 ? (
        <NoticeStrip
          tone="critical"
          title="Showing the last successful snapshot"
          description="A background refresh failed, but the most recent cached feed is still visible so the screen remains readable."
        />
      ) : null}

      <div className="disclaimer">
        Signals summarize observed activity and sentiment. They do not imply price targets, certainty, or trading instructions.
      </div>
    </PageContainer>
  );
}
