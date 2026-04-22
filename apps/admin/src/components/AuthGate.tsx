import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';

import { clearStoredAdminPassword, getStoredAdminPassword, setStoredAdminPassword } from '../lib/adminAccess';
import { verifyAdminPassword } from '../lib/api';
import { hasLiveSupabaseConfig } from '../lib/supabase';

interface AuthGateProps {
  children: ReactNode;
}

export function AuthGate({ children }: AuthGateProps) {
  const [unlocked, setUnlocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const savedPassword = getStoredAdminPassword();
    if (savedPassword) {
      setUnlocked(true);
    }
    setLoading(false);
  }, []);

  async function unlockAdmin() {
    setMessage(null);
    setLoading(true);

    try {
      const trimmedPassword = password.trim();
      if (!trimmedPassword) {
        throw new Error('관리자 비밀번호를 입력해 주세요.');
      }

      await verifyAdminPassword(trimmedPassword);
      setStoredAdminPassword(trimmedPassword);
      setUnlocked(true);
      setPassword('');
    } catch (error) {
      clearStoredAdminPassword();
      setUnlocked(false);
      setMessage(error instanceof Error ? error.message : '비밀번호 확인에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <div className="auth-screen">관리자 화면을 준비하고 있습니다…</div>;
  }

  if (!unlocked) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <span className="topbar__eyebrow">관리자 비밀번호</span>
          <h2>SNS 운영 화면에 들어가려면 관리자 비밀번호를 입력해 주세요.</h2>
          <p>
            {hasLiveSupabaseConfig
              ? '입력한 비밀번호는 엣지 함수 검증 후 현재 브라우저 세션에만 유지됩니다.'
              : '현재는 데모 모드입니다. 비밀번호를 입력하면 관리자 화면을 바로 미리 볼 수 있습니다.'}
          </p>
          <input
            className="auth-card__input"
            type="password"
            placeholder="관리자 비밀번호"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                void unlockAdmin();
              }
            }}
          />
          <button className="submit-button" onClick={() => void unlockAdmin()}>
            입장하기
          </button>
          {message ? <div className="notice notice--inline">{message}</div> : null}
        </div>
      </div>
    );
  }

  if (!hasLiveSupabaseConfig) {
    return (
      <>
        <div className="demo-banner">
          데모 모드입니다. `VITE_SUPABASE_URL`과 `VITE_SUPABASE_ANON_KEY`가 없어 샘플 데이터로 동작합니다.
        </div>
        {children}
      </>
    );
  }

  return (
    <>
      <div className="demo-banner demo-banner--live">
        관리자 비밀번호 확인이 완료됐습니다. 권한 작업은 비밀번호 헤더와 엣지 함수 감사 로그를 통해 처리됩니다.
      </div>
      {children}
    </>
  );
}
