import { startTransition, useEffect, useMemo, useState } from 'react';

import type {
  AdminOverridePublishRequest,
  FeedLayoutItemRecord,
  MetricTone,
  SnsAdminItemRecord,
  SnsAdminMetricRecord,
} from '../lib/shared-types';

import { Badge } from '../components/Badge';
import { DataTable } from '../components/DataTable';
import { Panel } from '../components/Panel';
import { fetchSnsControlItems, publishSnsOverride, upsertFeedLayoutItem } from '../lib/api';
import { formatDateTime } from '../lib/format';

interface EditorDraft {
  title: string;
  subtitle: string;
  body: string;
  orderIndex: string;
  isVisible: boolean;
  score: string;
  classification: string;
  change: string;
  summary: string;
  metricsText: string;
  driversText: string;
  categoriesText: string;
  sourceItemsText: string;
  approvalNote: string;
  reason: string;
}

function getBandLabel(score: number) {
  if (score <= 20) {
    return '매우 낮음';
  }

  if (score <= 40) {
    return '낮음';
  }

  if (score <= 60) {
    return '보통';
  }

  if (score <= 80) {
    return '높음';
  }

  return '매우 높음';
}

function getTone(score: number) {
  if (score <= 40) {
    return 'danger' as const;
  }

  if (score <= 60) {
    return 'warning' as const;
  }

  return 'success' as const;
}

function metricsToText(metrics: SnsAdminMetricRecord[]) {
  return metrics.map((metric) => [metric.label, metric.value, metric.tone ?? 'neutral'].join('|')).join('\n');
}

function listToLines(items: string[]) {
  return items.join('\n');
}

function linesToList(value: string) {
  return value
    .split(/\r?\n/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function csvToList(value: string) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseMetricTone(value: string): MetricTone | null {
  return value === 'cool' || value === 'neutral' || value === 'warm' ? value : null;
}

function textToMetrics(value: string): SnsAdminMetricRecord[] {
  return value
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [label = '', metricValue = '', tone = 'neutral'] = line.split('|').map((token) => token.trim());
      if (!label || !metricValue) {
        return null;
      }

      return {
        label,
        value: metricValue,
        tone: parseMetricTone(tone),
      } satisfies SnsAdminMetricRecord;
    })
    .filter((metric): metric is SnsAdminMetricRecord => metric !== null);
}

function createDraft(item: SnsAdminItemRecord): EditorDraft {
  return {
    title: item.title,
    subtitle: item.subtitle ?? '',
    body: item.body ?? '',
    orderIndex: String(item.orderIndex),
    isVisible: item.isVisible,
    score: String(item.currentContent.score),
    classification: item.currentContent.classification,
    change: String(item.currentContent.change),
    summary: item.currentContent.summary,
    metricsText: metricsToText(item.currentContent.metrics),
    driversText: listToLines(item.currentContent.drivers),
    categoriesText: item.currentContent.categories.join(', '),
    sourceItemsText: listToLines(item.currentContent.sourceItems),
    approvalNote: item.currentContent.approvalNote ?? '',
    reason: `SNS 수동 게시: ${item.title}`,
  };
}

function toLayoutRecord(item: SnsAdminItemRecord, draft: EditorDraft): FeedLayoutItemRecord {
  return {
    id: item.layoutId ?? `draft-${item.itemKey}`,
    tabSlug: 'sns_feed',
    itemKey: item.itemKey,
    itemKind: item.itemKind,
    sourceRef: item.sourceRef,
    title: draft.title.trim() || item.title,
    subtitle: draft.subtitle.trim() || null,
    body: draft.body.trim() || null,
    orderIndex: Number(draft.orderIndex) || item.orderIndex,
    isVisible: draft.isVisible,
    config: item.config,
  };
}

function toOverrideRequest(item: SnsAdminItemRecord, draft: EditorDraft): AdminOverridePublishRequest {
  const sourceItems = linesToList(draft.sourceItemsText);
  const payload = {
    title: draft.title.trim() || item.title,
    subtitle: draft.subtitle.trim() || null,
    summary: draft.summary.trim(),
    body: draft.summary.trim(),
    score: Number(draft.score) || 0,
    classification: draft.classification.trim() || '대기',
    change: Number(draft.change) || 0,
    metrics: textToMetrics(draft.metricsText),
    drivers: linesToList(draft.driversText),
    categories: csvToList(draft.categoriesText),
    sourceItems,
    sourceCount: sourceItems.length,
    approvalNote: draft.approvalNote.trim() || null,
  };

  return {
    tabSlug: 'sns_feed',
    itemKey: item.itemKey,
    payload,
    reason: draft.reason.trim() || `SNS 수동 게시: ${item.title}`,
  };
}

export function SnsControlPage() {
  const [items, setItems] = useState<SnsAdminItemRecord[]>([]);
  const [selectedItemKey, setSelectedItemKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<EditorDraft | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);

  useEffect(() => {
    void fetchSnsControlItems()
      .then((records) => {
        startTransition(() => {
          setItems(records);
          setSelectedItemKey((current) => current ?? records[0]?.itemKey ?? null);
        });
      })
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : 'SNS 관리 데이터를 불러오지 못했습니다.');
      });
  }, []);

  const selectedItem = useMemo(
    () => items.find((item) => item.itemKey === selectedItemKey) ?? null,
    [items, selectedItemKey],
  );

  useEffect(() => {
    if (!selectedItem) {
      return;
    }

    setDraft(createDraft(selectedItem));
  }, [selectedItem]);

  async function handleSaveLayout() {
    if (!selectedItem || !draft) {
      return;
    }

    setIsSaving(true);
    setNotice(null);
    setError(null);

    try {
      const saved = await upsertFeedLayoutItem(toLayoutRecord(selectedItem, draft));
      startTransition(() => {
        setItems((current) =>
          current
            .map((item) =>
              item.itemKey === saved.itemKey
                ? {
                    ...item,
                    layoutId: saved.id,
                    sourceRef: saved.sourceRef,
                    title: saved.title,
                    subtitle: saved.subtitle,
                    body: saved.body,
                    orderIndex: saved.orderIndex,
                    isVisible: saved.isVisible,
                    config: saved.config,
                  }
                : item,
            )
            .sort((left, right) => left.orderIndex - right.orderIndex),
        );
        setNotice('SNS 슬롯 구성을 저장했습니다.');
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'SNS 슬롯 저장에 실패했습니다.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handlePublishOverride() {
    if (!selectedItem || !draft) {
      return;
    }

    setIsPublishing(true);
    setNotice(null);
    setError(null);

    try {
      await publishSnsOverride(toOverrideRequest(selectedItem, draft));
      const nextDraft = createDraft({
        ...selectedItem,
        currentContent: {
          ...selectedItem.currentContent,
          title: draft.title.trim() || selectedItem.title,
          subtitle: draft.subtitle.trim() || null,
          summary: draft.summary.trim(),
          score: Number(draft.score) || 0,
          classification: draft.classification.trim() || '대기',
          change: Number(draft.change) || 0,
          metrics: textToMetrics(draft.metricsText),
          drivers: linesToList(draft.driversText),
          categories: csvToList(draft.categoriesText),
          sourceItems: linesToList(draft.sourceItemsText),
          approvalNote: draft.approvalNote.trim() || null,
        },
        publishedAt: new Date().toISOString(),
        hasPublishedState: true,
      });

      startTransition(() => {
        setItems((current) =>
          current.map((item) =>
            item.itemKey === selectedItem.itemKey
              ? {
                  ...item,
                  title: draft.title.trim() || item.title,
                  subtitle: draft.subtitle.trim() || null,
                  body: draft.body.trim() || null,
                  currentContent: {
                    ...item.currentContent,
                    title: nextDraft.title,
                    subtitle: nextDraft.subtitle || null,
                    summary: nextDraft.summary,
                    score: Number(nextDraft.score),
                    classification: nextDraft.classification,
                    change: Number(nextDraft.change),
                    metrics: textToMetrics(nextDraft.metricsText),
                    drivers: linesToList(nextDraft.driversText),
                    categories: csvToList(nextDraft.categoriesText),
                    sourceItems: linesToList(nextDraft.sourceItemsText),
                    approvalNote: nextDraft.approvalNote.trim() || null,
                  },
                  publishedAt: new Date().toISOString(),
                  hasPublishedState: true,
                }
              : item,
          ),
        );
        setDraft(nextDraft);
        setNotice('SNS 수동 게시를 완료했습니다.');
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'SNS 수동 게시에 실패했습니다.');
    } finally {
      setIsPublishing(false);
    }
  }

  return (
    <>
      {notice ? <div className="notice notice--inline">{notice}</div> : null}
      {error ? <div className="notice notice--danger">{error}</div> : null}

      <Panel
        title="SNS 관리"
        subtitle="트럼프, 일론, 커뮤니티 피드 슬롯 순서와 문구, 노출 여부를 직접 조정합니다."
      >
        <DataTable
          rows={items}
          emptyMessage="설정된 SNS 슬롯이 없습니다."
          columns={[
            {
              key: 'feed',
              header: '피드',
              render: (row) => (
                <div>
                  <strong>{row.title}</strong>
                  <div className="row-meta">{row.itemKey}</div>
                </div>
              ),
            },
            {
              key: 'score',
              header: '현재 상태',
              render: (row) => (
                <div className="table-stack">
                  <Badge tone={getTone(row.currentContent.score)}>{`${row.currentContent.score} / ${getBandLabel(row.currentContent.score)}`}</Badge>
                  <div className="row-meta">{row.currentContent.classification}</div>
                </div>
              ),
            },
            {
              key: 'published',
              header: '최근 게시',
              render: (row) => (row.publishedAt ? formatDateTime(row.publishedAt) : '미게시'),
            },
            {
              key: 'visible',
              header: '노출',
              render: (row) =>
                row.isVisible ? <Badge tone="success">노출</Badge> : <Badge tone="neutral">숨김</Badge>,
            },
            {
              key: 'action',
              header: '관리',
              render: (row) => (
                <button className="action-button action-button--ghost" onClick={() => setSelectedItemKey(row.itemKey)}>
                  편집
                </button>
              ),
            },
          ]}
        />
      </Panel>

      {selectedItem && draft ? (
        <div className="control-grid">
          <Panel
            title="슬롯 설정"
            subtitle="피드 카드 순서, 노출 여부, 기본 설명을 조정합니다."
            actions={<div className="hint-text">저장은 `admin-config-upsert` 경로로 기록됩니다.</div>}
          >
            <div className="control-form">
              <label>
                <span>제목</span>
                <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
              </label>
              <label>
                <span>부제</span>
                <input value={draft.subtitle} onChange={(event) => setDraft({ ...draft, subtitle: event.target.value })} />
              </label>
              <label>
                <span>순서</span>
                <input value={draft.orderIndex} onChange={(event) => setDraft({ ...draft, orderIndex: event.target.value })} />
              </label>
              <label className="control-form__toggle">
                <span>피드 노출</span>
                <input
                  type="checkbox"
                  checked={draft.isVisible}
                  onChange={(event) => setDraft({ ...draft, isVisible: event.target.checked })}
                />
              </label>
              <label className="control-form__full">
                <span>기본 설명</span>
                <textarea value={draft.body} onChange={(event) => setDraft({ ...draft, body: event.target.value })} rows={4} />
              </label>
            </div>
            <div className="action-row">
              <button className="submit-button" type="button" onClick={() => void handleSaveLayout()} disabled={isSaving}>
                {isSaving ? '저장 중…' : '슬롯 저장'}
              </button>
            </div>
          </Panel>

          <Panel
            title="수동 게시"
            subtitle="선택한 SNS 카드 내용을 직접 편집해 현재 피드 상태에 반영합니다."
            actions={<div className="hint-text">게시 시 `admin-override-publish` 경로로 감사 로그가 남습니다.</div>}
          >
            <div className="control-form">
              <label>
                <span>점수</span>
                <input value={draft.score} onChange={(event) => setDraft({ ...draft, score: event.target.value })} />
              </label>
              <label>
                <span>상태 문구</span>
                <input
                  value={draft.classification}
                  onChange={(event) => setDraft({ ...draft, classification: event.target.value })}
                />
              </label>
              <label>
                <span>변동</span>
                <input value={draft.change} onChange={(event) => setDraft({ ...draft, change: event.target.value })} />
              </label>
              <label>
                <span>카테고리</span>
                <input
                  value={draft.categoriesText}
                  onChange={(event) => setDraft({ ...draft, categoriesText: event.target.value })}
                  placeholder="트럼프, 미국정치"
                />
              </label>
              <label className="control-form__full">
                <span>요약</span>
                <textarea value={draft.summary} onChange={(event) => setDraft({ ...draft, summary: event.target.value })} rows={4} />
              </label>
              <label className="control-form__full">
                <span>지표 형식 (`항목|값|톤`)</span>
                <textarea
                  value={draft.metricsText}
                  onChange={(event) => setDraft({ ...draft, metricsText: event.target.value })}
                  rows={4}
                  placeholder="언급 증가율|+18%|warm"
                />
              </label>
              <label className="control-form__full">
                <span>핵심 요인 (줄바꿈 구분)</span>
                <textarea
                  value={draft.driversText}
                  onChange={(event) => setDraft({ ...draft, driversText: event.target.value })}
                  rows={4}
                />
              </label>
              <label className="control-form__full">
                <span>출처 목록 (줄바꿈 구분)</span>
                <textarea
                  value={draft.sourceItemsText}
                  onChange={(event) => setDraft({ ...draft, sourceItemsText: event.target.value })}
                  rows={4}
                />
              </label>
              <label className="control-form__full">
                <span>승인 메모</span>
                <textarea
                  value={draft.approvalNote}
                  onChange={(event) => setDraft({ ...draft, approvalNote: event.target.value })}
                  rows={3}
                />
              </label>
              <label className="control-form__full">
                <span>게시 사유</span>
                <textarea value={draft.reason} onChange={(event) => setDraft({ ...draft, reason: event.target.value })} rows={3} />
              </label>
            </div>
            <div className="action-row">
              <button className="submit-button" type="button" onClick={() => void handlePublishOverride()} disabled={isPublishing}>
                {isPublishing ? '게시 중…' : '수동 게시'}
              </button>
            </div>
          </Panel>
        </div>
      ) : null}

      {selectedItem && draft ? (
        <Panel
          title="미리보기"
          subtitle="현재 선택한 SNS 카드가 사용자 피드에 반영되기 전 모습을 확인합니다."
        >
          <div className="preview-grid">
            <article className="preview-card">
              <div className="preview-card__topline">
                <Badge tone={draft.isVisible ? 'success' : 'neutral'}>{draft.isVisible ? '노출' : '숨김'}</Badge>
                <span className="row-meta">{selectedItem.publishedAt ? formatDateTime(selectedItem.publishedAt) : '아직 게시되지 않음'}</span>
              </div>
              <h3>{draft.title}</h3>
              <p>{draft.summary || draft.body || '아직 요약이 없습니다.'}</p>
              <div className="preview-card__score">
                <strong>{Number(draft.score) || 0}</strong>
                <span>{getBandLabel(Number(draft.score) || 0)}</span>
              </div>
              <div className="preview-card__classification">{draft.classification || '대기'}</div>
              <div className="preview-chip-row">
                {csvToList(draft.categoriesText).map((category) => (
                  <span key={category} className="preview-chip">
                    {category}
                  </span>
                ))}
              </div>
            </article>
            <article className="preview-card preview-card--secondary">
              <strong>공통 서비스 반영 경로</strong>
              <ul className="preview-list">
                <li>슬롯 설정 저장은 `admin-config-upsert` 를 사용합니다.</li>
                <li>수동 게시 반영은 `admin-override-publish` 를 사용합니다.</li>
                <li>미니앱과 관리자 미리보기는 같은 SNS 현재 상태를 읽습니다.</li>
              </ul>
            </article>
          </div>
        </Panel>
      ) : null}
    </>
  );
}
