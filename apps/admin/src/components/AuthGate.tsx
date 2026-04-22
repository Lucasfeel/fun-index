import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';

import { hasLiveSupabaseConfig, supabase } from '../lib/supabase';

interface AuthGateProps {
  children: ReactNode;
}

export function AuthGate({ children }: AuthGateProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(hasLiveSupabaseConfig);
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!hasLiveSupabaseConfig || !supabase) {
      return;
    }

    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  async function sendMagicLink() {
    if (!supabase) {
      return;
    }

    const { error } = await supabase.auth.signInWithOtp({
      email,
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage('Magic link sent. Open it from the admin mailbox attached to this Supabase project.');
  }

  if (!hasLiveSupabaseConfig || !supabase) {
    return (
      <>
        <div className="demo-banner">
          Demo mode is active because `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are not set.
        </div>
        {children}
      </>
    );
  }

  if (loading) {
    return <div className="auth-screen">Checking admin session…</div>;
  }

  if (!session) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <span className="topbar__eyebrow">Admin Auth Required</span>
          <h2>Sign in before using provider controls, review actions, or publish tools.</h2>
          <p>
            This surface assumes Supabase Auth plus role-backed RLS. Use a registered admin email to receive a magic
            link.
          </p>
          <input
            className="auth-card__input"
            type="email"
            placeholder="ops@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <button className="submit-button" onClick={() => void sendMagicLink()}>
            Send magic link
          </button>
          {message ? <div className="notice notice--inline">{message}</div> : null}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="demo-banner demo-banner--live">
        Signed in as {session.user.email ?? session.user.id}. Authorization is still enforced by RLS and Edge Functions.
      </div>
      {children}
    </>
  );
}
