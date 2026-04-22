import { useEffect, useState, startTransition } from 'react';

import type { CollectionJobRecord } from '@indicator/shared';

import { Badge } from '../components/Badge';
import { DataTable } from '../components/DataTable';
import { Panel } from '../components/Panel';
import { fetchJobs } from '../lib/api';
import { formatDateTime } from '../lib/format';

export function JobsPage() {
  const [jobs, setJobs] = useState<CollectionJobRecord[]>([]);

  useEffect(() => {
    void fetchJobs().then((records) => {
      startTransition(() => {
        setJobs(records);
      });
    });
  }, []);

  return (
    <Panel
      title="Jobs"
      subtitle="Hourly collection jobs, parser versioning, and publish behavior."
      actions={<div className="hint-text">Cron deployment should reconcile from `collection_jobs.schedule_cron`.</div>}
    >
      <DataTable
        rows={jobs}
        columns={[
          {
            key: 'job',
            header: 'Job',
            render: (row) => (
              <div>
                <strong>{row.displayName}</strong>
                <div className="row-meta">{row.slug}</div>
              </div>
            ),
          },
          {
            key: 'schedule',
            header: 'Cron',
            render: (row) => <code>{row.scheduleCron}</code>,
          },
          {
            key: 'parser',
            header: 'Parser version',
            render: (row) => <code>{row.parserVersion}</code>,
          },
          {
            key: 'publish',
            header: 'Publish behavior',
            render: (row) => row.publishBehavior,
          },
          {
            key: 'enabled',
            header: 'State',
            render: (row) => (row.isEnabled ? <Badge tone="success">Enabled</Badge> : <Badge tone="neutral">Paused</Badge>),
          },
          {
            key: 'last',
            header: 'Last status',
            render: (row) => (
              <Badge tone={row.lastRunStatus === 'failed' ? 'danger' : row.lastRunStatus === 'review_required' ? 'warning' : 'success'}>
                {row.lastRunStatus ?? 'unknown'}
              </Badge>
            ),
          },
          {
            key: 'finished',
            header: 'Last finished',
            render: (row) => formatDateTime(row.lastFinishedAt),
          },
        ]}
      />
    </Panel>
  );
}
