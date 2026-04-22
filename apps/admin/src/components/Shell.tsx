import type { ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';

const navigation = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/providers', label: 'Providers' },
  { to: '/jobs', label: 'Jobs' },
  { to: '/review-queue', label: 'Review Queue' },
  { to: '/runs', label: 'Runs' },
  { to: '/feed-layout', label: 'Feed Layout' },
  { to: '/manual-rerun', label: 'Manual Rerun' },
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
          <span className="brand-block__eyebrow">Indicator Feed Ops</span>
          <h1>Control room for feed quality, publishing, and recovery.</h1>
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
          Current route
          <strong>{location.pathname.replace('/', '') || 'dashboard'}</strong>
        </div>
      </aside>
      <main className="app-shell__content">
        <header className="topbar">
          <div>
            <span className="topbar__eyebrow">Separate Admin UI</span>
            <p>Anon-safe mini-app reads stay outside this surface. Every privileged action here should remain auditable.</p>
          </div>
        </header>
        <div className="page-stack">{children}</div>
      </main>
    </div>
  );
}
