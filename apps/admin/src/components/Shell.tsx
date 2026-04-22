import type { ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';

import { labelForRoute } from '../lib/labels';

const navigation = [
  { to: '/dashboard', label: '대시보드' },
  { to: '/providers', label: '소스 상태' },
  { to: '/jobs', label: '수집 작업' },
  { to: '/review-queue', label: '검토 대기열' },
  { to: '/runs', label: '실행 이력' },
  { to: '/feed-layout', label: '피드 구성' },
  { to: '/sns-control', label: 'SNS 관리' },
  { to: '/manual-rerun', label: '수동 실행' },
];

interface ShellProps {
  children: ReactNode;
}

export function Shell({ children }: ShellProps) {
  const location = useLocation();

  return (
    <div className="app-shell">
      <aside className="app-shell__sidebar">
        <div className="brand-block">
          <span className="brand-block__eyebrow">지표 피드 관리자</span>
          <h1>피드 품질, 게시, 복구 작업을 한 곳에서 관리합니다.</h1>
        </div>
        <nav className="side-nav">
          {navigation.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => (isActive ? 'side-nav__item side-nav__item--active' : 'side-nav__item')}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footnote">
          현재 메뉴
          <strong>{labelForRoute(location.pathname)}</strong>
        </div>
      </aside>
      <main className="app-shell__content">
        <header className="topbar">
          <div>
            <span className="topbar__eyebrow">관리자 정적 사이트</span>
            <p>로그인 링크 없이 관리자 비밀번호만으로 들어가는 운영 화면입니다. 주요 작업은 모두 감사 로그 경로를 거칩니다.</p>
          </div>
        </header>
        <div className="page-stack">{children}</div>
      </main>
    </div>
  );
}
