import { useEffect, useMemo, useState } from 'react';
import { TOW, towFont, engraved } from '../../design/tow';
import { useGame } from '../../game';
import { unitTotalStrength } from '../../lib/armyRules';
import { battleByCode, reportBattleResult, type CampaignBattle, type BattleResultaat } from '../../lib/campaignBattle';
import { berekenVictory, type VpBonus, type Uitslag } from '../../lib/victoryPoints';
import type { Army, GameTracker } from '../../types';

const eb = engraved as React.CSSProperties;
const display = towFont.display;
const serif = towFont.serif;

// De VP-bonussen (general/BSB/standaards/objective) worden door een PARALLELLE taak op de tracker
// gezet als `tracker.bonus.{host,guest}`. Op het moment van schrijven zit dat veld nog niet in het
// GameTracker-type, dus lezen we het via een smalle lokale shape i.p.v. een `any`-cast die de build
// zou breken. Zodra het type wél bestaat blijft dit gewoon compileren (structureel compatibel).
type MetBonus = { bonus?: { host?: VpBonus; guest?: VpBonus } };
function readBonus(tracker: GameTracker | null): { host?: VpBonus; guest?: VpBonus } {
  return (tracker as (GameTracker & MetBonus) | null)?.bonus ?? {};
}

// Engine-uitslag → Engels UI-label.
const uitslagLabel = (u: Uitslag): string => (u === 'crushing' ? 'Crushing Victory' : u === 'victory' ? 'Victory' : 'Draw');

// Supabase-fout (geen Error-instantie, dus e.message viel eerder weg) → leesbare reden. De report-RPC
// raise't o.a. LEGERS_NIET_GELOCKT als niet beide kanten in de campagne-app hun leger gelockt hebben.
function reportFoutTekst(msg: string): string {
  if (/LEGERS_NIET_GELOCKT/.test(msg)) return 'Both armies must be locked in the campaign app first (battle Wizard → List → “Lock army” on both sides), then report again.';
  if (/AL_VERWERKT/.test(msg)) return 'This battle already has a recorded result in the campaign.';
  if (/ONBEKENDE_CODE/.test(msg)) return "This game's code isn't linked to a campaign battle.";
  return msg || 'Could not report the result.';
}

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

type Veteraan = NonNullable<BattleResultaat['veteraan']>[number];

// Campagne-relevante per-unit feiten voor de MELDENDE speler z'n EIGEN leger. `ownSeat` is de
// absolute seat-key ('host'/'guest') waarop de eigen units in de tracker staan — solo mapt naar
// 'host' (zoals GameView's absSeat('me')). De drempels spiegelen de VP-engine (unitVp):
//   remaining = unitTotalStrength − lost.
//   overleefd_50 : remaining ≥ 50% start-US  én  niet fleeing  én  niet weg (removed).
//   scar_trigger : remaining < 25% start-US   óf  weg          óf  fleeing.
// (Grenzen bewust asymmetrisch: ≥50% vs <25%, exact conform de opdracht.)
function collectVeteraan(tracker: GameTracker, ownArmy: Army | null, ownSeat: 'host' | 'guest'): Veteraan[] {
  const out: Veteraan[] = [];
  for (const u of ownArmy?.units ?? []) {
    const t = tracker.units[`${ownSeat}:${u.id}`];
    const ts = unitTotalStrength(u);
    const lost = Math.max(0, t?.lost ?? 0);
    const remaining = ts - lost;
    const fleeing = t?.fleeing ?? false;
    const weg = t?.weg ?? false;
    const overleefd_50 = remaining >= ts * 0.5 && !fleeing && !weg;
    const scar_trigger = remaining < ts * 0.25 || weg || fleeing;
    out.push({ unitId: u.campaignId ?? u.id, naam: u.name, overleefd_50, kills: Math.max(0, t?.kills ?? 0), scar_trigger });
  }
  return out;
}

// embedded = gerenderd binnen het einde-battle-overzicht (form direct open, geen eigen rand).
export function CampaignResultReporter({ embedded = false }: { embedded?: boolean } = {}) {
  const { code, game, tracker, seat, myArmy } = useGame();
  const [battle, setBattle] = useState<CampaignBattle | null>(null);
  const [open, setOpen] = useState(embedded);
  const [winner, setWinner] = useState<'host' | 'guest' | 'draw'>('draw');
  // `touched` = de speler heeft zélf een winnaar-knop geklikt. Zolang dit false is, prefillen we
  // `winner` uit de engine (res.winnaar); zodra de speler kiest, laten we z'n keuze staan (overrulebaar).
  const [touched, setTouched] = useState(false);
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

  // VP via de rules-kritieke engine (kill-VP uit Dead-or-Fled + handmatige bonussen), NIET meer ruw
  // uit tracker.vp. Bonussen defensief gelezen (zie readBonus). Engine verdraagt afwezige velden.
  const res = useMemo(() => {
    const b = readBonus(tracker);
    return berekenVictory(game?.host_army ?? null, game?.guest_army ?? null, tracker, b.host, b.guest);
  }, [tracker, game?.host_army, game?.guest_army]);
  const vpHost = res.hostVp;
  const vpGuest = res.guestVp;
  const attackerId = battle?.aanvaller.id ?? null;
  const defenderId = battle?.verdediger.id ?? null;

  // Prefill de winnaar-keuze uit de engine zolang de speler nog niet zelf heeft gekozen (touched).
  // Re-render-veilig: draait alleen als de engine-uitkomst of `touched` verandert, en muteert `winner`
  // niet zodra de speler heeft overruled. res.winnaar (null = draw) → onze 'host'|'guest'|'draw'.
  useEffect(() => {
    if (touched) return;
    setWinner(res.winnaar ?? 'draw');
  }, [res.winnaar, touched]);

  const kills = useMemo(
    () => (battle ? collectKills(tracker, game?.host_army?.units, game?.guest_army?.units) : []),
    [battle, tracker, game?.host_army, game?.guest_army],
  );

  // Per-unit veteraan-feiten voor de MELDENDE speler z'n EIGEN leger (myArmy dekt host/guest/solo).
  // Eigen seat-key: host/guest direct; solo → 'host' (zoals GameView's absSeat('me')).
  const ownSeat: 'host' | 'guest' = seat === 'guest' ? 'guest' : 'host';
  const veteraan = useMemo(
    () => (battle ? collectVeteraan(tracker, myArmy, ownSeat) : []),
    [battle, tracker, myArmy, ownSeat],
  );

  if (!code || !battle) return null; // not a campaign battle → nothing to report

  const hostName = game?.host_name || battle.aanvaller.naam || 'Attacker';
  const guestName = game?.guest_name || battle.verdediger.naam || 'Defender';

  // Marge-regel voor de campagne: er is geen apart marge-veld, dus we hangen één nette Engelse regel
  // aan de notes zodat de grensmaster minor (Victory) vs major (Crushing Victory) ziet. Bij een draw
  // vermelden we de VP-swing (verschil). We appenden aan de door de speler getypte notes en zorgen
  // dat dit NIET dubbel gebeurt bij "Report again" (we bouwen 'm elke submit vers uit `notes`).
  const marginLine = (): string => {
    if (res.winnaar === null) return `Result: Draw (${res.verschil} VP swing)`;
    const winName = res.winnaar === 'host' ? hostName : guestName;
    return `Result: ${uitslagLabel(res.uitslag)} — ${winName} +${res.verschil} VP`;
  };

  const submit = async () => {
    if (!attackerId || !defenderId) { setErr('This battle is missing its campaign players.'); return; }
    setBusy(true);
    setErr(null);
    const winnaar = winner === 'host' ? attackerId : winner === 'guest' ? defenderId : null;
    // Notes = wat de speler typte + de marge-regel; null alleen als beide leeg zijn.
    const notities = [notes.trim(), marginLine()].filter(Boolean).join('\n') || null;
    const resultaat: BattleResultaat = {
      winnaar,
      vp: { [attackerId]: vpHost, [defenderId]: vpGuest },
      kills,
      notities,
      veteraan,
    };
    try {
      await reportBattleResult(code, resultaat);
      setDone(true);
      setOpen(false);
    } catch (e) {
      setErr(reportFoutTekst((e as { message?: string })?.message || (e instanceof Error ? e.message : '') || ''));
    } finally {
      setBusy(false);
    }
  };

  const box: React.CSSProperties = { border: `1px solid ${TOW.goldDeep}`, borderRadius: 12, background: 'rgba(184,134,47,0.08)', padding: '13px 14px' };
  // Ingebed levert het overzicht zelf de kaart; dan geen eigen rand/achtergrond/padding.
  const formWrap: React.CSSProperties = embedded ? {} : box;
  const optBtn = (on: boolean): React.CSSProperties => ({ flex: 1, padding: '9px 6px', borderRadius: 9, cursor: 'pointer', border: `1px solid ${on ? TOW.goldDeep : TOW.line}`, background: on ? TOW.cardLt : 'transparent', color: on ? TOW.ink : TOW.muted, fontFamily: display, fontWeight: 600, fontSize: 13, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' });

  if (done) {
    return (
      <div style={formWrap}>
        <div style={{ ...eb, fontSize: 8.5, color: TOW.goldDeep, marginBottom: 4 }}>Result reported</div>
        <div style={{ fontFamily: serif, fontSize: 13.5, color: TOW.ink }}>Reported — the campaign grensmaster approves it.</div>
        <button onClick={() => { setDone(false); setOpen(true); }} style={{ marginTop: 8, background: 'none', border: 'none', cursor: 'pointer', fontFamily: serif, fontSize: 12.5, color: TOW.muted, textDecoration: 'underline' }}>Report again</button>
      </div>
    );
  }

  if (!open && !embedded) {
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
    <div style={formWrap}>
      <div style={{ ...eb, fontSize: 8.5, color: TOW.goldDeep, marginBottom: 8 }}>Report result · {code}</div>

      <div style={{ ...eb, fontSize: 8, color: TOW.muted, marginBottom: 5 }}>Winner {!touched && <span style={{ color: TOW.goldDeep }}>· auto from VP</span>}</div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
        <button onClick={() => { setTouched(true); setWinner('host'); }} style={optBtn(winner === 'host')}>{hostName}</button>
        <button onClick={() => { setTouched(true); setWinner('draw'); }} style={optBtn(winner === 'draw')}>Draw</button>
        <button onClick={() => { setTouched(true); setWinner('guest'); }} style={optBtn(winner === 'guest')}>{guestName}</button>
      </div>

      <div style={{ ...eb, fontSize: 8, color: TOW.muted, marginBottom: 5 }}>Victory points (calculated)</div>
      <div style={{ fontFamily: serif, fontSize: 13.5, color: TOW.ink, marginBottom: 4 }}>
        {hostName}: <strong>{vpHost}</strong> · {guestName}: <strong>{vpGuest}</strong>
        {kills.length > 0 && <span style={{ color: TOW.muted }}> · {kills.length} unit{kills.length === 1 ? '' : 's'} with losses</span>}
      </div>
      <div style={{ fontFamily: display, fontWeight: 700, fontSize: 13, color: res.uitslag === 'crushing' ? TOW.goldBright : res.winnaar ? TOW.goldDeep : TOW.muted, marginBottom: 12 }}>
        {uitslagLabel(res.uitslag)} · +{res.verschil} VP
      </div>

      {veteraan.length > 0 && (
        <>
          <div style={{ ...eb, fontSize: 8, color: TOW.muted, marginBottom: 5 }}>Your veterans · XP earned</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 4 }}>
            {veteraan.map((v, i) => {
              const xp = (v.overleefd_50 ? 1 : 0) + v.kills;
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontFamily: serif, fontSize: 13, color: TOW.ink }}>
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.naam || v.unitId}</span>
                  <span style={{ flexShrink: 0, fontFamily: display, fontWeight: 600, fontSize: 12, color: xp > 0 ? TOW.goldDeep : TOW.muted }}>
                    {xp > 0 ? `+${xp} XP` : '—'}{v.scar_trigger ? ' · scar risk' : ''}
                  </span>
                </div>
              );
            })}
          </div>
          <div style={{ fontFamily: serif, fontStyle: 'italic', fontSize: 11.5, color: TOW.muted, marginBottom: 12 }}>
            +1 XP for surviving above 50% strength, +1 per kill/trophy — applied to your campaign veterans once the grensmaster approves.
          </div>
        </>
      )}

      <div style={{ ...eb, fontSize: 8, color: TOW.muted, marginBottom: 5 }}>Notes (optional)</div>
      <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Anything the campaign should know…" style={{ width: '100%', borderRadius: 10, border: `1px solid ${TOW.lineStrong}`, background: TOW.cardLt, color: TOW.ink, padding: '9px 11px', fontFamily: serif, fontSize: 13, boxSizing: 'border-box', resize: 'vertical', marginBottom: 12 }} />

      {err && <div style={{ fontFamily: serif, fontSize: 13, color: TOW.blood, marginBottom: 10 }}>{err}</div>}

      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <button onClick={submit} disabled={busy} style={{ flex: 1, border: 'none', borderRadius: 10, cursor: 'pointer', padding: '11px 16px', background: `linear-gradient(180deg, ${TOW.goldBright}, ${TOW.gold} 55%, ${TOW.goldDeep})`, color: TOW.onGrad, fontFamily: display, fontWeight: 700, fontSize: 14, opacity: busy ? 0.5 : 1 }}>
          {busy ? 'Reporting…' : 'Report to campaign'}
        </button>
        {!embedded && <button onClick={() => setOpen(false)} style={{ border: `1px solid ${TOW.lineStrong}`, borderRadius: 10, background: 'transparent', color: TOW.muted, cursor: 'pointer', padding: '11px 14px', fontFamily: display, fontSize: 13 }}>Cancel</button>}
      </div>
    </div>
  );
}
