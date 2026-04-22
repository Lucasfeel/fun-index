import { useEffect, useState, startTransition } from 'react';

import type { DashboardSnapshot } from '@indicator/shared';

import { Badge } from '../components/Badge';
import { DataTable } from '../components/DataTable';
import { Panel } from '../components/Panel';
import { StatCard } from '../components/StatCard';
import { fetchDashboardSnapshot } from '../lib/api';
import { formatDateTime, formatPercent } from '../lib/format';

export function DashboardPage() {
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchDashboardSnapshot()
      .then((data) => {
        startTransition(() => {
          setSnapshot(data);
        });
      })
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : 'Failed to load dashboard');
      });
  }, []);

  return (
    <>
      <section className="hero-grid">
        <StatCard
          label="Failure rate, 24h"
          value={snapshot ? formatPercent(snapshot.failureRateLast24h) : '--'}
          meta="Hourly collectors and publish jobs"
        />
        <StatCard
          label="Freshness violations"
          value={snapshot ? String(snapshot.freshnessViolations) : '--'}
          meta="Cards or providers outside SLA"
        />
        <StatCard
          label="Providers tracked"
          value={snapshot ? String(snapshot.providerHealth.length) : '--'}
          meta="PizzINT, CNN, CMC, X"
        />
      </section>

      {error ? <div className="notice notice--danger">{error}</div> : null}

      <Panel title="Recent runs" subtitle="Latest execution outcomes and suspicious-output counts.">
        <DataTable
          rows={snapshot?.recentRuns ?? []}
          columns={[
            {
              key: 'job',
              header: 'Job',
              render: (run) => run.jobSlug ?? run.id,
            },
            {
              key: 'status',
              header: 'Status',
              render: (run) => (
                <Badge tone={run.status === 'failed' ? 'danger' : run.status === 'review_required' ? 'warning' : 'success'}>
                  {run.status}
                </Badge>
              ),
            },
            {
              key: 'started',
              header: 'Started',
              render: (run) => formatDateTime(run.startedAt),
            },
            {
              key: 'finished',
              header: 'Finished',
              render: (run) => formatDateTime(run.finishedAt),
            },
            {
              key: 'suspicious',
              header: 'Suspicious',
              render: (run) => String(run.suspiciousCount),
            },
            {
              key: 'freshness',
              header: 'Freshness',
              render: (run) => (run.freshnessViolation ? <Badge tone="warning">Violated</Badge> : <Badge tone="success">OK</Badge>),
            },
          ]}
        />
      </Panel>

      <Panel title="Provider health" subtitle="Source status and staleness relative to provider SLA.">
        <DataTable
          rows={snapshot?.providerHealth ?? []}
          columns={[
            {
              key: 'provider',
              header: 'Provider',
              render: (row) => row.providerCode,
            },
            {
              key: 'health',
              header: 'Health',
              render: (row) => (
                <Badge tone={row.sourceHealth === 'healthy' ? 'success' : row.sourceHealth === 'degraded' ? 'warning' : 'danger'}>
                  {row.sourceHealth}
                </Badge>
              ),
            },
            {
              key: 'freshness',
              header: 'Freshness',
              render: (row) => (row.stale ? <Badge tone="warning">Stale</Badge> : <Badge tone="success">Fresh</Badge>),
            },
            {
              key: 'minutes',
              header: 'Minutes since success',
              render: (row) => (row.minutesSinceSuccess === null ? 'Never' : `${row.minutesSinceSuccess}m`),
            },
          ]}
        />
      </Panel>
    </>
  );
}
