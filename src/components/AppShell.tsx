import { Outlet } from 'react-router-dom';
import { BottomTabBar } from './BottomTabBar';

export function AppShell() {
  return (
    <div className="app-shell">
      <div className="app-shell__ambient app-shell__ambient--top" />
      <div className="app-shell__ambient app-shell__ambient--bottom" />
      <Outlet />
      <BottomTabBar />
    </div>
  );
}
