import { useEffect, useState, startTransition } from 'react';

import type { CollectionJobRecord } from '../lib/shared-types';

import { Badge } from '../components/Badge';
import { DataTable } from '../components/DataTable';
import { Panel } from '../components/Panel';
import { fetchJobs } from '../lib/api';
import { formatDateTime } from '../lib/format';
import { labelForPublishBehavior, labelForRunStatus } from '../lib/labels';

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
      title="수집 작업"
      subtitle="작업 일정, 파서 버전, 게시 정책을 한눈에 확인합니다."
      actions={<div className="hint-text">실제 크론 배포는 `collection_jobs.schedule_cron` 값을 기준으로 맞춥니다.</div>}
    >
      <DataTable
        rows={jobs}
        columns={[
          {
            key: 'job',
            header: '작업',
            render: (row) => (
              <div>
                <strong>{row.displayName}</strong>
                <div className="row-meta">{row.slug}</div>
              </div>
            ),
          },
          {
            key: 'schedule',
            header: '주기',
            render: (row) => <code>{row.scheduleCron}</code>,
          },
          {
            key: 'parser',
            header: '파서 버전',
            render: (row) => <code>{row.parserVersion}</code>,
          },
          {
            key: 'publish',
            header: '게시 방식',
            render: (row) => labelForPublishBehavior(row.publishBehavior),
          },
          {
            key: 'enabled',
            header: '활성 상태',
            render: (row) => (row.isEnabled ? <Badge tone="success">활성</Badge> : <Badge tone="neutral">일시중지</Badge>),
          },
          {
            key: 'last',
            header: '최근 결과',
            render: (row) => (
              <Badge tone={row.lastRunStatus === 'failed' ? 'danger' : row.lastRunStatus === 'review_required' ? 'warning' : 'success'}>
                {labelForRunStatus(row.lastRunStatus)}
              </Badge>
            ),
          },
          {
            key: 'finished',
            header: '최근 종료',
            render: (row) => formatDateTime(row.lastFinishedAt),
          },
        ]}
      />
    </Panel>
  );
}
