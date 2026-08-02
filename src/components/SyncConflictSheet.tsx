import { useState } from 'react';
import { useListSync } from '../listSync';
import { TOW, towFont, engraved } from '../design/tow';

const eb = engraved as React.CSSProperties;

/**
 * "Which copy do you want to keep?" — shown when syncing would DELETE lists.
 *
 * Before this existed the pull adopted the cloud silently. That is right almost always: the cloud is
 * the shared truth and a second device should follow it. It is wrong in exactly one case, and that
 * case cost a real evening's work — a device that already holds lists gets a key for the first time
 * (typically by signing in), and its own lists disappear without a word. The push is last-write-wins,
 * so a moment later the other side is gone too.
 *
 * So this asks only when lists would actually be LOST: ids present here and absent in the cloud. A
 * cloud that merely has extra lists, or a list edited elsewhere, still flows through without a
 * dialogue — otherwise every ordinary edit on a second device would raise one and everyone would
 * learn to dismiss it on sight.
 *
 * There is no "cancel": leaving it open is the one state that must not persist, because nothing syncs
 * while the question stands. Both answers are safe now — the server keeps the last few versions of
 * every key, so the copy not chosen can still be brought back.
 */
export function SyncConflictSheet(): React.JSX.Element | null {
  const { conflict, resolveConflict } = useListSync();
  const [bezig, setBezig] = useState<'cloud' | 'hier' | null>(null);
  if (!conflict) return null;

  const { verdwijnen, hier, daar } = conflict;
  const kies = async (keuze: 'cloud' | 'hier') => {
    setBezig(keuze);
    try { await resolveConflict(keuze); } finally { setBezig(null); }
  };

  const knop: React.CSSProperties = {
    width: '100%', padding: '11px 14px', borderRadius: 10, cursor: 'pointer',
    fontFamily: towFont.display, fontWeight: 600, fontSize: 14, textAlign: 'left',
    display: 'flex', flexDirection: 'column', gap: 2,
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(30,20,8,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div style={{
        width: '100%', maxWidth: 430, maxHeight: '85vh', overflowY: 'auto',
        background: TOW.panel2, border: `1px solid ${TOW.lineStrong}`, borderRadius: 16, padding: 18,
      }}>
        <div style={{ ...eb, fontSize: 8.5, color: TOW.gold, marginBottom: 6 }}>Sync — which copy?</div>
        <h2 style={{ margin: '0 0 8px', fontFamily: towFont.display, fontWeight: 700, fontSize: 18, color: TOW.ink }}>
          {verdwijnen.length === 1 ? 'One list is only on this device' : `${verdwijnen.length} lists are only on this device`}
        </h2>
        <p style={{ margin: '0 0 10px', fontFamily: towFont.serif, fontSize: 13.5, lineHeight: 1.5, color: TOW.inkDim }}>
          The saved copy has {daar} {daar === 1 ? 'list' : 'lists'}; this device has {hier}. Taking the saved copy
          would remove {verdwijnen.length === 1 ? 'this one' : 'these'}:
        </p>

        {/* De namen, niet alleen een aantal: "3 lijsten" zegt niets over of je ze mist. */}
        <ul style={{
          margin: '0 0 14px', padding: '8px 12px', listStyle: 'disc inside',
          border: `1px solid ${TOW.line}`, borderRadius: 10, background: TOW.panel,
          fontFamily: towFont.serif, fontSize: 13, color: TOW.ink, lineHeight: 1.6,
        }}>
          {verdwijnen.slice(0, 8).map((n, i) => <li key={i}>{n}</li>)}
          {verdwijnen.length > 8 && (
            <li style={{ listStyle: 'none', color: TOW.muted }}>…and {verdwijnen.length - 8} more</li>
          )}
        </ul>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button
            type="button" disabled={!!bezig} onClick={() => kies('hier')}
            style={{ ...knop, border: `1px solid ${TOW.goldDeep}`, background: 'rgba(184,134,47,0.12)', color: TOW.ink, opacity: bezig ? 0.6 : 1 }}
          >
            <span>{bezig === 'hier' ? 'Keeping…' : 'Keep this device'}</span>
            <span style={{ fontFamily: towFont.serif, fontWeight: 400, fontSize: 12, color: TOW.inkDim }}>
              Nothing is lost here. The saved copy becomes {hier === 1 ? 'this single list' : `these ${hier} lists`}.
            </span>
          </button>
          <button
            type="button" disabled={!!bezig} onClick={() => kies('cloud')}
            style={{ ...knop, border: `1px solid ${TOW.line}`, background: TOW.panel, color: TOW.ink, opacity: bezig ? 0.6 : 1 }}
          >
            <span>{bezig === 'cloud' ? 'Loading…' : 'Take the saved copy'}</span>
            <span style={{ fontFamily: towFont.serif, fontWeight: 400, fontSize: 12, color: TOW.inkDim }}>
              This device gets the {daar} saved {daar === 1 ? 'list' : 'lists'}, and
              {verdwijnen.length === 1 ? ' the one above goes' : ` the ${verdwijnen.length} above go`}.
            </span>
          </button>
        </div>

        <p style={{ margin: '12px 0 0', fontFamily: towFont.serif, fontSize: 11.5, lineHeight: 1.5, color: TOW.muted }}>
          Either way the previous version stays recoverable — the last few are kept.
        </p>
      </div>
    </div>
  );
}
