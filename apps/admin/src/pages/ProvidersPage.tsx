import { useEffect, useState, startTransition } from 'react';

import type { ProviderRecord } from '@indicator/shared';

import { Badge } from '../components/Badge';
import { DataTable } from '../components/DataTable';
import { Panel } from '../components/Panel';
import { fetchProviders } from '../lib/api';
import { formatDateTime, formatJson } from '../lib/format';

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
      title="Providers"
      subtitle="Auth state, legal/data mode, source health, and supported signals."
      actions={<div className="hint-text">Mutations should route through `admin-config-upsert`.</div>}
    >
      <DataTable
        rows={providers}
        columns={[
          {
            key: 'provider',
            header: 'Provider',
            render: (row) => (
              <div>
                <strong>{row.displayName}</strong>
                <div className="row-meta">{row.code}</div>
              </div>
            ),
          },
          {
            key: 'kind',
            header: 'Kind',
            render: (row) => row.providerKind,
          },
          {
            key: 'auth',
            header: 'Auth',
            render: (row) => (
              <Badge tone={row.authState === 'valid' || row.authState === 'not_required' ? 'success' : 'warning'}>
                {row.authState}
              </Badge>
            ),
          },
          {
            key: 'legal',
            header: 'Legal mode',
            render: (row) => row.legalMode,
          },
          {
            key: 'health',
            header: 'Source health',
            render: (row) => (
              <Badge tone={row.sourceHealth === 'healthy' ? 'success' : row.sourceHealth === 'degraded' ? 'warning' : 'danger'}>
                {row.sourceHealth}
              </Badge>
            ),
          },
          {
            key: 'lastSuccess',
            header: 'Last success',
            render: (row) => formatDateTime(row.lastSuccessAt),
          },
          {
            key: 'notes',
            header: 'Config',
            render: (row) => (
              <details className="details-block">
                <summary>View config</summary>
                <pre>{formatJson(row.config)}</pre>
              </details>
            ),
          },
        ]}
      />
    </Panel>
  );
}
