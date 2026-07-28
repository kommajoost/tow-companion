import { useEffect, useRef, useState } from 'react';
import { TOW, engraved, towFont } from '../design/tow';
import { authSignIn } from '../lib/auth';
import { LogoMark } from './LogoMark';

const eb = engraved as React.CSSProperties;
const goldGrad = `linear-gradient(180deg, ${TOW.goldBright} 0%, ${TOW.gold} 55%, ${TOW.goldDeep} 100%)`;

export function CeledonLoginDialog({
  open,
  onCancel,
}: {
  open: boolean;
  onCancel: () => void;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    const timer = window.setTimeout(() => emailRef.current?.focus(), 80);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;

  const canSubmit = email.trim().length > 0 && password.length > 0 && !busy;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const result = await authSignIn(email, password);
      if (result.error) {
        setError(result.error);
        setBusy(false);
      }
      // On success the auth store receives the session. AppShell closes this dialog and starts
      // the Army-list tour; keeping busy true avoids a distracting button flash.
    } catch {
      setError('Could not sign in — check your connection and try again.');
      setBusy(false);
    }
  };

  const input: React.CSSProperties = {
    width: '100%',
    boxSizing: 'border-box',
    borderRadius: 10,
    border: `1px solid ${TOW.lineStrong}`,
    background: TOW.cardLt,
    color: TOW.ink,
    padding: '11px 12px',
    fontFamily: towFont.serif,
    fontSize: 15,
    outline: 'none',
  };

  return (
    <div
      role="presentation"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 260,
        display: 'grid',
        placeItems: 'center',
        padding: 16,
        background: 'rgba(20,14,8,0.72)',
        backdropFilter: 'blur(4px)',
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="celedon-login-title"
        style={{
          width: '100%',
          maxWidth: 430,
          borderRadius: 16,
          border: `1px solid ${TOW.lineStrong}`,
          background: TOW.panel,
          color: TOW.ink,
          padding: 20,
          boxShadow: '0 24px 70px rgba(20,14,8,0.58)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <LogoMark size={42} radius={10} />
          <div style={{ minWidth: 0 }}>
            <div style={{ ...eb, color: TOW.goldDeep, fontSize: 8.5 }}>Isle of Celedon · campaign access</div>
            <h1
              id="celedon-login-title"
              style={{ margin: '3px 0 0', fontFamily: towFont.display, fontSize: 22, lineHeight: 1.15 }}
            >
              Open your campaign army
            </h1>
          </div>
        </div>

        <p style={{ margin: '0 0 16px', fontFamily: towFont.serif, color: TOW.parchDim, fontSize: 14.5, lineHeight: 1.55 }}>
          Sign in with the same email and password you use on Isle of Celedon. Once you are in, we will
          take you straight through your campaign list.
        </p>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <label style={{ display: 'block', marginBottom: 10 }}>
            <span style={{ ...eb, display: 'block', marginBottom: 5, color: TOW.muted, fontSize: 8 }}>Email</span>
            <input
              ref={emailRef}
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              style={input}
            />
          </label>
          <label style={{ display: 'block', marginBottom: 12 }}>
            <span style={{ ...eb, display: 'block', marginBottom: 5, color: TOW.muted, fontSize: 8 }}>Password</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              style={input}
            />
          </label>

          {error && (
            <div
              role="alert"
              style={{
                marginBottom: 12,
                borderRadius: 9,
                border: '1px solid rgba(124,43,34,0.4)',
                background: 'rgba(124,43,34,0.09)',
                padding: '9px 11px',
                color: TOW.blood,
                fontFamily: towFont.serif,
                fontSize: 13.5,
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={!canSubmit}
            style={{
              width: '100%',
              border: 'none',
              borderRadius: 10,
              cursor: canSubmit ? 'pointer' : 'default',
              padding: '11px 16px',
              background: goldGrad,
              color: TOW.onGrad,
              opacity: canSubmit ? 1 : 0.5,
              fontFamily: towFont.display,
              fontWeight: 700,
              fontSize: 14,
            }}
          >
            {busy ? 'Signing in…' : 'Sign in & show me around'}
          </button>
        </form>

        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          style={{
            display: 'block',
            margin: '12px auto 0',
            border: 'none',
            background: 'transparent',
            color: TOW.muted,
            cursor: busy ? 'default' : 'pointer',
            fontFamily: towFont.serif,
            fontSize: 12.5,
            textDecoration: 'underline',
          }}
        >
          Continue without campaign
        </button>
      </section>
    </div>
  );
}
