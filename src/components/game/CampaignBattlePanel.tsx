import { useCallback, useEffect, useState } from 'react';
import { TOW, towFont, engraved } from '../../design/tow';
import { useGame } from '../../game';
import { getCachedCampaign, getCampaignCode } from '../../lib/campaign';
import { battleByCode, battleHandZet, battleTypeLabel, battleTypeNote, abilityLabel, abilityEffect, scarLabel, weerVanBattle, type CampaignBattle, type BattleSide, type Perk, type FoundItem, type BattleLijstSamenvatting, type VetUnit } from '../../lib/campaignBattle';
import { ArmyListPicker } from './ArmyListPicker';
import { CampaignBoard, defenderIsTop, parseSheetLayout, parseSheetSecLayout } from './CampaignBoard';
import type { Army } from '../../types';
import { isTestBattleCode } from '../../lib/testBattle';
import { useStatIndex } from '../../lib/useStatIndex';
import { overlayStatsFor } from '../../lib/overlays';
import { pasVeteraanToe, veteraanBonussen, celDelta, BETER_KLEUR, BETER_ACHTERGROND, type StatCel } from '../../lib/veteraanStats';
import { isVrijPotjeCode } from '../../lib/battleCode';
import { TERRAIN_PLACEMENT_SHORT, TERRAIN_PLACEMENT_STEPS } from '../../lib/terrainPlacement';
import { objectiveBriefings, BM_FIRST_TURN, BM_GAME_LENGTH, type ObjectiveBriefing } from '../../lib/battleMarchObjectives';

const eb = engraved as React.CSSProperties;
const display = towFont.display;
const serif = towFont.serif;

/** Slug → readable ("empire-of-man" → "Empire of man"). Module scope so the list block can use it too. */
const pretty = (s: string) => s.replace(/[-_]/g, ' ').replace(/^./, (c) => c.toUpperCase());

/** Het GRONDTYPE van de hex waarop gevochten wordt. De campagne bewaart dat in het Nederlands
 *  ('woud', 'vlakte'), en het stond als kale chip tussen de Engelse terreinstukken — dan lijkt
 *  "Woud" nog een stuk terrein naast "Wood · difficult" (Joost, 30-08). Vertaald, en met "region"
 *  erachter zodat meteen duidelijk is dat dit de streek is en niet iets wat je op tafel legt.
 *
 *  De acht waarden komen uit de kaart zelf (towc_map.types), plus bergpas die alleen op battles
 *  voorkomt. Een onbekende waarde valt terug op `pretty` — beter een Nederlands woord dan niets. */
const GROND: Record<string, string> = {
  zee: 'Sea', woud: 'Forest', vlakte: 'Plains', bergen: 'Mountains', heuvels: 'Hills',
  moeras: 'Marsh', kust: 'Coast', meer: 'Lake', bergpas: 'Mountain pass',
};
const grondLabel = (s: string): string => (GROND[s.toLowerCase().trim()] ? `${GROND[s.toLowerCase().trim()]} region` : pretty(s));

/** Eén terreinstuk zoals dit scherm het nodig heeft: soort, kenmerken en (soms) wiens helft. */
interface TerreinStuk {
  type: string;
  difficult: boolean;
  dangerous: boolean;
  /** Alleen gezet bij het STERKTEPUNT van de hex: het stuk hoort op de helft van die kant. */
  side: 'defender' | 'attacker' | null;
}

/** Leesbare namen van de terreinsoorten die de campagne genereert (enkelvoud, meervoud). De labels
 *  volgen de campagne zelf (TERRAIN_TYPES in de campagne-repo); onbekend valt terug op `pretty`. */
const TERREIN: Record<string, [string, string]> = {
  hill: ['Hill', 'hills'], wood: ['Wood', 'woods'], field: ['Field', 'fields'], marsh: ['Marsh', 'marshes'],
  building: ['Building', 'buildings'], obstacle: ['Rampart / Wall', 'ramparts / walls'],
};
const terreinNaam = (type: string): string => TERREIN[type.toLowerCase()]?.[0] ?? pretty(type);
const terreinMeervoud = (type: string): string => TERREIN[type.toLowerCase()]?.[1] ?? `${pretty(type).toLowerCase()}s`;
/** Het kenmerk achter de soort. Difficult én dangerous heet "dangerous terrain" (Joost, 05-10). */
const terreinKenmerk = (t: TerreinStuk): string | null =>
  t.dangerous ? 'dangerous terrain' : t.difficult ? 'difficult terrain' : null;

/** +3 / −1 / +0 — een roll-off-modifier zoals je hem aan tafel optelt. */
const metTeken = (n: number): string => (n < 0 ? `−${Math.abs(n)}` : `+${n}`);

/** Veteranen die iets te melden hebben: XP, abilities of scars. Een verse unit valt weg. */
const vetRijen = (vets: VetUnit[] | undefined): VetUnit[] =>
  (vets ?? []).filter((v) => v.xp > 0 || v.abilities.length > 0 || v.littekens > 0);

/**
 * Eén sectie van de briefing (05-10-2026): genummerde kop, korte ondertitel, eigen accentkleur.
 * WAAROM ZO. Joost wilde "een duidelijker onderscheid" tussen battle-info, opstelling, legers en
 * reminders. Op een telefoon scrol je door één lange kolom; de bovenrand en het nummer vertellen je
 * zonder lezen in welk deel je zit, de stijl blijft het perkament-en-goud van de app. LET OP: de
 * Ivory-skin heeft maar één accent-tint (gold = blood = karmijn), dus het onderscheid zit in een mix
 * van accent, neutraal (muted/ink), tint en een gestippelde rand — niet in kleur alleen.
 */
function Sectie({ nr, titel, onder, accent, tint = false, gestippeld = false, children }: {
  nr: number;
  titel: string;
  onder?: string;
  accent: string;
  /** Lichte goudtint als achtergrond (Objectives). */
  tint?: boolean;
  /** Gestippelde bovenrand (Reminders): in de Ivory-skin zijn gold en blood dezelfde kleur, dus
   *  kleur alleen onderscheidt Battle en Reminders daar niet. */
  gestippeld?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        border: `1px solid ${TOW.line}`, borderTop: `3px ${gestippeld ? 'dashed' : 'solid'} ${accent}`, borderRadius: 12,
        background: tint ? `linear-gradient(rgba(184,134,47,0.07), rgba(184,134,47,0.07)), ${TOW.panel2}` : TOW.panel2,
        padding: '12px 15px 15px', marginBottom: 14,
      }}
    >
      <h2 style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: 0 }}>
        <span style={{ ...eb, fontSize: 10, color: accent }}>{nr} ·</span>
        <span style={{ fontFamily: display, fontWeight: 700, fontSize: 18, color: TOW.ink }}>{titel}</span>
      </h2>
      {onder && <div style={{ fontFamily: serif, fontStyle: 'italic', fontSize: 12.5, color: TOW.muted, margin: '1px 0 10px' }}>{onder}</div>}
      {!onder && <div style={{ height: 8 }} />}
      {children}
    </section>
  );
}

/** Een LETTERLIJKE regeltekst. Eigen vorm (lijn links, cursief) zodat je ziet: dit is het boek,
 *  niet de app — wat de app zelf zegt staat er nooit zo bij. */
function RegelTekst({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontFamily: serif, fontStyle: 'italic', fontSize: 12.5, color: TOW.parch, lineHeight: 1.5, borderLeft: `2px solid ${TOW.goldDeep}`, paddingLeft: 9 }}>
      {children}
    </div>
  );
}

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
  // Statline-index (gedeeld, één fetch per sessie): voor de basiswaarde onder een veteraan-bonus.
  const statIdx = useStatIndex();
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
  // context the same way Settings does; no fetch here — the link is a prerequisite.
  // De TESTBATTLE hoeft geen gekoppeld campagneprofiel: hij bestaat alleen op dit apparaat en er is
  // geen kant om aan toegewezen te worden. Zonder deze uitzondering strandt hij op "link this app
  // to your campaign profile first" en valt er niets te testen — precies waar hij voor bedoeld is.
  // Je speelt er altijd de AANVALLER; de tegenstander is de tweede lijst die je koos.
  const testBattle = isTestBattleCode(code);
  const myPlayerId = testBattle
    ? (battle?.aanvaller.id ?? 'test-a')
    : getCachedCampaign()?.context?.speler.id ?? null;
  const linked = testBattle || (!!getCampaignCode() && !!myPlayerId);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadErr(null);
    try {
      const b = await battleByCode(code);
      setBattle(b);
    } catch (e) {
      // Een PostgREST-fout is een gewoon object, geen Error: zonder dit werd ONBEKENDE_CODE altijd
      // "Could not load this battle" en zag de speler nooit wat er echt mis was (29-09-2026).
      const msg = e instanceof Error ? e.message
        : e && typeof e === 'object' && typeof (e as { message?: unknown }).message === 'string' ? (e as { message: string }).message
        : '';
      setLoadErr(msg || 'Could not load this battle.');
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
          {loadErr === 'ONBEKENDE_CODE'
            ? isVrijPotjeCode(code)
              ? `${code} is a friendly game code, not a campaign battle. Go back and use New battle › Join battle.`
              : `No campaign battle found for code ${code}.`
            : (loadErr || 'Could not load this battle.')}
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
  /** De OBJECTIVES van deze battle. De campagne noemt ze `secondaries` (ids als 'bm-troves-3'); wat ze
   *  zijn, waar ze liggen en wat de regel zegt komt uit `objectiveBriefings` — letterlijk van de
   *  regel-site, nooit door ons samengevat. */
  const secondaries = Array.isArray(sheet.secondaries)
    ? (sheet.secondaries as unknown[]).map(asStr).filter((q): q is string => !!q)
    : [];
  // GEEN AFMETINGEN (Joost 21-08-2026: "niet de afmetingen van de terrainpieces erbij"). Een
  // gegenereerde 8x5" suggereerde een precisie die er niet is -- aan tafel pak je het stuk dat je hebt.
  // Het TYPE is de regel (hill/wood/marsh bepaalt de terreinregels), de maat was decoratie; de kaart
  // tekent sinds 16-08 geen terrein meer, dus ook de coördinaten hoeven hier niet mee.
  // WEL `dangerous` en `side` (05-10-2026): die werden weggegooid, terwijl `side` precies zegt welk
  // stuk het sterktepunt van de hex is en op wiens helft het hoort.
  const terrain = Array.isArray(sheet.terrain)
    ? (sheet.terrain as unknown[]).map((t): TerreinStuk | null => {
      const o = (t && typeof t === 'object' ? t : {}) as Record<string, unknown>;
      const type = asStr(o.type);
      if (!type) return null;
      return {
        type,
        difficult: o.difficult === true,
        dangerous: o.dangerous === true,
        side: o.side === 'defender' || o.side === 'attacker' ? o.side : null,
      };
    }).filter((t): t is TerreinStuk => !!t)
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
  const toontKaart = !!(layout && tableW && tableH);
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

  // ── Objectives (05-10-2026) ────────────────────────────────────────────────────────────────────
  // Joost: "dit zijn Objectives" — zo heten ze in Battle March, dus zo heten ze hier. Per objective: wat het is, WAAR het ligt
  // (uitgerekend uit de coördinaten van de campagne) en de letterlijke regel. Geen objectives bij een
  // CHALLENGE (12-09-2026, Joost): een challenge staat buiten de campagne; ze hier tonen wekt de indruk
  // dat er iets mee te halen valt.
  const briefings = battle.type !== 'challenge'
    ? objectiveBriefings(secondaries, secLayout, tableW, tableH)
    : [];
  const heeftLandmark = briefings.some((b) => b.id === 'bm-landmark');

  // ── Terrein: wat je nodig hebt (05-10-2026) ────────────────────────────────────────────────────
  // Joost: "maak duidelijker welke terrain pieces je nodig hebt". Eén regel per soort met een aantal,
  // in plaats van een chip per stuk — dat is de boodschappenlijst waarmee je de doos in gaat.
  const benodigd = Object.values(terrain.reduce<Record<string, { naam: string; kenmerk: string | null; n: number }>>((acc, t) => {
    const kenmerk = terreinKenmerk(t);
    const key = `${t.type}|${kenmerk ?? ''}`;
    acc[key] = acc[key] ?? { naam: terreinNaam(t.type), kenmerk, n: 0 };
    acc[key].n += 1;
    return acc;
  }, {})).sort((a, b) => b.n - a.n || a.naam.localeCompare(b.naam) || (a.kenmerk ?? '').localeCompare(b.kenmerk ?? ''));
  // HET STERKTEPUNT. Staat er een nederzetting/gebouw op de hex, dan voegt de campagne-generator een
  // extra stuk toe (een heuvel, of een bos op een woud-hex) dat op de helft van de verdediger hoort:
  // het staat voor die nederzetting. De sheet merkt het met `side`; zonder dat veld zeggen we niets.
  const sterktepunten = terrain.filter((t) => t.side).map((t) => {
    const zelfde = terrain.filter((x) => x.type === t.type).length;
    const rol = t.side === 'attacker' ? 'attacker' : 'defender';
    const wie = (rol === 'attacker' ? battle.aanvaller : battle.verdediger).naam;
    const stuk = zelfde > 1 ? `One of the ${terreinMeervoud(t.type)}` : `The ${terreinNaam(t.type).toLowerCase()}`;
    return `${stuk} is the strongpoint of the ${rol}${wie ? `, ${wie}` : ''}: it goes on the ${rol}'s half of the table and stands in for the settlement on this hex.`;
  });

  // DE VOLGORDE aan tafel. Procedurele lijm, geen regel: alleen welke sectie je wanneer nodig hebt.
  // Joost (05-10-2026): "eerst deploymentzones markeren, dan de objectives, en dan het terrein". Met de
  // zones en objectives al op tafel zie je bij het om de beurt plaatsen van het terrein meteen wat je
  // afschermt of vrijlaat. (Het boek legt het terrein juist eerst; dit is de volgorde van Celedon.)
  const setupStappen: string[] = [];
  if (toontKaart || deployNote) setupStappen.push(toontKaart ? 'Mark the deployment zones (map below).' : 'Mark the deployment zones (see below).');
  if (briefings.length > 0) setupStappen.push('Set up the objectives — see Objectives.');
  if (heeftLandmark) setupStappen.push("Roll for the landmark's unusual property — see Objectives.");
  if (terrain.length > 0) setupStappen.push('Place the terrain (below).');
  setupStappen.push('Deploy your armies in their zones.');
  const heeftSetup = setupStappen.length > 1 || !!groundType || !!battle.hexGebouw || terrain.length > 0 || toontKaart || !!deployNote;

  /** Een feit-chip in de Battle-sectie (Battle March, punten, tafel, rondes). */
  const feit = (text: string) => (
    <span
      key={text}
      style={{ fontFamily: serif, fontSize: 12.5, padding: '3px 10px', borderRadius: 999, border: `1px solid ${TOW.line}`, background: TOW.bg, color: TOW.parch }}
    >
      {text}
    </span>
  );
  const feiten = [
    typeLabel,
    battle.battleMarch ? 'Battle March' : null,
    battle.cap ? `${battle.cap} pts` : null,
    tableLabel,
    battle.battleMarch ? '5 rounds' : null,
  ].filter((f): f is string => !!f);

  /** Kleine kop binnen een sectie. */
  const subkop = (text: string, mt = 12) => (
    <div style={{ ...eb, fontSize: 8, color: TOW.muted, marginTop: mt, marginBottom: 5 }}>{text}</div>
  );

  /** Een letterlijke regeltabel (de Unusual Properties van de landmark): twee kolommen, smal genoeg
   *  voor een telefoon — de eerste kolom houdt z'n worp op één regel, de tweede loopt door. */
  const regelTabel = (t: NonNullable<ObjectiveBriefing['table']>) => (
    <div>
      {subkop(t.heading, 9)}
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {t.columns.map((c) => (
              <th key={c} style={{ ...eb, fontSize: 8, color: TOW.muted, textAlign: 'left', padding: '0 8px 4px 0', borderBottom: `1px solid ${TOW.line}` }}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {t.rows.map(([a, c]) => (
            <tr key={a}>
              <td style={{ fontFamily: display, fontWeight: 700, fontSize: 13, color: TOW.goldDeep, verticalAlign: 'top', padding: '5px 10px 5px 0', whiteSpace: 'nowrap', borderBottom: `1px solid ${TOW.line}` }}>{a}</td>
              <td style={{ fontFamily: serif, fontStyle: 'italic', fontSize: 12.5, color: TOW.parch, lineHeight: 1.45, padding: '5px 0', borderBottom: `1px solid ${TOW.line}` }}>{c}</td>
            </tr>
          ))}
        </tbody>
      </table>
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
  // VETERANEN-STATS VOORAF (08-10-2026, Joost): wat een ability aan de statline verandert, voor beide
  // kanten, vóór je opstelt. Basis uit de statline-index via de catalogusnaam van de line-up-regel met
  // dezelfde uid; zonder statline (oude battle, onbekende naam) alleen de bonus zelf ("Ld +1").
  const vetStats = (v: VetUnit, lijst: BattleLijstSamenvatting | null | undefined): { k: string; tekst: string; titel: string }[] => {
    const bonus = veteraanBonussen(v.abilities);
    const sleutels = Object.keys(bonus);
    if (!sleutels.length) return [];
    const regel = lijst?.units.find((u) => u.uid && u.uid === v.unitId);
    const rows = statIdx && regel?.datasheet ? overlayStatsFor(statIdx, regel.datasheet, null, lijst?.leger) : [];
    const rij = rows.find((r) => /^\d+$/.test(String(r.Ld ?? '').trim()));
    if (rij) {
      const cellen = pasVeteraanToe(Object.entries(rij).filter(([k]) => k !== 'Name').map(([k, val]): StatCel => ({ k, v: String(val ?? '') })), v.abilities);
      return cellen.filter((c) => celDelta(c) != null).map((c) => ({ k: c.k, tekst: `${c.k} ${c.v} (+${celDelta(c)})`, titel: `${c.k} ${c.base} → ${c.v}: ${c.source}` }));
    }
    return sleutels.map((k) => {
      const naam = k === 'ld' ? 'Ld' : k.toUpperCase();
      return { k: naam, tekst: `${naam} +${bonus[k].n}`, titel: bonus[k].bron.join(' + ') };
    });
  };

  const renderVets = (vets: VetUnit[] | undefined, heading: string, lijst?: BattleLijstSamenvatting | null) => {
    const rijen = vetRijen(vets);
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
              {vetStats(v, lijst).map((c) => (
                <span
                  key={c.k}
                  title={c.titel}
                  style={{ fontFamily: serif, fontSize: 11.5, fontWeight: 700, padding: '2px 8px', borderRadius: 999, border: `1px solid ${BETER_KLEUR}`, background: BETER_ACHTERGROND, color: BETER_KLEUR, fontVariantNumeric: 'tabular-nums', cursor: 'help' }}
                >
                  {c.tekst}
                </span>
              ))}
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

  // ── Reminders: perks en items met hun EFFECT als tekst (05-10-2026) ────────────────────────────
  // Tot vandaag stond het effect alleen in een `title`-tooltip, en op een telefoon bestaat hover niet:
  // je zag "Outpost Watch" en moest raden wat het deed. Nu staat het effect eronder, leesbaar.
  const renderPerks = (perks: Perk[]) =>
    perks.length > 0 ? (
      <div>
        {subkop(perks.length > 1 ? 'Active perks' : 'Active perk', 8)}
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 7 }}>
          {perks.map((p, i) => (
            <li key={`${p.perk}-${i}`}>
              <div style={{ fontFamily: display, fontWeight: 700, fontSize: 13.5, color: TOW.goldDeep }}>{p.label}</div>
              {p.effect && <div style={{ fontFamily: serif, fontSize: 12.5, color: TOW.parch, lineHeight: 1.45, marginTop: 1 }}>{p.effect}</div>}
            </li>
          ))}
        </ul>
      </div>
    ) : null;

  // Attached found magic items (up to 2 per side since 16-08): name + points, a "Single use" tag when
  // it's a consumable, and the effect as visible text underneath.
  const renderItems = (items: FoundItem[]) =>
    items.length > 0 ? (
      <div>
        {subkop(items.length > 1 ? 'Magic items' : 'Magic item', 8)}
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 7 }}>
          {items.map((item, i) => (
            <li key={`${item.naam}-${i}`}>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 7 }}>
                <span style={{ fontFamily: display, fontWeight: 700, fontSize: 13.5, color: TOW.goldDeep }}>
                  {item.naam}{item.punten ? <span style={{ fontFamily: serif, fontWeight: 400, fontSize: 12.5, color: TOW.muted }}> · {item.punten} pts</span> : null}
                </span>
                {item.soort === 'consumable' && (
                  <span style={{ ...eb, fontSize: 8, padding: '3px 8px', borderRadius: 999, border: `1px solid ${TOW.line}`, background: TOW.bg, color: TOW.muted }}>
                    Single use
                  </span>
                )}
              </div>
              {item.effect && <div style={{ fontFamily: serif, fontSize: 12.5, color: TOW.parch, lineHeight: 1.45, marginTop: 1 }}>{item.effect}</div>}
            </li>
          ))}
        </ul>
      </div>
    ) : null;

  /** Kop van één kant binnen Armies/Reminders: kleurstip + rol + naam. */
  const kantKop = (side: BattleSide, rol: 'Attacker' | 'Defender') => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
      <span style={{ width: 10, height: 10, borderRadius: 99, background: side.kleur || TOW.gold, border: `1px solid ${TOW.line}`, flexShrink: 0 }} />
      <span style={{ fontFamily: display, fontWeight: 700, fontSize: 14, color: TOW.ink }}>
        {rol}{side.naam ? <span style={{ fontWeight: 400, color: TOW.parchDim }}> · {side.naam}</span> : null}
      </span>
    </div>
  );

  const kanten = [
    { rol: 'Attacker' as const, side: battle.aanvaller, lijst: battle.aanvLijst, vets: battle.veteranen?.aanvaller,
      perks: battle.perks?.aanvaller ?? [], items: battle.items?.aanvaller ?? [], roll: battle.rollOff?.aanvaller ?? [] },
    { rol: 'Defender' as const, side: battle.verdediger, lijst: battle.verdLijst, vets: battle.veteranen?.verdediger,
      perks: battle.perks?.verdediger ?? [], items: battle.items?.verdediger ?? [], roll: battle.rollOff?.verdediger ?? [] },
  ];
  const heeftLegers = kanten.some((k) => k.lijst || vetRijen(k.vets).length > 0);
  // ROLL-OFF VOOR DE EERSTE BEURT (05-10-2026). De server levert per kant de modifiers en hun bron
  // (War Hall, Watchtower, Scouting Outpost, Raider's Den); wij tellen alleen op wat er staat.
  const heeftRollOff = kanten.some((k) => k.roll.length > 0);
  const heeftReminders = heeftRollOff || kanten.some((k) => k.perks.length > 0 || k.items.length > 0);

  // Secties nummeren we doorlopend: valt Objectives weg (challenge, of geen secondaries), dan volgt
  // er geen gat tussen 2 en 4.
  let sectieNr = 0;
  const volgende = () => ++sectieNr;

  // ── De briefing: kop + vijf secties (05-10-2026) ───────────────────────────────────────────────
  // Joost: "maak een duidelijker onderscheid tussen battle info, battlefield setup, de armies en de
  // reminders." Alles stond in één kaart; nu vijf kaarten in de volgorde waarin je ze aan tafel nodig
  // hebt, elk met een eigen accentkleur zodat je op een telefoon ziet in welk deel je zit.
  const header = (
    <>
      <div style={{ border: `1px solid ${TOW.line}`, borderRadius: 12, background: TOW.panel2, padding: '14px 15px', marginBottom: 14 }}>
        <div style={{ ...eb, fontSize: 8.5, color: TOW.goldDeep, marginBottom: 8 }}>Campaign battle{typeLabel ? ` · ${typeLabel}` : ''} · {battle.code}</div>
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

      {/* ── 1 · BATTLE ── wat je speelt: scenario, soort, grootte, rondes, weer. */}
      <Sectie nr={volgende()} titel="Battle" onder="What you are playing" accent={TOW.gold}>
        {/* DE BATTLE ZELF: naam als kop, de campagne-zin eronder als ondertitel (Joost 14-08).
            `reason` is de zin van de campagne, niet een parafrase. */}
        {scenarioName && (
          <div style={{ fontFamily: display, fontSize: 21, color: TOW.gold, lineHeight: 1.15 }}>{scenarioName}</div>
        )}
        {reason && (
          <div style={{ fontFamily: serif, fontSize: 13.5, color: TOW.parchDim, marginTop: 4 }}>{reason}</div>
        )}
        {feiten.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginTop: 10 }}>{feiten.map(feit)}</div>
        )}
        {/* "5 rounds" is een regel van Battle March: de letterlijke zin staat er direct onder. */}
        {battle.battleMarch && <div style={{ marginTop: 8 }}><RegelTekst>{BM_GAME_LENGTH}</RegelTekst></div>}
        {/* De worp die dit scenario (en bij Battle March ook de objectives) opleverde. Klein, maar
            het scheelt het verschil tussen "dit is gerold" en "dit is opgelegd" — en `reason`
            hierboven vertelt in dat tweede geval waarom. */}
        {rollLine && (
          <div style={{ ...eb, fontSize: 8, color: TOW.muted, marginTop: 9 }}>{rollLine}</div>
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

        {/* Waar het scenario over gaat en wanneer het potje eindigt. Die tekst stond tot 14-08 alleen
            in de scenario-catalogus van de campagne-app; nu schrijft de campagne 'm mee in de sheet.
            De `deployNote` staat sinds 05-10 bij de deployment-kaart in Battlefield setup. */}
        {(blurb || gameEnd) && (
          <div style={{ marginTop: 10, border: `1px solid ${TOW.line}`, borderRadius: 10, padding: '10px 12px' }}>
            {blurb && <div style={{ fontFamily: serif, fontSize: 13, color: TOW.parch, lineHeight: 1.45 }}>{blurb}</div>}
            {gameEnd && <div style={{ fontFamily: serif, fontSize: 12.5, color: TOW.muted, lineHeight: 1.45, marginTop: blurb ? 6 : 0 }}>Game end: {gameEnd}</div>}
          </div>
        )}

        {/* What the SORT of battle means, where that is not obvious from the rest of the screen. A
            challenge is the only one that leaves the map alone, so it is the only one that says so —
            and it says nothing about how the game is scored, because that is identical for every type. */}
        {typeNote && (
          <div style={{ fontFamily: serif, fontStyle: 'italic', fontSize: 13, color: TOW.muted, marginTop: 8 }}>{typeNote}</div>
        )}
      </Sectie>

      {/* ── 2 · BATTLEFIELD SETUP ── wat je nodig hebt en hoe je het neerzet. */}
      {heeftSetup && (
      <Sectie nr={volgende()} titel="Battlefield setup" onder="What goes on the table, in this order" accent={TOW.muted}>
        {setupStappen.length > 1 && (
          <ol style={{ margin: 0, paddingLeft: 20, listStyleType: 'decimal', display: 'flex', flexDirection: 'column', gap: 3 }}>
            {setupStappen.map((s) => (
              <li key={s} style={{ fontFamily: serif, fontSize: 13, color: TOW.parch, lineHeight: 1.4 }}>{s}</li>
            ))}
          </ol>
        )}

        {/* DE DEPLOYMENT-KAART. Alleen als de sheet een uitgerekende `layout` meebrengt — een oudere
            (v1) battle heeft die niet, en dan blijft alleen de `deployNote` over. Boven en onder het
            bord staat wie daar opstelt, zodat je de kaart kunt lezen vanaf jouw kant van de tafel. */}
        {(toontKaart || deployNote) && subkop('Deployment')}
        {deployNote && (
          <div style={{ fontFamily: serif, fontSize: 12.5, color: TOW.parchDim, lineHeight: 1.45, marginBottom: toontKaart ? 6 : 0 }}>{deployNote}</div>
        )}
        {layout && tableW && tableH && (
          <div>
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

        {/* DE STREEK. Joost (05-10): "de Plains region is het type hex op de campagnekaart, en dat
            bepaalt welke terrain pieces er gekozen zijn." Dus de streek staat hier bóven de lijst, met
            het gebouw op de hex erbij (de server levert de naam; het ruwe id tonen we niet). */}
        {(groundType || battle.hexGebouw) && (
          <>
            {subkop('Region')}
            <div style={{ fontFamily: display, fontSize: 16, color: TOW.gold }}>
              {[groundType ? grondLabel(groundType) : null, battle.hexGebouw || null].filter(Boolean).join(' · ')}
            </div>
            {groundType && (
              <div style={{ fontFamily: serif, fontSize: 12.5, color: TOW.muted, lineHeight: 1.45, marginTop: 2 }}>
                The type of this battle's hex on the campaign map. It decided which terrain pieces are on this table.
              </div>
            )}
          </>
        )}

        {benodigd.length > 0 && (
          <>
            {subkop('Terrain you need')}
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {benodigd.map((r) => (
                <li key={`${r.naam}|${r.kenmerk ?? ''}`} style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span aria-hidden style={{ width: 10, height: 10, border: `1.5px solid ${TOW.goldDeep}`, borderRadius: 2, flexShrink: 0, transform: 'translateY(1px)' }} />
                  <span style={{ fontFamily: serif, fontSize: 14, color: TOW.parch }}>
                    <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{r.n} ×</span> {r.naam}
                    {r.kenmerk ? <span style={{ color: TOW.muted }}> — {r.kenmerk}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
            {sterktepunten.map((s) => (
              <div key={s} style={{ marginTop: 8, fontFamily: serif, fontSize: 12.5, color: TOW.parch, lineHeight: 1.45, borderLeft: `3px solid ${TOW.goldDeep}`, padding: '2px 0 2px 9px' }}>
                {s}
              </div>
            ))}
          </>
        )}

        {/* HOE JE HET TERREIN NEERZET. Sinds 29-09-2026 de HUISREGEL van Celedon (lib/terrainPlacement.ts),
            niet meer de rulebook-regel: om de beurt een stuk op het midden van een kwart, de tegenstander
            gooit scatter + 2D6 en beslist. Samenvatting altijd zichtbaar, de stappen uitklapbaar. */}
        {terrain.length > 0 && (
          <div style={{ marginTop: 12, border: `1px solid ${TOW.line}`, borderRadius: 9, padding: '8px 10px', background: TOW.bg }}>
            <div style={{ ...eb, fontSize: 8, color: TOW.muted, marginBottom: 3 }}>Placing the terrain</div>
            <div style={{ fontFamily: serif, fontSize: 12, color: TOW.parchDim, lineHeight: 1.5 }}>{TERRAIN_PLACEMENT_SHORT}</div>
            <details style={{ marginTop: 6 }}>
              <summary style={{ cursor: 'pointer', fontFamily: towFont.display, fontWeight: 600, fontSize: 11.5, color: TOW.goldDeep, listStyle: 'none' }}>
                How placement works, step by step ›
              </summary>
              <ol style={{ margin: '6px 0 0', paddingLeft: 18, listStyleType: 'decimal', display: 'flex', flexDirection: 'column', gap: 5 }}>
                {TERRAIN_PLACEMENT_STEPS.map((st) => (
                  <li key={st.title} style={{ fontFamily: serif, fontSize: 12, color: TOW.parchDim, lineHeight: 1.45 }}>
                    <span style={{ fontWeight: 700, color: TOW.parch }}>{st.title}. </span>{st.text}
                  </li>
                ))}
              </ol>
            </details>
          </div>
        )}

      </Sectie>
      )}

      {/* ── 3 · OBJECTIVES ── wat je wilt veroveren, waar het ligt, en de letterlijke regel. */}
      {briefings.length > 0 && (
        <Sectie nr={volgende()} titel="Objectives" onder="What you fight over, and where it goes" accent={TOW.goldBright} tint>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {briefings.map((b) => {
              // "Zoals genummerd op de kaart" alleen als die kaart er ook echt staat en er nummers op zijn.
              const opKaart = !toontKaart ? ''
                : b.id.startsWith('bm-troves') && (secLayout?.objectives.length ?? 0) > 0 ? ' As numbered on the map.'
                : b.id === 'bm-landmark' && secLayout?.specialFeature ? ' Marked ★ on the map.'
                : '';
              return (
                <div key={b.id} style={{ border: `1px solid ${TOW.line}`, borderRadius: 10, background: TOW.panel2, padding: '10px 12px' }}>
                  <div style={{ fontFamily: display, fontWeight: 700, fontSize: 16, color: TOW.gold }}>{b.title}</div>
                  {b.what && <div style={{ fontFamily: serif, fontSize: 13, color: TOW.parchDim, marginTop: 2 }}>{b.what}</div>}
                  {b.placement && (
                    <div style={{ marginTop: 8, border: `1px solid ${TOW.goldDeep}`, borderRadius: 8, background: 'rgba(184,134,47,0.10)', padding: '7px 10px', fontFamily: serif, fontSize: 13.5, color: TOW.parch, lineHeight: 1.45 }}>
                      <span style={{ ...eb, fontSize: 8.5, color: TOW.goldDeep, marginRight: 6 }}>Where:</span>
                      {b.placement}{opKaart}
                    </div>
                  )}
                  {b.short.map((r, i) => (
                    <div key={`${r.heading}-${i}`}>
                      {subkop(r.heading, 9)}
                      <RegelTekst>{r.text}</RegelTekst>
                    </div>
                  ))}
                  {b.table && regelTabel(b.table)}
                  {/* Een objective die we niet kennen: alleen de titel. Geen letterlijke tekst = geen tekst. */}
                  {b.short.length === 0 && (
                    <div style={{ fontFamily: serif, fontStyle: 'italic', fontSize: 12.5, color: TOW.muted, marginTop: 4 }}>
                      The campaign sets what this objective requires.
                    </div>
                  )}
                  {b.full.length > 0 && (
                    <details style={{ marginTop: 9 }}>
                      <summary style={{ cursor: 'pointer', fontFamily: display, fontWeight: 600, fontSize: 11.5, color: TOW.goldDeep, listStyle: 'none' }}>
                        Full rules ›
                      </summary>
                      {b.full.map((r, i) => (
                        <div key={`${r.heading}-${i}`}>
                          {/* Twee alinea's onder dezelfde kop: de kop maar één keer. */}
                          {(i === 0 || b.full[i - 1].heading !== r.heading) && subkop(r.heading, 8)}
                          <div style={{ marginTop: i > 0 && b.full[i - 1].heading === r.heading ? 6 : 0 }}><RegelTekst>{r.text}</RegelTekst></div>
                        </div>
                      ))}
                      {b.table && regelTabel(b.table)}
                      {b.source && (
                        <div style={{ fontFamily: serif, fontStyle: 'italic', fontSize: 11.5, color: TOW.faint, marginTop: 8 }}>Source: {b.source}</div>
                      )}
                    </details>
                  )}
                </div>
              );
            })}
          </div>
        </Sectie>
      )}

      {/* ── 4 · ARMIES ── beide line-ups en de campagne-veteranen, per kant. Bewust ook die van de
          tegenstander: wat er tegenover je staat wil je zien vóór je opstelt, en de campagne heeft
          het al gelockt. */}
      {heeftLegers && (
        <Sectie nr={volgende()} titel="Armies" onder="Who brings what" accent={TOW.ink}>
          {kanten.map((k, i) => (
            <div key={k.rol} style={{ marginTop: i ? 16 : 0, paddingTop: i ? 12 : 0, borderTop: i ? `1px solid ${TOW.line}` : 'none' }}>
              {kantKop(k.side, k.rol)}
              {renderLijst(k.lijst, 'Line-up')}
              {renderVets(k.vets, 'Campaign veterans', k.lijst)}
            </div>
          ))}
        </Sectie>
      )}

      {/* ── 5 · REMINDERS ── wat je TIJDENS het potje moet onthouden: de roll-off voor de eerste
          beurt, de perks (ook die van outposts) en de magic items van beide kanten. Die van de
          tegenstander zijn de helft die je nergens anders kunt opzoeken. */}
      {heeftReminders && (
        <Sectie nr={volgende()} titel="Reminders" onder="Keep these in mind during the game" accent={TOW.blood} gestippeld>
          {heeftRollOff && (
            <div style={{ border: `1px solid ${TOW.line}`, borderRadius: 10, padding: '9px 11px', background: TOW.bg, marginBottom: 12 }}>
              <div style={{ ...eb, fontSize: 8, color: TOW.muted, marginBottom: 5 }}>Roll for first turn</div>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
                {kanten.map((k) => (
                  <li key={k.rol}>
                    <div style={{ fontFamily: display, fontWeight: 700, fontSize: 13.5, color: TOW.ink }}>
                      {k.rol}{k.side.naam ? ` · ${k.side.naam}` : ''}:{' '}
                      <span style={{ color: TOW.goldDeep, fontVariantNumeric: 'tabular-nums' }}>{metTeken(k.roll.reduce((s, r) => s + r.waarde, 0))}</span>
                    </div>
                    <div style={{ fontFamily: serif, fontSize: 12.5, color: TOW.parchDim }}>
                      {k.roll.length ? k.roll.map((r) => `${r.label} ${metTeken(r.waarde)}`).join(' · ') : 'No modifiers'}
                    </div>
                  </li>
                ))}
              </ul>
              {battle.battleMarch && <div style={{ marginTop: 8 }}><RegelTekst>{BM_FIRST_TURN}</RegelTekst></div>}
            </div>
          )}
          {kanten.filter((k) => k.perks.length > 0 || k.items.length > 0).map((k, i) => (
            <div key={k.rol} style={{ marginTop: i ? 14 : 0, paddingTop: i ? 10 : 0, borderTop: i ? `1px solid ${TOW.line}` : 'none' }}>
              {kantKop(k.side, k.rol)}
              {renderPerks(k.perks)}
              {renderItems(k.items)}
            </div>
          ))}
        </Sectie>
      )}
    </>
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

      {/* Foto-herinnering (24-08-2026, Joost: "vraag de spelers voordat ze de battle starten om niet
          te vergeten dat ze foto's moeten maken"). Bij results wordt om de drie beste momenten
          gevraagd; wie dat pas daar hoort heeft niets om te uploaden. */}
      <div style={{ fontFamily: serif, fontSize: 13, color: TOW.gold, marginTop: 14, padding: '9px 12px', borderRadius: 10, border: `1px solid ${TOW.goldDeep}`, background: 'rgba(184,134,47,0.08)', lineHeight: 1.5 }}>
        Take photos during the battle — at the end you will be asked to upload the three best moments
        (the most characteristic or the most epic) for the campaign chronicle.
      </div>

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
