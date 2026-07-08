import { useCallback, useEffect, useState } from 'react';
import { TOW, towFont, engraved } from '../../design/tow';
import { useGame } from '../../game';
import { getCachedCampaign, getCampaignCode } from '../../lib/campaign';
import { battleByCode, type CampaignBattle, type BattleSide } from '../../lib/campaignBattle';
import { ArmyListPicker } from './ArmyListPicker';
import type { Army } from '../../types';

const eb = engraved as React.CSSProperties;
const display = towFont.display;
const serif = towFont.serif;

// The Game tab's campaign-battle entry. Given a pending sync code (from the ?battle= deep-link or a
// typed code), it looks the battle up, shows a short header, works out which side the linked campaign
// player is on (attacker → host, defender → guest), and lets the player load ONE of their own
// Companion builder lists into their seat — then opens the shared realtime game on that code. From
// there the normal Game-mode tracker takes over. Non-participants get a read-only notice.
export function CampaignBattlePanel({ code, onDismiss }: { code: string; onDismiss: () => void }) {
  const { openCampaignBattle, busy, error } = useGame();
  const [battle, setBattle] = useState<CampaignBattle | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [name, setName] = useState('');

  // The linked campaign player id (attacker/defender ids are campaign-player ids). Read the cached
  // context the same way Settings/BuilderWorkspace do; no fetch here — the link is a prerequisite.
  const myPlayerId = getCachedCampaign()?.context?.speler.id ?? null;
  const linked = !!getCampaignCode() && !!myPlayerId;

  const load = useCallback(async () => {
    setLoading(true);
    setLoadErr(null);
    try {
      const b = await battleByCode(code);
      setBattle(b);
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : 'Could not load this battle.');
    } finally {
      setLoading(false);
    }
  }, [code]);

  useEffect(() => { load(); }, [load]);

  // Seed the name field from the campaign player's name once the battle loads.
  useEffect(() => {
    if (!battle || name) return;
    const meId = myPlayerId;
    const mine = meId && battle.aanvaller.id === meId ? battle.aanvaller
      : meId && battle.verdediger.id === meId ? battle.verdediger : null;
    if (mine?.naam) setName(mine.naam);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [battle]);

  // Which seat is this user? attacker → host, defender → guest, else null (spectator).
  const mySeat: 'host' | 'guest' | null = !battle || !myPlayerId
    ? null
    : battle.aanvaller.id === myPlayerId ? 'host'
    : battle.verdediger.id === myPlayerId ? 'guest'
    : null;

  const wrap = (children: React.ReactNode) => (
    <div className="tow-field" style={{ height: '100%', overflowY: 'auto', color: TOW.ink }}>
      <div style={{ maxWidth: 560, margin: '0 auto', padding: '20px 16px 40px' }}>{children}</div>
    </div>
  );

  const dismissBtn = (
    <button onClick={onDismiss} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: serif, fontSize: 13.5, color: TOW.muted, textDecoration: 'underline' }}>
      ← back to the normal game setup
    </button>
  );

  if (loading) {
    return wrap(<div style={{ fontFamily: serif, fontStyle: 'italic', fontSize: 15, color: TOW.muted }}>Loading campaign battle {code}…</div>);
  }

  if (loadErr || !battle) {
    return wrap(
      <>
        <h1 style={{ fontFamily: display, fontWeight: 700, fontSize: 24, color: TOW.ink, margin: '4px 0 8px' }}>Campaign battle</h1>
        <p style={{ fontFamily: serif, fontSize: 15, color: TOW.blood, margin: '0 0 16px' }}>
          {loadErr === 'ONBEKENDE_CODE' ? `No campaign battle found for code ${code}.` : (loadErr || 'Could not load this battle.')}
        </p>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <button onClick={load} style={{ border: `1px solid ${TOW.goldDeep}`, borderRadius: 10, background: 'rgba(184,134,47,0.10)', color: TOW.goldDeep, cursor: 'pointer', padding: '9px 16px', fontFamily: display, fontWeight: 600, fontSize: 13.5 }}>Try again</button>
          {dismissBtn}
        </div>
      </>,
    );
  }

  // ── Battle header (always shown) ──
  const SideChip = ({ side, label }: { side: BattleSide; label: string }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
      <span style={{ width: 12, height: 12, borderRadius: 99, background: side.kleur || TOW.gold, border: `1px solid ${TOW.line}`, flexShrink: 0 }} />
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontFamily: display, fontWeight: 700, fontSize: 15, color: TOW.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{side.naam || label}</span>
        <span style={{ display: 'block', ...eb, fontSize: 8, color: TOW.muted }}>{label}{side.factie ? ` · ${side.factie}` : ''}</span>
      </span>
    </div>
  );

  const scenarioName = typeof battle.scenario?.scenarioNaam === 'string' ? (battle.scenario.scenarioNaam as string) : null;
  const header = (
    <div style={{ border: `1px solid ${TOW.line}`, borderRadius: 12, background: TOW.panel2, padding: '14px 15px', marginBottom: 18 }}>
      <div style={{ ...eb, fontSize: 8.5, color: TOW.goldDeep, marginBottom: 8 }}>Campaign battle · {battle.code}{scenarioName ? ` · ${scenarioName}` : ''}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}><SideChip side={battle.aanvaller} label="Attacker" /></div>
        <span style={{ fontFamily: serif, fontStyle: 'italic', fontSize: 13, color: TOW.faint, flexShrink: 0 }}>vs</span>
        <div style={{ flex: 1, minWidth: 0 }}><SideChip side={battle.verdediger} label="Defender" /></div>
      </div>
      {!battle.beideGelockt && (
        <div style={{ fontFamily: serif, fontStyle: 'italic', fontSize: 13, color: TOW.muted, marginTop: 10 }}>
          Waiting for both players to lock their armies in the campaign app…
        </div>
      )}
    </div>
  );

  // ── Not linked → can't tell which side you are ──
  if (!linked) {
    return wrap(
      <>
        {header}
        <p style={{ fontFamily: serif, fontSize: 14.5, color: TOW.parchDim, margin: '0 0 14px' }}>
          Link this app to your campaign profile first (Settings → Campaign) so it knows which side of this battle you play.
        </p>
        {dismissBtn}
      </>,
    );
  }

  // ── Linked but not a participant → read-only ──
  if (!mySeat) {
    return wrap(
      <>
        {header}
        <p style={{ fontFamily: serif, fontSize: 14.5, color: TOW.parchDim, margin: '0 0 14px' }}>
          You're not in this battle — it's between {battle.aanvaller.naam || 'the attacker'} and {battle.verdediger.naam || 'the defender'}.
        </p>
        {dismissBtn}
      </>,
    );
  }

  // ── Participant → load your own army and open the game ──
  const mySide = mySeat === 'host' ? battle.aanvaller : battle.verdediger;
  const myLijst = mySeat === 'host' ? battle.aanvLijst : battle.verdLijst; // locked summary (name only)

  const openWith = async (army: Army | null) => {
    const ok = await openCampaignBattle(code, mySeat, name, army);
    if (ok) onDismiss(); // GameProvider now has a seat → GameMode swaps to GameView
  };

  const inputStyle: React.CSSProperties = { width: '100%', borderRadius: 10, border: `1px solid ${TOW.lineStrong}`, background: TOW.cardLt, color: TOW.ink, padding: '10px 12px', fontFamily: serif, fontSize: 15, boxSizing: 'border-box' };
  const labelStyle: React.CSSProperties = { ...eb, fontSize: 9, color: TOW.muted, marginBottom: 5, display: 'block' };

  return wrap(
    <>
      {header}

      <div style={{ ...eb, fontSize: 8.5, color: TOW.goldDeep, marginBottom: 6 }}>
        You are the {mySeat === 'host' ? 'attacker' : 'defender'}{mySide.naam ? ` · ${mySide.naam}` : ''}
      </div>
      <p style={{ fontFamily: serif, fontSize: 14, color: TOW.parchDim, margin: '0 0 16px' }}>
        Load your <strong>full Companion army list</strong> for this battle, then open the shared game. Your opponent opens the same code on their device and you play with the live tracker.
        {myLijst?.naam ? <> Your locked campaign list is <strong>“{myLijst.naam}”</strong>{myLijst.punten ? ` (${myLijst.punten} pts)` : ''} — pick the matching list below.</> : null}
      </p>

      <label style={labelStyle}>Your name</label>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Joost" style={{ ...inputStyle, marginBottom: 16 }} />

      {/* The list picker converts a chosen builder list into a full Army (with stats) and opens the
          game with it. Renders nothing if the player has no saved lists — the fallback button below
          covers that (open the game, add your army inside). */}
      <ArmyListPicker onPick={openWith} label="Choose your army list for this battle" />

      <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginTop: 8 }}>
        <button
          onClick={() => openWith(null)}
          disabled={busy}
          style={{ border: `1px solid ${TOW.lineStrong}`, borderRadius: 10, background: 'transparent', color: TOW.muted, cursor: 'pointer', padding: '10px 16px', fontFamily: display, fontWeight: 600, fontSize: 13.5, opacity: busy ? 0.5 : 1 }}
        >
          {busy ? 'Opening…' : 'Open the game & add my army later'}
        </button>
        {dismissBtn}
      </div>

      {error && <div style={{ fontFamily: serif, fontSize: 13.5, color: TOW.blood, marginTop: 12 }}>{error}</div>}
    </>,
  );
}
