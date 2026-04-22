import { useEffect, useState, startTransition } from 'react';

import type { DashboardSnapshot } from '../lib/shared-types';

import { Badge } from '../components/Badge';
import { DataTable } from '../components/DataTable';
import { Panel } from '../components/Panel';
import { StatCard } from '../components/StatCard';
import { fetchDashboardSnapshot } from '../lib/api';
import { formatDateTime, formatPercent } from '../lib/format';
import { labelForRunStatus, labelForSourceHealth } from '../lib/labels';

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
        setError(reason instanceof Error ? reason.message : '대시보드 데이터를 불러오지 못했습니다.');
      });
  }, []);

  return (
    <>
      <section className="hero-grid">
        <StatCard
          label="최근 24시간 실패율"
          value={snapshot ? formatPercent(snapshot.failureRateLast24h) : '--'}
          meta="시간 단위 수집/게시 작업 기준"
        />
        <StatCard
          label="갱신 지연 건수"
          value={snapshot ? String(snapshot.freshnessViolations) : '--'}
          meta="SLA를 벗어난 카드와 소스"
        />
        <StatCard
          label="추적 중인 소스"
          value={snapshot ? String(snapshot.providerHealth.length) : '--'}
          meta="PizzINT, CNN, CMC, X 기준"
        />
      </section>

      {error ? <div className="notice notice--danger">{error}</div> : null}

      <Panel title="최근 실행" subtitle="가장 최근 실행 결과와 의심 출력 건수를 확인합니다.">
        <DataTable
          rows={snapshot?.recentRuns ?? []}
          columns={[
            {
              key: 'job',
              header: '작업',
              render: (run) => run.jobSlug ?? run.id,
            },
            {
              key: 'status',
              header: '상태',
              render: (run) => (
                <Badge tone={run.status === 'failed' ? 'danger' : run.status === 'review_required' ? 'warning' : 'success'}>
                  {labelForRunStatus(run.status)}
                </Badge>
              ),
            },
            {
              key: 'started',
              header: '시작',
              render: (run) => formatDateTime(run.startedAt),
            },
            {
              key: 'finished',
              header: '종료',
              render: (run) => formatDateTime(run.finishedAt),
            },
            {
              key: 'suspicious',
              header: '의심 건수',
              render: (run) => String(run.suspiciousCount),
            },
            {
              key: 'freshness',
              header: '갱신 상태',
              render: (run) => (run.freshnessViolation ? <Badge tone="warning">지연</Badge> : <Badge tone="success">정상</Badge>),
            },
          ]}
        />
      </Panel>

      <Panel title="소스 상태" subtitle="각 소스의 현재 상태와 SLA 대비 지연 여부를 확인합니다.">
        <DataTable
          rows={snapshot?.providerHealth ?? []}
          columns={[
            {
              key: 'provider',
              header: '소스',
              render: (row) => row.providerCode,
            },
            {
              key: 'health',
              header: '상태',
              render: (row) => (
                <Badge tone={row.sourceHealth === 'healthy' ? 'success' : row.sourceHealth === 'degraded' ? 'warning' : 'danger'}>
                  {labelForSourceHealth(row.sourceHealth)}
                </Badge>
              ),
            },
            {
              key: 'freshness',
              header: '갱신 상태',
              render: (row) => (row.stale ? <Badge tone="warning">지연</Badge> : <Badge tone="success">정상</Badge>),
            },
            {
              key: 'minutes',
              header: '최근 성공 이후',
              render: (row) => (row.minutesSinceSuccess === null ? '없음' : `${row.minutesSinceSuccess}분`),
            },
          ]}
        />
      </Panel>
    </>
  );
}
