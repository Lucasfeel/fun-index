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
    return <div className="auth-screen">관리자 화면을 준비하는 중입니다.</div>;
  }

  if (!unlocked) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <span className="auth-card__eyebrow">ADMIN</span>
          <h2>관리자 비밀번호를 입력해 주세요.</h2>
          <p>
            {hasLiveSupabaseConfig
              ? '로그인 없이 비밀번호만 확인한 뒤 바로 편집 화면으로 들어갑니다.'
              : '현재는 데모 모드입니다. 비밀번호를 입력하면 샘플 화면으로 바로 들어갑니다.'}
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
          <button className="submit-button" onClick={() => void unlockAdmin()}>입장하기</button>
          {message ? <div className="notice notice--inline">{message}</div> : null}
        </div>
      </div>
    );
  }

  if (!hasLiveSupabaseConfig) {
    return (
      <>
        <div className="demo-banner">
          데모 모드입니다. Supabase 환경 변수가 없어 샘플 데이터로 동작합니다.
        </div>
        {children}
      </>
    );
  }

  return (
      <>
        <div className="demo-banner demo-banner--live">
          관리자 비밀번호 확인이 완료되었습니다.
        </div>
        {children}
      </>
  );
}
