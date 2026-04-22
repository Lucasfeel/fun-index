import { Navigate, Route, Routes } from 'react-router-dom';

import { AuthGate } from './components/AuthGate';
import { Shell } from './components/Shell';
import { DashboardPage } from './pages/DashboardPage';
import { ProvidersPage } from './pages/ProvidersPage';
import { JobsPage } from './pages/JobsPage';
import { ReviewQueuePage } from './pages/ReviewQueuePage';
import { RunsPage } from './pages/RunsPage';
import { FeedLayoutPage } from './pages/FeedLayoutPage';
import { ManualRerunPage } from './pages/ManualRerunPage';
import { SnsControlPage } from './pages/SnsControlPage';

export default function App() {
  return (
    <AuthGate>
      <Shell>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/providers" element={<ProvidersPage />} />
          <Route path="/jobs" element={<JobsPage />} />
          <Route path="/review-queue" element={<ReviewQueuePage />} />
          <Route path="/runs" element={<RunsPage />} />
          <Route path="/feed-layout" element={<FeedLayoutPage />} />
          <Route path="/sns-control" element={<SnsControlPage />} />
          <Route path="/manual-rerun" element={<ManualRerunPage />} />
        </Routes>
      </Shell>
    </AuthGate>
  );
}
