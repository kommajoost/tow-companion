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
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100dvh',
        padding: 'max(16px, env(safe-area-inset-top, 0px)) 16px max(16px, env(safe-area-inset-bottom, 0px))',
        background:
          'radial-gradient(circle at 50% 50%, rgba(211,163,68,0.16) 0%, rgba(211,163,68,0.06) 27%, transparent 54%), rgba(20,14,8,0.76)',
        backdropFilter: 'blur(5px)',
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="celedon-login-title"
        style={{
          width: '100%',
          maxWidth: 450,
          position: 'relative',
          isolation: 'isolate',
          borderRadius: 16,
          border: '1px solid rgba(183,137,49,0.74)',
          background: TOW.panel,
          color: TOW.ink,
          padding: 22,
          boxShadow:
            '0 0 0 1px rgba(255,225,150,0.11), 0 0 38px rgba(211,158,52,0.34), 0 0 96px rgba(155,101,17,0.22), 0 28px 72px rgba(20,14,8,0.64)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <LogoMark size={42} radius={10} />
          <div style={{ minWidth: 0 }}>
            <div style={{ ...eb, color: TOW.goldDeep, fontSize: 8.5 }}>Isle of Celedon · your campaign account</div>
            <h1
              id="celedon-login-title"
              style={{ margin: '3px 0 0', fontFamily: towFont.display, fontSize: 22, lineHeight: 1.15 }}
            >
              Sign in to your campaign army
            </h1>
          </div>
        </div>

        <div
          aria-hidden="true"
          style={{
            height: 1,
            margin: '-2px 0 15px',
            background: `linear-gradient(90deg, transparent, ${TOW.goldBright}, ${TOW.goldDeep}, transparent)`,
            boxShadow: '0 0 12px rgba(211,158,52,0.55)',
          }}
        />

        <p style={{ margin: '0 0 16px', fontFamily: towFont.serif, color: TOW.parchDim, fontSize: 14.5, lineHeight: 1.55 }}>
          Use the same email and password as Isle of Celedon. Your faction, points limit and campaign
          list are already waiting here.
        </p>

        <div
          style={{
            margin: '0 0 16px',
            borderLeft: `2px solid ${TOW.goldDeep}`,
            background: 'rgba(183,137,49,0.08)',
            padding: '9px 11px',
            color: TOW.parchDim,
            fontFamily: towFont.serif,
            fontSize: 13.5,
            lineHeight: 1.45,
          }}
        >
          After signing in, a short guided tour opens your Army list and shows you exactly where to begin.
        </div>

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
            {busy ? 'Signing in…' : 'Sign in & start the Army tour'}
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
