import { useState } from 'react';
import { TOW, towFont, engraved } from '../design/tow';
import { useTheme } from '../theme';
import { usePwa } from '../pwa';
import { supabase, TOW_FEEDBACK } from '../lib/supabase';
import { useAuth, authSignIn, authSignUp, authSignOut } from '../lib/auth';
import { useListSync } from '../listSync';
import { deriveKey, type CloudLists } from '../lib/listSync';
import {
  useCampagnes, kiesCampagne, verversCampagnes, hernoemRegiment, regimentSlug,
} from '../lib/campaign';
import { usePersistentState, setPersisted } from '../store';
import { LogoMark } from './LogoMark';

const eb = engraved as React.CSSProperties;
const APP_VERSION = __APP_VERSION__;
const BUILD_SHA = __BUILD_SHA__;
const BUILD_DATE = __BUILD_DATE__;
// e.g. "0.1.0 · 0dea538 · 2026-06-14"
const BUILD_LABEL = `${APP_VERSION} · ${BUILD_SHA} · ${BUILD_DATE}`;

// Settings screen — currently the home of "install app" and "updates", with room to grow.
export function SettingsMode() {
  const { canInstall, installed, promptInstall, needRefresh, updateApp, checkForUpdate } = usePwa();
  const { mode, set: setTheme } = useTheme();
  const [checking, setChecking] = useState(false);
  const [checkedNote, setCheckedNote] = useState<string | null>(null);

  const card: React.CSSProperties = {
    border: `1px solid ${TOW.line}`,
    borderRadius: 14,
    background: TOW.panel2,
    padding: 16,
    marginBottom: 12,
  };
  const goldBtn: React.CSSProperties = {
    border: 'none',
    borderRadius: 11,
    cursor: 'pointer',
    padding: '12px 18px',
    background: `linear-gradient(180deg, ${TOW.goldBright}, ${TOW.gold} 55%, ${TOW.goldDeep})`,
    color: TOW.onGrad,
    fontFamily: towFont.display,
    fontWeight: 700,
    fontSize: 15,
  };
  const ghostBtn: React.CSSProperties = {
    border: `1px solid ${TOW.lineStrong}`,
    borderRadius: 11,
    cursor: 'pointer',
    padding: '11px 16px',
    background: 'transparent',
    color: TOW.goldDeep,
    fontFamily: towFont.display,
    fontWeight: 600,
    fontSize: 14,
  };
  const title: React.CSSProperties = { ...eb, fontSize: 9.5, color: TOW.goldDeep, marginBottom: 6 };
  const body: React.CSSProperties = { fontFamily: towFont.serif, fontSize: 14, color: TOW.parchDim, lineHeight: 1.45 };

  const onCheck = () => {
    setChecking(true);
    setCheckedNote(null);
    checkForUpdate();
    // The SW update is async; give it a moment, then report.
    window.setTimeout(() => {
      setChecking(false);
      setCheckedNote(needRefresh ? null : 'You’re on the latest version.');
    }, 2500);
  };

  return (
    <div className="tow-field" style={{ height: '100%', overflowY: 'auto', color: TOW.ink }}>
      <div style={{ maxWidth: 560, margin: '0 auto', padding: '20px 16px 40px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
          <LogoMark size={40} radius={9} />
          <div>
            <h1 style={{ fontFamily: towFont.display, fontWeight: 700, fontSize: 24, color: TOW.ink, margin: 0 }}>Settings</h1>
            <div style={{ ...eb, fontSize: 9, color: TOW.muted, marginTop: 2 }}>Old World Companion · v{APP_VERSION}</div>
          </div>
        </div>

        {/* Install */}
        <div style={card}>
          <div style={title}>Install app</div>
          {installed ? (
            <div style={body}>✓ The companion is installed and runs as an app.</div>
          ) : canInstall ? (
            <>
              <div style={{ ...body, marginBottom: 12 }}>
                Install the companion to your home screen / desktop for a full-screen app that also works offline.
              </div>
              <button style={goldBtn} onClick={() => promptInstall()}>
                Install the app
              </button>
            </>
          ) : (
            <>
              <div style={{ ...body, marginBottom: 8 }}>
                Your browser hasn’t offered an install prompt yet. You can still add it manually:
              </div>
              <ul style={{ ...body, margin: 0, paddingLeft: 18 }}>
                <li><b>Chrome (desktop):</b> click the install icon ⊕ in the address bar, or menu ⋮ → “Install Old World Companion”.</li>
                <li><b>Android / Chrome:</b> menu ⋮ → “Install app”.</li>
                <li><b>iPhone / Safari:</b> Share → “Add to Home Screen”.</li>
              </ul>
            </>
          )}
        </div>

        {/* Appearance */}
        <div style={card}>
          <div style={title}>Appearance</div>
          <div style={{ ...body, marginBottom: 12 }}>Choose a light or dark theme for the app.</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['light', 'dark'] as const).map((m) => {
              const on = mode === m;
              return (
                <button key={m} onClick={() => setTheme(m)} aria-pressed={on}
                  style={{ flex: 1, padding: '11px 14px', borderRadius: 11, cursor: 'pointer', border: `1px solid ${on ? TOW.goldDeep : TOW.lineStrong}`, background: on ? 'rgba(138,108,48,0.14)' : 'transparent', color: on ? TOW.goldDeep : TOW.parchDim, fontFamily: towFont.display, fontWeight: 600, fontSize: 14.5 }}>
                  {m === 'light' ? 'Light' : 'Dark'}
                </button>
              );
            })}
          </div>
        </div>

        {/* Updates */}
        <div style={card}>
          <div style={title}>Updates</div>
          {needRefresh ? (
            <>
              <div style={{ ...body, marginBottom: 12, color: TOW.ink }}>A new version is ready.</div>
              <button style={goldBtn} onClick={updateApp}>
                Update now
              </button>
            </>
          ) : (
            <>
              <div style={{ ...body, marginBottom: 12 }}>
                The app updates itself automatically. You can also check now.
              </div>
              <button style={{ ...ghostBtn, opacity: checking ? 0.6 : 1 }} onClick={onCheck} disabled={checking}>
                {checking ? 'Checking…' : 'Check for updates'}
              </button>
              {checkedNote && (
                <div style={{ ...body, marginTop: 10, color: TOW.goldDeep }}>{checkedNote}</div>
              )}
            </>
          )}
        </div>

        {/* Account */}
        <AccountSection card={card} title={title} body={body} goldBtn={goldBtn} ghostBtn={ghostBtn} />

        {/* Campaign */}
        <CampaignSection card={card} title={title} body={body} goldBtn={goldBtn} ghostBtn={ghostBtn} />

        {/* Sync army lists */}
        <ListSyncSection card={card} title={title} body={body} goldBtn={goldBtn} ghostBtn={ghostBtn} />

        {/* Feedback */}
        <FeedbackSection card={card} title={title} body={body} goldBtn={goldBtn} ghostBtn={ghostBtn} />

        {/* About */}
        <div style={card}>
          <div style={title}>About</div>
          <div style={body}>
            Rules quoted verbatim from{' '}
            <a href="https://tow.whfb.app/" target="_blank" rel="noreferrer" style={{ color: TOW.goldDeep, textDecoration: 'underline' }}>
              tow.whfb.app
            </a>
            . Unofficial personal-use aid. Warhammer: The Old World © Games Workshop.
          </div>
        </div>

        {/* Version */}
        <div style={card}>
          <div style={title}>Version</div>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
            <span style={{ ...body, color: TOW.ink, fontWeight: 600 }}>v{APP_VERSION}</span>
            <span style={{ fontFamily: towFont.serif, fontSize: 12.5, color: TOW.muted }}>build {BUILD_SHA} · {BUILD_DATE}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Sync your saved army lists + groups across devices with a self-chosen password (no login). The
// password is hashed into the actual sync key (see deriveKey); same password → same syncs.
function ListSyncSection({
  card, title, body, goldBtn, ghostBtn,
}: {
  card: React.CSSProperties; title: React.CSSProperties; body: React.CSSProperties;
  goldBtn: React.CSSProperties; ghostBtn: React.CSSProperties;
}) {
  const sync = useListSync();
  const { user } = useAuth();
  const [pass, setPass] = usePersistentState<string | null>('tow:syncPass', null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [localErr, setLocalErr] = useState<string | null>(null);
  const [reveal, setReveal] = useState(false);
  // Both this device and the password already hold lists → ask which wins.
  const [choice, setChoice] = useState<{ key: string; password: string; cloud: CloudLists } | null>(null);

  const inputStyle: React.CSSProperties = {
    width: '100%', borderRadius: 10, border: `1px solid ${TOW.lineStrong}`, background: TOW.cardLt,
    color: TOW.ink, padding: '10px 12px', fontFamily: towFont.serif, fontSize: 15, boxSizing: 'border-box',
  };

  const finish = (password: string) => { setPass(password); setInput(''); setLocalErr(null); setChoice(null); setReveal(false); };

  const connect = async () => {
    const password = input.trim();
    if (password.length < 4) { setLocalErr('Use at least 4 characters.'); return; }
    setBusy(true); setLocalErr(null);
    try {
      const key = await deriveKey(password);
      const cloud = await sync.peek(key);
      const cloudHas = !!cloud && Array.isArray(cloud.lists) && cloud.lists.length > 0;
      if (cloudHas && sync.listCount > 0) {
        setChoice({ key, password, cloud: cloud! });   // both sides have lists — let the user pick
      } else if (cloudHas) {
        sync.adoptCloud(key, cloud!); finish(password); // this device empty → take the saved lists
      } else {
        await sync.pushMine(key); finish(password);     // nothing saved yet → seed from here
      }
    } catch (e) {
      setLocalErr(e instanceof Error ? e.message : 'Could not connect — check your password and connection.');
    } finally {
      setBusy(false);
    }
  };

  const stop = () => { sync.disconnect(); setPass(null); setReveal(false); };

  const statusText = sync.status === 'syncing' ? 'Syncing…'
    : sync.status === 'error' ? 'Sync error'
    : sync.lastSyncedAt ? `Synced · ${new Date(sync.lastSyncedAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}`
    : 'Connected';
  const statusColor = sync.status === 'error' ? TOW.blood : sync.status === 'synced' ? '#4f6b3a' : TOW.muted;

  return (
    <div style={card}>
      <div style={title}>Sync army lists</div>

      {sync.viaAccount ? (
        // ── Automatic, on the signed-in account ──
        // No password to show or manage: the key is derived from the account, so every device you sign
        // in on lands on the same lists. This is also what makes a campaign list visible to Isle of
        // Celedon, which reads it from the cloud copy.
        <>
          <div style={{ ...body, marginBottom: 10 }}>
            Your lists &amp; groups sync automatically to your account — sign in on another device and they’re
            there. This is also how the campaign reads your army list.
          </div>
          <div style={{ ...eb, fontSize: 8.5, color: statusColor, marginBottom: 12 }}>{statusText} · {sync.listCount} list{sync.listCount === 1 ? '' : 's'}</div>
          {sync.error && <div style={{ ...body, color: TOW.blood, marginBottom: 10 }}>{sync.error}</div>}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button style={{ ...ghostBtn, opacity: sync.status === 'syncing' ? 0.6 : 1 }} disabled={sync.status === 'syncing'} onClick={() => sync.pushNow()}>Upload now</button>
            <button style={{ ...ghostBtn, opacity: sync.status === 'syncing' ? 0.6 : 1 }} disabled={sync.status === 'syncing'} onClick={() => sync.pullNow()}>Fetch now</button>
          </div>
        </>
      ) : sync.key ? (
        // ── Connected with a self-chosen password (the no-login route) ──
        <>
          <div style={{ ...body, marginBottom: 10 }}>
            Your saved lists &amp; groups sync to every device that uses this password. Enter the same password on your other device.
          </div>
          {/* Ingelogd, maar dit apparaat hangt aan een eigen wachtwoord-sleutel. Inloggen stapt daar
              bewust NIET overheen (anders raak je je wachtwoord-lijsten kwijt), maar dat betekende ook
              dat je account-lijsten hier nooit binnenkwamen en uit-en-weer-inloggen niets deed — zonder
              dat iets dat vertelde (Joost 02-08). Nu staat het er, met de overstap ernaast. */}
          {user && sync.useAccountKey && (
            <div style={{ border: `1px solid ${TOW.gold}`, borderRadius: 10, padding: '10px 12px', marginBottom: 10, background: 'rgba(184,134,47,0.08)' }}>
              <div style={{ ...body, marginBottom: 8 }}>
                You’re signed in as <b>{user.email}</b>, but this device syncs on its own password — so the
                lists on your account are <b>not</b> the ones you see here. Signing out and back in will not
                change that.
              </div>
              <button style={{ ...ghostBtn, borderColor: TOW.gold, color: TOW.ink }} onClick={() => sync.useAccountKey?.()}>
                Use my account’s lists instead
              </button>
            </div>
          )}
          {pass ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <code style={{ flex: 1, minWidth: 0, fontFamily: towFont.display, fontWeight: 700, fontSize: 15, color: TOW.ink, background: TOW.cardLt, border: `1px solid ${TOW.lineStrong}`, borderRadius: 10, padding: '10px 12px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{reveal ? pass : '•'.repeat(Math.min(12, Math.max(4, pass.length)))}</code>
              <button style={{ ...ghostBtn, padding: '10px 12px' }} onClick={() => setReveal((r) => !r)}>{reveal ? 'Hide' : 'Show'}</button>
            </div>
          ) : (
            <div style={{ ...body, fontStyle: 'italic', marginBottom: 6 }}>Connected with an older sync key. Stop and reconnect with a password to switch.</div>
          )}
          <div style={{ ...eb, fontSize: 8.5, color: statusColor, marginBottom: 12 }}>{statusText} · {sync.listCount} list{sync.listCount === 1 ? '' : 's'}</div>
          {sync.error && <div style={{ ...body, color: TOW.blood, marginBottom: 10 }}>{sync.error}</div>}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button style={{ ...ghostBtn, opacity: sync.status === 'syncing' ? 0.6 : 1 }} disabled={sync.status === 'syncing'} onClick={() => sync.pushNow()}>Upload now</button>
            <button style={{ ...ghostBtn, opacity: sync.status === 'syncing' ? 0.6 : 1 }} disabled={sync.status === 'syncing'} onClick={() => sync.pullNow()}>Fetch now</button>
            <button style={{ ...ghostBtn, color: TOW.muted, borderColor: TOW.line }} onClick={stop}>Stop syncing</button>
          </div>
        </>
      ) : choice ? (
        // ── Conflict on connect: both this device and the password already have lists ──
        <>
          <div style={{ ...body, marginBottom: 12 }}>
            That password already has <b>{choice.cloud.lists.length}</b> list{choice.cloud.lists.length === 1 ? '' : 's'} saved, and this device has <b>{sync.listCount}</b>. Which should win?
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button style={goldBtn} onClick={() => { sync.adoptCloud(choice.key, choice.cloud); finish(choice.password); }}>
              Use the saved lists (replace this device)
            </button>
            <button style={ghostBtn} onClick={async () => { setBusy(true); try { await sync.pushMine(choice.key); finish(choice.password); } catch (e) { setLocalErr(e instanceof Error ? e.message : 'Failed'); } finally { setBusy(false); } }}>
              Keep this device’s lists (overwrite the saved ones)
            </button>
            <button style={{ ...ghostBtn, color: TOW.muted, borderColor: TOW.line }} onClick={() => setChoice(null)}>Cancel</button>
          </div>
        </>
      ) : (
        // ── Not set up ──
        <>
          <div style={{ ...body, marginBottom: 12 }}>
            Keep your army lists &amp; groups in sync between your phone and computer — no account needed. Pick a password, then enter the same one on your other device.
          </div>
          <input type="password" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && connect()} placeholder="Choose a sync password" style={{ ...inputStyle, marginBottom: 8 }} />
          <button style={{ ...goldBtn, width: '100%', opacity: input.trim().length < 4 || busy ? 0.5 : 1 }} disabled={input.trim().length < 4 || busy} onClick={connect}>{busy ? 'Connecting…' : 'Sync with this password'}</button>
          {localErr && <div style={{ ...body, color: TOW.blood, marginTop: 8 }}>{localErr}</div>}
          <div style={{ fontFamily: towFont.serif, fontSize: 12, color: TOW.muted, marginTop: 10, lineHeight: 1.45 }}>
            Anyone who knows this password can see and change your lists, so pick something only you would use. It’s the only secret — there’s no account to recover it.
          </div>
        </>
      )}
    </div>
  );
}

// Optional Supabase Auth (email + password) — sign in with the SAME account as the campaign, the
// basis for the account-based coupling. Login is never required: the army builder is local, so this
// section only ever unlocks the future campaign link, it doesn't gate anything here.
function AccountSection({
  card, title, body, goldBtn, ghostBtn,
}: {
  card: React.CSSProperties; title: React.CSSProperties; body: React.CSSProperties;
  goldBtn: React.CSSProperties; ghostBtn: React.CSSProperties;
}) {
  const { user, loading } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const inputStyle: React.CSSProperties = {
    width: '100%', borderRadius: 10, border: `1px solid ${TOW.lineStrong}`, background: TOW.cardLt,
    color: TOW.ink, padding: '10px 12px', fontFamily: towFont.serif, fontSize: 15, boxSizing: 'border-box',
  };

  const canSubmit = !!email.trim() && password.length > 0 && !busy;

  const submit = async () => {
    if (!canSubmit) return;
    const mail = email.trim();
    if (mode === 'signup' && password.length < 6) { setError('Password too short — use at least 6 characters.'); return; }
    setBusy(true); setError(null); setNotice(null);
    try {
      if (mode === 'signup') {
        const { error: err, needsConfirmation } = await authSignUp(mail, password);
        if (err) { setError(err); }
        else if (needsConfirmation) {
          setNotice('Account created. Check your email to confirm, then sign in.');
          setPassword(''); setMode('signin');
        }
        // else: confirmation off → onAuthStateChange flips this section to the signed-in view.
      } else {
        const { error: err } = await authSignIn(mail, password);
        if (err) setError(err);
        // success → onAuthStateChange updates the view; clear the password either way.
        else setPassword('');
      }
    } catch {
      setError('Something went wrong — please try again.');
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    setBusy(true); setError(null); setNotice(null);
    try {
      const { error: err } = await authSignOut();
      if (err) setError(err);
    } finally {
      setBusy(false);
    }
  };

  const switchMode = (m: 'signin' | 'signup') => { setMode(m); setError(null); setNotice(null); };

  return (
    <div style={card}>
      <div style={title}>Account</div>

      {user ? (
        // ── Signed in ──
        <>
          <div style={{ ...eb, fontSize: 8.5, color: TOW.goldDeep, marginBottom: 6 }}>Signed in as</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <span style={{ width: 11, height: 11, borderRadius: 99, background: TOW.goldDeep, border: `1px solid ${TOW.line}`, flexShrink: 0 }} />
            <span style={{ ...body, color: TOW.ink, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.email}</span>
          </div>
          <div style={{ ...body, marginBottom: 12 }}>
            This is the account the companion links to your campaign profile. Signing out only affects the account — your saved army lists stay on this device.
          </div>
          <button style={{ ...ghostBtn, color: TOW.muted, borderColor: TOW.line, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={signOut}>
            {busy ? 'Signing out…' : 'Sign out'}
          </button>
          {error && <div style={{ ...body, color: TOW.blood, marginTop: 10 }}>{error}</div>}
        </>
      ) : (
        // ── Signed out ──
        <>
          <div style={{ ...body, marginBottom: 12 }}>
            Sign in with the same account as your Grensvorsten campaign. Optional — the army builder works without an account; this just links the companion to your player profile.
          </div>

          {/* Sign in / Register toggle — mirrors the Appearance toggle. */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            {(['signin', 'signup'] as const).map((m) => {
              const on = mode === m;
              return (
                <button key={m} onClick={() => switchMode(m)} aria-pressed={on}
                  style={{ flex: 1, padding: '10px 14px', borderRadius: 11, cursor: 'pointer', border: `1px solid ${on ? TOW.goldDeep : TOW.lineStrong}`, background: on ? 'rgba(138,108,48,0.14)' : 'transparent', color: on ? TOW.goldDeep : TOW.parchDim, fontFamily: towFont.display, fontWeight: 600, fontSize: 14 }}>
                  {m === 'signin' ? 'Sign in' : 'Register'}
                </button>
              );
            })}
          </div>

          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="Email"
            style={{ ...inputStyle, marginBottom: 8 }}
          />
          <input
            type="password"
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="Password"
            style={{ ...inputStyle, marginBottom: 8 }}
          />
          <button style={{ ...goldBtn, width: '100%', opacity: canSubmit ? 1 : 0.5 }} disabled={!canSubmit} onClick={submit}>
            {busy ? (mode === 'signup' ? 'Creating…' : 'Signing in…') : loading ? 'Please wait…' : (mode === 'signup' ? 'Create account' : 'Sign in')}
          </button>

          {error && <div style={{ ...body, color: TOW.blood, marginTop: 10 }}>{error}</div>}
          {notice && <div style={{ ...body, color: TOW.goldDeep, marginTop: 10 }}>{notice}</div>}
        </>
      )}
    </div>
  );
}

// Your campaign(s) on Isle of Celedon. Nothing to link by hand any more: signing in with the same
// account as the campaign site IS the coupling (see lib/campaign.ts). One account can hold more than
// one campaign — your own preparation for the real campaign, plus a slot in the grensmaster's
// playtest game — so this section can offer a choice. With one campaign there is nothing to choose
// and no picker appears.
function CampaignSection({
  card, title, body, goldBtn, ghostBtn,
}: {
  card: React.CSSProperties; title: React.CSSProperties; body: React.CSSProperties;
  goldBtn: React.CSSProperties; ghostBtn: React.CSSProperties;
}) {
  const { user } = useAuth();
  const { campagnes, actief: ctx, laden, fout } = useCampagnes();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listsRaw, setListsRaw] = usePersistentState<unknown[]>('tow:lists', []);
  // Hernoem-editor: welke register-unit staat open (naam-slug) + het concept.
  const [hernoemId, setHernoemId] = useState<string | null>(null);
  const [hernoemNaam, setHernoemNaam] = useState('');

  const messageFor = (e: unknown): string => {
    if (e instanceof Error && e.message) return e.message;
    return 'Could not reach the campaign — check your connection.';
  };

  const refresh = async () => {
    if (busy) return;
    setBusy(true); setError(null);
    await verversCampagnes();
    setBusy(false);
  };

  // Hernoem een veteraan: de server hernoemt de register-rij én de cloud-lijsten (XP/abilities/
  // scars reizen mee); daarna trekken we de lokale lijsten gelijk en verversen we de context.
  // Vereist de koppelcode van een game-slot — een voorbereiding heeft nog geen regimenten.
  const hernoem = async (unitId: string) => {
    const naam = hernoemNaam.trim();
    const code = ctx?.koppelcode;
    if (!code || !naam || busy) return;
    setBusy(true); setError(null);
    try {
      const res = await hernoemRegiment(code, unitId, naam);
      setListsRaw((ls) => (Array.isArray(ls) ? ls : []).map((raw) => {
        const l = raw as { campaign?: boolean; entries?: { customName?: string }[] };
        if (!l || typeof l !== 'object' || !l.campaign || !Array.isArray(l.entries)) return raw;
        return { ...l, entries: l.entries.map((e) => (regimentSlug(e?.customName ?? '') === unitId ? { ...e, customName: res.naam } : e)) };
      }));
      setHernoemId(null); setHernoemNaam('');
      await verversCampagnes();
    } catch (e) {
      setError(e instanceof Error && e.message === 'NAAM_BESTAAT_AL'
        ? 'That name is already taken by another regiment.'
        : messageFor(e));
    } finally {
      setBusy(false);
    }
  };

  // Je campagne-lijsten uit tow:lists, gefilterd op DEZE campagne-speler (lijsten zonder speler-tag
  // laten we staan — die komen uit een oudere versie). Oplopend op fase.
  type CampLijst = { id?: string; name?: string; points?: number; entries?: unknown[]; campaign?: boolean; campaignSpeler?: string; campaignFase?: number };
  const campaignLists = (Array.isArray(listsRaw) ? (listsRaw as CampLijst[]) : [])
    .filter((l) => l && l.campaign && l.id && (!ctx?.speler.id || !l.campaignSpeler || l.campaignSpeler === ctx.speler.id))
    .sort((a, b) => (a.campaignFase ?? 0) - (b.campaignFase ?? 0));

  return (
    <div style={card}>
      <div style={title}>Campaign</div>

      {!user ? (
        <div style={body}>
          Sign in above with your <b style={{ color: TOW.ink }}>Isle of Celedon</b> account and your campaign appears
          here by itself — same email and password as the campaign site. There is no code to enter any more.
        </div>
      ) : laden && !ctx ? (
        <div style={body}>Looking for your campaign…</div>
      ) : !ctx ? (
        <>
          <div style={{ ...body, marginBottom: 10 }}>
            This account isn’t part of a campaign yet. Sign up on the campaign site and confirm your faction there —
            after that it shows up here on its own.
          </div>
          {fout && <div style={{ ...body, color: TOW.blood, marginBottom: 10 }}>{fout}</div>}
          <button style={{ ...ghostBtn, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={refresh}>
            {busy ? 'Checking…' : 'Check again'}
          </button>
        </>
      ) : (
        <>
          {/* Meer dan één campagne ⇒ kiezen. Anders is er niets te kiezen en tonen we geen kiezer. */}
          {campagnes.length > 1 && (
            <>
              <div style={{ ...eb, fontSize: 8.5, color: TOW.goldDeep, marginBottom: 6 }}>Which campaign</div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                {campagnes.map((c) => {
                  const on = c.key === ctx.key;
                  return (
                    <button key={c.key} onClick={() => kiesCampagne(c.key)} aria-pressed={on}
                      style={{ flex: 1, padding: '10px 12px', borderRadius: 11, cursor: on ? 'default' : 'pointer', border: `1px solid ${on ? TOW.goldDeep : TOW.lineStrong}`, background: on ? 'rgba(138,108,48,0.14)' : 'transparent', color: on ? TOW.goldDeep : TOW.parchDim, fontFamily: towFont.display, fontWeight: 600, fontSize: 13.5 }}>
                      {c.label}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            {ctx.speler.kleur && <span style={{ width: 11, height: 11, borderRadius: 99, background: ctx.speler.kleur, border: `1px solid ${TOW.line}`, flexShrink: 0 }} />}
            <span style={{ ...body, color: TOW.ink }}>{ctx.speler.naam} · {ctx.speler.factie || 'no faction yet'}</span>
          </div>
          <div style={{ ...eb, fontSize: 8.5, color: TOW.goldDeep, marginBottom: 4 }}>
            {ctx.label} · Act {ctx.fase} · {ctx.puntenCap} pts
          </div>
          <div style={{ ...body, fontSize: 12.5, color: TOW.muted, marginBottom: 12 }}>
            {ctx.gelockt
              ? `Your Act ${ctx.fase} list is locked — you can look at it, but not change it until Act ${ctx.fase + 1} opens.`
              : 'Linked through your account. Your army lists reach the campaign on their own.'}
          </div>

          {/* Regiment-register: je opgeslagen (named) units in de campagne, mét hun staat van
              dienst. Namen geef je in de army builder — tik een unit in een campagne-lijst aan. */}
          {ctx.units.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ ...eb, fontSize: 8.5, color: TOW.goldDeep, marginBottom: 6 }}>Your regiments</div>
              {ctx.units.map((u) => {
                const rowId = regimentSlug(u.naam);
                const open = hernoemId === rowId;
                return (
                  <div key={u.naam} style={{ marginBottom: open ? 8 : 4, opacity: u.status === 'actief' ? 1 : 0.55 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
                      <span style={{ flex: 1, minWidth: 0, fontFamily: towFont.serif, fontSize: 12.5, color: TOW.ink }}>{u.naam}</span>
                      <span style={{ ...eb, fontSize: 7.5, color: TOW.muted, flexShrink: 0 }}>
                        {u.xp} XP{u.abilities ? ` · ${u.abilities} abl` : ''}{u.littekens ? ` · ${u.littekens} scar${u.littekens === 1 ? '' : 's'}` : ''}{u.status !== 'actief' ? ' · reserve' : ''}
                      </span>
                      {ctx.koppelcode && (
                        <button
                          onClick={() => { setHernoemId(open ? null : rowId); setHernoemNaam(u.naam); }}
                          style={{ flexShrink: 0, border: `1px solid ${TOW.line}`, background: 'transparent', borderRadius: 7, cursor: 'pointer', color: TOW.goldDeep, padding: '2px 8px', ...eb, fontSize: 7 }}
                        >
                          {open ? 'Cancel' : 'Rename'}
                        </button>
                      )}
                    </div>
                    {open && (
                      <div style={{ display: 'flex', gap: 6, marginTop: 5 }}>
                        <input
                          value={hernoemNaam}
                          onChange={(e) => setHernoemNaam(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') void hernoem(rowId); }}
                          maxLength={40}
                          autoFocus
                          style={{ flex: 1, minWidth: 0, borderRadius: 8, border: `1px solid ${TOW.lineStrong}`, background: TOW.cardLt, color: TOW.ink, padding: '7px 10px', fontFamily: towFont.serif, fontSize: 13, boxSizing: 'border-box', outline: 'none' }}
                        />
                        <button
                          disabled={busy || !hernoemNaam.trim()}
                          onClick={() => void hernoem(rowId)}
                          style={{ ...goldBtn, flexShrink: 0, padding: '7px 14px', fontSize: 12, opacity: busy || !hernoemNaam.trim() ? 0.6 : 1 }}
                        >
                          Save
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
              <div style={{ fontFamily: towFont.serif, fontStyle: 'italic', fontSize: 11, color: TOW.faint, marginTop: 6 }}>
                Name units in the army builder: open a campaign list, tap a unit, then tap “Name” next to the close button. Rename here keeps a regiment’s XP — the new name follows it everywhere, including your lists.
              </div>
            </div>
          )}

          {/* Your campaign lists — tik = openen in de Army-builder. */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ ...eb, fontSize: 8.5, color: TOW.goldDeep, marginBottom: 6 }}>Your campaign lists</div>
            {campaignLists.length > 0 ? (
              <>
                {campaignLists.map((l) => (
                  <button key={l.id} onClick={() => { if (!l.id) return; setPersisted('tow:builder-active', l.id); setPersisted('tow:tab', 'army'); }}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left', padding: '9px 11px', borderRadius: 9, cursor: 'pointer', border: `1px solid ${TOW.line}`, background: TOW.cardLt, marginBottom: 5 }}>
                    <span style={{ flex: 1, minWidth: 0, fontFamily: towFont.display, fontWeight: 600, fontSize: 13.5, color: TOW.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.name || 'Untitled list'}</span>
                    <span style={{ ...eb, fontSize: 7.5, color: TOW.muted, flexShrink: 0 }}>
                      {l.points ?? 0} pts · {Array.isArray(l.entries) ? l.entries.length : 0}u
                    </span>
                    <span aria-hidden style={{ color: TOW.goldDeep, fontSize: 15, flexShrink: 0 }}>›</span>
                  </button>
                ))}
                <div style={{ fontFamily: towFont.serif, fontStyle: 'italic', fontSize: 11, color: TOW.faint, marginTop: 2 }}>
                  Tap a list to open it in the Army builder.
                </div>
              </>
            ) : (
              <div style={{ fontFamily: towFont.serif, fontStyle: 'italic', fontSize: 11.5, color: TOW.muted }}>
                No campaign list yet. Open the <b>Army</b> tab — the campaign panel at the top starts it for you, with
                the right points cap and faction already set.
              </div>
            )}
          </div>

          {error && <div style={{ ...body, color: TOW.blood, marginBottom: 10 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button style={{ ...ghostBtn, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={refresh}>{busy ? 'Refreshing…' : 'Refresh'}</button>
            <button style={{ ...ghostBtn, color: TOW.muted, borderColor: TOW.line }}
              onClick={() => { setPersisted('tow:celedon-tour', 'pending'); setPersisted('tow:tab', 'army'); }}>
              Show me around
            </button>
          </div>
        </>
      )}
    </div>
  );
}

interface FeedbackItem {
  id: string;
  message: string;
  contact: string | null;
  app_version: string | null;
  created_at: string;
}

// Feedback inbox: anyone can leave a bug/idea; the messages are not publicly readable.
// The owner can reveal them with a password (checked server-side via an RPC).
function FeedbackSection({
  card,
  title,
  body,
  goldBtn,
  ghostBtn,
}: {
  card: React.CSSProperties;
  title: React.CSSProperties;
  body: React.CSSProperties;
  goldBtn: React.CSSProperties;
  ghostBtn: React.CSSProperties;
}) {
  const [message, setMessage] = useState('');
  const [contact, setContact] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Owner viewer
  const [showGate, setShowGate] = useState(false);
  const [pw, setPw] = useState('');
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<FeedbackItem[] | null>(null);
  const [viewError, setViewError] = useState<string | null>(null);

  const input: React.CSSProperties = {
    width: '100%',
    borderRadius: 10,
    border: `1px solid ${TOW.lineStrong}`,
    background: TOW.cardLt,
    color: TOW.ink,
    padding: '10px 12px',
    fontFamily: towFont.serif,
    fontSize: 14,
    boxSizing: 'border-box',
  };

  const send = async () => {
    if (!message.trim()) return;
    setSending(true);
    setError(null);
    const { error: err } = await supabase
      .from(TOW_FEEDBACK)
      .insert({ message: message.trim(), contact: contact.trim() || null, app_version: BUILD_LABEL });
    setSending(false);
    if (err) setError(err.message);
    else {
      setSent(true);
      setMessage('');
      setContact('');
    }
  };

  const unlock = async () => {
    setLoading(true);
    setViewError(null);
    const { data, error: err } = await supabase.rpc('get_tow_feedback', { pw });
    setLoading(false);
    if (err) {
      setViewError(err.message);
      return;
    }
    const res = data as { authorized: boolean; items: FeedbackItem[] } | null;
    if (res && res.authorized) setItems(res.items || []);
    else setViewError('Incorrect password.');
  };

  return (
    <div style={card}>
      <div style={title}>Feedback</div>
      {sent ? (
        <>
          <div style={{ ...body, color: TOW.goldDeep, marginBottom: 10 }}>✓ Thanks! Your feedback was sent.</div>
          <button style={ghostBtn} onClick={() => setSent(false)}>Send more</button>
        </>
      ) : (
        <>
          <div style={{ ...body, marginBottom: 10 }}>
            Found a bug or have an idea? Let me know — it goes straight to the developer.
          </div>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Your bug report, idea or comment…"
            rows={4}
            style={{ ...input, resize: 'vertical', marginBottom: 8 }}
          />
          <input
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            placeholder="Name or email (optional)"
            style={{ ...input, marginBottom: 10 }}
          />
          <button style={{ ...goldBtn, opacity: !message.trim() || sending ? 0.5 : 1 }} onClick={send} disabled={!message.trim() || sending}>
            {sending ? 'Sending…' : 'Send feedback'}
          </button>
          {error && <div style={{ ...body, color: TOW.blood, marginTop: 10 }}>{error}</div>}
        </>
      )}

      {/* Owner-only viewer */}
      <div style={{ marginTop: 16, paddingTop: 12, borderTop: `1px solid ${TOW.line}` }}>
        {!showGate && items === null ? (
          <button
            onClick={() => setShowGate(true)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: towFont.serif, fontSize: 12.5, color: TOW.muted, textDecoration: 'underline', padding: 0 }}
          >
            Show feedback (owner)
          </button>
        ) : items === null ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ ...eb, fontSize: 8.5, color: TOW.muted }}>Owner password</div>
            <input
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && unlock()}
              placeholder="Password"
              style={input}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={{ ...goldBtn, flex: 1, opacity: loading ? 0.5 : 1 }} onClick={unlock} disabled={loading}>
                {loading ? 'Unlocking…' : 'Show feedback'}
              </button>
              <button style={ghostBtn} onClick={() => { setShowGate(false); setPw(''); setViewError(null); }}>Cancel</button>
            </div>
            {viewError && <div style={{ ...body, color: TOW.blood }}>{viewError}</div>}
          </div>
        ) : (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ ...eb, fontSize: 8.5, color: TOW.goldDeep }}>Feedback · {items!.length}</span>
              <button
                onClick={() => { setItems(null); setShowGate(false); setPw(''); }}
                style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', fontFamily: towFont.serif, fontSize: 12.5, color: TOW.muted, textDecoration: 'underline' }}
              >
                Hide
              </button>
            </div>
            {items!.length === 0 ? (
              <div style={{ ...body, fontStyle: 'italic' }}>No feedback yet.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {items!.map((f) => (
                  <div key={f.id} style={{ border: `1px solid ${TOW.line}`, borderRadius: 10, background: TOW.cardLt, padding: '10px 12px' }}>
                    <div style={{ fontFamily: towFont.serif, fontSize: 13.5, color: TOW.ink, whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>{f.message}</div>
                    <div style={{ fontFamily: towFont.serif, fontSize: 11.5, color: TOW.muted, marginTop: 6 }}>
                      {new Date(f.created_at).toLocaleString()}
                      {f.contact ? ` · ${f.contact}` : ''}
                      {f.app_version ? ` · v${f.app_version}` : ''}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
