import { useEffect, useState } from 'react';

import {
  canEditSignals,
  createSignalEditorDraft,
  hasVerifiedAdminPassword,
  publishSignalEdit,
  verifyEditorPassword,
  type SignalEditorDraft,
} from '../lib/editor';
import type { SignalItem } from '../lib/types';

interface SignalEditorSheetProps {
  item: SignalItem;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}

function isSocialSignal(item: SignalItem) {
  return item.domain === 'social';
}

function isPentagonSignal(item: SignalItem) {
  return item.domain === 'pentagon';
}

export function SignalEditorSheet({ item, onClose, onSaved }: SignalEditorSheetProps) {
  const [draft, setDraft] = useState<SignalEditorDraft>(() => createSignalEditorDraft(item));
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [editorUnlocked, setEditorUnlocked] = useState(hasVerifiedAdminPassword());
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    setDraft(createSignalEditorDraft(item));
    setPassword('');
    setMessage(null);
    setEditorUnlocked(hasVerifiedAdminPassword());
  }, [item]);

  if (!canEditSignals()) {
    return null;
  }

  function updateDraft<K extends keyof SignalEditorDraft>(key: K, value: SignalEditorDraft[K]) {
    setDraft((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function updateMetric(index: number, field: 'label' | 'value', value: string) {
    setDraft((current) => ({
      ...current,
      metrics: current.metrics.map((metric, metricIndex) =>
        metricIndex === index
          ? {
              ...metric,
              [field]: value,
            }
          : metric,
      ),
    }));
  }

  async function handleVerify() {
    setMessage(null);
    setVerifying(true);

    try {
      await verifyEditorPassword(password);
      setEditorUnlocked(true);
      setPassword('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '관리자 비밀번호를 확인하지 못했습니다.');
    } finally {
      setVerifying(false);
    }
  }

  async function handleSave() {
    setMessage(null);
    setSaving(true);

    try {
      await publishSignalEdit(item, draft);
      await onSaved();
      onClose();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '카드 편집 내용을 저장하지 못했습니다.');
      setEditorUnlocked(hasVerifiedAdminPassword());
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="editor-sheet" role="dialog" aria-modal="true" aria-label="카드 편집">
      <button type="button" className="editor-sheet__backdrop" onClick={onClose} aria-label="닫기" />

      <div className="editor-sheet__panel">
        <div className="editor-sheet__header">
          <div>
            <strong className="editor-sheet__eyebrow">미니앱에서 바로 편집</strong>
            <h2 className="editor-sheet__title">{item.title}</h2>
          </div>
          <button type="button" className="button button--ghost" onClick={onClose}>
            닫기
          </button>
        </div>

        {!editorUnlocked ? (
          <div className="editor-sheet__auth">
            <label className="editor-sheet__field">
              <span>관리자 비밀번호</span>
              <input
                type="password"
                value={password}
                placeholder="비밀번호 입력"
                onChange={(event) => setPassword(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    void handleVerify();
                  }
                }}
              />
            </label>

            <div className="editor-sheet__actions">
              <button type="button" className="button" onClick={() => void handleVerify()} disabled={verifying}>
                {verifying ? '확인 중...' : '확인'}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="editor-sheet__body">
              <div className="editor-sheet__grid">
                <label className="editor-sheet__field">
                  <span>제목</span>
                  <input value={draft.title} onChange={(event) => updateDraft('title', event.target.value)} />
                </label>

                <label className="editor-sheet__field">
                  <span>부제</span>
                  <input value={draft.subtitle} onChange={(event) => updateDraft('subtitle', event.target.value)} />
                </label>
              </div>

              <div className="editor-sheet__grid">
                <label className="editor-sheet__field">
                  <span>상태 문구</span>
                  <input
                    value={draft.classification}
                    onChange={(event) => updateDraft('classification', event.target.value)}
                  />
                </label>

                <label className="editor-sheet__field">
                  <span>점수</span>
                  <input
                    inputMode="numeric"
                    value={draft.score}
                    onChange={(event) => updateDraft('score', event.target.value)}
                  />
                </label>

                <label className="editor-sheet__field">
                  <span>변화량</span>
                  <input
                    inputMode="decimal"
                    value={draft.change}
                    onChange={(event) => updateDraft('change', event.target.value)}
                  />
                </label>
              </div>

              <label className="editor-sheet__field">
                <span>요약</span>
                <textarea
                  rows={4}
                  value={draft.summary}
                  onChange={(event) => updateDraft('summary', event.target.value)}
                />
              </label>

              <div className="editor-sheet__metrics">
                <strong>지표 요약</strong>
                {draft.metrics.map((metric, index) => (
                  <div key={`metric-${index}`} className="editor-sheet__metric-row">
                    <input
                      value={metric.label}
                      placeholder="라벨"
                      onChange={(event) => updateMetric(index, 'label', event.target.value)}
                    />
                    <input
                      value={metric.value}
                      placeholder="값"
                      onChange={(event) => updateMetric(index, 'value', event.target.value)}
                    />
                  </div>
                ))}
              </div>

              <label className="editor-sheet__field">
                <span>노출 이유</span>
                <textarea
                  rows={4}
                  value={draft.driversText}
                  onChange={(event) => updateDraft('driversText', event.target.value)}
                />
              </label>

              {isPentagonSignal(item) ? (
                <div className="editor-sheet__grid">
                  <label className="editor-sheet__field">
                    <span>커버리지</span>
                    <input
                      value={draft.coverageLabel}
                      onChange={(event) => updateDraft('coverageLabel', event.target.value)}
                    />
                  </label>

                  <label className="editor-sheet__field">
                    <span>표본 수</span>
                    <input
                      inputMode="numeric"
                      value={draft.sampleSize}
                      onChange={(event) => updateDraft('sampleSize', event.target.value)}
                    />
                  </label>
                </div>
              ) : null}

              {isSocialSignal(item) ? (
                <>
                  <div className="editor-sheet__grid">
                    <label className="editor-sheet__field">
                      <span>카테고리</span>
                      <textarea
                        rows={3}
                        value={draft.categoriesText}
                        onChange={(event) => updateDraft('categoriesText', event.target.value)}
                      />
                    </label>

                    <label className="editor-sheet__field">
                      <span>출처</span>
                      <textarea
                        rows={3}
                        value={draft.sourcesText}
                        onChange={(event) => updateDraft('sourcesText', event.target.value)}
                      />
                    </label>
                  </div>

                  <label className="editor-sheet__field">
                    <span>검토 안내</span>
                    <textarea
                      rows={3}
                      value={draft.approvalNote}
                      onChange={(event) => updateDraft('approvalNote', event.target.value)}
                    />
                  </label>
                </>
              ) : null}
            </div>

            <div className="editor-sheet__actions">
              <button type="button" className="button button--ghost" onClick={onClose}>
                취소
              </button>
              <button type="button" className="button" onClick={() => void handleSave()} disabled={saving}>
                {saving ? '저장 중...' : '저장'}
              </button>
            </div>
          </>
        )}

        {message ? <div className="editor-sheet__message">{message}</div> : null}
      </div>
    </div>
  );
}
