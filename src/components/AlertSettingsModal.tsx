import { useMemo, useState, type CSSProperties } from 'react';
import { X } from 'lucide-react';
import clsx from 'clsx';

import { alertStageBands, getAlertStageBand, scoreToAlertStage, type AlertStage } from '../lib/alertStages';
import type { AlertSubscription } from '../lib/alerts';

interface AlertSettingsModalProps {
  title: string;
  score: number;
  subscription?: AlertSubscription | undefined;
  isWaiting: boolean;
  isSaving: boolean;
  error?: Error | null;
  onClose: () => void;
  onSave: (stage: AlertStage) => Promise<unknown>;
}

export function AlertSettingsModal({
  title,
  score,
  subscription,
  isWaiting,
  isSaving,
  error,
  onClose,
  onSave,
}: AlertSettingsModalProps) {
  const currentStage = scoreToAlertStage(score);
  const initialStage = subscription?.thresholdStage ?? currentStage;
  const [selectedStage, setSelectedStage] = useState<AlertStage>(initialStage);
  const selectedBand = useMemo(() => getAlertStageBand(selectedStage), [selectedStage]);
  const currentBand = getAlertStageBand(currentStage);

  async function handleSave() {
    if (isWaiting || isSaving) {
      return;
    }

    try {
      await onSave(selectedStage);
      onClose();
    } catch {
      // The mutation error is rendered from React Query state.
    }
  }

  return (
    <div className="alert-sheet" role="dialog" aria-modal="true" aria-label={`${title} 알림 설정`}>
      <button type="button" className="alert-sheet__backdrop" onClick={onClose} aria-label="닫기" />

      <div className="alert-sheet__panel">
        <div className="alert-sheet__header">
          <div>
            <strong className="alert-sheet__eyebrow">단계 알림</strong>
            <h2 className="alert-sheet__title">{title}</h2>
          </div>
          <button type="button" className="alert-sheet__close" onClick={onClose} aria-label="닫기">
            <X aria-hidden="true" />
          </button>
        </div>

        <div className="alert-sheet__body">
          <div className="alert-sheet__summary">
            <span>현재 단계</span>
            <strong style={{ color: currentBand.color }}>{currentBand.label}</strong>
          </div>

          <div className="alert-sheet__copy">
            <strong>{selectedBand.label} 이상으로 올라오면 알려드릴게요.</strong>
            <span>알림은 같은 공개 상태에서 한 번만 보내집니다.</span>
          </div>

          <div className="alert-stage-picker" role="radiogroup" aria-label="알림 단계 선택">
            {alertStageBands.map((stage) => {
              const isSelected = stage.stage === selectedStage;
              return (
                <button
                  key={stage.stage}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  className={clsx('alert-stage-card', isSelected && 'alert-stage-card--selected')}
                  style={{
                    '--alert-stage-color': stage.color,
                  } as CSSProperties}
                  onClick={() => setSelectedStage(stage.stage)}
                >
                  <span>{stage.stage}단계</span>
                  <strong>{stage.label}</strong>
                  <small>
                    {stage.min}~{stage.max}
                  </small>
                </button>
              );
            })}
          </div>

          {isWaiting ? (
            <p className="alert-sheet__message alert-sheet__message--warning">
              아직 공개된 데이터가 없어 알림을 설정할 수 없습니다.
            </p>
          ) : null}

          {error ? (
            <p className="alert-sheet__message alert-sheet__message--error">
              {error.message || '알림 설정을 저장하지 못했습니다.'}
            </p>
          ) : null}
        </div>

        <div className="alert-sheet__actions">
          <button
            type="button"
            className="button alert-sheet__submit"
            onClick={() => void handleSave()}
            disabled={isWaiting || isSaving}
          >
            {isSaving ? '설정 중...' : '알림설정 하기'}
          </button>
        </div>
      </div>
    </div>
  );
}
