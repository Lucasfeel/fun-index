import { useEffect, useState, startTransition } from 'react';

import type { FeedLayoutItemRecord } from '@indicator/shared';

import { Badge } from '../components/Badge';
import { DataTable } from '../components/DataTable';
import { Panel } from '../components/Panel';
import { fetchFeedLayout } from '../lib/api';
import { formatJson } from '../lib/format';

export function FeedLayoutPage() {
  const [items, setItems] = useState<FeedLayoutItemRecord[]>([]);

  useEffect(() => {
    void fetchFeedLayout().then((records) => {
      startTransition(() => {
        setItems(records);
      });
    });
  }, []);

  return (
    <Panel
      title="Feed Layout"
      subtitle="Card order, copy, visibility, and tab composition for Home, Pentagon, Psychology, and SNS Feed."
      actions={<div className="hint-text">Persist changes through `admin-config-upsert` for audit-safe writes.</div>}
    >
      <DataTable
        rows={items}
        columns={[
          {
            key: 'tab',
            header: 'Tab',
            render: (row) => row.tabSlug,
          },
          {
            key: 'item',
            header: 'Card',
            render: (row) => (
              <div>
                <strong>{row.title}</strong>
                <div className="row-meta">{row.itemKey}</div>
              </div>
            ),
          },
          {
            key: 'source',
            header: 'Source ref',
            render: (row) => row.sourceRef ?? 'Manual',
          },
          {
            key: 'order',
            header: 'Order',
            render: (row) => String(row.orderIndex),
          },
          {
            key: 'visible',
            header: 'Visible',
            render: (row) => (row.isVisible ? <Badge tone="success">Visible</Badge> : <Badge tone="neutral">Hidden</Badge>),
          },
          {
            key: 'config',
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
