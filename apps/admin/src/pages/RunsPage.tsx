import { useEffect, useState, startTransition } from 'react';

import type { RunSummary } from '../lib/shared-types';

import { Badge } from '../components/Badge';
import { DataTable } from '../components/DataTable';
import { Panel } from '../components/Panel';
import { fetchRuns } from '../lib/api';
import { formatDateTime } from '../lib/format';
import { labelForRunStatus, labelForRunTrigger } from '../lib/labels';

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
      title="실행 이력"
      subtitle="실행 로그, 재시도 흐름, 진단 정보를 빠르게 확인하는 화면입니다."
      actions={<div className="hint-text">필요하면 `run_logs`, `raw_snapshots`, `audit_log` 세부 조회와 함께 확인하세요.</div>}
    >
      <DataTable
        rows={runs}
        columns={[
          {
            key: 'run',
            header: '실행',
            render: (row) => (
              <div>
                <strong>{row.id}</strong>
                <div className="row-meta">{row.idempotencyKey}</div>
              </div>
            ),
          },
          {
            key: 'trigger',
            header: '트리거',
            render: (row) => labelForRunTrigger(row.trigger),
          },
          {
            key: 'status',
            header: '상태',
            render: (row) => (
              <Badge tone={row.status === 'failed' ? 'danger' : row.status === 'review_required' ? 'warning' : 'success'}>
                {labelForRunStatus(row.status)}
              </Badge>
            ),
          },
          {
            key: 'window',
            header: '시작 / 종료',
            render: (row) => (
              <div>
                <div>{formatDateTime(row.startedAt)}</div>
                <div className="row-meta">{formatDateTime(row.finishedAt)}</div>
              </div>
            ),
          },
          {
            key: 'error',
            header: '진단',
            render: (row) =>
              row.errorCode ? (
                <div>
                  <strong>{row.errorCode}</strong>
                  <div className="row-meta">{row.errorMessage}</div>
                </div>
              ) : (
                <span className="row-meta">치명적 오류 없음</span>
              ),
          },
        ]}
      />
    </Panel>
  );
}
