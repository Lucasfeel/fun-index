import { useEffect, useState, startTransition } from 'react';

import type { FeedLayoutItemRecord } from '../lib/shared-types';

import { Badge } from '../components/Badge';
import { DataTable } from '../components/DataTable';
import { Panel } from '../components/Panel';
import { fetchFeedLayout } from '../lib/api';
import { formatJson } from '../lib/format';
import { labelForFeedItemKind, labelForFeedTab } from '../lib/labels';

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
      title="피드 구성"
      subtitle="홈, 펜타곤, 심리, SNS 탭의 카드 순서와 문구, 노출 여부를 확인합니다."
      actions={<div className="hint-text">변경 저장은 `admin-config-upsert` 경로를 통해 감사 로그와 함께 기록됩니다.</div>}
    >
      <DataTable
        rows={items}
        columns={[
          {
            key: 'tab',
            header: '탭',
            render: (row) => labelForFeedTab(row.tabSlug),
          },
          {
            key: 'item',
            header: '항목',
            render: (row) => (
              <div>
                <strong>{row.title}</strong>
                <div className="row-meta">{row.itemKey}</div>
              </div>
            ),
          },
          {
            key: 'kind',
            header: '종류',
            render: (row) => labelForFeedItemKind(row.itemKind),
          },
          {
            key: 'source',
            header: '소스',
            render: (row) => row.sourceRef ?? '수동 편집',
          },
          {
            key: 'order',
            header: '순서',
            render: (row) => String(row.orderIndex),
          },
          {
            key: 'visible',
            header: '노출',
            render: (row) => (row.isVisible ? <Badge tone="success">노출</Badge> : <Badge tone="neutral">숨김</Badge>),
          },
          {
            key: 'config',
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
