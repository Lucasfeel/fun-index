import { useEffect, useState, startTransition } from 'react';

import type { RunSummary } from '@indicator/shared';

import { Badge } from '../components/Badge';
import { DataTable } from '../components/DataTable';
import { Panel } from '../components/Panel';
import { fetchRuns } from '../lib/api';
import { formatDateTime } from '../lib/format';

export function RunsPage() {
  const [runs, setRuns] = useState<RunSummary[]>([]);

  useEffect(() => {
    void fetchRuns().then((records) => {
      startTransition(() => {
        setRuns(records);
      });
    });
  }, []);

  return (
    <Panel
      title="Runs"
      subtitle="Execution logs, raw snapshot traceability, retries, and diagnostics starting point."
      actions={<div className="hint-text">Pair this page with `run_logs`, `raw_snapshots`, and `audit_log` drill-down queries.</div>}
    >
      <DataTable
        rows={runs}
        columns={[
          {
            key: 'run',
            header: 'Run',
            render: (row) => (
              <div>
                <strong>{row.id}</strong>
                <div className="row-meta">{row.idempotencyKey}</div>
              </div>
            ),
          },
          {
            key: 'trigger',
            header: 'Trigger',
            render: (row) => row.trigger,
          },
          {
            key: 'status',
            header: 'Status',
            render: (row) => (
              <Badge tone={row.status === 'failed' ? 'danger' : row.status === 'review_required' ? 'warning' : 'success'}>
                {row.status}
              </Badge>
            ),
          },
          {
            key: 'window',
            header: 'Started / finished',
            render: (row) => (
              <div>
                <div>{formatDateTime(row.startedAt)}</div>
                <div className="row-meta">{formatDateTime(row.finishedAt)}</div>
              </div>
            ),
          },
          {
            key: 'error',
            header: 'Diagnostics',
            render: (row) =>
              row.errorCode ? (
                <div>
                  <strong>{row.errorCode}</strong>
                  <div className="row-meta">{row.errorMessage}</div>
                </div>
              ) : (
                <span className="row-meta">No critical error</span>
              ),
          },
        ]}
      />
    </Panel>
  );
}
