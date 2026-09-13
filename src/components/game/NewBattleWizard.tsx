import { useEffect, useState } from 'react';
import { TOW, towFont, engraved } from '../../design/tow';
import { usePersistentState, setPersisted } from '../../store';
import { useBackClose } from '../../lib/backStack';
import { useGame } from '../../game';
import { parseArmyList } from '../../lib/armyParser';
import { builderListToArmy, type MagicText, type MountText } from '../../lib/builderToArmy';
import { makeTroopTypeLookup, enrichArmyTroopTypes } from '../../lib/troopTypes';
import { compName } from '../../lib/armies';
import {
  applyOverlayItems, catalogueFor, applyOverlayMagicText, applyOverlayMountText, applyOverlayStatIndex,
  hasOverlay, isOverlay, overlayStatsFor, OVERLAY_FILES, type CompositionOverlay,
} from '../../lib/overlays';
import type { OwbArmy, MagicItemsData } from '../../lib/owbBuilder';
import { openGedeeldeLijst, type DeelbareLijst } from '../../lib/listShare';
import { scenarioById, secondaryById } from '../../lib/battle';
import {
  DEFAULT_SHEET, FORMATS, formatDef, normSheet, type BattleFormat, type BattleSheet,
} from '../../lib/battleSheet';
import {
  genereerSheet, herrolScenario, herrolSecondary, herrolTerrein, herrolWeer, zonderSecondaries, zonderWeer,
} from '../../lib/battleGenerate';
import { BattleSheetView } from './BattleSheetView';
import { BattlefieldEditor, BF_STAP, BF_STEPS, wisselFormat } from './BattlefieldEditor';
import { ArmyListPicker } from './ArmyListPicker';
import { OwbInstructions } from './OwbInstructions';
import type { Army } from '../../types';

// DE NIEUWE-BATTLE-WIZARD.
//
// Joost (13-09): "het moet met nieuwe battle dan meer als een wizard worden (…) en dan ook start en
// host en join en alles, multiplayer of singleplayer kiezen. En dan los je armylist in een tab ergens
// kiezen. Het geheel moet gewoon veel duidelijker en gestructureerd worden voor mensen om samen een
// potje te starten."
//
// Vier stappen, in de volgorde waarin je aan tafel ook praat:
//   1. Players     — spelen we solo, host ik, of sluit ik aan? En hoe heet je?
//   2. Battlefield — Generate (alles gerold, daarna per onderdeel bij te stellen) of Step by step.
//   3. Armies      — wie speelt met welke lijst.
//   4. Review      — het hele blad nog één keer, en dan één knop.
//
// WAAROM JOIN STAP 2 OVERSLAAT. Het slagveld is van de HOST (zie battleSheet.ts: één van de twee moet
// de baas zijn, anders overschrijven twee spelers elkaars scenario). Een gast die hier een scenario
// zou kiezen, kiest iets dat bij het joinen meteen door de sheet van de host vervangen wordt — dat is
// erger dan de stap niet krijgen. De stap blijft wél in de balk staan, doorgestreept en met "from the
// host" erbij: stil verspringen zou de indruk wekken dat er iets misging.
//
// WAT ER NIET MEER GEBEURT: deze wizard schrijft NIET naar `tow:battle`. Die sleutel blijft bestaan
// als terugval voor potjes van vóór vandaag (useObjectives leest hem nog), maar de waarheid over een
// nieuw potje is de sheet op de tracker.

const eb = engraved as React.CSSProperties;
const BASE = import.meta.env.BASE_URL;
const goldGrad = `linear-gradient(180deg, ${TOW.goldBright} 0%, ${TOW.gold} 55%, ${TOW.goldDeep} 100%)`;

const STEPS = ['Players', 'Battlefield', 'Armies', 'Review'] as const;
const STAP = { spelers: 0, battlefield: 1, legers: 2, review: 3 } as const;

type Modus = 'solo' | 'host' | 'join';
type Tak = 'generate' | 'step' | null;

interface StatRow { Name: string; M: string; WS: string; BS: string; S: string; T: string; W: string; I: string; A: string; Ld: string }
type StatIndex = Record<string, { stats?: StatRow[]; troopType?: string }>;

/** Alles wat je kwijt zou zijn als je even naar de Army-tab loopt om je lijst te controleren. Staat
 *  daarom in localStorage en niet in useState (Joost, 13-09). Ook de legers: die opnieuw moeten
 *  kiezen is precies het soort herwerk dat deze wizard moest wegnemen. */
interface WizardDraft {
  v: 1;
  stap: number;
  modus: Modus;
  naam: string;
  joinCode: string;
  tak: Tak;
  /** Sub-stap binnen de step-by-step-editor (index in BF_STEPS). */
  bfStap: number;
  /** Kwam de speler via een ✎ uit de Generate-weergave? Dan brengt Back hem daar ook weer terug. */
  viaGenerate: boolean;
  genWeer: boolean;
  genSecondaries: boolean;
  /** Is er al iets gegenereerd? Zonder dit zou de Generate-tak bij binnenkomst de DEFAULT-sheet als
   *  "resultaat" tonen, alsof er al gerold was. */
  gegenereerd: boolean;
  sheet: BattleSheet;
  mijnLeger: Army | null;
  oppLeger: Army | null;
}

const LEEG_DRAFT: WizardDraft = {
  v: 1, stap: 0, modus: 'host', naam: '', joinCode: '', tak: null, bfStap: 0, viaGenerate: false,
  genWeer: false, genSecondaries: false, gegenereerd: false, sheet: DEFAULT_SHEET,
  mijnLeger: null, oppLeger: null,
};

/** Een opgeslagen draft opschonen. Hij komt uit localStorage en kan van een oudere appversie zijn;
 *  zelfde houding als `normSheet`: alleen de vorm afdwingen, nooit iets verzinnen. */
function normDraft(raw: unknown): WizardDraft {
  const d = (raw && typeof raw === 'object' ? raw : {}) as Partial<WizardDraft>;
  return {
    ...LEEG_DRAFT,
    ...d,
    v: 1,
    sheet: normSheet(d.sheet) ?? DEFAULT_SHEET,
    stap: typeof d.stap === 'number' ? Math.max(0, Math.min(STEPS.length - 1, d.stap)) : 0,
    bfStap: typeof d.bfStap === 'number' ? Math.max(0, Math.min(BF_STEPS.length - 1, d.bfStap)) : 0,
  };
}

// ── OWB-data: alles wat nodig is om een BUILDER-lijst in een speel-Army om te zetten ─────────────
//
// ArmyListPicker doet dit al voor je EIGEN lijsten. Voor een lijst die met een DEELCODE binnenkomt
// bestaat die weg niet — die lijst staat niet in `tow:lists` en mag daar ook niet in belanden (het is
// de lijst van je tegenstander, geen eigen lijst). Vandaar deze losse route, met een cache per
// bestand zodat een tweede deelcode niets opnieuw ophaalt.

interface OwbData {
  statIdx: StatIndex;
  itemsData: MagicItemsData | null;
  magicText: MagicText;
  mountText: MountText;
  armyNames: Record<string, string>;
  itemsByArmy: Record<string, string[]>;
}

let owbBelofte: Promise<OwbData> | null = null;
const haalJson = (pad: string) => fetch(`${BASE}${pad}`).then((r) => (r.ok ? r.json() : null)).catch(() => null);

function laadOwb(): Promise<OwbData> {
  if (!owbBelofte) {
    owbBelofte = Promise.all([
      haalJson('owb/rules-index.json'),
      haalJson('owb/magic-items.json'),
      haalJson('owb/magic-item-text.json'),
      haalJson('owb/mount-text.json'),
      haalJson('owb/index.json'),
      haalJson('owb/the-old-world.json'),
    ]).then(([stats, items, magic, mount, idx, meta]) => {
      const armyNames: Record<string, string> = Array.isArray(idx?.armies)
        ? Object.fromEntries(idx.armies.map((a: { slug: string; name: string }) => [a.slug, a.name]))
        : {};
      const itemsByArmy: Record<string, string[]> = {};
      for (const a of (meta?.armies ?? [])) itemsByArmy[a.id] = Array.isArray(a.items) ? a.items : [];
      return {
        statIdx: (stats ?? {}) as StatIndex,
        itemsData: (items ?? null) as MagicItemsData | null,
        magicText: (magic ?? {}) as MagicText,
        mountText: (mount ?? {}) as MountText,
        armyNames,
        itemsByArmy,
      };
    });
  }
  return owbBelofte;
}

const catCache = new Map<string, Promise<OwbArmy | null>>();
const overlayCache = new Map<string, Promise<CompositionOverlay | null>>();

function laadCatalogus(slug: string): Promise<OwbArmy | null> {
  let p = catCache.get(slug);
  if (!p) { p = haalJson(`owb/${slug}.json`) as Promise<OwbArmy | null>; catCache.set(slug, p); }
  return p;
}

function laadOverlay(composition: string): Promise<CompositionOverlay | null> {
  if (!hasOverlay(composition)) return Promise.resolve(null);
  let p = overlayCache.get(composition);
  if (!p) {
    p = haalJson(`renegade/${OVERLAY_FILES[composition]}`).then((j) => (isOverlay(j) ? j : null));
    overlayCache.set(composition, p);
  }
  return p;
}

/** Een gedeelde builder-lijst omzetten naar een speelbaar `Army`. Zelfde recept als in
 *  ArmyListPicker (catalogus + stats + magic items + eventuele composition-overlay), alleen dan voor
 *  een lijst die niet op dit apparaat staat. */
async function deelcodeNaarArmy(code: string): Promise<Army> {
  const gedeeld = await openGedeeldeLijst(code);
  const l: DeelbareLijst = gedeeld.lijst;
  const [owb, rawCat, overlay] = await Promise.all([laadOwb(), laadCatalogus(l.army), laadOverlay(l.composition)]);
  if (!rawCat) throw new Error(`No catalogue for “${l.army}” — update the app and try again.`);
  if (hasOverlay(l.composition) && !overlay) throw new Error('That list uses a composition this app could not load.');
  const cat = catalogueFor(rawCat, l.composition, overlay);
  const itemPool = owb.itemsData && overlay ? applyOverlayItems(owb.itemsData, overlay) : owb.itemsData;
  const resolvedIndex = overlay ? applyOverlayStatIndex(owb.statIdx, overlay) : owb.statIdx;
  const statsFor = (naam: string): StatRow[] => overlayStatsFor(owb.statIdx, naam, overlay);
  return builderListToArmy({ ...l, name: l.name }, cat, statsFor, {
    faction: owb.armyNames[l.army] ?? l.army,
    composition: compName(l.composition, l.army),
    overlayId: overlay?.id,
    itemsData: itemPool ?? undefined,
    armyItemLists: owb.itemsByArmy[l.army] ?? [],
    magicText: applyOverlayMagicText(owb.magicText, overlay),
    mountText: applyOverlayMountText(owb.mountText, overlay),
    troopTypeFor: makeTroopTypeLookup(resolvedIndex),
    factionNames: Object.values(owb.armyNames),
  });
}

// ── Kleine bouwstenen ───────────────────────────────────────────────────────────────────────────

const invoer: React.CSSProperties = {
  width: '100%', borderRadius: 10, border: `1px solid ${TOW.lineStrong}`, background: TOW.cardLt,
  color: TOW.ink, padding: '10px 12px', fontFamily: towFont.serif, fontSize: 15, boxSizing: 'border-box',
};
const veldLabel: React.CSSProperties = { ...eb, fontSize: 9, color: TOW.muted, marginBottom: 5, display: 'block' };

function Vinkje({ aan, onClick, titel, uitleg }: { aan: boolean; onClick: () => void; titel: string; uitleg: string }) {
  return (
    <button
      onClick={onClick}
      role="checkbox"
      aria-checked={aan}
      style={{ width: '100%', display: 'flex', alignItems: 'flex-start', gap: 9, cursor: 'pointer', padding: '10px 12px', borderRadius: 10, textAlign: 'left', border: `1px solid ${aan ? TOW.goldDeep : TOW.line}`, background: aan ? 'rgba(184,134,47,0.10)' : 'transparent' }}
    >
      <span style={{ width: 18, height: 18, marginTop: 1, flexShrink: 0, borderRadius: 5, border: `1px solid ${aan ? TOW.goldDeep : TOW.lineStrong}`, background: aan ? goldGrad : 'transparent', color: TOW.onGrad, fontSize: 12, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{aan ? '✓' : ''}</span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontFamily: towFont.display, fontWeight: 600, fontSize: 14, color: aan ? TOW.ink : TOW.parchDim }}>{titel}</span>
        <span style={{ display: 'block', fontFamily: towFont.serif, fontSize: 12, color: TOW.muted, lineHeight: 1.35, marginTop: 2 }}>{uitleg}</span>
      </span>
    </button>
  );
}

/** Eén regel in het tweak-paneel onder een gegenereerd blad: wat er gerold is, met de knopjes om
 *  ALLEEN dat onderdeel opnieuw te doen. */
function TweakRij({ label, waarde, onHerrol, onEdit, onUit }: {
  label: string;
  waarde: string;
  onHerrol?: () => void;
  onEdit?: () => void;
  onUit?: () => void;
}) {
  const knop: React.CSSProperties = {
    width: 30, height: 30, flexShrink: 0, borderRadius: 8, cursor: 'pointer', padding: 0,
    border: `1px solid ${TOW.goldDeep}`, background: 'rgba(184,134,47,0.12)', color: TOW.goldDeep,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 14,
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 8px', borderRadius: 9, border: `1px solid ${TOW.line}`, background: TOW.cardLt }}>
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ ...eb, fontSize: 8, color: TOW.muted, display: 'block' }}>{label}</span>
        <span style={{ display: 'block', fontFamily: towFont.serif, fontSize: 13, color: TOW.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{waarde}</span>
      </span>
      {onHerrol && <button onClick={onHerrol} title={`Re-roll ${label.toLowerCase()}`} aria-label={`Re-roll ${label.toLowerCase()}`} style={knop}>🎲</button>}
      {onEdit && <button onClick={onEdit} title={`Edit ${label.toLowerCase()}`} aria-label={`Edit ${label.toLowerCase()}`} style={knop}>✎</button>}
      {onUit && <button onClick={onUit} title={`Remove ${label.toLowerCase()}`} aria-label={`Remove ${label.toLowerCase()}`} style={{ ...knop, border: `1px solid ${TOW.line}`, background: 'transparent', color: TOW.muted }}>✕</button>}
    </div>
  );
}

/** Eén leger kiezen: uit je eigen lijsten, met een deelcode van je tegenstander, of geplakt uit Old
 *  World Builder. Drie wegen naar hetzelfde `Army`, want dat is precies waar mensen aan tafel op
 *  vastlopen: de één heeft zijn lijst in de app, de ander stuurt een code, de derde plakt. */
function LegerKiezer({ titel, leger, onLeger, troopTypeFor }: {
  titel: string;
  leger: Army | null;
  onLeger: (a: Army | null) => void;
  troopTypeFor: (naam: string) => string | undefined;
}) {
  const [plak, setPlak] = useState('');
  const [code, setCode] = useState('');
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  const haalDeelcode = async () => {
    setBezig(true); setFout(null);
    try {
      onLeger(await deelcodeNaarArmy(code));
      setCode('');
    } catch (e) {
      setFout(e instanceof Error ? e.message : 'Could not open that share code.');
    } finally {
      setBezig(false);
    }
  };

  return (
    <div style={{ marginBottom: 16, padding: '12px 13px', borderRadius: 12, border: `1px solid ${leger ? TOW.goldDeep : TOW.line}`, background: leger ? 'rgba(184,134,47,0.07)' : 'transparent' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: leger ? 0 : 10 }}>
        <span style={{ ...eb, fontSize: 9, color: TOW.goldDeep, flex: 1, minWidth: 0 }}>{titel}</span>
        {leger && <button onClick={() => onLeger(null)} style={{ flexShrink: 0, padding: '5px 11px', borderRadius: 7, border: `1px solid ${TOW.line}`, background: 'transparent', color: TOW.muted, cursor: 'pointer', fontFamily: towFont.display, fontWeight: 600, fontSize: 12 }}>Change</button>}
      </div>

      {leger ? (
        <div style={{ fontFamily: towFont.serif, fontSize: 14, color: TOW.ink, marginTop: 6 }}>
          ✓ {leger.name}{leger.points != null ? ` · ${leger.points} pts` : ''} · {leger.units.length} unit{leger.units.length === 1 ? '' : 's'}
        </div>
      ) : (<>
        <ArmyListPicker onPick={(a) => onLeger(a)} label="From your saved lists" />

        <label style={veldLabel}>Or open a share code</label>
        <div style={{ display: 'flex', gap: 7, marginBottom: 4 }}>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="e.g. 7QK4XP"
            maxLength={16}
            aria-label="Army list share code"
            style={{ ...invoer, letterSpacing: '0.2em', textTransform: 'uppercase', fontFamily: towFont.display }}
          />
          <button
            onClick={haalDeelcode}
            disabled={!code.trim() || bezig}
            style={{ flexShrink: 0, padding: '0 16px', borderRadius: 10, border: `1px solid ${TOW.goldDeep}`, background: 'rgba(184,134,47,0.12)', color: TOW.goldDeep, cursor: !code.trim() || bezig ? 'default' : 'pointer', opacity: !code.trim() || bezig ? 0.5 : 1, fontFamily: towFont.display, fontWeight: 600, fontSize: 13.5 }}
          >{bezig ? '…' : 'Open'}</button>
        </div>
        <div style={{ fontFamily: towFont.serif, fontStyle: 'italic', fontSize: 11.5, color: TOW.muted, margin: '0 0 12px' }}>
          Your opponent can share their list from the Army tab and send you the code.
        </div>
        {fout && <div style={{ fontFamily: towFont.serif, fontSize: 13, color: TOW.blood, marginBottom: 10 }}>{fout}</div>}

        <label style={veldLabel}>Or paste an Old World Builder export</label>
        <textarea
          value={plak}
          onChange={(e) => setPlak(e.target.value)}
          placeholder="Paste the full export here…"
          rows={5}
          style={{ ...invoer, resize: 'vertical', fontSize: 13, lineHeight: 1.4 }}
        />
        {plak.trim() && (
          <button
            onClick={() => onLeger(enrichArmyTroopTypes(parseArmyList(plak), troopTypeFor))}
            style={{ marginTop: 8, padding: '9px 14px', borderRadius: 9, border: `1px solid ${TOW.goldDeep}`, background: 'rgba(184,134,47,0.12)', color: TOW.goldDeep, cursor: 'pointer', fontFamily: towFont.display, fontWeight: 600, fontSize: 13.5 }}
          >Use this list</button>
        )}
        <OwbInstructions defaultOpen={false} />
      </>)}
    </div>
  );
}

// ── De wizard ───────────────────────────────────────────────────────────────────────────────────

export function NewBattleWizard({ onBack }: { onBack: () => void }) {
  const { createGame, joinGame, startSolo, busy, error } = useGame();
  const [ruwDraft, setDraft] = usePersistentState<WizardDraft>('tow:battle-draft', LEEG_DRAFT);
  const d = normDraft(ruwDraft);
  // FUNCTIONEEL bijwerken, en niet `{ ...d, ...patch }`. De draft is één groot object, dus elke
  // schrijfactie schrijft ALLE velden — en een handler die nog met de `d` van een vorige render
  // werkt, zet daarmee ongemerkt een eerdere keuze terug (tijdens het testen sloeg "Solo" zo weer om
  // naar "Host" zodra je je naam typte). `setDraft` leest in deze vorm de waarde die er NU staat.
  const zet = (patch: Partial<WizardDraft>) => setDraft((prev) => ({ ...normDraft(prev), ...patch }));
  useBackClose(true, onBack);

  // Alleen nodig om een GEPLAKTE lijst zijn troop types te geven; de picker en de deelcode-route
  // regelen dat zelf.
  const [statIdx, setStatIdx] = useState<StatIndex | null>(null);
  useEffect(() => { laadOwb().then((o) => setStatIdx(o.statIdx)).catch(() => {}); }, []);
  const troopTypeFor = makeTroopTypeLookup(statIdx);

  const joinModus = d.modus === 'join';
  // De stappen die voor DEZE modus echt bestaan. Join slaat het slagveld over (dat is van de host).
  const actief = joinModus ? [STAP.spelers, STAP.legers, STAP.review] : [0, 1, 2, 3];
  const posInActief = Math.max(0, actief.indexOf(d.stap));

  const gaNaar = (stap: number) => zet({ stap });
  const volgende = () => {
    const i = actief.indexOf(d.stap);
    if (i >= 0 && i < actief.length - 1) gaNaar(actief[i + 1]);
  };
  const vorige = () => {
    const i = actief.indexOf(d.stap);
    if (i > 0) gaNaar(actief[i - 1]);
    else onBack();
  };

  const setSheet = (sheet: BattleSheet) => zet({ sheet });
  const fmt = formatDef(d.sheet.format);
  const scenario = scenarioById(d.sheet.scenario);
  const secondaryNaam = d.sheet.secondaries.length
    ? d.sheet.secondaries.map((id) => secondaryById(id)?.name ?? id).join(' · ')
    : 'None';

  /** Naar de step-by-step-editor springen op een specifieke stap (de ✎-knoppen). */
  const bewerk = (bfStap: number) => zet({ tak: 'step', bfStap, viaGenerate: true });

  // ── Doorgaan-knop: mag het al? ────────────────────────────────────────────────────────────────
  const naamOk = d.naam.trim().length > 0;
  const codeOk = d.joinCode.trim().length > 0;
  const stap1Ok = naamOk && (!joinModus || codeOk);
  const legersOk = d.modus === 'solo' ? !!d.mijnLeger && !!d.oppLeger : !!d.mijnLeger;

  // ── Starten ───────────────────────────────────────────────────────────────────────────────────
  const start = async () => {
    if (d.modus === 'solo') {
      // De tegenstander gaat er VÓÓR `startSolo` in. `setOpponentArmy` kijkt naar `seat`, en die is
      // op dit moment nog null — hij zou dus stilletjes niets doen, en een effect achteraf haalt het
      // niet omdat GameMode de wizard meteen na het starten vervangt door de game. Daarom schrijven
      // we het tweede leger rechtstreeks op de sleutel waar `useGame` het vandaan leest.
      if (d.oppLeger) setPersisted('tow:solo-opp', d.oppLeger);
      startSolo(d.mijnLeger, { sheet: d.sheet });
      setDraft(LEEG_DRAFT);
      return;
    }
    if (d.modus === 'host') {
      // Mét sheet betekent: dit potje begint in de LOBBY (createGame zet `gestart: false`). De host
      // deelt de code, beide spelers kiezen hun leger, en de host drukt daar op Start.
      const code = await createGame(d.naam.trim(), d.mijnLeger, { sheet: d.sheet });
      if (code) setDraft(LEEG_DRAFT);
      return;
    }
    const ok = await joinGame(d.joinCode.trim(), d.naam.trim(), d.mijnLeger);
    if (ok) setDraft(LEEG_DRAFT);
  };

  const startLabel = d.modus === 'solo' ? '⚔ Start battle' : d.modus === 'host' ? 'Create game & get code' : 'Join battle';

  return (
    <div className="tow-field" style={{ height: '100%', overflowY: 'auto', color: TOW.ink }}>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '12px 14px 32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <button onClick={vorige} aria-label="Back" style={{ height: 32, flexShrink: 0, borderRadius: 8, cursor: 'pointer', border: `1px solid ${TOW.lineStrong}`, background: TOW.cardLt, fontFamily: towFont.display, fontWeight: 600, fontSize: 12.5, color: TOW.inkDim, padding: '0 11px' }}>‹ Back</button>
          <h2 style={{ margin: 0, minWidth: 0, fontFamily: towFont.display, fontWeight: 700, fontSize: 20, color: TOW.ink }}>New battle</h2>
        </div>

        {/* Voortgang. De overgeslagen Battlefield-stap blijft staan (gestreept + "from the host"),
            zodat je ziet dát hij bestaat en waaróm je hem niet krijgt. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', margin: '0 0 14px' }}>
          <div style={{ display: 'flex', gap: 5, flex: '1 1 150px', minWidth: 0 }}>
            {STEPS.map((naam, i) => {
              const over = joinModus && i === STAP.battlefield;
              const gedaan = !over && actief.indexOf(i) >= 0 && actief.indexOf(i) <= posInActief;
              return (
                <div
                  key={naam}
                  title={over ? 'Battlefield — set by the host' : naam}
                  style={{ flex: over ? '0 0 18px' : 1, minWidth: 0, height: 4, borderRadius: 99, background: gedaan ? goldGrad : 'rgba(74,55,22,0.12)', border: over ? `1px dashed ${TOW.lineStrong}` : 'none', boxSizing: 'border-box' }}
                />
              );
            })}
          </div>
          <span style={{ ...eb, fontSize: 8, color: TOW.muted, whiteSpace: 'nowrap' }}>
            Step {posInActief + 1}/{actief.length} · {STEPS[d.stap]}
          </span>
        </div>

        {/* ── 1 · PLAYERS ──────────────────────────────────────────────────────────────────────── */}
        {d.stap === STAP.spelers && (<>
          <div style={{ ...eb, fontSize: 9, color: TOW.muted, marginBottom: 8 }}>Who is playing?</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
            {([
              ['solo', '🎲', 'Solo', 'Both armies on this device — no code, no opponent to wait for.'],
              ['host', '📣', 'Host a game', 'You set up the battlefield and get a code to share.'],
              ['join', '🔗', 'Join a game', 'Your opponent hosts; you enter their code.'],
            ] as const).map(([m, icon, titel, uitleg]) => {
              const on = d.modus === m;
              return (
                <button key={m} onClick={() => zet({ modus: m })} style={{ display: 'flex', alignItems: 'flex-start', gap: 11, width: '100%', textAlign: 'left', padding: '13px 15px', borderRadius: 12, cursor: 'pointer', border: `1px solid ${on ? TOW.goldDeep : TOW.line}`, background: on ? 'rgba(184,134,47,0.12)' : TOW.panel2 }}>
                  <span aria-hidden style={{ fontSize: 20, lineHeight: 1.2, flexShrink: 0 }}>{icon}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontFamily: towFont.display, fontWeight: 700, fontSize: 15, color: on ? TOW.goldDeep : TOW.ink }}>{titel}</span>
                    <span style={{ display: 'block', fontFamily: towFont.serif, fontSize: 12.5, color: TOW.muted, lineHeight: 1.35 }}>{uitleg}</span>
                  </span>
                  {on && <span aria-hidden style={{ color: TOW.goldDeep, fontSize: 15, flexShrink: 0 }}>✓</span>}
                </button>
              );
            })}
          </div>

          <label style={veldLabel}>Your name</label>
          <input value={d.naam} onChange={(e) => zet({ naam: e.target.value })} placeholder="e.g. Joost" style={{ ...invoer, marginBottom: 14 }} />

          {joinModus && (<>
            <label style={veldLabel}>Game code</label>
            <input
              value={d.joinCode}
              onChange={(e) => zet({ joinCode: e.target.value.toUpperCase() })}
              placeholder="e.g. K7Q4"
              maxLength={6}
              style={{ ...invoer, letterSpacing: '0.3em', textTransform: 'uppercase', fontFamily: towFont.display }}
            />
            <div style={{ fontFamily: towFont.serif, fontStyle: 'italic', fontSize: 12.5, color: TOW.muted, margin: '8px 2px 0' }}>
              The battlefield comes from the host — you go straight from here to your army.
            </div>
          </>)}
        </>)}

        {/* ── 2 · BATTLEFIELD ──────────────────────────────────────────────────────────────────── */}
        {d.stap === STAP.battlefield && !joinModus && (<>
          {d.tak === null && (<>
            <div style={{ ...eb, fontSize: 9, color: TOW.muted, marginBottom: 8 }}>How do you want the battlefield?</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button onClick={() => zet({ tak: 'generate', viaGenerate: false })} style={{ display: 'flex', alignItems: 'flex-start', gap: 11, textAlign: 'left', padding: '15px 16px', borderRadius: 12, cursor: 'pointer', border: `1px solid ${TOW.goldDeep}`, background: 'rgba(184,134,47,0.12)' }}>
                <span aria-hidden style={{ fontSize: 22, lineHeight: 1.1, flexShrink: 0 }}>🎲</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontFamily: towFont.display, fontWeight: 700, fontSize: 16, color: TOW.goldDeep }}>Generate</span>
                  <span style={{ display: 'block', fontFamily: towFont.serif, fontSize: 12.5, color: TOW.muted, lineHeight: 1.35 }}>Roll the scenario, scatter the terrain and lay it all out. Tweak anything afterwards.</span>
                </span>
              </button>
              <button onClick={() => zet({ tak: 'step', bfStap: 0, viaGenerate: false })} style={{ display: 'flex', alignItems: 'flex-start', gap: 11, textAlign: 'left', padding: '15px 16px', borderRadius: 12, cursor: 'pointer', border: `1px solid ${TOW.line}`, background: TOW.panel2 }}>
                <span aria-hidden style={{ fontSize: 22, lineHeight: 1.1, flexShrink: 0 }}>🗺️</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontFamily: towFont.display, fontWeight: 700, fontSize: 16, color: TOW.ink }}>Step by step</span>
                  <span style={{ display: 'block', fontFamily: towFont.serif, fontSize: 12.5, color: TOW.muted, lineHeight: 1.35 }}>Format, map size, scenario, secondaries and terrain — one choice at a time.</span>
                </span>
              </button>
            </div>
          </>)}

          {d.tak === 'generate' && (<>
            <div style={{ ...eb, fontSize: 9, color: TOW.muted, marginBottom: 8 }}>Format</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 14 }}>
              {FORMATS.map((f) => {
                const on = d.sheet.format === f.id;
                return (
                  <button key={f.id} onClick={() => setSheet(wisselFormat(d.sheet, f.id as BattleFormat))} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, textAlign: 'left', padding: '11px 13px', borderRadius: 10, cursor: 'pointer', border: `1px solid ${on ? TOW.goldDeep : TOW.line}`, background: on ? 'rgba(138,108,48,0.10)' : TOW.cardLt }}>
                    <span style={{ width: 18, height: 18, marginTop: 2, flexShrink: 0, borderRadius: 99, border: `1px solid ${on ? TOW.goldDeep : TOW.lineStrong}`, background: on ? goldGrad : 'transparent', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: TOW.onGrad, fontSize: 11, fontWeight: 700 }}>{on ? '✓' : ''}</span>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: 'block', fontFamily: towFont.display, fontWeight: 700, fontSize: 14.5, color: on ? TOW.goldDeep : TOW.ink }}>{f.label}</span>
                      <span style={{ display: 'block', fontFamily: towFont.serif, fontSize: 12, color: TOW.muted, lineHeight: 1.35 }}>{f.blurb}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 14 }}>
              <Vinkje aan={d.genWeer} onClick={() => zet({ genWeer: !d.genWeer })} titel="Include weather" uitleg="Roll one Disruptive Weather effect for the whole battle." />
              <Vinkje aan={d.genSecondaries} onClick={() => zet({ genSecondaries: !d.genSecondaries })} titel="Include a secondary objective" uitleg="Add one secondary objective on top of the scenario." />
            </div>

            <button
              onClick={() => zet({
                sheet: genereerSheet({ format: d.sheet.format, weer: d.genWeer, secondaries: d.genSecondaries, tableW: d.sheet.tableW, tableH: d.sheet.tableH }),
                gegenereerd: true,
              })}
              style={{ width: '100%', border: 'none', borderRadius: 11, cursor: 'pointer', padding: '13px 18px', background: goldGrad, color: TOW.onGrad, fontFamily: towFont.display, fontWeight: 700, fontSize: 15 }}
            >{d.gegenereerd ? '🎲 Generate again' : '🎲 Generate battlefield'}</button>

            {d.gegenereerd && (<>
              <div style={{ marginTop: 16 }}>
                <BattleSheetView sheet={d.sheet} titel="Your battlefield" />
              </div>
              {/* Bijstellen zonder opnieuw te beginnen: 🎲 rolt ALLEEN dit onderdeel opnieuw (de
                  herrol*-functies laten de rest letterlijk staan), ✎ brengt je naar de bijbehorende
                  stap van de step-by-step-editor. Weer heeft geen ✎: er valt niets te kiezen, het is
                  een D6-tabel — je rolt hem opnieuw of je speelt zonder. */}
              <div style={{ ...eb, fontSize: 9, color: TOW.muted, margin: '16px 0 7px' }}>Tweak one thing</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <TweakRij label="Format" waarde={fmt.label} onEdit={() => bewerk(BF_STAP.format)} />
                <TweakRij label="Map size" waarde={`${d.sheet.tableW}″ × ${d.sheet.tableH}″`} onEdit={() => bewerk(BF_STAP.tafel)} />
                <TweakRij
                  label="Scenario"
                  waarde={scenario?.name ?? d.sheet.scenario}
                  onHerrol={() => setSheet(herrolScenario(d.sheet))}
                  onEdit={() => bewerk(BF_STAP.scenario)}
                />
                <TweakRij
                  label="Terrain"
                  waarde={`${d.sheet.terrain.length} feature${d.sheet.terrain.length === 1 ? '' : 's'}`}
                  onHerrol={() => setSheet(herrolTerrein(d.sheet))}
                  onEdit={() => bewerk(BF_STAP.terrein)}
                />
                <TweakRij
                  label="Secondary"
                  waarde={secondaryNaam}
                  onHerrol={() => setSheet(herrolSecondary(d.sheet))}
                  onEdit={() => bewerk(BF_STAP.secondaries)}
                  onUit={d.sheet.secondaries.length ? () => setSheet(zonderSecondaries(d.sheet)) : undefined}
                />
                <TweakRij
                  label="Weather"
                  waarde={d.sheet.weer ? d.sheet.weer.naam : 'None'}
                  onHerrol={() => setSheet(herrolWeer(d.sheet))}
                  onUit={d.sheet.weer ? () => setSheet(zonderWeer(d.sheet)) : undefined}
                />
              </div>
            </>)}
          </>)}

          {d.tak === 'step' && (<>
            {d.viaGenerate && (
              <button onClick={() => zet({ tak: 'generate' })} style={{ marginBottom: 8, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: towFont.serif, fontSize: 13, color: TOW.goldDeep, textDecoration: 'underline' }}>
                ‹ Back to the generated sheet
              </button>
            )}
            <BattlefieldEditor sheet={d.sheet} onChange={setSheet} stap={d.bfStap} onStap={(i) => zet({ bfStap: i })} />
          </>)}
        </>)}

        {/* ── 3 · ARMIES ───────────────────────────────────────────────────────────────────────── */}
        {d.stap === STAP.legers && (<>
          <div style={{ fontFamily: towFont.serif, fontStyle: 'italic', fontSize: 13.5, color: TOW.parchDim, margin: '0 0 14px' }}>
            {d.modus === 'solo'
              ? 'Both armies play on this device, so pick them both.'
              : 'Pick your own army — your opponent picks theirs on their device.'}
          </div>
          <LegerKiezer titel={d.modus === 'solo' ? 'Your army' : 'Your army'} leger={d.mijnLeger} onLeger={(a) => zet({ mijnLeger: a })} troopTypeFor={troopTypeFor} />
          {d.modus === 'solo' && (
            <LegerKiezer titel="Opposing army" leger={d.oppLeger} onLeger={(a) => zet({ oppLeger: a })} troopTypeFor={troopTypeFor} />
          )}
        </>)}

        {/* ── 4 · REVIEW ───────────────────────────────────────────────────────────────────────── */}
        {d.stap === STAP.review && (<>
          {joinModus ? (
            <div style={{ padding: '13px 15px', borderRadius: 12, border: `1px dashed ${TOW.lineStrong}`, marginBottom: 14 }}>
              <div style={{ ...eb, fontSize: 9, color: TOW.muted, marginBottom: 5 }}>Battlefield</div>
              <div style={{ fontFamily: towFont.serif, fontSize: 13.5, color: TOW.ink, lineHeight: 1.4 }}>
                Comes from the host. You will see the full battle sheet in the lobby, before the game starts.
              </div>
            </div>
          ) : (
            <BattleSheetView
              sheet={d.sheet}
              titel="Battle sheet"
              rechts={<button onClick={() => zet({ stap: STAP.battlefield })} style={{ padding: '6px 12px', borderRadius: 8, border: `1px solid ${TOW.goldDeep}`, background: 'rgba(184,134,47,0.12)', color: TOW.goldDeep, cursor: 'pointer', fontFamily: towFont.display, fontWeight: 600, fontSize: 12.5 }}>✎ Edit</button>}
            />
          )}

          <div style={{ ...eb, fontSize: 9, color: TOW.muted, margin: '18px 0 7px' }}>Players</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 11px', borderRadius: 10, border: `1px solid ${TOW.goldDeep}`, background: 'rgba(184,134,47,0.08)' }}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontFamily: towFont.display, fontWeight: 600, fontSize: 14.5, color: TOW.ink }}>{d.naam.trim() || 'You'} · you</span>
                <span style={{ display: 'block', fontFamily: towFont.serif, fontSize: 12.5, color: d.mijnLeger ? TOW.parchDim : TOW.muted, fontStyle: d.mijnLeger ? 'normal' : 'italic' }}>
                  {d.mijnLeger ? `${d.mijnLeger.name}${d.mijnLeger.points != null ? ` · ${d.mijnLeger.points} pts` : ''}` : 'no army yet'}
                </span>
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 11px', borderRadius: 10, border: `1px solid ${TOW.line}` }}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontFamily: towFont.display, fontWeight: 600, fontSize: 14.5, color: TOW.ink }}>{d.modus === 'solo' ? 'Opponent' : 'Your opponent'}</span>
                <span style={{ display: 'block', fontFamily: towFont.serif, fontSize: 12.5, color: d.oppLeger ? TOW.parchDim : TOW.muted, fontStyle: d.oppLeger ? 'normal' : 'italic' }}>
                  {d.modus === 'solo'
                    ? (d.oppLeger ? `${d.oppLeger.name}${d.oppLeger.points != null ? ` · ${d.oppLeger.points} pts` : ''}` : 'no army yet')
                    : d.modus === 'host' ? 'joins with your code, and picks their own army' : 'hosts this game'}
                </span>
              </span>
            </div>
          </div>

          {d.modus === 'host' && (
            <div style={{ fontFamily: towFont.serif, fontStyle: 'italic', fontSize: 12.5, color: TOW.muted, margin: '10px 2px 0', lineHeight: 1.4 }}>
              You get a code to share. Both of you land in the lobby — you can still adjust the battle
              sheet there, and you press Start when you are both ready.
            </div>
          )}
          {error && <div style={{ fontFamily: towFont.serif, fontSize: 13.5, color: TOW.blood, marginTop: 12 }}>{error}</div>}
        </>)}

        {/* ── Navigatie ────────────────────────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 8, marginTop: 20, flexWrap: 'wrap' }}>
          <button
            onClick={() => {
              // In de step-by-step-tak loopt Back eerst door de sub-stappen terug, dan naar de
              // tak-keuze (of naar het gegenereerde blad als je daar vandaan kwam).
              if (d.stap === STAP.battlefield && d.tak === 'step' && d.bfStap > 0) zet({ bfStap: d.bfStap - 1 });
              else if (d.stap === STAP.battlefield && d.tak === 'step') zet({ tak: d.viaGenerate ? 'generate' : null });
              else if (d.stap === STAP.battlefield && d.tak === 'generate') zet({ tak: null });
              else vorige();
            }}
            style={{ flex: '0 0 auto', padding: '11px 16px', borderRadius: 11, cursor: 'pointer', border: `1px solid ${TOW.lineStrong}`, background: 'transparent', color: TOW.inkDim, fontFamily: towFont.display, fontWeight: 600, fontSize: 14 }}
          >{d.stap === 0 ? 'Cancel' : '‹ Back'}</button>

          {d.stap === STAP.review ? (
            <button
              onClick={start}
              disabled={busy}
              style={{ flex: 1, minWidth: 180, padding: '13px 18px', borderRadius: 11, border: 'none', background: goldGrad, color: TOW.onGrad, fontFamily: towFont.display, fontWeight: 700, fontSize: 15, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.5 : 1 }}
            >{busy ? 'Working…' : startLabel}</button>
          ) : (
            <button
              onClick={() => {
                // In de step-by-step-tak loopt Next eerst de vijf sub-stappen af.
                if (d.stap === STAP.battlefield && d.tak === 'step' && d.bfStap < BF_STEPS.length - 1) zet({ bfStap: d.bfStap + 1 });
                else volgende();
              }}
              disabled={d.stap === STAP.spelers ? !stap1Ok : d.tak === null && d.stap === STAP.battlefield}
              style={{ flex: 1, minWidth: 140, padding: '13px 18px', borderRadius: 11, border: 'none', background: goldGrad, color: TOW.onGrad, fontFamily: towFont.display, fontWeight: 700, fontSize: 15, cursor: 'pointer', opacity: (d.stap === STAP.spelers && !stap1Ok) || (d.stap === STAP.battlefield && d.tak === null) ? 0.5 : 1 }}
            >Next ›</button>
          )}
        </div>

        {d.stap === STAP.spelers && !stap1Ok && (
          <div style={{ fontFamily: towFont.serif, fontStyle: 'italic', fontSize: 12.5, color: TOW.muted, margin: '8px 2px 0' }}>
            {naamOk ? 'Enter the code your opponent sent you.' : 'Enter your name to continue.'}
          </div>
        )}
        {/* EEN LEGER IS HIER GEEN VOORWAARDE (13-09). Het stond eerst als slagboom voor Next, maar dat
            strandde precies degene die het meeste haast heeft: wie een code krijgt toegestuurd en zijn
            lijsten op een ANDER apparaat heeft staan, kon het potje niet eens binnen. En het sprak
            zichzelf tegen — de lobby toont "no army yet" en heeft er zijn eigen kiezer voor, net als
            het spelscherm. Dus: een opmerking, geen blokkade. */}
        {d.stap === STAP.legers && !legersOk && (
          <div style={{ fontFamily: towFont.serif, fontStyle: 'italic', fontSize: 12.5, color: TOW.muted, margin: '8px 2px 0' }}>
            {d.modus === 'solo'
              ? 'You can pick both armies later, in the lobby.'
              : 'No army yet? You can pick it later, in the lobby.'}
          </div>
        )}
      </div>
    </div>
  );
}
