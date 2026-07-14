import { useEffect, useState } from 'react';
import { TOW, towFont, engraved } from '../design/tow';
import { useTheme } from '../theme';
import { usePwa } from '../pwa';
import { supabase, TOW_FEEDBACK } from '../lib/supabase';
import { useAuth, authSignIn, authSignUp, authSignOut } from '../lib/auth';
import { useListSync } from '../listSync';
import { deriveKey, type CloudLists } from '../lib/listSync';
import {
  koppelCampagne, koppelMetWachtwoord, koppelViaAccount, versCampagneContext, cacheCampaignContext, getCachedCampaign, clearCampaignCache,
  eigenSyncKey, hernoemRegiment, regimentSlug,
  type CampaignContext,
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

      {sync.key ? (
        // ── Connected ──
        <>
          <div style={{ ...body, marginBottom: 10 }}>
            Your saved lists &amp; groups sync to every device that uses this password. Enter the same password on your other device.
          </div>
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

// Link this app to a "De Grensvorsten" campaign with a short code from the campaign app. Once linked
// we cache the returned context (phase, points cap, the player's faction) and can refresh it. If the
// user also syncs lists, we pass the derived sync key so the campaign can tie the two together.
function CampaignSection({
  card, title, body, goldBtn, ghostBtn,
}: {
  card: React.CSSProperties; title: React.CSSProperties; body: React.CSSProperties;
  goldBtn: React.CSSProperties; ghostBtn: React.CSSProperties;
}) {
  const { user } = useAuth();
  const [code, setCode] = usePersistentState<string | null>('tow:campaignCode', null);
  const [input, setInput] = useState('');
  // Wachtwoord-koppeling: alternatief voor de 6-teken-code — koppelt op je campagne-profiel.
  const [wachtwoord, setWachtwoord] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ctx, setCtx] = useState<CampaignContext | null>(() => getCachedCampaign()?.context ?? null);
  // Account-koppeling: automatisch koppelen zodra je bent ingelogd (geen code nodig). `viaAccount`
  // = we koppelden via het account; `accountResolved` = de account-poging is afgerond (succes of
  // niet) zodat de fallback-UI niet flikkert terwijl de koppeling nog laadt.
  const [viaAccount, setViaAccount] = useState(false);
  const [accountResolved, setAccountResolved] = useState(false);
  const [listsRaw, setListsRaw] = usePersistentState<unknown[]>('tow:lists', []);
  // Hernoem-editor: welke register-unit staat open (naam-slug) + het concept.
  const [hernoemId, setHernoemId] = useState<string | null>(null);
  const [hernoemNaam, setHernoemNaam] = useState('');

  // De ECHTE list-sync-key (tow:syncKey) — random gegenereerd of wachtwoord-afgeleid; de campagne
  // koppelt op precies deze key, dus nooit zelf opnieuw uit het wachtwoord afleiden.
  const syncKeyFor = async (): Promise<string | null> => eigenSyncKey();

  // Bij mount (niet-ingelogd): is er een code maar geen context in het geheugen, probeer eerst de
  // cache en anders stil verversen. Ingelogd? Dan drijft de account-effect hieronder de refresh, dus
  // sla deze over. Faalt de stille refresh, laat de gekoppelde staat gewoon zonder foutmelding.
  useEffect(() => {
    if (!code || ctx || user) return;
    const cached = getCachedCampaign();
    if (cached) { setCtx(cached.context); return; }
    let alive = true;
    versCampagneContext(code)
      .then((fresh) => { if (alive) { setCtx(fresh); cacheCampaignContext(fresh); } })
      .catch(() => { /* stil: gekoppeld blijven, gebruiker kan handmatig verversen */ });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  // Ingelogd? Koppel automatisch via het account (auth.uid() → geclaimd factie-slot). Draait bij het
  // openen én bij in-/uitloggen (keyt op user.id). Faalt dit (bv. GEEN_SLOT), val dan stil terug op
  // de handmatige code/wachtwoord-koppeling. Zet en passant cloud-sync aan met een account-afgeleide
  // sleutel als die er nog niet is, zodat de campagne je lijsten via het account terugvindt.
  useEffect(() => {
    if (!user) { setViaAccount(false); setAccountResolved(false); return; }
    let alive = true;
    setAccountResolved(false);
    (async () => {
      try {
        const fresh = await koppelViaAccount();
        if (!alive) return;
        cacheCampaignContext(fresh);
        setCtx(fresh);
        setViaAccount(true);
        setError(null);
        if (fresh.koppelcode) setCode(fresh.koppelcode);
        // Nog geen list-sync? Leid een stabiele sleutel af van het account en zet 'm via de store —
        // de ListSyncProvider pikt de nieuwe key op en pusht je lijsten (de server tagt ze op
        // auth.uid()). Een BESTAANDE sync-key laten we ongewijzigd.
        if (!eigenSyncKey()) {
          try { setPersisted('tow:syncKey', await deriveKey(user.id)); }
          catch { /* sync-key is optioneel: zonder blijft de lijstbouwer lokaal werken */ }
        }
      } catch {
        // NIET_INGELOGD / GEEN_SLOT: geen melding — de fallback-koppeling verschijnt vanzelf.
        if (alive) setViaAccount(false);
      } finally {
        if (alive) setAccountResolved(true);
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const messageFor = (e: unknown): string => {
    if (e instanceof Error) {
      if (e.message === 'ONBEKENDE_CODE') return 'Unknown code — check the campaign app.';
      if (e.message) return e.message;
    }
    return 'Could not link — check your connection.';
  };

  const link = async () => {
    if (input.length !== 6 || busy) return;
    setBusy(true); setError(null);
    try {
      const syncKey = await syncKeyFor();
      const fresh = await koppelCampagne(input, syncKey);
      cacheCampaignContext(fresh);
      setCtx(fresh);
      setCode(input);
      setInput('');
    } catch (e) {
      setError(messageFor(e));
    } finally {
      setBusy(false);
    }
  };

  // Koppel op je campagne-wachtwoord i.p.v. de code. De server vindt je speler en geeft de context
  // incl. `koppelcode` terug — die bewaren we als code zodat latere (code-gebaseerde) refreshes werken.
  const linkMetWachtwoord = async () => {
    const wachtw = wachtwoord.trim();
    if (wachtw.length < 4 || busy) return;
    setBusy(true); setError(null);
    try {
      const fresh = await koppelMetWachtwoord(wachtw);
      if (!fresh.koppelcode) { setError('Could not link — try the code instead.'); return; }
      cacheCampaignContext(fresh);
      setCtx(fresh);
      setCode(fresh.koppelcode);
      setWachtwoord('');
    } catch (e) {
      if (e instanceof Error && e.message === 'ONBEKEND_WACHTWOORD') {
        setError('No player found with this password — create your profile in the campaign app first.');
      } else if (e instanceof Error && e.message === 'WACHTWOORD_TE_KORT') {
        setError('Password too short — use at least 4 characters.');
      } else {
        setError(messageFor(e));
      }
    } finally {
      setBusy(false);
    }
  };

  const refresh = async () => {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      // Ingelogd via account → ververs via het account; anders via de opgeslagen code.
      const fresh = viaAccount ? await koppelViaAccount() : code ? await versCampagneContext(code) : null;
      if (fresh) {
        cacheCampaignContext(fresh);
        setCtx(fresh);
        if (viaAccount && fresh.koppelcode) setCode(fresh.koppelcode);
      }
    } catch (e) {
      setError(messageFor(e));
    } finally {
      setBusy(false);
    }
  };

  const unlink = () => {
    clearCampaignCache();
    setCode(null);
    setCtx(null);
    setError(null);
  };

  // Hernoem een veteraan: de server hernoemt de register-rij én de cloud-lijsten (XP/abilities/
  // scars reizen mee); daarna trekken we de lokale lijsten gelijk en verversen we de context.
  const hernoem = async (unitId: string) => {
    const naam = hernoemNaam.trim();
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
      const fresh = await versCampagneContext(code);
      cacheCampaignContext(fresh);
      setCtx(fresh);
    } catch (e) {
      setError(e instanceof Error && e.message === 'NAAM_BESTAAT_AL'
        ? 'That name is already taken by another regiment.'
        : messageFor(e));
    } finally {
      setBusy(false);
    }
  };

  // Zelfde input-stijl als de list-sync-sectie.
  const inputStyle: React.CSSProperties = {
    width: '100%', borderRadius: 10, border: `1px solid ${TOW.lineStrong}`, background: TOW.cardLt,
    color: TOW.ink, padding: '10px 12px', fontFamily: towFont.serif, fontSize: 15, boxSizing: 'border-box',
  };

  // Je campagne-lijsten: de met de "Campaign list"-toggle gebouwde lijsten (tow:lists), gefilterd op
  // DEZE campagne-speler. Ouder-zonder-speler laten we staan. Oplopend op fase.
  type CampLijst = { id?: string; name?: string; points?: number; entries?: unknown[]; campaign?: boolean; campaignSpeler?: string; campaignFase?: number };
  const campaignLists = (Array.isArray(listsRaw) ? (listsRaw as CampLijst[]) : [])
    .filter((l) => l && l.campaign && l.id && (!ctx?.speler.id || !l.campaignSpeler || l.campaignSpeler === ctx.speler.id))
    .sort((a, b) => (a.campaignFase ?? 0) - (b.campaignFase ?? 0));

  return (
    <div style={card}>
      <div style={title}>Campaign</div>

      {(viaAccount || code) ? (
        // ── Linked (via je account of via een code) ──
        <>
          {ctx ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ width: 11, height: 11, borderRadius: 99, background: ctx.speler.kleur, border: `1px solid ${TOW.line}`, flexShrink: 0 }} />
                <span style={{ ...body, color: TOW.ink }}>{ctx.speler.naam} · {ctx.speler.factie}</span>
              </div>
              {viaAccount && (
                <div style={{ ...body, fontSize: 12.5, color: TOW.muted, marginBottom: 8 }}>
                  Linked to {ctx.speler.naam} ({ctx.speler.factie}) via your account
                </div>
              )}
              <div style={{ ...eb, fontSize: 8.5, color: TOW.goldDeep, marginBottom: 12 }}>Phase {ctx.fase} · {ctx.puntenCap} pts</div>
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
                          <button
                            onClick={() => { setHernoemId(open ? null : rowId); setHernoemNaam(u.naam); }}
                            style={{ flexShrink: 0, border: `1px solid ${TOW.line}`, background: 'transparent', borderRadius: 7, cursor: 'pointer', color: TOW.goldDeep, padding: '2px 8px', ...eb, fontSize: 7 }}
                          >
                            {open ? 'Cancel' : 'Rename'}
                          </button>
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

              {/* Your campaign lists — de met de "Campaign list"-toggle gebouwde lijsten; tik = openen in de Army-builder. */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ ...eb, fontSize: 8.5, color: TOW.goldDeep, marginBottom: 6 }}>Your campaign lists</div>
                {campaignLists.length > 0 ? (
                  <>
                    {campaignLists.map((l) => (
                      <button key={l.id} onClick={() => { if (!l.id) return; setPersisted('tow:builder-active', l.id); setPersisted('tow:tab', 'army'); }}
                        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left', padding: '9px 11px', borderRadius: 9, cursor: 'pointer', border: `1px solid ${TOW.line}`, background: TOW.cardLt, marginBottom: 5 }}>
                        <span style={{ flex: 1, minWidth: 0, fontFamily: towFont.display, fontWeight: 600, fontSize: 13.5, color: TOW.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.name || 'Untitled list'}</span>
                        <span style={{ ...eb, fontSize: 7.5, color: TOW.muted, flexShrink: 0 }}>
                          {l.campaignFase ? `Ph ${l.campaignFase} · ` : ''}{l.points ?? 0} pts · {Array.isArray(l.entries) ? l.entries.length : 0}u
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
                    No campaign lists yet. In the Army tab, tap "New list" and turn on "Campaign list" — it locks the list to this phase's cap and composition.
                  </div>
                )}
              </div>
            </>
          ) : (
            <div style={{ ...body, marginBottom: 12 }}>Linked. Refresh to load your campaign details.</div>
          )}
          {error && <div style={{ ...body, color: TOW.blood, marginBottom: 10 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button style={{ ...ghostBtn, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={refresh}>{busy ? 'Refreshing…' : 'Refresh'}</button>
            {/* Account-koppeling is automatisch — geen Unlink; alleen de handmatige code-koppeling ontkoppel je. */}
            {!viaAccount && <button style={{ ...ghostBtn, color: TOW.muted, borderColor: TOW.line }} onClick={unlink}>Unlink</button>}
          </div>
        </>
      ) : (user && !accountResolved) ? (
        // ── Ingelogd: account-koppeling wordt opgehaald ──
        <div style={{ ...body }}>Linking via your account…</div>
      ) : (
        // ── Not linked (fallback: code of campagne-wachtwoord) ──
        <>
          {user && (
            <div style={{ ...body, marginBottom: 12, fontStyle: 'italic', color: TOW.muted }}>
              No campaign profile is linked to this account yet. Claim your faction in the campaign app, or link manually below.
            </div>
          )}
          <div style={{ ...body, marginBottom: 12 }}>
            Link this app to a Grensvorsten campaign. Link with your campaign password, or ask the campaign app for your link code, under Army.
          </div>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value.toUpperCase().slice(0, 6))}
            onKeyDown={(e) => e.key === 'Enter' && link()}
            placeholder="ABC123"
            style={{ ...inputStyle, marginBottom: 8 }}
          />
          <button style={{ ...goldBtn, width: '100%', opacity: input.length !== 6 || busy ? 0.5 : 1 }} disabled={input.length !== 6 || busy} onClick={link}>
            {busy ? 'Linking…' : 'Link campaign'}
          </button>

          {/* Scheiding + alternatieve wachtwoord-flow (koppelt op je campagne-profiel). */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '14px 0' }}>
            <span style={{ flex: 1, height: 1, background: TOW.line }} />
            <span style={{ ...eb, fontSize: 8, color: TOW.muted }}>or</span>
            <span style={{ flex: 1, height: 1, background: TOW.line }} />
          </div>
          <div style={{ ...eb, fontSize: 8.5, color: TOW.goldDeep, marginBottom: 6 }}>Campaign password</div>
          <input
            type="password"
            value={wachtwoord}
            onChange={(e) => setWachtwoord(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && linkMetWachtwoord()}
            placeholder="Your campaign password"
            style={{ ...inputStyle, marginBottom: 8 }}
          />
          <button style={{ ...goldBtn, width: '100%', opacity: wachtwoord.trim().length < 4 || busy ? 0.5 : 1 }} disabled={wachtwoord.trim().length < 4 || busy} onClick={linkMetWachtwoord}>
            {busy ? 'Linking…' : 'Link with password'}
          </button>
          <div style={{ fontFamily: towFont.serif, fontStyle: 'italic', fontSize: 11, color: TOW.faint, marginTop: 8, lineHeight: 1.45 }}>
            Tip: use the same password for Sync lists above — the campaign then reads your army lists automatically.
          </div>

          {error && <div style={{ ...body, color: TOW.blood, marginTop: 8 }}>{error}</div>}
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
