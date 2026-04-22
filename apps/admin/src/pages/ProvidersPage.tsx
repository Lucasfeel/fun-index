import { useEffect, useState, startTransition } from 'react';

import type { ProviderRecord } from '../lib/shared-types';

import { Badge } from '../components/Badge';
import { DataTable } from '../components/DataTable';
import { Panel } from '../components/Panel';
import { fetchProviders } from '../lib/api';
import { formatDateTime, formatJson } from '../lib/format';
import {
  labelForProviderAuthState,
  labelForProviderKind,
  labelForProviderLegalMode,
  labelForSourceHealth,
} from '../lib/labels';

export function ProvidersPage() {
  const [providers, setProviders] = useState<ProviderRecord[]>([]);

  useEffect(() => {
    void fetchProviders().then((records) => {
      startTransition(() => {
        setProviders(records);
      });
    });
  }, []);

  return (
    <Panel
      title="소스 상태"
      subtitle="인증 상태, 데이터 모드, 소스 건강도와 설정을 확인합니다."
      actions={<div className="hint-text">설정 변경은 `admin-config-upsert` 경로를 통해 반영하는 구성을 전제로 합니다.</div>}
    >
      <DataTable
        rows={providers}
        columns={[
          {
            key: 'provider',
            header: '소스',
            render: (row) => (
              <div>
                <strong>{row.displayName}</strong>
                <div className="row-meta">{row.code}</div>
              </div>
            ),
          },
          {
            key: 'kind',
            header: '유형',
            render: (row) => labelForProviderKind(row.providerKind),
          },
          {
            key: 'auth',
            header: '인증',
            render: (row) => (
              <Badge tone={row.authState === 'valid' || row.authState === 'not_required' ? 'success' : 'warning'}>
                {labelForProviderAuthState(row.authState)}
              </Badge>
            ),
          },
          {
            key: 'legal',
            header: '데이터 모드',
            render: (row) => labelForProviderLegalMode(row.legalMode),
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
            key: 'lastSuccess',
            header: '최근 성공',
            render: (row) => formatDateTime(row.lastSuccessAt),
          },
          {
            key: 'notes',
            header: '설정',
            render: (row) => (
              <details className="details-block">
                <summary>설정 보기</summary>
                <pre>{formatJson(row.config)}</pre>
              </details>
            ),
          },
        ]}
      />
    </Panel>
  );
}
