// "Kies een nieuw wachtwoord" — verschijnt als je via een herstel-link binnenkomt.
//
// Zonder dit scherm is een herstel-link een halve functie: Supabase maakt van dat token een ECHTE
// sessie, dus je bent ineens ingelogd, maar je wachtwoord is nog steeds het wachtwoord dat je niet
// meer weet. De volgende keer sta je er weer. Vandaar dat de vlag (`recovery`) blijft staan tot je
// hier klaar bent.
//
// App-breed gemonteerd, niet in de login-popup: die is dan allang gesloten — je klikt de link in je
// mail, komt terug op de app, en de popup waar het begon bestaat niet meer.

import { useState } from 'react';
import { TOW, towFont, engraved } from '../design/tow';
import { authUpdatePassword, authSignOut, useAuth } from '../lib/auth';

const eb = engraved as React.CSSProperties;
const goldGrad = `linear-gradient(180deg, ${TOW.goldBright} 0%, ${TOW.gold} 55%, ${TOW.goldDeep} 100%)`;

/** Supabase weigert korter dan 6; hier staat het er vóór je op de knop drukt in plaats van erna. */
const MIN = 6;

export function NewPasswordDialog(): React.JSX.Element | null {
  const { recovery, user } = useAuth();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [klaar, setKlaar] = useState(false);

  if (!recovery) return null;

  const kort = pw.length > 0 && pw.length < MIN;
  const ongelijk = pw2.length > 0 && pw !== pw2;
  const kan = pw.length >= MIN && pw === pw2 && !busy;

  const veld: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', padding: '11px 12px', borderRadius: 10,
    border: `1px solid ${TOW.lineStrong}`, background: TOW.panel, color: TOW.ink,
    fontFamily: towFont.serif, fontSize: 15, marginBottom: 8,
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 95, background: 'rgba(30,20,8,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div style={{
        width: '100%', maxWidth: 420, background: TOW.panel2,
        border: `1px solid ${TOW.lineStrong}`, borderRadius: 16, padding: 18,
      }}>
        <div style={{ ...eb, fontSize: 8.5, color: TOW.gold, marginBottom: 4 }}>Password reset</div>
        <h2 style={{ margin: '0 0 8px', fontFamily: towFont.display, fontWeight: 700, fontSize: 19, color: TOW.ink }}>
          {klaar ? 'Your password is set' : 'Choose a new password'}
        </h2>

        {klaar ? (
          <>
            <p style={{ margin: '0 0 14px', fontFamily: towFont.serif, fontSize: 14, lineHeight: 1.5, color: TOW.inkDim }}>
              You’re signed in{user?.email ? ` as ${user.email}` : ''}. Use this password next time.
            </p>
            <button
              type="button"
              onClick={() => setKlaar(false)}
              style={{ width: '100%', border: 'none', borderRadius: 10, cursor: 'pointer', padding: '11px 16px',
                       background: goldGrad, color: TOW.onGrad, fontFamily: towFont.display, fontWeight: 700, fontSize: 14 }}
            >
              Continue
            </button>
          </>
        ) : (
          <>
            <p style={{ margin: '0 0 14px', fontFamily: towFont.serif, fontSize: 14, lineHeight: 1.5, color: TOW.inkDim }}>
              You opened a reset link{user?.email ? ` for ${user.email}` : ''}. Pick a new password — this is also the
              one you use on Isle of Celedon.
            </p>
            <input
              type="password" value={pw} autoFocus autoComplete="new-password"
              onChange={(e) => { setPw(e.target.value); setError(null); }}
              placeholder={`New password (at least ${MIN} characters)`} style={veld}
            />
            <input
              type="password" value={pw2} autoComplete="new-password"
              onChange={(e) => { setPw2(e.target.value); setError(null); }}
              placeholder="Repeat it" style={veld}
            />
            {(kort || ongelijk || error) && (
              <p style={{ margin: '0 0 10px', fontFamily: towFont.serif, fontSize: 13, color: TOW.blood }}>
                {error ?? (kort ? `Use at least ${MIN} characters.` : 'The two do not match.')}
              </p>
            )}
            <button
              type="button" disabled={!kan}
              onClick={async () => {
                setBusy(true); setError(null);
                const { error: fout } = await authUpdatePassword(pw);
                setBusy(false);
                if (fout) setError(fout); else setKlaar(true);
              }}
              style={{ width: '100%', border: 'none', borderRadius: 10, cursor: kan ? 'pointer' : 'default',
                       padding: '11px 16px', background: goldGrad, color: TOW.onGrad, opacity: kan ? 1 : 0.5,
                       fontFamily: towFont.display, fontWeight: 700, fontSize: 14 }}
            >
              {busy ? 'Saving…' : 'Set password'}
            </button>
            {/* Geen "later" — dan blijf je met een sessie zitten waarvan je het wachtwoord niet kent.
                Uitloggen is de enige eerlijke uitweg, en die staat er. */}
            <button
              type="button" disabled={busy} onClick={() => void authSignOut()}
              style={{ display: 'block', margin: '10px auto 0', border: 'none', background: 'none',
                       cursor: 'pointer', fontFamily: towFont.serif, fontSize: 12.5, color: TOW.muted }}
            >
              Cancel and sign out
            </button>
          </>
        )}
      </div>
    </div>
  );
}
