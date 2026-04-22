import clsx from 'clsx';
import type { ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';

type TabKey = 'home' | 'pentagon' | 'psychology' | 'sns';

interface TabDefinition {
  key: TabKey;
  label: string;
  to: string;
  icon: ReactNode;
}

const tabs: TabDefinition[] = [
  {
    key: 'home',
    label: 'Home',
    to: '/',
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4.5v-5.5h-5V21H5a1 1 0 0 1-1-1v-9.5Z" />
      </svg>
    ),
  },
  {
    key: 'pentagon',
    label: 'Pentagon',
    to: '/pentagon',
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="m12 3 8 5.5-3 9.5H7L4 8.5 12 3Z" />
      </svg>
    ),
  },
  {
    key: 'psychology',
    label: 'Psychology',
    to: '/psychology',
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M12 3a8.5 8.5 0 0 0-4.8 15.5v2h9.6v-2A8.5 8.5 0 0 0 12 3Zm-2.8 6.4c0-1.2 1-2.2 2.2-2.2H13a2.4 2.4 0 0 1 2.4 2.4c0 1-.6 1.8-1.4 2.2l-1 .5c-.5.3-.8.7-.8 1.3v.4h-2v-.6c0-1.3.7-2.4 1.8-3l.8-.4c.4-.2.6-.5.6-.9A.5.5 0 0 0 13 8.6h-1.6a.3.3 0 0 0-.3.3v.5h-2Z" />
        <circle cx="12" cy="17.5" r="1" />
      </svg>
    ),
  },
  {
    key: 'sns',
    label: 'SNS Feed',
    to: '/sns',
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M6 5h12a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H9.3L5 20v-3.2A3 3 0 0 1 3 14V8a3 3 0 0 1 3-3Zm2.5 4a1 1 0 1 0 0 2h7a1 1 0 1 0 0-2h-7Zm0 4a1 1 0 1 0 0 2h4.5a1 1 0 1 0 0-2H8.5Z" />
      </svg>
    ),
  },
];

function getActiveTab(pathname: string): TabKey {
  if (pathname.startsWith('/pentagon')) {
    return 'pentagon';
  }

  if (pathname.startsWith('/psychology')) {
    return 'psychology';
  }

  if (pathname.startsWith('/sns')) {
    return 'sns';
  }

  return 'home';
}

export function BottomTabBar() {
  const location = useLocation();
  const activeTab = getActiveTab(location.pathname);

  return (
    <nav className="tab-bar" aria-label="Primary">
      <div className="tab-bar__inner">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;

          return (
            <NavLink
              key={tab.key}
              to={tab.to}
              className={clsx('tab-bar__item', isActive && 'tab-bar__item--active')}
            >
              <span className="tab-bar__icon">{tab.icon}</span>
              <span className="tab-bar__label">{tab.label}</span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
