import { useEffect, useMemo, useState } from 'react';
import { TOW, towFont, engraved } from '../../design/tow';
import { useGame } from '../../game';
import { battleByCode, reportBattleResult, type CampaignBattle, type BattleResultaat } from '../../lib/campaignBattle';
import type { GameTracker } from '../../types';

const eb = engraved as React.CSSProperties;
const display = towFont.display;
const serif = towFont.serif;

// F5 — report a campaign battle's result back to "De Grensvorsten". Only renders when the active
// game's code actually maps to a campaign battle (we probe with towc_battle_by_code; a normal ad-hoc
// game returns ONBEKENDE_CODE and this renders nothing). The reporter maps host→attacker and
// guest→defender, keys VP + winner on the CAMPAIGN player ids (not host/guest), sends per-unit
// casualties as `kills`, plus optional notes. The campaign stores it as a proposal for the
// grensmaster to approve — applying rewards is not this app's concern.

// Collapse the tracker's per-unit casualties into a compact kills list. We only know lost/fleeing
// per seat:unitId here (no kill-attribution yet), so we report each side's own losses, tagged with
// the unit name so the campaign can read it. side = 'attacker' | 'defender' (host = attacker).
function collectKills(
  tracker: GameTracker,
  hostArmyUnits: { id: string; name: string }[] | undefined,
  guestArmyUnits: { id: string; name: string }[] | undefined,
): { side: 'attacker' | 'defender'; unitId: string; unit: string; lost: number; fleeing: boolean }[] {
  const out: { side: 'attacker' | 'defender'; unitId: string; unit: string; lost: number; fleeing: boolean }[] = [];
  const push = (seat: 'host' | 'guest', side: 'attacker' | 'defender', units?: { id: string; name: string }[]) => {
    for (const u of units ?? []) {
      const t = tracker.units[`${seat}:${u.id}`];
      if (t && (t.lost > 0 || t.fleeing)) out.push({ side, unitId: u.id, unit: u.name, lost: t.lost, fleeing: t.fleeing });
    }
  };
  push('host', 'attacker', hostArmyUnits);
  push('guest', 'defender', guestArmyUnits);
  return out;
}

export function CampaignResultReporter() {
  const { code, game, tracker } = useGame();
  const [battle, setBattle] = useState<CampaignBattle | null>(null);
  const [open, setOpen] = useState(false);
  const [winner, setWinner] = useState<'host' | 'guest' | 'draw'>('draw');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Probe once per code: is this game a campaign battle? Silent on the "not a campaign battle" path.
  useEffect(() => {
    if (!code) { setBattle(null); return; }
    let alive = true;
    battleByCode(code)
      .then((b) => { if (alive) setBattle(b); })
      .catch(() => { if (alive) setBattle(null); });
    return () => { alive = false; };
  }, [code]);

  // VP from the shared tracker (keyed host/guest), and the campaign player ids for each seat.
  const vpHost = tracker.vp.host ?? 0;
  const vpGuest = tracker.vp.guest ?? 0;
  const attackerId = battle?.aanvaller.id ?? null;
  const defenderId = battle?.verdediger.id ?? null;

  const kills = useMemo(
    () => (battle ? collectKills(tracker, game?.host_army?.units, game?.guest_army?.units) : []),
    [battle, tracker, game?.host_army, game?.guest_army],
  );

  if (!code || !battle) return null; // not a campaign battle → nothing to report

  const submit = async () => {
    if (!attackerId || !defenderId) { setErr('This battle is missing its campaign players.'); return; }
    setBusy(true);
    setErr(null);
    const winnaar = winner === 'host' ? attackerId : winner === 'guest' ? defenderId : null;
    const resultaat: BattleResultaat = {
      winnaar,
      vp: { [attackerId]: vpHost, [defenderId]: vpGuest },
      kills,
      notities: notes.trim() || null,
    };
    try {
      await reportBattleResult(code, resultaat);
      setDone(true);
      setOpen(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not report the result.');
    } finally {
      setBusy(false);
    }
  };

  const hostName = game?.host_name || battle.aanvaller.naam || 'Attacker';
  const guestName = game?.guest_name || battle.verdediger.naam || 'Defender';

  const box: React.CSSProperties = { border: `1px solid ${TOW.goldDeep}`, borderRadius: 12, background: 'rgba(184,134,47,0.08)', padding: '13px 14px' };
  const optBtn = (on: boolean): React.CSSProperties => ({ flex: 1, padding: '9px 6px', borderRadius: 9, cursor: 'pointer', border: `1px solid ${on ? TOW.goldDeep : TOW.line}`, background: on ? TOW.cardLt : 'transparent', color: on ? TOW.ink : TOW.muted, fontFamily: display, fontWeight: 600, fontSize: 13, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' });

  if (done) {
    return (
      <div style={box}>
        <div style={{ ...eb, fontSize: 8.5, color: TOW.goldDeep, marginBottom: 4 }}>Result reported</div>
        <div style={{ fontFamily: serif, fontSize: 13.5, color: TOW.ink }}>Reported — the campaign grensmaster approves it.</div>
        <button onClick={() => { setDone(false); setOpen(true); }} style={{ marginTop: 8, background: 'none', border: 'none', cursor: 'pointer', fontFamily: serif, fontSize: 12.5, color: TOW.muted, textDecoration: 'underline' }}>Report again</button>
      </div>
    );
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={{ ...box, width: '100%', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontFamily: display, fontWeight: 700, fontSize: 14, color: TOW.goldDeep }}>Report result to campaign</span>
          <span style={{ display: 'block', fontFamily: serif, fontSize: 12, color: TOW.muted }}>Send winner, VP and casualties back to De Grensvorsten</span>
        </span>
        <span aria-hidden style={{ color: TOW.goldDeep, fontSize: 18, flexShrink: 0 }}>›</span>
      </button>
    );
  }

  return (
    <div style={box}>
      <div style={{ ...eb, fontSize: 8.5, color: TOW.goldDeep, marginBottom: 8 }}>Report result · {code}</div>

      <div style={{ ...eb, fontSize: 8, color: TOW.muted, marginBottom: 5 }}>Winner</div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
        <button onClick={() => setWinner('host')} style={optBtn(winner === 'host')}>{hostName}</button>
        <button onClick={() => setWinner('draw')} style={optBtn(winner === 'draw')}>Draw</button>
        <button onClick={() => setWinner('guest')} style={optBtn(winner === 'guest')}>{guestName}</button>
      </div>

      <div style={{ ...eb, fontSize: 8, color: TOW.muted, marginBottom: 5 }}>Victory points (from the tracker)</div>
      <div style={{ fontFamily: serif, fontSize: 13.5, color: TOW.ink, marginBottom: 12 }}>
        {hostName}: <strong>{vpHost}</strong> · {guestName}: <strong>{vpGuest}</strong>
        {kills.length > 0 && <span style={{ color: TOW.muted }}> · {kills.length} unit{kills.length === 1 ? '' : 's'} with losses</span>}
      </div>

      <div style={{ ...eb, fontSize: 8, color: TOW.muted, marginBottom: 5 }}>Notes (optional)</div>
      <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Anything the campaign should know…" style={{ width: '100%', borderRadius: 10, border: `1px solid ${TOW.lineStrong}`, background: TOW.cardLt, color: TOW.ink, padding: '9px 11px', fontFamily: serif, fontSize: 13, boxSizing: 'border-box', resize: 'vertical', marginBottom: 12 }} />

      {err && <div style={{ fontFamily: serif, fontSize: 13, color: TOW.blood, marginBottom: 10 }}>{err}</div>}

      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <button onClick={submit} disabled={busy} style={{ flex: 1, border: 'none', borderRadius: 10, cursor: 'pointer', padding: '11px 16px', background: `linear-gradient(180deg, ${TOW.goldBright}, ${TOW.gold} 55%, ${TOW.goldDeep})`, color: TOW.onGrad, fontFamily: display, fontWeight: 700, fontSize: 14, opacity: busy ? 0.5 : 1 }}>
          {busy ? 'Reporting…' : 'Report to campaign'}
        </button>
        <button onClick={() => setOpen(false)} style={{ border: `1px solid ${TOW.lineStrong}`, borderRadius: 10, background: 'transparent', color: TOW.muted, cursor: 'pointer', padding: '11px 14px', fontFamily: display, fontSize: 13 }}>Cancel</button>
      </div>
    </div>
  );
}
