import { useCallback, useEffect, useState } from 'react';
import { TOW, towFont, engraved } from '../../design/tow';
import { useGame } from '../../game';
import { getCachedCampaign, getCampaignCode } from '../../lib/campaign';
import { battleByCode, battleHandZet, battleTypeLabel, battleTypeNote, abilityLabel, abilityEffect, scarLabel, weerVanBattle, type CampaignBattle, type BattleSide, type Perk, type FoundItem, type BattleLijstSamenvatting, type VetUnit } from '../../lib/campaignBattle';
import { ArmyListPicker } from './ArmyListPicker';
import { CampaignBoard, defenderIsTop, parseSheetLayout, parseSheetSecLayout } from './CampaignBoard';
import type { Army } from '../../types';

const eb = engraved as React.CSSProperties;
const display = towFont.display;
const serif = towFont.serif;

/** Slug → readable ("empire-of-man" → "Empire of man"). Module scope so the list block can use it too. */
const pretty = (s: string) => s.replace(/[-_]/g, ' ').replace(/^./, (c) => c.toUpperCase());

// ── BattleSheet v2: de UITGEREKENDE opstelling ───────────────────────────────────────────────────
// Sinds 16-08-2026 rekent de campagne de deployment zelf uit en schrijft 'm mee in de sheet
// (`layout`/`secLayout`, in tafel-inches). De Companion rekent hier NIETS na: `src/lib/battle.ts` is
// een oudere fork van diezelfde scenario-catalogus (kent de drie Battle March-kaarten en de nieuwe
// attacker/defender-opstellingen niet), dus `deploymentFor` zou stilletjes een ANDERE battle tekenen
// dan de campagne heeft opgezet. Het lezen van die velden staat in `CampaignBoard` — daar horen ze,
// want de parser en de tekenaar zijn samen het contract met de campagne.

/**
 * One side's army list, collapsed to a single line and expandable to the FULL line-up: every unit with
 * its model count, category, points and the options it actually carries (30-07-2026).
 *
 * The campaign used to hand over unit NAMES only, which is why this used to be one grey line of text —
 * and why the opponent's army could not be loaded at all. It now carries the whole thing, worked out by
 * this app's own `entryPoints`/`optionSummary` and passed through, so both sides read the same numbers.
 * A unit whose points the campaign does not know shows a dash: an unknown cost is not 0.
 *
 * Sinds 20-08-2026 staat het blok standaard OPEN: bij een battle wil je de line-ups meteen zien in
 * plaats van er eerst op te moeten klikken.
 */
function LijstBlok({ lijst, heading, open: openInit = true }: {
  lijst: BattleLijstSamenvatting | null;
  heading: string;
  open?: boolean;
}) {
  const [open, setOpen] = useState(openInit);
  if (!lijst) return null;
  const units = lijst.units;
  const modellen = units.reduce((s, u) => s + (u.modellen || 0), 0);
  const detail = units.some((u) => u.punten != null || u.opties.length > 0);
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ ...eb, fontSize: 8, color: TOW.muted, marginBottom: 5 }}>{heading}</div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={units.length === 0}
        aria-expanded={open}
        style={{
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, width: '100%',
          border: `1px solid ${TOW.line}`, borderRadius: 9, background: TOW.panel2,
          padding: '9px 11px', textAlign: 'left', cursor: units.length ? 'pointer' : 'default',
        }}
      >
        <span style={{ minWidth: 0 }}>
          <span style={{ display: 'block', fontFamily: serif, fontSize: 13.5, color: TOW.parch }}>{lijst.naam}</span>
          <span style={{ display: 'block', fontFamily: serif, fontSize: 12, color: TOW.faint, marginTop: 1 }}>
            {[lijst.leger ? pretty(lijst.leger) : null,
              units.length ? `${units.length} units` : null,
              modellen ? `${modellen} models` : null].filter(Boolean).join(' · ')}
          </span>
        </span>
        <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 7 }}>
          {lijst.punten ? <span style={{ fontFamily: serif, fontSize: 12.5, color: TOW.parchDim }}>{lijst.punten} pts</span> : null}
          {units.length > 0 && <span style={{ fontFamily: serif, fontSize: 13, color: TOW.faint }}>{open ? '▾' : '▸'}</span>}
        </span>
      </button>
      {open && units.length > 0 && (
        <ul style={{ listStyle: 'none', margin: '6px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
          {units.map((u, i) => (
            <li key={u.uid ?? `${u.naam}-${i}`} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, padding: '0 3px' }}>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontFamily: serif, fontSize: 12.5, color: TOW.parchDim }}>
                  {u.modellen > 1 ? <span style={{ color: TOW.faint }}>{u.modellen}× </span> : null}
                  {u.datasheet || u.naam}
                  {u.cat ? <span style={{ color: TOW.faint }}> · {pretty(u.cat)}</span> : null}
                </span>
                {/* De eigen campagne-naam als EXTRA regel; het datasheet blijft de hoofdregel. */}
                {u.datasheet && u.naam && u.naam !== u.datasheet ? (
                  <span style={{ display: 'block', fontFamily: serif, fontStyle: 'italic', fontSize: 11.5, color: TOW.faint }}>
                    {u.naam}
                  </span>
                ) : null}
                {u.opties.length > 0 && (
                  <span style={{ display: 'block', fontFamily: serif, fontSize: 11.5, color: TOW.faint, lineHeight: 1.35 }}>
                    {u.opties.join(' · ')}
                  </span>
                )}
              </span>
              <span style={{ flexShrink: 0, fontFamily: serif, fontSize: 12, color: TOW.parchDim, fontVariantNumeric: 'tabular-nums' }}>
                {u.punten != null ? `${u.punten} pts` : '—'}
              </span>
            </li>
          ))}
          {!detail && (
            <li style={{ fontFamily: serif, fontSize: 11.5, color: TOW.faint, lineHeight: 1.35, padding: '0 3px' }}>
              Points and options per unit appear once this list has been synced from the builder again.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

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
  // The army waiting to go into the battle. Held here rather than opened straight away: the pre-game
  // briefing is the point of this screen, so starting is a separate, deliberate press.
  const [staged, setStaged] = useState<Army | null>(null);
  // Start-handshake: bezig-vlag + foutregel voor het zetten van je eigen "ik ben klaar".
  const [handBezig, setHandBezig] = useState(false);
  const [handFout, setHandFout] = useState<string | null>(null);
  // Leger van een AI-tegenstander. Die opent deze battle nooit zelf, dus zonder dit blijft hun kant van
  // de tracker leeg en moet jij hun lijst erbij zoeken (Joost 30-07). De AI-dummy is een gedeelde lijst,
  // dus die staat op je eigen apparaat en kan langs dezelfde weg geladen worden als je eigen leger.
  const [stagedTegen, setStagedTegen] = useState<Army | null>(null);

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

  // Wachten op de tegenpartij: zolang IK klaar sta en de ander niet, elke 3s de stand ophalen. Zonder
  // dit zou je op je eigen scherm blijven wachten tot je handmatig ververst (Joost 30-07).
  useEffect(() => {
    if (!battle?.handen) return;
    // Tegen een AI valt er niets te pollen: die kant is server-side al meegestempeld.
    const tegenIsAi = battle.aanvaller.id === myPlayerId ? battle.verdediger.ai : battle.aanvaller.ai;
    if (tegenIsAi) return;
    const mijn = battle.aanvaller.id === myPlayerId ? battle.handen.startAanv : battle.handen.startVerd;
    if (!mijn || battle.handen.beideGestart) return;
    const t = setInterval(() => {
      battleByCode(code)
        .then((b) => setBattle((cur) => (cur ? { ...cur, handen: b.handen ?? cur.handen } : b)))
        .catch(() => { /* stil: de volgende tik probeert het opnieuw */ });
    }, 3000);
    return () => clearInterval(t);
  }, [battle?.handen, battle?.aanvaller.id, myPlayerId, code]);


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

  /** Open de gedeelde tracker op deze code. Eén plek, want twee wegen leiden hierheen: jij drukt als
   *  laatste op Start, óf je tegenstander doet dat terwijl jij staat te wachten (de poll hieronder). */
  const startNu = useCallback(async (army: Army | null, tegenLeger: Army | null = null) => {
    if (!battle || !mySeat) return;
    const mijn = mySeat === 'host' ? battle.aanvaller : battle.verdediger;
    const tegen = mySeat === 'host' ? battle.verdediger : battle.aanvaller;
    // De GAME-REGELS van deze Act mee naar de tracker (21-08-2026): Battle March (5 rounds + de
    // halve VP-schaal) en het Disruptive Weather van de Act. Beide komen van de server, zodat de
    // twee spelers gegarandeerd onder dezelfde regels spelen; `openCampaignBattle` merget ze in de
    // tracker zonder een lopend potje te wissen.
    const ok = await openCampaignBattle(code, mySeat, mijn.naam || name, army, battle.veteranen, tegen.naam || undefined, tegenLeger, {
      battleMarch: battle.battleMarch,
      weer: weerVanBattle(battle),
    });
    if (ok) onDismiss(); // GameProvider heeft nu een seat → GameMode wisselt naar GameView
  }, [battle, mySeat, code, name, openCampaignBattle, onDismiss]);


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
        {loadErr === 'ONBEKENDE_CODE' && (
          <p style={{ fontFamily: serif, fontSize: 13, color: TOW.muted, margin: '-8px 0 16px' }}>
            This battle is over or was withdrawn. Clearing it takes you back to the normal Game tab.
          </p>
        )}
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
  // What KIND of battle this is (Conquest / Raid / Claim duel / The Calling / Challenge). Only labelled
  // and, where it matters, explained — how it is scored and reported does not depend on the type.
  const typeLabel = battleTypeLabel(battle.type);
  const typeNote = battleTypeNote(battle.type);

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
      // x/y are the piece's position on the table, in the same inches as tableW/tableH. Kept so the
      // battlefield can be DRAWN rather than only listed — without them a "map" would be decoration.
      return {
        type,
        size: w && h ? `${w}×${h}″` : null,
        difficult: o.difficult === true,
        x: asNum(o.x), y: asNum(o.y), w, h,
      };
    }).filter((t): t is { type: string; size: string | null; difficult: boolean; x: number | null; y: number | null; w: number | null; h: number | null } => !!t)
    : [];
  // 14-08-2026: de campagne schrijft de scenario-uitleg mee in de sheet, zodat we hier niet z'n
  // scenario-catalogus hoeven na te bouwen. Ontbreekt hij (oudere battles), dan valt het blok weg.
  const blurb = asStr(sheet.blurb);
  const deployNote = asStr(sheet.deployNote);
  const gameEnd = asStr(sheet.gameEnd);

  // ── De deployment-kaart (16-08-2026) ───────────────────────────────────────────────────────────
  // 14-08 ging de getekende plattegrond eruit: het bord werd op schaal getekend met de terreinstukken
  // op hun coördinaten, en dat suggereerde een precisie die er niet is — aan tafel zet je de stukken
  // toch naar smaak neer.
  //
  // 16-08 komt de kaart terug, maar in TWEE registers (Joost). Zones, maatlijnen en objectives worden
  // strak getekend, want dat ZIJN regels: waar je mag opstellen, hoe diep je zone is en waar de
  // objectives liggen staat niet ter discussie. Het terrein wordt gedempt getekend, met een bijschrift
  // dat het indicatief is. Wat de kaart toont komt bovendien KANT-EN-KLAAR uit de battle-sheet: de
  // campagne rekent de opstelling uit, wij tekenen alleen. Zie `CampaignBoard` voor het waarom.
  const sheetV = asNum(sheet.v) ?? 1;
  const tableW = asNum(sheet.tableW);
  const tableH = asNum(sheet.tableH);
  const layout = parseSheetLayout(sheet.layout);
  const secLayout = parseSheetSecLayout(sheet.secLayout);
  // De gerolde D6 achter deze opstelling. Ontbreekt hij op een v2-sheet, dan is het scenario geforceerd
  // (de campagne legt in `reden` uit waarom) — bij een v1-sheet weten we het simpelweg niet, en dan
  // zeggen we niets in plaats van 'forced' te beweren.
  const worp = asNum(sheet.worp);
  const worpObjectief = asNum(sheet.worpObjectief);
  // DISRUPTIVE WEATHER (v3, 17-08-2026): de campagne bakt naam + effect mee, dus we hoeven de officiële
  // tabel hier niet na te bouwen — precies zoals bij layout/secLayout. Alleen Battle March (Act 1-2)
  // heeft dit; elke oudere sheet levert undefined en dan tonen we het blok niet.
  // Sinds 21-08 levert de server het weer ook als LOS veld (één worp per Act voor het hele eiland);
  // `weerVanBattle` kiest dat veld en valt terug op de sheet-versie van oudere battles.
  const weer = weerVanBattle(battle);
  // DE SETUP-POOL (sheet v4, 20-08-2026). De campagne rolt niet meer per battle een eigen D6: de server
  // VERDEELT de zes setups over de battles van de Act (bij 14 generals zijn dat 7 battles, dus speelt
  // geen enkele tafel op één avond dezelfde setup). Er is dan geen worp, dus "Setup roll: 4" zou hier
  // een getal tonen dat nooit gegooid is — we noemen het uitgedeelde slot. Een echte worp blijft staan
  // voor battles buiten die verdeling (claim-duels, challenges) en voor oudere sheets. Zoals altijd
  // bouwen we de tabel hier NIET na: we tonen wat de sheet zegt.
  const setupSlot = asNum(sheet.setupSlot);
  const setupTotaal = asNum(sheet.setupTotaal);
  const setupGeforceerd = sheet.setupGeforceerd === true;
  const weerDeel = weer?.worp ? ` · Weather roll: ${weer.worp}` : '';
  const rollLine = worp != null
    ? `Setup roll: ${worp}${worpObjectief != null ? ` · Objectives roll: ${worpObjectief}` : ''}${weerDeel}`
    : setupSlot != null
      ? `${setupGeforceerd ? 'Setup forced — took ' : 'Setup '}${setupSlot}${setupTotaal != null ? ` of ${setupTotaal}` : ''} this Act${weerDeel}`
      : sheetV >= 2 ? `Setup: forced — no roll${weerDeel}` : null;

  // WIE STAAT WAAR. `defenderIsTop` leest het uit de zone-labels met de campagne-afspraak
  // (zone A = boven = verdediger) als terugval. Mijn eigen kant komt uit `mySeat`, de bestaande
  // stoel-bepaling van dit scherm: AANVALLER → host, VERDEDIGER → guest.
  const defenderTop = defenderIsTop(layout, tableH ?? 0, asStr(sheet.verdedigerKant));
  const ikBenVerdediger = mySeat === 'guest';
  const youSide: 'top' | 'bottom' | undefined = mySeat
    ? (ikBenVerdediger === defenderTop ? 'top' : 'bottom')
    : undefined;
  /** Bijschrift boven/onder het bord: rol, of jij dat bent, en wiens leger het is. */
  const kantLabel = (isDefender: boolean): string => {
    const side = isDefender ? battle.verdediger : battle.aanvaller;
    const rol = isDefender ? 'Defender' : 'Attacker';
    const wie = !mySeat ? null : isDefender === ikBenVerdediger ? 'you' : 'opponent';
    return `${rol}${wie ? ` — ${wie}` : ''}${side.naam ? ` · ${side.naam}` : ''}`;
  };
  /** Alleen terrein met een volledige positie kan getekend worden; de rest blijft in de chip-lijst. */

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
  const renderLijst = (lijst: typeof battle.aanvLijst, heading: string) => (
    <LijstBlok lijst={lijst} heading={heading} />
  );

  /** Campagne-veteranen van één kant (20-08-2026). `battle.veteranen` werd al gefetcht en geparsed maar
   *  nergens getekend: het reisde alleen door naar `openCampaignBattle` om op de units gestempeld te
   *  worden, dus je zag het pas ná het openen van de tracker — precies te laat voor een briefing.
   *
   *  Per unit: naam, XP en de gewonnen abilities (effect als tooltip) + scars. Units zonder XP,
   *  abilities én scars laten we weg: dat is een verse unit en die heeft hier niets te melden.
   *  De server vult dit veld alleen als beide legers gelockt zijn, dus beide kanten mogen. */
  const renderVets = (vets: VetUnit[] | undefined, heading: string) => {
    const rijen = (vets ?? []).filter((v) => v.xp > 0 || v.abilities.length > 0 || v.littekens > 0);
    if (rijen.length === 0) return null;
    return (
      <div style={{ marginTop: 12 }}>
        <div style={{ ...eb, fontSize: 8, color: TOW.muted, marginBottom: 5 }}>{heading}</div>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {rijen.map((v) => (
            <li key={v.unitId} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, padding: '0 3px' }}>
              <span style={{ fontFamily: serif, fontSize: 12.5, color: TOW.parchDim }}>
                {v.naam}
                {v.cat ? <span style={{ color: TOW.faint }}> · {pretty(v.cat)}</span> : null}
              </span>
              {v.xp > 0 && (
                <span
                  title={`${v.xp} campaign XP — rolls D6+${v.xp} on the veteran table after the battle`}
                  style={{ fontFamily: serif, fontSize: 11.5, padding: '2px 8px', borderRadius: 999, border: `1px solid ${TOW.goldDeep}`, background: 'rgba(184,134,47,0.18)', color: TOW.gold, fontVariantNumeric: 'tabular-nums', cursor: 'help' }}
                >
                  {v.xp} XP
                </span>
              )}
              {v.abilities.map((a, i) => {
                const eff = abilityEffect(a.t);
                return (
                  <span
                    key={i}
                    title={eff || undefined}
                    style={{ fontFamily: serif, fontSize: 11.5, padding: '2px 8px', borderRadius: 999, border: `1px solid ${TOW.goldDeep}`, background: 'rgba(184,134,47,0.10)', color: TOW.goldDeep, cursor: eff ? 'help' : 'default' }}
                  >
                    {abilityLabel(a.t)}{a.keuze ? ` · ${a.keuze.toUpperCase()}` : ''}
                  </span>
                );
              })}
              {v.littekens > 0 && (
                <span
                  title="Battle scars carried from earlier Acts"
                  style={{ fontFamily: serif, fontSize: 11.5, padding: '2px 8px', borderRadius: 999, border: `1px solid ${TOW.blood}`, background: 'transparent', color: TOW.blood, cursor: 'help' }}
                >
                  {scarLabel(v.littekens)}
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>
    );
  };

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
      <div style={{ ...eb, fontSize: 8.5, color: TOW.goldDeep, marginBottom: 8 }}>Campaign battle{typeLabel ? ` · ${typeLabel}` : ''} · {battle.code}{scenarioName ? ` · ${scenarioName}` : ''}</div>
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
      {/* DE BATTLE ZELF: naam als kop, de campagne-zin eronder als ondertitel (Joost 14-08). De naam
          stond alleen nog als staartje in het kleine eyebrow-regeltje bovenaan; als je hier binnenkomt
          wil je in één oogopslag zien wélk scenario je speelt. `reason` is de zin van de campagne,
          niet een parafrase. */}
      {(scenarioName || reason) && (
        <div style={{ marginTop: 12 }}>
          {scenarioName && (
            <div style={{ fontFamily: display, fontSize: 20, color: TOW.gold, lineHeight: 1.15 }}>{scenarioName}</div>
          )}
          {reason && (
            <div style={{ fontFamily: serif, fontSize: 13.5, color: TOW.parchDim, marginTop: 4 }}>{reason}</div>
          )}
          {/* De worp die dit scenario (en bij Battle March ook de objectives) opleverde. Klein, maar
              het scheelt het verschil tussen "dit is gerold" en "dit is opgelegd" — en `reason`
              hierboven vertelt in dat tweede geval waarom. */}
          {rollLine && (
            <div style={{ ...eb, fontSize: 8, color: TOW.muted, marginTop: 5 }}>{rollLine}</div>
          )}
        </div>
      )}

      {/* DISRUPTIVE WEATHER — geldt de hele game, dus dit is de regel die je aan tafel het vaakst
          terug moet lezen. Vandaar naam + volledig effect en niet alleen de worp. */}
      {weer && (
        <div style={{ marginTop: 10, border: `1px solid ${TOW.line}`, borderRadius: 10, padding: '10px 12px' }}>
          <div style={{ ...eb, fontSize: 8, color: TOW.muted }}>
            Disruptive weather{weer.worp ? ` · roll ${weer.worp}` : ''}
          </div>
          <div style={{ fontFamily: display, fontSize: 16, color: TOW.gold, marginTop: 3 }}>{weer.naam}</div>
          {weer.effect && (
            <div style={{ fontFamily: serif, fontSize: 12.5, color: TOW.parch, lineHeight: 1.45, marginTop: 4 }}>{weer.effect}</div>
          )}
          <div style={{ fontFamily: serif, fontSize: 12, color: TOW.muted, marginTop: 4 }}>
            Rolled before deployment; in play for the whole game.
          </div>
        </div>
      )}

      {/* Hoe je opstelt en wanneer het potje eindigt. Die tekst stond tot 14-08 alleen in de
          scenario-catalogus van de campagne-app; nu schrijft de campagne 'm mee in de battle-sheet,
          zodat de Companion hem heeft zonder die catalogus na te bouwen. */}
      {(blurb || deployNote || gameEnd) && (
        <div style={{ marginTop: 10, border: `1px solid ${TOW.line}`, borderRadius: 10, padding: '10px 12px' }}>
          {blurb && <div style={{ fontFamily: serif, fontSize: 13, color: TOW.parch, lineHeight: 1.45 }}>{blurb}</div>}
          {deployNote && <div style={{ fontFamily: serif, fontSize: 12.5, color: TOW.muted, lineHeight: 1.45, marginTop: blurb ? 6 : 0 }}>{deployNote}</div>}
          {gameEnd && <div style={{ fontFamily: serif, fontSize: 12.5, color: TOW.muted, lineHeight: 1.45, marginTop: 6 }}>Game end: {gameEnd}</div>}
        </div>
      )}

      {/* What the SORT of battle means, where that is not obvious from the rest of the screen. A
          challenge is the only one that leaves the map alone, so it is the only one that says so —
          and it says nothing about how the game is scored, because that is identical for every type. */}
      {typeNote && (
        <div style={{ fontFamily: serif, fontStyle: 'italic', fontSize: 13, color: TOW.muted, marginTop: 8 }}>{typeNote}</div>
      )}

      {/* Battle quests. The campaign calls them `secondaries`; they decide what you are playing FOR, so
          they belong on a pre-game screen. Slugs are title-cased for reading — the campaign remains the
          authority on what each one actually requires. */}
      {quests.length > 0 && chipRow('Battle quests', quests.map((q) => chip(pretty(q))))}

      {/* DE DEPLOYMENT-KAART. Alleen als de sheet een uitgerekende `layout` meebrengt — een oudere
          (v1) battle heeft die niet, en dan blijft dit scherm precies zoals het was. Boven en onder
          het bord staat wie daar opstelt, zodat je de kaart kunt lezen vanaf jouw kant van de tafel. */}
      {layout && tableW && tableH && (
        <div style={{ marginTop: 12 }}>
          <div style={{ ...eb, fontSize: 8, color: TOW.muted, marginBottom: 5 }}>Deployment</div>
          <div style={{ fontFamily: serif, fontSize: 12, color: youSide === 'top' ? TOW.goldDeep : TOW.muted, marginBottom: 4 }}>
            {kantLabel(defenderTop)}
          </div>
          <CampaignBoard
            layout={layout}
            secLayout={secLayout}
            tableW={tableW}
            tableH={tableH}
            youSide={youSide}
          />
          <div style={{ fontFamily: serif, fontSize: 12, color: youSide === 'bottom' ? TOW.goldDeep : TOW.muted, marginTop: 4 }}>
            {kantLabel(!defenderTop)}
          </div>
        </div>
      )}

      {/* Battlefield als LIJST — de maat, de grond en elk terreinstuk met z'n formaat. Genoeg om het
          bord te bouwen; de plaatsing doe je aan tafel. */}
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

      {/* Campagne-veteranen voor BEIDE kanten, direct onder de line-ups: welke units al XP hebben en
          wat ze aan abilities meebrengen is deel van wat er tegenover je staat. */}
      {battle.veteranen && (
        <>
          {renderVets(battle.veteranen.aanvaller, `${battle.aanvaller.naam || 'Attacker'} · campaign veterans`)}
          {renderVets(battle.veteranen.verdediger, `${battle.verdediger.naam || 'Defender'} · campaign veterans`)}
        </>
      )}

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
  const myLijst = mySeat === 'host' ? battle.aanvLijst : battle.verdLijst;
  const oppLijst = mySeat === 'host' ? battle.verdLijst : battle.aanvLijst;

  const oppSide = mySeat === 'host' ? battle.verdediger : battle.aanvaller;


  // ── De start-handshake ────────────────────────────────────────────────────────────────────────
  const mijnKant: 'aanvaller' | 'verdediger' = mySeat === 'host' ? 'aanvaller' : 'verdediger';
  const handen = battle.handen;
  const ikGereed = !!handen && !!(mijnKant === 'aanvaller' ? handen.startAanv : handen.startVerd);
  const beideGestart = !!handen?.beideGestart;
  // Een battle wordt in de WAR PHASE gespeeld: zolang er nog generals marcheren weigert de server een
  // start (NOG_REALM_PHASE). Ontbreekt het veld (oudere server), dan is er ook geen poort → open laten.
  const magStarten = battle.warFase !== false;

  /** Zet of trek mijn Start-stempel in. Opent NIETS: staan beide kanten, dan wisselt de knop naar
   *  "Open battle" en druk je zelf door — anders schiet dit briefing-scherm voorbij. */
  const zetHand = async (aan: boolean) => {
    if (handBezig) return;
    setHandBezig(true);
    setHandFout(null);
    try {
      const h = await battleHandZet(code, mijnKant, 'start', aan);
      setBattle((b) => (b ? { ...b, handen: h ?? b.handen } : b));
    } catch (e) {
      setHandFout(e instanceof Error ? e.message : 'Could not set your readiness.');
    } finally {
      setHandBezig(false);
    }
  };


  return wrap(
    <>
      {header}

      <div style={{ ...eb, fontSize: 8.5, color: TOW.goldDeep, marginBottom: 6 }}>
        You are the {mySeat === 'host' ? 'attacker' : 'defender'}{mySide.naam ? ` · ${mySide.naam}` : ''}
      </div>
      <p style={{ fontFamily: serif, fontSize: 14, color: TOW.parchDim, margin: '0 0 16px' }}>
        {myLijst?.naam
          ? <>Your campaign list is locked as <strong>“{myLijst.naam}”</strong>{myLijst.punten ? ` (${myLijst.punten} pts)` : ''} and loads by itself. Read the briefing above, then start the battle when you are ready — your opponent opens the same code on their device and you play with the live tracker.</>
          : <>Load your <strong>full Companion army list</strong> for this battle, then start it. Your opponent opens the same code on their device and you play with the live tracker.</>}
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
        // STAGES the army; it does not start the battle. Handing this straight to `openWith` made the
        // whole briefing flash past — the army loaded, the game opened, and the screen you came here to
        // read was gone before you could read it. Loading and starting are two decisions, and only the
        // second one is yours to make.
        onPick={setStaged}
        label="Choose your army list for this battle"
        lockedListName={myLijst?.naam ?? null}
        lockedListArmy={myLijst?.leger ?? null}
        campaignPlayerId={myPlayerId}
        autoPick
        stil
      />

      {/* AI-tegenstander: hun leger komt van deze kant mee, want er is geen tweede device dat 'm gaat
          openen. De AI-dummy is een gedeelde lijst, dus dezelfde picker vindt 'm op naam + leger. Bij
          een MENSELIJKE tegenstander doen we dit niet: dan is hun lijst hun eigen zaak. */}
      {oppSide.ai && oppLijst && (
        <ArmyListPicker
          onPick={setStagedTegen}
          label={`${oppSide.naam || 'Opponent'} — the campaign's AI list`}
          lockedListName={oppLijst.naam}
          lockedListArmy={oppLijst.leger}
          autoPick
          stil
        />
      )}

      {/* ── Twee handen op de knop, in twee stappen (Joost 30-07) ──────────────────────────────────
          1. "Start battle" zet JOUW stempel op de battle. Eén speler kon eerder alleen beginnen — en
             zelfs afsluiten — terwijl de ander nog niets gedaan had.
          2. Staan beide stempels, dan verschijnt "Open battle" en ga je zélf naar de tracker. Dat
             openen gebeurt NIET automatisch: dit briefing-scherm is het halve punt van deze pagina, en
             met een stempel van een vorige sessie schoot je er anders meteen door.
          Een AI-kant stempelt server-side automatisch mee, dus daar sta je direct op stap 2.
          Draait de server nog zonder handen-stand (`handen === undefined`), dan blijft de oude directe
          start over — beter dan een knop die niets doet. */}
      <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', marginTop: 14 }}>
        <button
          onClick={() => {
            if (!handen) { void startNu(staged, stagedTegen); return; } // oude server: één druk, direct openen
            if (beideGestart) { void startNu(staged, stagedTegen); return; } // stap 2
            if (!ikGereed) void zetHand(true);                  // stap 1
          }}
          disabled={busy || handBezig || !magStarten || (ikGereed && !beideGestart)}
          style={{
            border: `1px solid ${TOW.goldDeep}`, borderRadius: 10,
            background: beideGestart || staged || ikGereed ? 'rgba(184,134,47,0.16)' : 'transparent',
            color: TOW.gold,
            cursor: busy || handBezig || (ikGereed && !beideGestart) ? 'default' : 'pointer', padding: '11px 20px',
            fontFamily: display, fontWeight: 700, fontSize: 14.5,
            opacity: busy || handBezig || (ikGereed && !beideGestart) ? 0.5 : 1,
          }}
        >
          {busy ? 'Opening…' : handBezig ? 'Working…'
            : !magStarten ? 'Not yet — Realm phase'
            : beideGestart ? 'Open battle'
            : ikGereed ? 'Waiting for your opponent…'
            : 'Start battle'}
        </button>
        {ikGereed && !beideGestart && !oppSide.ai && (
          <button
            onClick={() => void zetHand(false)}
            disabled={handBezig}
            style={{
              border: `1px solid ${TOW.line}`, borderRadius: 10, background: 'transparent',
              color: TOW.parchDim, cursor: handBezig ? 'default' : 'pointer', padding: '10px 16px',
              fontFamily: display, fontWeight: 700, fontSize: 13.5,
            }}
          >
            Not ready yet
          </button>
        )}
        <span style={{ fontFamily: serif, fontSize: 13, color: TOW.muted }}>
          {!magStarten
            ? 'The campaign is still in its Realm phase — generals are taking their turns. Read the briefing; the battle opens once every general has marched.'
            : beideGestart
            ? oppSide.ai
              // Een AI heeft geen device om op te drukken; die kant stemt server-side automatisch mee.
              ? `${oppSide.naam || 'Your opponent'} is run by the campaign, so no second press is needed — read the briefing, then open the battle when you are ready.`
              : `Both sides are ready. Open the battle to move to the tracker on code ${code}.`
            : ikGereed
            ? `You are ready. ${oppSide.naam || 'Your opponent'} has to press Start on their own device before you can open the battle.`
            : staged
              ? `${staged.units.length} unit${staged.units.length === 1 ? '' : 's'} loaded — press Start to tell your opponent you are ready.`
              // Ready zonder leger mag bewust: liever beide spelers in de tracker en de lijst daar
              // toevoegen dan vastzitten achter een lijst die dit apparaat niet kan bouwen.
              : 'No army loaded yet — you can still press Start and add it inside the game.'}
        </span>
        {dismissBtn}
      </div>
      {handFout && <div style={{ fontFamily: serif, fontSize: 13.5, color: TOW.blood, marginTop: 10 }}>{handFout}</div>}

      {error && <div style={{ fontFamily: serif, fontSize: 13.5, color: TOW.blood, marginTop: 12 }}>{error}</div>}
    </>,
  );
}
