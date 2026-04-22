import { FormEvent, useState } from 'react';

import { Panel } from '../components/Panel';
import { invokeAdminFunction } from '../lib/api';

export function ManualRerunPage() {
  const [jobSlug, setJobSlug] = useState('collect-pizzint-pizza-index');
  const [mode, setMode] = useState<'one_shot' | 'backfill' | 'publish_only'>('one_shot');
  const [backfillStartAt, setBackfillStartAt] = useState('');
  const [backfillEndAt, setBackfillEndAt] = useState('');
  const [reason, setReason] = useState('파서 조정 이후 수동 점검을 위해 재실행합니다.');
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
      setResult(error instanceof Error ? error.message : '재실행 요청에 실패했습니다.');
    }
  }

  return (
    <Panel
      title="수동 실행"
      subtitle="1회 재실행, 백필, 게시만 실행을 운영에서 직접 요청할 수 있습니다."
    >
      <form className="rerun-form" onSubmit={onSubmit}>
        <label>
          <span>작업 슬러그</span>
          <input value={jobSlug} onChange={(event) => setJobSlug(event.target.value)} />
        </label>
        <label>
          <span>실행 방식</span>
          <select value={mode} onChange={(event) => setMode(event.target.value as typeof mode)}>
            <option value="one_shot">1회 재실행</option>
            <option value="backfill">백필</option>
            <option value="publish_only">게시만</option>
          </select>
        </label>
        <label>
          <span>백필 시작</span>
          <input value={backfillStartAt} onChange={(event) => setBackfillStartAt(event.target.value)} placeholder="2026-04-21T00:00:00Z" />
        </label>
        <label>
          <span>백필 종료</span>
          <input value={backfillEndAt} onChange={(event) => setBackfillEndAt(event.target.value)} placeholder="2026-04-22T00:00:00Z" />
        </label>
        <label className="rerun-form__full">
          <span>사유</span>
          <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={4} />
        </label>
        <button className="submit-button" type="submit">
          실행 요청
        </button>
      </form>
      {result ? (
        <div className="result-block">
          <strong>응답</strong>
          <pre>{result}</pre>
        </div>
      ) : null}
    </Panel>
  );
}
