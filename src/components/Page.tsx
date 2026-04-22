import clsx from 'clsx';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

interface PageContainerProps {
  children: ReactNode;
  emphasis?: 'default' | 'hero';
}

interface ScreenHeaderProps {
  eyebrow: string;
  title: string;
  description: string;
  aside?: ReactNode;
}

interface DetailHeaderProps {
  section: string;
  title: string;
  subtitle?: string | undefined;
  fallbackPath: string;
}

interface SectionProps {
  title: string;
  description?: string;
  action?: ReactNode;
}

interface NoticeStripProps {
  tone?: 'neutral' | 'warning' | 'critical';
  title: string;
  description: string;
}

export function PageContainer({ children, emphasis = 'default' }: PageContainerProps) {
  return (
    <main className={clsx('page', emphasis === 'hero' && 'page--hero')}>
      <div className="page__content">{children}</div>
    </main>
  );
}

export function ScreenHeader({ eyebrow, title, description, aside }: ScreenHeaderProps) {
  return (
    <header className="screen-header">
      <div className="screen-header__copy">
        <span className="screen-header__eyebrow">{eyebrow}</span>
        <h1 className="screen-header__title">{title}</h1>
        <p className="screen-header__description">{description}</p>
      </div>
      {aside ? <div className="screen-header__aside">{aside}</div> : null}
    </header>
  );
}

export function DetailHeader({ section, title, subtitle, fallbackPath }: DetailHeaderProps) {
  const navigate = useNavigate();

  function handleBack() {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }

    navigate(fallbackPath);
  }

  return (
    <header className="detail-header">
      <button type="button" className="back-button" onClick={handleBack}>
        <span aria-hidden="true">‹</span>
        <span>Back</span>
      </button>
      <div className="detail-header__copy">
        <span className="detail-header__eyebrow">{section}</span>
        <h1 className="detail-header__title">{title}</h1>
        {subtitle ? <p className="detail-header__subtitle">{subtitle}</p> : null}
      </div>
    </header>
  );
}

export function Section({ title, description, action }: SectionProps) {
  return (
    <div className="section-header">
      <div>
        <h2 className="section-header__title">{title}</h2>
        {description ? <p className="section-header__description">{description}</p> : null}
      </div>
      {action ? <div className="section-header__action">{action}</div> : null}
    </div>
  );
}

export function NoticeStrip({ tone = 'neutral', title, description }: NoticeStripProps) {
  return (
    <div className={clsx('notice-strip', `notice-strip--${tone}`)}>
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  );
}
