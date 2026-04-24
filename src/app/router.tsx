import { Suspense, lazy, type ReactNode } from 'react';
import { Navigate, createHashRouter } from 'react-router-dom';
import { AppShell } from '../components/AppShell';

const HomeScreen = lazy(async () => {
  const module = await import('../features/HomeScreen');
  return { default: module.HomeScreen };
});

const PentagonScreen = lazy(async () => {
  const module = await import('../features/PentagonScreen');
  return { default: module.PentagonScreen };
});

const PsychologyScreen = lazy(async () => {
  const module = await import('../features/PsychologyScreen');
  return { default: module.PsychologyScreen };
});

const SnsFeedScreen = lazy(async () => {
  const module = await import('../features/SnsFeedScreen');
  return { default: module.SnsFeedScreen };
});

function RouteFallback() {
  return (
    <main className="page">
      <div className="page__content">
        <div className="state-panel">
          <strong>Loading screen</strong>
          <p>The next view is being prepared.</p>
        </div>
      </div>
    </main>
  );
}

function withSuspense(node: ReactNode) {
  return <Suspense fallback={<RouteFallback />}>{node}</Suspense>;
}

export const router = createHashRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      {
        index: true,
        element: withSuspense(<HomeScreen />),
      },
      {
        path: 'pentagon',
        element: withSuspense(<PentagonScreen />),
      },
      {
        path: 'pentagon/:slug',
        element: <Navigate to="/pentagon" replace />,
      },
      {
        path: 'psychology',
        element: withSuspense(<PsychologyScreen />),
      },
      {
        path: 'psychology/:slug',
        element: <Navigate to="/psychology" replace />,
      },
      {
        path: 'sns',
        element: withSuspense(<SnsFeedScreen />),
      },
      {
        path: 'sns/:slug',
        element: <Navigate to="/sns" replace />,
      },
    ],
  },
]);
