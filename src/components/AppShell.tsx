import { Outlet } from 'react-router-dom';
import { BottomTabBar } from './BottomTabBar';

export function AppShell() {
  return (
    <div className="app-shell">
      <Outlet />
      <BottomTabBar />
    </div>
  );
}
