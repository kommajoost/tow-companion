import { useCallback, useEffect, useRef, useState } from 'react';
import { TOW, towFont, engraved } from '../design/tow';
import { SwitchIcon } from '../design/icons';
import { useAuth } from '../lib/auth';
import { useBackClose } from '../lib/backStack';
import {
  useTestAccounts, wisselNaarTestAccount, wisselNaarEigenSessie, testAccountUitloggen, eigenSessie,
  type TestAccount,
} from '../lib/testAccounts';

// De testaccount-switcher in de vaste navigatie: op een breed scherm in de icon-rail, op de telefoon
// als extra knopje in de tabbalk. Hij bestaat alleen zodra er minstens één testaccount in Settings
// staat, zodat een gewone speler er nooit iets van ziet.
//
// Wisselen is een échte uit- en inlog en herlaadt daarna de app (zie lib/testAccounts.ts), dus de
// knop laat tijdens de wissel duidelijk zien dat er iets loopt.

const eb = engraved as React.CSSProperties;

// Amber — bewust NIET het goud van de huisstijl: dit moet eruit springen als "let op, je kijkt niet
// met je eigen account". Werkt in beide skins.
const AMBER = '#c07a1e';
const AMBER_BG = 'rgba(192,122,30,0.16)';

type Placement = 'rail' | 'tabbar';

interface MenuPos { top?: number; bottom?: number; left?: number; right?: number }

export function TestAccountSwitcher({ placement }: { placement: Placement }) {
  const accounts = useTestAccounts();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [herladen, setHerladen] = useState(false);
  const [pos, setPos] = useState<MenuPos>({});
  const btnRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => setOpen(false), []);
  useBackClose(open, close);

  // Sluit bij Escape en bij een resize (de vaste positie klopt dan niet meer).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    const onResize = () => setOpen(false);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('resize', onResize); };
  }, [open]);

  if (accounts.length === 0) return null;

  const mail = (user?.email || '').trim().toLowerCase();
  const actief = accounts.find((a) => a.email.trim().toLowerCase() === mail) ?? null;
  const testing = !!actief && !actief.eigen;
  // De eigen login (07-08): de sessie die bij de eerste wissel is bewaard, of de huidige sessie als
  // die geen (niet-eigen) testaccount is. Zo staat je gewone account áltijd in de lijst.
  const eigenStash = eigenSessie();
  const eigenActief = !!mail && (!actief || actief.eigen === true);

  const toggle = () => {
    if (open) { setOpen(false); return; }
    const r = btnRef.current?.getBoundingClientRect();
    if (r) {
      setPos(placement === 'rail'
        ? { left: Math.round(r.right + 8), bottom: Math.max(8, Math.round(window.innerHeight - r.bottom)) }
        : { right: 8, bottom: Math.max(8, Math.round(window.innerHeight - r.top + 8)) });
    }
    setError(null);
    setOpen(true);
  };

  const kies = async (acc: TestAccount) => {
    if (busy) return;
    setBusy(acc.email); setError(null); setHerladen(false);
    const { error: err, herladenNodig } = await wisselNaarTestAccount(acc);
    // Bij succes herlaadt de pagina — dan komen we hier meestal niet meer voorbij.
    if (err) { setError(err); setBusy(null); }
    else if (herladenNodig) setHerladen(true);
  };

  const uitloggen = async () => {
    if (busy) return;
    setBusy('*'); setError(null); setHerladen(false);
    const { error: err, herladenNodig } = await testAccountUitloggen();
    if (err) { setError(err); setBusy(null); }
    else if (herladenNodig) setHerladen(true);
  };

  /** Terug naar de eigen login via de bewaarde sessie (geen wachtwoord nodig). */
  const naarEigen = async () => {
    if (busy) return;
    setBusy('eigen'); setError(null); setHerladen(false);
    const { error: err, herladenNodig } = await wisselNaarEigenSessie();
    if (err) { setError(err); setBusy(null); }
    else if (herladenNodig) setHerladen(true);
  };

  const kleur = testing ? AMBER : TOW.muted;
  const knopLabel = busy ? 'Switching…' : testing ? actief!.label : actief ? 'Accounts' : 'Test';

  const button = (
    <button
      ref={btnRef}
      onClick={toggle}
      aria-haspopup="menu"
      aria-expanded={open}
      title={testing ? `Testing as ${actief!.label} — switch account` : 'Switch test account'}
      style={{
        position: 'relative',
        width: placement === 'rail' ? 60 : 54,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        padding: placement === 'rail' ? '9px 0' : '10px 0',
        borderRadius: 12,
        cursor: 'pointer',
        border: 'none',
        background: testing ? AMBER_BG : 'transparent',
        color: kleur,
      }}
    >
      <SwitchIcon size={placement === 'rail' ? 21 : 20} color={kleur} />
      <span style={{
        maxWidth: placement === 'rail' ? 54 : 50, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        fontFamily: towFont.display, fontWeight: 600, fontSize: placement === 'rail' ? 8.5 : 9, letterSpacing: '0.04em',
      }}>
        {knopLabel}
      </span>
    </button>
  );

  return (
    <>
      {button}
      {open && (
        <>
          {/* Klik naast het menu = sluiten. */}
          <div onClick={close} style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'transparent' }} />
          <div
            role="menu"
            style={{
              position: 'fixed', zIndex: 91, ...pos,
              width: 258, maxWidth: 'calc(100vw - 16px)',
              boxSizing: 'border-box',
              background: TOW.panel2,
              border: `1px solid ${TOW.lineStrong}`,
              borderRadius: 13,
              padding: 10,
              boxShadow: '0 12px 34px rgba(0,0,0,0.28)',
            }}
          >
            <div style={{ ...eb, fontSize: 8.5, color: testing ? AMBER : TOW.goldDeep, marginBottom: 8 }}>
              {testing ? `Testing as ${actief!.label}` : actief ? `Signed in · ${actief.label}` : user ? 'Signed in' : 'Signed out'}
            </div>
            {user && (
              <div style={{ fontFamily: towFont.serif, fontSize: 11.5, color: TOW.muted, marginBottom: 8, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {user.email}
              </div>
            )}

            {/* "Your account" bovenaan: de bewaarde eigen sessie — één tik terug, zonder wachtwoord. */}
            {(eigenStash || eigenActief) && (
              <button
                role="menuitem"
                disabled={eigenActief || !!busy}
                onClick={() => void naarEigen()}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left',
                  padding: '9px 10px', marginBottom: 4, borderRadius: 9,
                  cursor: eigenActief || busy ? 'default' : 'pointer',
                  border: `1px solid ${eigenActief ? TOW.goldDeep : TOW.line}`,
                  background: eigenActief ? 'rgba(138,108,48,0.14)' : TOW.cardLt,
                  opacity: busy && busy !== 'eigen' ? 0.5 : 1,
                }}
              >
                <span aria-hidden style={{ width: 12, flexShrink: 0, color: eigenActief ? TOW.goldDeep : 'transparent', fontSize: 13, lineHeight: 1 }}>✓</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontFamily: towFont.display, fontWeight: 600, fontSize: 13.5, color: TOW.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    Your account
                  </span>
                  <span style={{ display: 'block', fontFamily: towFont.serif, fontSize: 11, color: TOW.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {busy === 'eigen' ? 'Signing in…' : eigenActief ? mail : eigenStash?.email}
                  </span>
                </span>
              </button>
            )}

            {accounts.map((a) => {
              const on = a.email.trim().toLowerCase() === mail;
              const laden = busy === a.email;
              return (
                <button
                  key={a.email}
                  role="menuitem"
                  disabled={on || !!busy}
                  onClick={() => void kies(a)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left',
                    padding: '9px 10px', marginBottom: 4, borderRadius: 9,
                    cursor: on || busy ? 'default' : 'pointer',
                    border: `1px solid ${on ? (a.eigen ? TOW.goldDeep : AMBER) : TOW.line}`,
                    background: on ? (a.eigen ? 'rgba(138,108,48,0.14)' : AMBER_BG) : TOW.cardLt,
                    opacity: busy && !laden ? 0.5 : 1,
                  }}
                >
                  <span aria-hidden style={{ width: 12, flexShrink: 0, color: on ? (a.eigen ? TOW.goldDeep : AMBER) : 'transparent', fontSize: 13, lineHeight: 1 }}>✓</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontFamily: towFont.display, fontWeight: 600, fontSize: 13.5, color: TOW.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {a.label}{a.eigen ? ' · own' : ''}
                    </span>
                    <span style={{ display: 'block', fontFamily: towFont.serif, fontSize: 11, color: TOW.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {laden ? 'Signing in…' : a.email}
                    </span>
                  </span>
                </button>
              );
            })}

            <div style={{ height: 1, background: TOW.line, margin: '8px 0' }} />
            <button
              role="menuitem"
              disabled={!!busy || !user}
              onClick={() => void uitloggen()}
              style={{
                width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: 9,
                border: `1px solid ${TOW.line}`, background: 'transparent',
                cursor: busy || !user ? 'default' : 'pointer',
                fontFamily: towFont.display, fontWeight: 600, fontSize: 13, color: TOW.muted,
                opacity: !user ? 0.5 : 1,
              }}
            >
              {busy === '*' ? 'Signing out…' : 'Sign out'}
            </button>

            {error && (
              <div style={{ fontFamily: towFont.serif, fontSize: 11.5, color: TOW.blood, marginTop: 8, lineHeight: 1.4 }}>{error}</div>
            )}
            {herladen && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontFamily: towFont.serif, fontSize: 11.5, color: AMBER, lineHeight: 1.4, marginBottom: 6 }}>
                  Signed in — this browser didn’t reload by itself. One tap finishes the switch.
                </div>
                <button
                  onClick={() => window.location.replace(window.location.href)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 9, border: `1px solid ${AMBER}`, background: AMBER_BG, cursor: 'pointer', fontFamily: towFont.display, fontWeight: 600, fontSize: 13, color: TOW.ink }}
                >
                  Reload now
                </button>
              </div>
            )}
            <div style={{ fontFamily: towFont.serif, fontStyle: 'italic', fontSize: 10.5, color: TOW.faint, marginTop: 8, lineHeight: 1.4 }}>
              Switching signs out and back in for real — the app reloads with that account’s lists.
            </div>
          </div>
        </>
      )}
    </>
  );
}
