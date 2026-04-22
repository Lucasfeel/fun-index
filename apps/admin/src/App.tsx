import { Navigate, Route, Routes } from 'react-router-dom';

import { AuthGate } from './components/AuthGate';
import { MiniFeedAdminPage } from './pages/MiniFeedAdminPage';

export default function App() {
  return (
    <AuthGate>
      <Routes>
        <Route path="/" element={<MiniFeedAdminPage tab="home" />} />
        <Route path="/pentagon" element={<MiniFeedAdminPage tab="pentagon" />} />
        <Route path="/psychology" element={<MiniFeedAdminPage tab="psychology" />} />
        <Route path="/sns" element={<MiniFeedAdminPage tab="sns" />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthGate>
  );
}
