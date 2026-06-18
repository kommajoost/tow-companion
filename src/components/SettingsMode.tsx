import { useState } from 'react';
import { TOW, towFont, engraved } from '../design/tow';
import { useTheme } from '../theme';
import { usePwa } from '../pwa';
import { supabase, TOW_FEEDBACK } from '../lib/supabase';
import { useListSync } from '../listSync';
import type { CloudLists } from '../lib/listSync';
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

// Sync your saved army lists across devices with a shared key (no login). See src/listSync.tsx.
function ListSyncSection({
  card, title, body, goldBtn, ghostBtn,
}: {
  card: React.CSSProperties; title: React.CSSProperties; body: React.CSSProperties;
  goldBtn: React.CSSProperties; ghostBtn: React.CSSProperties;
}) {
  const sync = useListSync();
  const [showConnect, setShowConnect] = useState(false);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [localErr, setLocalErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // When connecting to a key that already has lists while THIS device also has lists, ask which wins.
  const [choice, setChoice] = useState<{ key: string; cloud: CloudLists } | null>(null);

  const input2: React.CSSProperties = {
    width: '100%', borderRadius: 10, border: `1px solid ${TOW.lineStrong}`, background: TOW.cardLt,
    color: TOW.ink, padding: '10px 12px', fontFamily: towFont.display, fontSize: 15, letterSpacing: '0.12em',
    boxSizing: 'border-box', textTransform: 'uppercase',
  };

  const copyKey = () => {
    if (!sync.key) return;
    navigator.clipboard?.writeText(sync.key).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1500); }).catch(() => {});
  };

  const connect = async () => {
    if (!input.trim()) return;
    setBusy(true); setLocalErr(null);
    try {
      const cloud = await sync.peek(input);
      const cloudHas = cloud && Array.isArray(cloud.lists) && cloud.lists.length > 0;
      if (cloudHas && sync.listCount > 0) {
        setChoice({ key: input, cloud: cloud! }); // both sides have lists — let the user pick
      } else if (cloudHas) {
        sync.adoptCloud(input, cloud!);            // this device empty → take the cloud's lists
        setShowConnect(false); setInput('');
      } else {
        await sync.pushMine(input);                // key empty on the server → seed it from here
        setShowConnect(false); setInput('');
      }
    } catch (e) {
      setLocalErr(e instanceof Error ? e.message : 'Could not connect — check the key and your connection.');
    } finally {
      setBusy(false);
    }
  };

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
            Your saved lists sync across every device that uses this key. Enter the same key on your other device.
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <code style={{ flex: 1, minWidth: 0, fontFamily: towFont.display, fontWeight: 700, fontSize: 16, letterSpacing: '0.12em', color: TOW.ink, background: TOW.cardLt, border: `1px solid ${TOW.lineStrong}`, borderRadius: 10, padding: '10px 12px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sync.key}</code>
            <button style={{ ...ghostBtn, padding: '10px 12px' }} onClick={copyKey}>{copied ? 'Copied ✓' : 'Copy'}</button>
          </div>
          <div style={{ ...eb, fontSize: 8.5, color: statusColor, marginBottom: 12 }}>{statusText} · {sync.listCount} list{sync.listCount === 1 ? '' : 's'}</div>
          {sync.error && <div style={{ ...body, color: TOW.blood, marginBottom: 10 }}>{sync.error}</div>}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button style={{ ...ghostBtn, opacity: sync.status === 'syncing' ? 0.6 : 1 }} disabled={sync.status === 'syncing'} onClick={() => sync.pushNow()}>Upload now</button>
            <button style={{ ...ghostBtn, opacity: sync.status === 'syncing' ? 0.6 : 1 }} disabled={sync.status === 'syncing'} onClick={() => sync.pullNow()}>Fetch now</button>
            <button style={{ ...ghostBtn, color: TOW.muted, borderColor: TOW.line }} onClick={() => sync.disconnect()}>Stop syncing</button>
          </div>
        </>
      ) : choice ? (
        // ── Conflict on connect: both this device and the key already have lists ──
        <>
          <div style={{ ...body, marginBottom: 12 }}>
            That key already has <b>{choice.cloud.lists.length}</b> list{choice.cloud.lists.length === 1 ? '' : 's'}, and this device has <b>{sync.listCount}</b>. Which should win?
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button style={goldBtn} onClick={() => { sync.adoptCloud(choice.key, choice.cloud); setChoice(null); setShowConnect(false); setInput(''); }}>
              Use the cloud’s lists (replace this device)
            </button>
            <button style={ghostBtn} onClick={async () => { setBusy(true); try { await sync.pushMine(choice.key); setChoice(null); setShowConnect(false); setInput(''); } catch (e) { setLocalErr(e instanceof Error ? e.message : 'Failed'); } finally { setBusy(false); } }}>
              Keep this device’s lists (overwrite the cloud)
            </button>
            <button style={{ ...ghostBtn, color: TOW.muted, borderColor: TOW.line }} onClick={() => setChoice(null)}>Cancel</button>
          </div>
        </>
      ) : (
        // ── Not set up ──
        <>
          <div style={{ ...body, marginBottom: 12 }}>
            Keep your saved army lists in sync between your phone and computer — no account needed. Create a key here, then enter it on your other device.
          </div>
          <button style={goldBtn} onClick={() => sync.createKey()}>Create a sync key</button>
          <div style={{ ...eb, fontSize: 8, color: TOW.faint, textAlign: 'center', margin: '12px 0' }}>— or —</div>
          {showConnect ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && connect()} placeholder="ABCD-EFGH-…" style={input2} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={{ ...goldBtn, flex: 1, opacity: !input.trim() || busy ? 0.5 : 1 }} disabled={!input.trim() || busy} onClick={connect}>{busy ? 'Connecting…' : 'Connect'}</button>
                <button style={ghostBtn} onClick={() => { setShowConnect(false); setInput(''); setLocalErr(null); }}>Cancel</button>
              </div>
              {localErr && <div style={{ ...body, color: TOW.blood }}>{localErr}</div>}
            </div>
          ) : (
            <button style={{ ...ghostBtn, width: '100%' }} onClick={() => setShowConnect(true)}>I already have a key</button>
          )}
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
