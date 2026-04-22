import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';

import { createFeedEditorDraft, publishFeedEdit, type FeedEditorDraft } from '../lib/feedEditor';
import { fetchFeedSnapshot } from '../lib/feedData';
import type { AdminSignalItem, FeedSnapshot, FeedTab } from '../lib/feedTypes';

interface MiniFeedAdminPageProps {
  tab: FeedTab;
}

type PentagonFilter = 'all' | 'pizza' | 'gay-bar';
type PsychologyFilter = 'all' | 'us-stock-fear-greed' | 'crypto-fear-greed' | 'kr-stock-fear-greed';
type SocialFilter = 'all' | 'trump' | 'elon' | 'kr-stock-community' | 'global-stock-community';

interface GaugeBand {
  color: string;
  label: string;
}

const gaugeBands: GaugeBand[] = [
  { color: '#D73C38', label: '매우 낮음' },
  { color: '#EC891C', label: '낮음' },
  { color: '#FDD52C', label: '보통' },
  { color: '#A1CE2D', label: '높음' },
  { color: '#56B678', label: '매우 높음' },
];

function keyOf(item: AdminSignalItem) {
  return `${item.domain}:${item.slug}`;
}

function clampScore(score: number) {
  return Math.min(100, Math.max(0, score));
}

function isWaitingSignal(item: AdminSignalItem) {
  const normalized = item.classification.replace(/\s+/g, '');
  return normalized === '대기' || normalized === '대기중';
}

function getGaugeBand(item: AdminSignalItem) {
  if (isWaitingSignal(item)) {
    return {
      color: '#8B95A1',
      label: '대기',
    } satisfies GaugeBand;
  }

  const score = clampScore(item.score);
  const index = score === 100 ? gaugeBands.length - 1 : Math.floor(score / 20);
  return gaugeBands[Math.min(index, gaugeBands.length - 1)]!;
}

function polarToCartesian(centerX: number, centerY: number, radius: number, angleInDegrees: number) {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;

  return {
    x: centerX + radius * Math.cos(angleInRadians),
    y: centerY + radius * Math.sin(angleInRadians),
  };
}

function describeArc(centerX: number, centerY: number, radius: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(centerX, centerY, radius, endAngle);
  const end = polarToCartesian(centerX, centerY, radius, startAngle);

  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 0 0 ${end.x} ${end.y}`;
}

function describeHalfDome(centerX: number, centerY: number, radius: number) {
  return `M ${centerX - radius} ${centerY} A ${radius} ${radius} 0 0 1 ${centerX + radius} ${centerY} Z`;
}

function SignalGauge({ item }: { item: AdminSignalItem }) {
  const score = clampScore(item.score);
  const band = getGaugeBand(item);
  const cx = 160;
  const cy = 128;
  const radius = 110;
  const domeRadius = 54;
  const needleAngle = -90 + score * 1.8;
  const needleEnd = polarToCartesian(cx, cy, 90, needleAngle);
  const segmentGap = 4;
  const segmentSweep = (180 - segmentGap * (gaugeBands.length - 1)) / gaugeBands.length;

  return (
    <div className="signal-gauge" aria-hidden="true">
      <svg viewBox="0 0 320 182" className="signal-gauge__svg">
        {gaugeBands.map((segment, index) => {
          const startAngle = -90 + index * (segmentSweep + segmentGap);
          const endAngle = startAngle + segmentSweep;
          const isActive = segment.color === band.color;

          return (
            <path
              key={segment.color}
              d={describeArc(cx, cy, radius, startAngle, endAngle)}
              fill="none"
              stroke={segment.color}
              strokeWidth="30"
              strokeLinecap="butt"
              strokeOpacity={isActive ? 0.52 : 0.2}
            />
          );
        })}

        <path
          d={describeHalfDome(cx, cy, domeRadius)}
          fill={band.color}
          fillOpacity="0.16"
          stroke={band.color}
          strokeOpacity="0.42"
          strokeWidth="2"
        />

        <line
          x1={cx}
          y1={cy}
          x2={needleEnd.x}
          y2={needleEnd.y}
          stroke="#191F28"
          strokeWidth="4.5"
          strokeLinecap="round"
        />
        <circle cx={cx} cy={cy} r="8" fill="#FFFFFF" stroke="#191F28" strokeWidth="2" />
        <text
          x={cx}
          y={cy - domeRadius / 2 + 2}
          textAnchor="middle"
          dominantBaseline="middle"
          className="signal-gauge__score"
        >
          {Math.round(score)}
        </text>
      </svg>
    </div>
  );
}

function getStatement(item: AdminSignalItem) {
  if (isWaitingSignal(item)) {
    return '첫 공개 데이터 대기 중';
  }

  return item.classification;
}

function getSectionTitle(tab: FeedTab) {
  if (tab === 'pentagon') {
    return '펜타곤';
  }

  if (tab === 'psychology') {
    return '심리';
  }

  if (tab === 'sns') {
    return 'SNS';
  }

  return '';
}

function findItem(snapshot: FeedSnapshot | null, selectedKey: string | null) {
  if (!snapshot || !selectedKey) {
    return null;
  }

  const allItems = [...snapshot.pentagon, ...snapshot.psychology, ...snapshot.social];
  return allItems.find((item) => keyOf(item) === selectedKey) ?? null;
}

function FilterChips({
  activeValue,
  options,
  onChange,
}: {
  activeValue: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <div className="segmented-chips">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={activeValue === option.value ? 'segmented-chips__item segmented-chips__item--active' : 'segmented-chips__item'}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function AdminFeedCard({
  item,
  selected,
  onEdit,
}: {
  item: AdminSignalItem;
  selected: boolean;
  onEdit: () => void;
}) {
  const band = getGaugeBand(item);

  return (
    <article className={selected ? 'feed-card feed-card--selected' : 'feed-card'}>
      <div className="feed-card__header">
        <h2 className="feed-card__title">{item.title}</h2>
        <button
          type="button"
          className={selected ? 'button button--ghost button--small feed-card__edit feed-card__edit--active' : 'button button--ghost button--small feed-card__edit'}
          onClick={onEdit}
        >
          {selected ? '편집 중' : '편집'}
        </button>
      </div>

      <div className="feed-card__link">
        <div className="feed-card__gauge-row">
          <SignalGauge item={item} />

          <div className="feed-card__insight">
            <strong className="feed-card__band" style={{ color: band.color }}>
              {band.label}
            </strong>
            <p className="feed-card__statement">{getStatement(item)}</p>
          </div>
        </div>
      </div>
    </article>
  );
}

function EmptyEditor() {
  return (
    <aside className="admin-editor">
      <div className="admin-editor__placeholder">
        <strong>편집할 피드를 선택해 주세요.</strong>
        <p>카드 오른쪽의 편집 버튼을 누르면 이 영역에서 바로 수정할 수 있습니다.</p>
      </div>
    </aside>
  );
}

export function MiniFeedAdminPage({ tab }: MiniFeedAdminPageProps) {
  const [snapshot, setSnapshot] = useState<FeedSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<FeedEditorDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pentagonFilter, setPentagonFilter] = useState<PentagonFilter>('all');
  const [psychologyFilter, setPsychologyFilter] = useState<PsychologyFilter>('all');
  const [socialFilter, setSocialFilter] = useState<SocialFilter>('all');

  const selectedItem = findItem(snapshot, selectedKey);

  useEffect(() => {
    void loadSnapshot(selectedKey);
  }, []);

  useEffect(() => {
    if (!snapshot || !selectedItem) {
      return;
    }

    const currentItems = getVisibleItems();
    const currentKeys = new Set(currentItems.map((item) => keyOf(item)));

    if (!currentKeys.has(keyOf(selectedItem))) {
      setSelectedKey(null);
      setDraft(null);
      setMessage(null);
    }
  }, [tab, pentagonFilter, psychologyFilter, socialFilter, snapshot, selectedItem]);

  async function loadSnapshot(nextSelectedKey: string | null) {
    setLoading(true);
    setError(null);

    try {
      const nextSnapshot = await fetchFeedSnapshot();
      setSnapshot(nextSnapshot);

      if (nextSelectedKey) {
        const nextItem = findItem(nextSnapshot, nextSelectedKey);
        setSelectedKey(nextItem ? nextSelectedKey : null);
        setDraft(nextItem ? createFeedEditorDraft(nextItem) : null);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '피드를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }

  function getVisibleItems() {
    if (!snapshot) {
      return [] as AdminSignalItem[];
    }

    if (tab === 'home') {
      return snapshot.home;
    }

    if (tab === 'pentagon') {
      return pentagonFilter === 'all'
        ? snapshot.pentagon
        : snapshot.pentagon.filter((item) => {
            if (pentagonFilter === 'pizza') {
              return item.slug === 'pizza-index';
            }

            return item.slug === 'gay-bar-index';
          });
    }

    if (tab === 'psychology') {
      return psychologyFilter === 'all'
        ? snapshot.psychology
        : snapshot.psychology.filter((item) => item.slug === psychologyFilter);
    }

    return socialFilter === 'all'
      ? snapshot.social
      : snapshot.social.filter((item) => item.slug === socialFilter);
  }

  function handleSelect(item: AdminSignalItem) {
    setSelectedKey(keyOf(item));
    setDraft(createFeedEditorDraft(item));
    setMessage(null);
  }

  function handleFieldChange<K extends keyof FeedEditorDraft>(field: K, value: FeedEditorDraft[K]) {
    setDraft((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        [field]: value,
      };
    });
  }

  async function handleSave() {
    if (!selectedItem || !draft) {
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      await publishFeedEdit(selectedItem, draft);
      await loadSnapshot(keyOf(selectedItem));
      setMessage('저장되었습니다.');
    } catch (saveError) {
      setMessage(saveError instanceof Error ? saveError.message : '저장하지 못했습니다.');
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    if (!selectedItem) {
      return;
    }

    setDraft(createFeedEditorDraft(selectedItem));
    setMessage(null);
  }

  const items = getVisibleItems();

  return (
    <div className="admin-app">
      <div className="admin-layout">
        <section className="admin-feed-column">
          <main className={tab === 'home' ? 'page page--hero' : 'page'}>
            <div className="page__content">
              {tab !== 'home' ? (
                <header className="screen-header">
                  <div className="screen-header__copy">
                    <h1 className="screen-header__title">{getSectionTitle(tab)}</h1>
                  </div>
                </header>
              ) : null}

              {tab === 'pentagon' ? (
                <FilterChips
                  activeValue={pentagonFilter}
                  options={[
                    { value: 'all', label: '전체' },
                    { value: 'pizza', label: '피자 지수' },
                    { value: 'gay-bar', label: '바 지수' },
                  ]}
                  onChange={(value) => setPentagonFilter(value as PentagonFilter)}
                />
              ) : null}

              {tab === 'psychology' ? (
                <FilterChips
                  activeValue={psychologyFilter}
                  options={[
                    { value: 'all', label: '전체' },
                    { value: 'us-stock-fear-greed', label: '미국주식' },
                    { value: 'crypto-fear-greed', label: '코인' },
                    { value: 'kr-stock-fear-greed', label: '한국주식' },
                  ]}
                  onChange={(value) => setPsychologyFilter(value as PsychologyFilter)}
                />
              ) : null}

              {tab === 'sns' ? (
                <FilterChips
                  activeValue={socialFilter}
                  options={[
                    { value: 'all', label: '전체' },
                    { value: 'trump', label: '트럼프' },
                    { value: 'elon', label: '일론' },
                    { value: 'kr-stock-community', label: '국내 커뮤니티' },
                    { value: 'global-stock-community', label: '해외 커뮤니티' },
                  ]}
                  onChange={(value) => setSocialFilter(value as SocialFilter)}
                />
              ) : null}

              {loading ? (
                <div className="feed-stack" aria-hidden="true">
                  {Array.from({ length: tab === 'home' ? 4 : 3 }).map((_, index) => (
                    <div key={index} className="feed-card feed-card--skeleton">
                      <div className="skeleton skeleton--title" />
                      <div className="skeleton skeleton--metrics" />
                    </div>
                  ))}
                </div>
              ) : null}

              {!loading && error ? (
                <div className="state-panel">
                  <strong>피드를 불러오지 못했습니다.</strong>
                  <p>{error}</p>
                  <button type="button" className="button" onClick={() => void loadSnapshot(selectedKey)}>
                    다시 시도
                  </button>
                </div>
              ) : null}

              {!loading && !error && items.length === 0 ? (
                <div className="state-panel">
                  <strong>표시할 카드가 없습니다.</strong>
                  <p>현재 탭과 조건에 맞는 피드가 없습니다.</p>
                </div>
              ) : null}

              {!loading && !error && items.length > 0 ? (
                <div className="feed-stack">
                  {items.map((item) => (
                    <AdminFeedCard
                      key={keyOf(item)}
                      item={item}
                      selected={selectedKey === keyOf(item)}
                      onEdit={() => handleSelect(item)}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          </main>

          <nav className="tab-bar" aria-label="탭 이동">
            <div className="tab-bar__inner">
              <NavLink to="/" end className={({ isActive }) => (isActive ? 'tab-bar__item tab-bar__item--active' : 'tab-bar__item')}>
                <span className="tab-bar__icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4.5v-5.5h-5V21H5a1 1 0 0 1-1-1v-9.5Z" />
                  </svg>
                </span>
                <span className="tab-bar__label">홈</span>
              </NavLink>

              <NavLink to="/pentagon" className={({ isActive }) => (isActive ? 'tab-bar__item tab-bar__item--active' : 'tab-bar__item')}>
                <span className="tab-bar__icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <path d="m12 3 8 5.5-3 9.5H7L4 8.5 12 3Z" />
                  </svg>
                </span>
                <span className="tab-bar__label">펜타곤</span>
              </NavLink>

              <NavLink to="/psychology" className={({ isActive }) => (isActive ? 'tab-bar__item tab-bar__item--active' : 'tab-bar__item')}>
                <span className="tab-bar__icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <path d="M12 3a8.5 8.5 0 0 0-4.8 15.5v2h9.6v-2A8.5 8.5 0 0 0 12 3Zm-2.8 6.4c0-1.2 1-2.2 2.2-2.2H13a2.4 2.4 0 0 1 2.4 2.4c0 1-.6 1.8-1.4 2.2l-1 .5c-.5.3-.8.7-.8 1.3v.4h-2v-.6c0-1.3.7-2.4 1.8-3l.8-.4c.4-.2.6-.5.6-.9A.5.5 0 0 0 13 8.6h-1.6a.3.3 0 0 0-.3.3v.5h-2Z" />
                    <circle cx="12" cy="17.5" r="1" />
                  </svg>
                </span>
                <span className="tab-bar__label">심리</span>
              </NavLink>

              <NavLink to="/sns" className={({ isActive }) => (isActive ? 'tab-bar__item tab-bar__item--active' : 'tab-bar__item')}>
                <span className="tab-bar__icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <path d="M6 5h12a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H9.3L5 20v-3.2A3 3 0 0 1 3 14V8a3 3 0 0 1 3-3Zm2.5 4a1 1 0 1 0 0 2h7a1 1 0 1 0 0-2h-7Zm0 4a1 1 0 1 0 0 2h4.5a1 1 0 1 0 0-2H8.5Z" />
                  </svg>
                </span>
                <span className="tab-bar__label">SNS</span>
              </NavLink>
            </div>
          </nav>
        </section>

        {!selectedItem || !draft ? (
          <EmptyEditor />
        ) : (
          <aside className="admin-editor">
            <div className="admin-editor__panel">
              <div className="admin-editor__header">
                <div>
                  <span className="admin-editor__eyebrow">편집 중</span>
                  <h2 className="admin-editor__title">{selectedItem.title}</h2>
                </div>
                <button type="button" className="button button--ghost button--small" onClick={handleReset}>
                  되돌리기
                </button>
              </div>

              <div className="admin-editor__form">
                <label className="editor-field">
                  <span>제목</span>
                  <input value={draft.title} onChange={(event) => handleFieldChange('title', event.target.value)} />
                </label>

                <label className="editor-field">
                  <span>부제</span>
                  <input value={draft.subtitle} onChange={(event) => handleFieldChange('subtitle', event.target.value)} />
                </label>

                <div className="editor-grid">
                  <label className="editor-field">
                    <span>점수</span>
                    <input value={draft.score} inputMode="numeric" onChange={(event) => handleFieldChange('score', event.target.value)} />
                  </label>

                  <label className="editor-field">
                    <span>변화값</span>
                    <input value={draft.change} inputMode="decimal" onChange={(event) => handleFieldChange('change', event.target.value)} />
                  </label>
                </div>

                <label className="editor-field">
                  <span>상태 문구</span>
                  <input
                    value={draft.classification}
                    onChange={(event) => handleFieldChange('classification', event.target.value)}
                  />
                </label>

                <label className="editor-field">
                  <span>설명</span>
                  <textarea rows={4} value={draft.summary} onChange={(event) => handleFieldChange('summary', event.target.value)} />
                </label>

                {selectedItem.domain === 'pentagon' ? (
                  <div className="editor-grid">
                    <label className="editor-field">
                      <span>커버리지</span>
                      <input
                        value={draft.coverageLabel}
                        onChange={(event) => handleFieldChange('coverageLabel', event.target.value)}
                      />
                    </label>

                    <label className="editor-field">
                      <span>표본 수</span>
                      <input
                        value={draft.sampleSize}
                        inputMode="numeric"
                        onChange={(event) => handleFieldChange('sampleSize', event.target.value)}
                      />
                    </label>
                  </div>
                ) : null}

                {selectedItem.domain === 'social' ? (
                  <>
                    <label className="editor-field">
                      <span>카테고리</span>
                      <textarea
                        rows={3}
                        value={draft.categoriesText}
                        onChange={(event) => handleFieldChange('categoriesText', event.target.value)}
                      />
                    </label>

                    <label className="editor-field">
                      <span>출처</span>
                      <textarea
                        rows={3}
                        value={draft.sourcesText}
                        onChange={(event) => handleFieldChange('sourcesText', event.target.value)}
                      />
                    </label>

                    <label className="editor-field">
                      <span>검토 메모</span>
                      <textarea
                        rows={3}
                        value={draft.approvalNote}
                        onChange={(event) => handleFieldChange('approvalNote', event.target.value)}
                      />
                    </label>
                  </>
                ) : null}
              </div>

              <div className="admin-editor__actions">
                <button type="button" className="button button--ghost" onClick={() => void loadSnapshot(selectedKey)}>
                  새로고침
                </button>
                <button type="button" className="button" onClick={() => void handleSave()} disabled={saving}>
                  {saving ? '저장 중…' : '저장'}
                </button>
              </div>

              {message ? <div className="admin-editor__message">{message}</div> : null}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
