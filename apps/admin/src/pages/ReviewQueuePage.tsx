import { useEffect, useState, startTransition } from 'react';

import type { ReviewQueueItem } from '@indicator/shared';

import { Badge } from '../components/Badge';
import { DataTable } from '../components/DataTable';
import { Panel } from '../components/Panel';
import { fetchReviewQueue, invokeAdminFunction } from '../lib/api';
import { formatDateTime, formatJson } from '../lib/format';

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
      setMessage(`${action} queued: ${JSON.stringify(result)}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Action failed');
    }
  }

  return (
    <Panel
      title="Review Queue"
      subtitle="Approve, reject, edit, and publish suspicious outputs and SNS rollups."
      actions={message ? <div className="notice notice--inline">{message}</div> : null}
    >
      <DataTable
        rows={items}
        columns={[
          {
            key: 'entity',
            header: 'Entity',
            render: (row) => (
              <div>
                <strong>{row.entityType}</strong>
                <div className="row-meta">{row.id}</div>
              </div>
            ),
          },
          {
            key: 'status',
            header: 'Status',
            render: (row) => (
              <Badge tone={row.status === 'pending' ? 'warning' : row.status === 'rejected' ? 'danger' : 'success'}>
                {row.status}
              </Badge>
            ),
          },
          {
            key: 'reason',
            header: 'Reason',
            render: (row) => (
              <div>
                <strong>{row.reasonCode}</strong>
                <div className="row-meta">{row.reasonDetail ?? 'No detail'}</div>
              </div>
            ),
          },
          {
            key: 'payload',
            header: 'Payload',
            render: (row) => (
              <details className="details-block">
                <summary>Preview</summary>
                <pre>{formatJson(row.editedPayload ?? row.originalPayload)}</pre>
              </details>
            ),
          },
          {
            key: 'reviewed',
            header: 'Reviewed',
            render: (row) => formatDateTime(row.reviewedAt),
          },
          {
            key: 'actions',
            header: 'Actions',
            render: (row) => (
              <div className="action-row">
                <button className="action-button" onClick={() => void runAction(row, 'approve')}>
                  Approve
                </button>
                <button className="action-button action-button--ghost" onClick={() => void runAction(row, 'reject')}>
                  Reject
                </button>
                <button className="action-button action-button--accent" onClick={() => void runAction(row, 'publish')}>
                  Publish
                </button>
              </div>
            ),
          },
        ]}
      />
    </Panel>
  );
}
