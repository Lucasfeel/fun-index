import { FormEvent, useState } from 'react';

import { Panel } from '../components/Panel';
import { invokeAdminFunction } from '../lib/api';

export function ManualRerunPage() {
  const [jobSlug, setJobSlug] = useState('collect-pizzint-pizza-index');
  const [mode, setMode] = useState<'one_shot' | 'backfill' | 'publish_only'>('one_shot');
  const [backfillStartAt, setBackfillStartAt] = useState('');
  const [backfillEndAt, setBackfillEndAt] = useState('');
  const [reason, setReason] = useState('Manual verification after parser adjustment');
  const [result, setResult] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      const response = await invokeAdminFunction('admin-rerun', {
        jobSlug,
        mode,
        idempotencyKey: `manual-${jobSlug}-${Date.now()}`,
        backfillStartAt: backfillStartAt || undefined,
        backfillEndAt: backfillEndAt || undefined,
        reason,
      });
      setResult(JSON.stringify(response, null, 2));
    } catch (error) {
      setResult(error instanceof Error ? error.message : 'Failed to request rerun');
    }
  }

  return (
    <Panel
      title="Manual Rerun"
      subtitle="One-shot reruns, backfills, publish-only execution, and operator override tooling."
    >
      <form className="rerun-form" onSubmit={onSubmit}>
        <label>
          <span>Job slug</span>
          <input value={jobSlug} onChange={(event) => setJobSlug(event.target.value)} />
        </label>
        <label>
          <span>Mode</span>
          <select value={mode} onChange={(event) => setMode(event.target.value as typeof mode)}>
            <option value="one_shot">One-shot rerun</option>
            <option value="backfill">Backfill</option>
            <option value="publish_only">Publish-only</option>
          </select>
        </label>
        <label>
          <span>Backfill start</span>
          <input value={backfillStartAt} onChange={(event) => setBackfillStartAt(event.target.value)} placeholder="2026-04-21T00:00:00Z" />
        </label>
        <label>
          <span>Backfill end</span>
          <input value={backfillEndAt} onChange={(event) => setBackfillEndAt(event.target.value)} placeholder="2026-04-22T00:00:00Z" />
        </label>
        <label className="rerun-form__full">
          <span>Reason</span>
          <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={4} />
        </label>
        <button className="submit-button" type="submit">
          Request rerun
        </button>
      </form>
      {result ? (
        <div className="result-block">
          <strong>Response</strong>
          <pre>{result}</pre>
        </div>
      ) : null}
    </Panel>
  );
}
