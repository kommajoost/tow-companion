import { useCallback, useEffect, useState } from 'react';
import { TOW, towFont, engraved } from '../../design/tow';
import { useGame } from '../../game';
import { getCachedCampaign, getCampaignCode } from '../../lib/campaign';
import { battleByCode, type CampaignBattle, type BattleSide, type Perk, type FoundItem } from '../../lib/campaignBattle';
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

  // ── The rest of the BattleSheet ────────────────────────────────────────────────────────────────
  // `battle.scenario` is the campaign's raw sheet and this screen read exactly one field out of it —
  // the scenario name — while the sheet also carries why the battle is happening, the table size, the
  // terrain that is on it, and the secondary objectives. All of it was already arriving and being
  // thrown away, which is why the pre-game screen had nothing to say. Read defensively: the shape is
  // the campaign's, not ours, so every field is checked rather than assumed.
  const sheet = (battle.scenario ?? {}) as Record<string, unknown>;
  const asStr = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const asNum = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const reason = asStr(sheet.reden);
  const tableLabel = asStr(sheet.bordLabel)
    ?? (asNum(sheet.tableW) && asNum(sheet.tableH) ? `${asNum(sheet.tableW)}×${asNum(sheet.tableH)}″` : null);
  const groundType = asStr(sheet.terrein);
  /** Secondary objectives = what the campaign calls battle quests. Slugs like "baggage-trains", so they
   *  are title-cased for display rather than shown raw; the campaign is the authority on their rules. */
  const quests = Array.isArray(sheet.secondaries)
    ? (sheet.secondaries as unknown[]).map(asStr).filter((q): q is string => !!q)
    : [];
  const terrain = Array.isArray(sheet.terrain)
    ? (sheet.terrain as unknown[]).map((t) => {
      const o = (t && typeof t === 'object' ? t : {}) as Record<string, unknown>;
      const type = asStr(o.type);
      if (!type) return null;
      const w = asNum(o.w);
      const h = asNum(o.h);
      return { type, size: w && h ? `${w}×${h}″` : null, difficult: o.difficult === true };
    }).filter((t): t is { type: string; size: string | null; difficult: boolean } => !!t)
    : [];
  const pretty = (s: string) => s.replace(/[-_]/g, ' ').replace(/^./, (c) => c.toUpperCase());

  const chip = (text: string, title?: string) => (
    <span
      key={text}
      title={title}
      style={{ fontFamily: serif, fontSize: 12, padding: '3px 10px', borderRadius: 999, border: `1px solid ${TOW.line}`, background: TOW.panel2, color: TOW.parchDim }}
    >
      {text}
    </span>
  );
  const chipRow = (heading: string, children: React.ReactNode) => (
    <div style={{ marginTop: 12 }}>
      <div style={{ ...eb, fontSize: 8, color: TOW.muted, marginBottom: 5 }}>{heading}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>{children}</div>
    </div>
  );

  /** One side's locked list: name, points and the units in it. This is a SUMMARY from the campaign —
   *  unit names only, no options or statlines — so it is presented as a line-up, not as an army. Only
   *  your OWN full army is loadable, out of your own Companion lists. */
  const renderLijst = (lijst: typeof battle.aanvLijst, heading: string) =>
    lijst ? (
      <div style={{ marginTop: 12 }}>
        <div style={{ ...eb, fontSize: 8, color: TOW.muted, marginBottom: 5 }}>{heading}</div>
        <div style={{ fontFamily: serif, fontSize: 13, color: TOW.parchDim }}>
          {lijst.naam}
          {lijst.punten ? ` · ${lijst.punten} pts` : ''}
          {lijst.leger ? ` · ${pretty(lijst.leger)}` : ''}
        </div>
        {lijst.units.length > 0 && (
          <div style={{ fontFamily: serif, fontSize: 12.5, color: TOW.faint, marginTop: 3 }}>
            {lijst.units.join(' · ')}
          </div>
        )}
      </div>
    ) : null;

  // Active building perks (from the campaign) shown read-only. Label as a chip, effect as tooltip.
  const renderPerks = (perks: Perk[], heading: string) =>
    perks.length > 0 ? (
      <div style={{ marginTop: 12 }}>
        <div style={{ ...eb, fontSize: 8, color: TOW.muted, marginBottom: 5 }}>{heading}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {perks.map((p, i) => (
            <span
              key={i}
              title={p.effect || undefined}
              style={{ fontFamily: serif, fontSize: 12, padding: '3px 10px', borderRadius: 999, border: `1px solid ${TOW.goldDeep}`, background: 'rgba(184,134,47,0.10)', color: TOW.goldDeep, cursor: p.effect ? 'help' : 'default' }}
            >
              {p.label}
            </span>
          ))}
        </div>
      </div>
    ) : null;

  // Attached found magic item (max 1 per side) shown read-only — same chip style as the perks. Name
  // + points on the chip, effect as tooltip, and a "Single use" tag when it's a consumable.
  const renderItem = (item: FoundItem | null, heading: string) =>
    item ? (
      <div style={{ marginTop: 12 }}>
        <div style={{ ...eb, fontSize: 8, color: TOW.muted, marginBottom: 5 }}>{heading}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          <span
            title={item.effect || undefined}
            style={{ fontFamily: serif, fontSize: 12, padding: '3px 10px', borderRadius: 999, border: `1px solid ${TOW.goldDeep}`, background: 'rgba(184,134,47,0.10)', color: TOW.goldDeep, cursor: item.effect ? 'help' : 'default' }}
          >
            {item.naam}{item.punten ? ` · ${item.punten} pts` : ''}
          </span>
          {item.soort === 'consumable' && (
            <span style={{ ...eb, fontSize: 8, padding: '3px 8px', borderRadius: 999, border: `1px solid ${TOW.line}`, background: TOW.panel2, color: TOW.muted }}>
              Single use
            </span>
          )}
        </div>
      </div>
    ) : null;

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
      {/* Why this battle is being fought — the campaign's own sentence, not a paraphrase. */}
      {reason && (
        <div style={{ fontFamily: serif, fontSize: 13.5, color: TOW.parchDim, marginTop: 10 }}>{reason}</div>
      )}

      {/* Battle quests. The campaign calls them `secondaries`; they decide what you are playing FOR, so
          they belong on a pre-game screen. Slugs are title-cased for reading — the campaign remains the
          authority on what each one actually requires. */}
      {quests.length > 0 && chipRow('Battle quests', quests.map((q) => chip(pretty(q))))}

      {/* Battlefield setup — table size, ground, and the terrain that is on it. */}
      {(tableLabel || groundType || terrain.length > 0) && chipRow('Battlefield', (
        <>
          {tableLabel && chip(tableLabel)}
          {groundType && chip(pretty(groundType))}
          {terrain.map((t, i) => (
            <span
              key={`${t.type}-${i}`}
              style={{ fontFamily: serif, fontSize: 12, padding: '3px 10px', borderRadius: 999, border: `1px solid ${TOW.line}`, background: TOW.panel2, color: TOW.parchDim }}
            >
              {pretty(t.type)}{t.size ? ` ${t.size}` : ''}{t.difficult ? ' · difficult' : ''}
            </span>
          ))}
        </>
      ))}

      {/* Both line-ups. Shown for both sides on purpose: what the opponent is bringing is exactly what
          you want to know before deploying, and the campaign has already locked it. */}
      {renderLijst(battle.aanvLijst, `${battle.aanvaller.naam || 'Attacker'} · list`)}
      {renderLijst(battle.verdLijst, `${battle.verdediger.naam || 'Defender'} · list`)}

      {/* Perks and found items for BOTH sides. This used to show only your own when you were playing,
          which is backwards for a pre-game briefing: your opponent's perks are the half you cannot look
          up anywhere else. */}
      {battle.perks && (
        <>
          {renderPerks(battle.perks.aanvaller, `${battle.aanvaller.naam || 'Attacker'} · active perks`)}
          {renderPerks(battle.perks.verdediger, `${battle.verdediger.naam || 'Defender'} · active perks`)}
        </>
      )}
      {battle.items && (
        <>
          {renderItem(battle.items.aanvaller, `${battle.aanvaller.naam || 'Attacker'} · magic item`)}
          {renderItem(battle.items.verdediger, `${battle.verdediger.naam || 'Defender'} · magic item`)}
        </>
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

  const oppSide = mySeat === 'host' ? battle.verdediger : battle.aanvaller;

  const openWith = async (army: Army | null) => {
    // Pass the battle's veteran data so openCampaignBattle can stamp my side's units with their
    // campaign abilities + scars before the army is written to tow_games (rides along to both players).
    //
    // The NAME is the campaign's, not something typed here: this is a campaign battle between two known
    // players. And the opponent's name goes along so the tracker shows who you are actually playing
    // instead of "Opponent" until they get round to opening the battle on their own device.
    const ok = await openCampaignBattle(code, mySeat, mySide.naam || name, army, battle.veteranen, oppSide.naam || undefined);
    if (ok) onDismiss(); // GameProvider now has a seat → GameMode swaps to GameView
  };


  return wrap(
    <>
      {header}

      <div style={{ ...eb, fontSize: 8.5, color: TOW.goldDeep, marginBottom: 6 }}>
        You are the {mySeat === 'host' ? 'attacker' : 'defender'}{mySide.naam ? ` · ${mySide.naam}` : ''}
      </div>
      <p style={{ fontFamily: serif, fontSize: 14, color: TOW.parchDim, margin: '0 0 16px' }}>
        {myLijst?.naam
          ? <>Your campaign list is locked as <strong>“{myLijst.naam}”</strong>{myLijst.punten ? ` (${myLijst.punten} pts)` : ''} — it loads below. Open the shared game and your opponent opens the same code on their device; you play with the live tracker.</>
          : <>Load your <strong>full Companion army list</strong> for this battle, then open the shared game. Your opponent opens the same code on their device and you play with the live tracker.</>}
      </p>

      {/* NO NAME FIELD. A campaign battle is between two named campaign players, so asking you to type
          your own name was asking for something already known — and letting you type a different one
          would just disagree with the campaign. Shown above instead, as part of "You are the attacker". */}

      {/* The picker converts a list into a full Army (stats, options, overlay) and hands it over. With a
          locked campaign list it does that BY ITSELF (`autoPick`) — there is nothing to choose, the
          campaign already decided which list plays — while still showing which one was loaded, and
          leaving the "show all" escape hatch if the name-match ever picks the wrong one.

          Only YOUR army can be loaded this way: the campaign's `verdLijst`/`aanvLijst` are summaries of
          unit NAMES, without options or statlines, so the opponent's line-up is listed above but their
          full army has to come off their own device. */}
      <ArmyListPicker
        onPick={openWith}
        label="Choose your army list for this battle"
        lockedListName={myLijst?.naam ?? null}
        autoPick
      />

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
