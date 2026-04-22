import { useEffect, useState, startTransition } from 'react';

import type { ReviewQueueItem } from '../lib/shared-types';

import { Badge } from '../components/Badge';
import { DataTable } from '../components/DataTable';
import { Panel } from '../components/Panel';
import { fetchReviewQueue, invokeAdminFunction } from '../lib/api';
import { formatDateTime, formatJson } from '../lib/format';
import { labelForReviewEntity, labelForReviewStatus } from '../lib/labels';

const actionLabels = {
  approve: '승인',
  reject: '반려',
  publish: '게시',
} as const;

export function ReviewQueuePage() {
  const [items, setItems] = useState<ReviewQueueItem[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void fetchReviewQueue().then((records) => {
      startTransition(() => {
        setItems(records);
      });
    });
  }, []);

  async function runAction(item: ReviewQueueItem, action: 'approve' | 'reject' | 'publish') {
    try {
      const result = await invokeAdminFunction('admin-review-action', {
        reviewQueueId: item.id,
        action,
      });
      setMessage(`${actionLabels[action]} 요청을 접수했습니다. ${JSON.stringify(result)}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '작업 처리에 실패했습니다.');
    }
  }

  return (
    <Panel
      title="검토 대기열"
      subtitle="의심 출력과 SNS 요약을 승인, 반려, 게시할 수 있습니다."
      actions={message ? <div className="notice notice--inline">{message}</div> : null}
    >
      <DataTable
        rows={items}
        columns={[
          {
            key: 'entity',
            header: '대상',
            render: (row) => (
              <div>
                <strong>{labelForReviewEntity(row.entityType)}</strong>
                <div className="row-meta">{row.id}</div>
              </div>
            ),
          },
          {
            key: 'status',
            header: '상태',
            render: (row) => (
              <Badge tone={row.status === 'pending' ? 'warning' : row.status === 'rejected' ? 'danger' : 'success'}>
                {labelForReviewStatus(row.status)}
              </Badge>
            ),
          },
          {
            key: 'reason',
            header: '사유',
            render: (row) => (
              <div>
                <strong>{row.reasonCode}</strong>
                <div className="row-meta">{row.reasonDetail ?? '상세 설명이 없습니다.'}</div>
              </div>
            ),
          },
          {
            key: 'payload',
            header: '내용',
            render: (row) => (
              <details className="details-block">
                <summary>미리 보기</summary>
                <pre>{formatJson(row.editedPayload ?? row.originalPayload)}</pre>
              </details>
            ),
          },
          {
            key: 'reviewed',
            header: '검토 시각',
            render: (row) => formatDateTime(row.reviewedAt),
          },
          {
            key: 'actions',
            header: '작업',
            render: (row) => (
              <div className="action-row">
                <button className="action-button" onClick={() => void runAction(row, 'approve')}>
                  승인
                </button>
                <button className="action-button action-button--ghost" onClick={() => void runAction(row, 'reject')}>
                  반려
                </button>
                <button className="action-button action-button--accent" onClick={() => void runAction(row, 'publish')}>
                  게시
                </button>
              </div>
            ),
          },
        ]}
      />
    </Panel>
  );
}
