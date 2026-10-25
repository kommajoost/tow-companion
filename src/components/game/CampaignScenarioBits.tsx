import { useEffect, useState } from 'react';
import { TOW, towFont, engraved } from '../../design/tow';
import { usePersistentState } from '../../store';
import { useBackClose } from '../../lib/backStack';
import { useLab } from '../lab/labContext';
import { isClaim, zonderRollen, type CampaignBattle } from '../../lib/campaignBattle';
import { CampaignBoard, defenderIsTop, parseSheetLayout, parseSheetSecLayout } from './CampaignBoard';
import {
  parseSheetTerrain, terrainEffect, terrainName, terrainStyle, terrainTrait, TRAIT_TEXT,
  type CampaignTerrainPiece,
} from '../../lib/campaignTerrain';
import { terrainPlacementShort } from '../../lib/terrainPlacement';
import { eersteBeurtVast, scenarioBonusVan, CAMPAGNE_OBJECTIVES } from '../../lib/campaignScenario';
import { kantTekst, postSamenvatting, type ScenarioBonus } from '../../lib/scenarioBonus';
import {
  WRATH_NOG_NIET, WRATH_REGEL, gooiWrath, volledigeWorp, wrathActief, wrathGeldt, wrathSleutel,
  type WrathTrigger,
} from '../../lib/wrathTriggers';
import { isScenarioTestCode } from '../../lib/scenarioTest';

// GEDEELDE STUKKEN VAN DE CAMPAGNE-BRIEFING (22-10-2026).
//
// De briefing vóór de battle (CampaignBattlePanel) en het scenario-overzicht TIJDENS het spel
// (CampaignScenarioOverlay, de knop "Battlefield" in GameView) tonen dezelfde dingen: de kaart, het
// terrein, de scenario-VP, de eerste beurt en de Wrath Triggers. Eén component per ding, zodat de
// twee schermen niet uit elkaar kunnen lopen. Alles leest de sheet; niets wordt nagerekend.

const eb = engraved as React.CSSProperties;
const display = towFont.display;
const serif = towFont.serif;

const asStr = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const asNum = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const sheetVan = (battle: CampaignBattle): Record<string, unknown> => (battle.scenario ?? {}) as Record<string, unknown>;

// ── De scenario-test ───────────────────────────────────────────────────────────────────────────────

/** De banner van de scenario-testmodus (alleen testbuild): niets wordt opgeslagen of gemeld. */
export function ScenarioTestBanner() {
  // In het Scenario lab (23-10-2026) staat het TEST-hoeklabel boven de lab-balk, niet boven deze banner:
  // dan hoeft hij er niet voor in te springen (anders brak hij op een telefoon over twee regels).
  const lab = useLab();
  return (
    <div
      role="status"
      data-testid="scenario-test-banner"
      style={{ background: '#b45309', color: '#fff', fontFamily: display, fontWeight: 700, fontSize: 13, letterSpacing: '.04em', textAlign: 'center', padding: lab ? '6px 12px' : '7px 12px 7px 150px' }}
    >
      Scenario test — nothing is saved
    </div>
  );
}

// ── De kaart ───────────────────────────────────────────────────────────────────────────────────────

/** Het bord met boven en onder wie daar opstelt. `mySeat` (host = aanvaller) kleurt je eigen kant. */
export function ScenarioKaart({ battle, mySeat }: { battle: CampaignBattle; mySeat: 'host' | 'guest' | null }) {
  const sheet = sheetVan(battle);
  const tableW = asNum(sheet.tableW);
  const tableH = asNum(sheet.tableH);
  const layout = parseSheetLayout(sheet.layout);
  const secLayout = parseSheetSecLayout(sheet.secLayout);
  if (!layout || !tableW || !tableH) return null;
  // Alleen terrein dat een REGEL is komt op het bord: het vooraf geplaatste gebouw en z'n muur van oude
  // sheets (18-10 t/m 20-10). De lage muur van Breakthrough zet de verdediger zelf, dus die niet.
  const vooraf = parseSheetTerrain(sheet.terrain).filter((t) => t.preplaced);
  const defenderTop = defenderIsTop(layout, tableH, asStr(sheet.verdedigerKant));
  const ikBenVerdediger = mySeat === 'guest';
  const youSide: 'top' | 'bottom' | undefined = mySeat ? (ikBenVerdediger === defenderTop ? 'top' : 'bottom') : undefined;
  // 25-10-2026 (Joost): claim-battle zonder aanvaller/verdediger. Dan staat er boven en onder het bord
  // alleen de naam (+ you/opponent), en heten de opstelvakken naar de speler: het "Defender"-vak is de
  // (gelote) verdediger, het "Attacker"-vak de aanvaller. Alleen bij het TONEN: `defenderTop` hierboven
  // leest nog de originele labels, en lopende battles hebben die labels al in hun sheet staan.
  const claim = isClaim(battle.type);
  const kantLabel = (isDefender: boolean): string => {
    const side = isDefender ? battle.verdediger : battle.aanvaller;
    const rol = claim ? 'Claimant' : isDefender ? 'Defender' : 'Attacker';
    const wie = !mySeat ? null : isDefender === ikBenVerdediger ? 'you' : 'opponent';
    if (claim && side.naam) return `${side.naam}${wie ? ` (${wie})` : ''}`;
    return `${rol}${wie ? ` (${wie})` : ''}${side.naam ? ` · ${side.naam}` : ''}`;
  };
  const toonLayout = claim
    ? { ...layout, zones: layout.zones.map((z) => ({ ...z, label: zonderRollen(z.label, battle) })) }
    : layout;
  return (
    <div>
      <div style={{ fontFamily: serif, fontSize: 12, color: youSide === 'top' ? TOW.goldDeep : TOW.muted, marginBottom: 4 }}>{kantLabel(defenderTop)}</div>
      <CampaignBoard layout={toonLayout} secLayout={secLayout} tableW={tableW} tableH={tableH} youSide={youSide} terrain={vooraf} />
      <div style={{ fontFamily: serif, fontSize: 12, color: youSide === 'bottom' ? TOW.goldDeep : TOW.muted, marginTop: 4 }}>{kantLabel(!defenderTop)}</div>
    </div>
  );
}

// ── Het terrein ────────────────────────────────────────────────────────────────────────────────────

/** Eén kleurstaaltje in de kleur van het bord. */
const Staal = ({ type }: { type: string }) => {
  const st = terrainStyle(type);
  return <span aria-hidden style={{ width: 14, height: 10, borderRadius: 2, flexShrink: 0, background: st.fill, border: `1px solid ${st.edge}`, transform: 'translateY(1px)' }} />;
};

interface Regel { type: string; naam: string; kenmerk: string | null; effect: string | null; n: number }
function groepeer(stukken: CampaignTerrainPiece[]): Regel[] {
  const acc: Record<string, Regel> = {};
  for (const t of stukken) {
    const k = terrainTrait(t);
    const kenmerk = k ? TRAIT_TEXT[k] : null;
    const key = `${t.type}|${kenmerk ?? ''}`;
    acc[key] = acc[key] ?? { type: t.type, naam: terrainName(t.type), kenmerk, effect: terrainEffect(t), n: 0 };
    acc[key].n += 1;
  }
  return Object.values(acc).sort((a, b) => b.n - a.n || a.naam.localeCompare(b.naam) || (a.kenmerk ?? '').localeCompare(b.kenmerk ?? ''));
}

/**
 * DE BOODSCHAPPENLIJST VAN HET TERREIN (05-10-2026, 22-10-2026). Per soort: aantal, naam, kenmerk,
 * een kleurstaaltje zoals op het bord, en wat het stuk aan tafel DOET (de effectregel van de campagne).
 * Het scenario-stuk van de verdediger (de lage muur in Breakthrough, `byDefender`) staat apart: dat
 * wordt niet om de beurt geplaatst maar vooraf door de verdediger, en het komt bovenop het aantal.
 */
export function TerreinLijst({ terrain, compact = false, battle = null }: {
  terrain: CampaignTerrainPiece[];
  compact?: boolean;
  /** 25-10-2026 (Joost): claim-battle zonder aanvaller/verdediger -- met de battle erbij heet "the
   *  defender" in het scenario-stuk de speler. Zonder battle (het lab) de oude tekst. */
  battle?: CampaignBattle | null;
}) {
  const rol = (t: string): string => zonderRollen(t, battle);
  const scenario = groepeer(terrain.filter((t) => t.byDefender));
  const gewoon = groepeer(terrain.filter((t) => !t.byDefender));
  const rij = (r: Regel) => (
    <li key={`${r.type}|${r.kenmerk ?? ''}`} style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
      <Staal type={r.type} />
      <span style={{ minWidth: 0 }}>
        <span style={{ fontFamily: serif, fontSize: compact ? 13 : 14, color: TOW.parch }}>
          <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{r.n} ×</span> {r.naam}
          {r.kenmerk ? <span style={{ color: TOW.muted }}> · {r.kenmerk}</span> : null}
        </span>
        {r.effect && (
          <span style={{ display: 'block', fontFamily: serif, fontStyle: 'italic', fontSize: compact ? 11 : 11.5, color: TOW.muted, lineHeight: 1.35 }}>{r.effect}</span>
        )}
      </span>
    </li>
  );
  return (
    <div>
      {scenario.length > 0 && (
        <div style={{ marginBottom: 8, border: `1px solid ${TOW.goldDeep}`, borderRadius: 9, padding: '7px 10px', background: 'rgba(184,134,47,0.08)' }}>
          <div style={{ ...eb, fontSize: 8, color: TOW.goldDeep, marginBottom: 4 }}>{rol('Scenario piece · the defender places it first')}</div>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>{scenario.map(rij)}</ul>
          <div style={{ fontFamily: serif, fontSize: 12, color: TOW.parchDim, lineHeight: 1.4, marginTop: 4 }}>
            {rol('Before the other terrain, the defender places it anywhere in their own half. It does not scatter, and it comes on top of the terrain pieces below.')}
          </div>
        </div>
      )}
      {gewoon.length > 0 && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: compact ? 4 : 6 }}>{gewoon.map(rij)}</ul>
      )}
    </div>
  );
}

// ── De eerste beurt ────────────────────────────────────────────────────────────────────────────────

/** "The defender (Name) takes the first turn. No roll-off." of null als er gewoon gerold wordt. */
export function eersteBeurtZin(battle: CampaignBattle): string | null {
  const vast = eersteBeurtVast(battle.scenario);
  if (!vast) return null;
  const side = vast === 'aanvaller' ? battle.aanvaller : battle.verdediger;
  // 25-10-2026 (Joost): claim-battle zonder aanvaller/verdediger -- dan alleen de naam.
  if (isClaim(battle.type) && side.naam) return `${side.naam} takes the first turn. There is no roll for it in this setup.`;
  return `The ${vast === 'aanvaller' ? 'attacker' : 'defender'}${side.naam ? ` (${side.naam})` : ''} takes the first turn. There is no roll for it in this setup.`;
}

// ── Scenario-VP ────────────────────────────────────────────────────────────────────────────────────

/** De posten van `scenarioBonus` als naslag: wie scoort wat, hoeveel, en de uitleg van de campagne. */
export function ScenarioVpLijst({ def, battle, compact = false }: { def: ScenarioBonus; battle: CampaignBattle; compact?: boolean }) {
  // 25-10-2026 (Joost): claim-battle zonder aanvaller/verdediger -- dan de naam i.p.v. de rol, ook in
  // het label en de uitleg van de campagne ("units in the defender's zone").
  const claim = isClaim(battle.type);
  const rol = (t: string): string => zonderRollen(t, battle);
  const wie = (k: 'aanvaller' | 'verdediger' | 'beide') => {
    if (k === 'beide') return kantTekst(k);
    const naam = (k === 'aanvaller' ? battle.aanvaller : battle.verdediger).naam;
    if (claim && naam) return naam;
    return `${kantTekst(k)}${naam ? ` (${naam})` : ''}`;
  };
  return (
    <ul data-testid="scenario-vp-lijst" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: compact ? 5 : 7 }}>
      {def.posten.map((p) => (
        <li key={p.id}>
          <div style={{ fontFamily: display, fontWeight: 700, fontSize: compact ? 13 : 13.5, color: TOW.goldDeep }}>{rol(p.label)}</div>
          <div style={{ fontFamily: serif, fontSize: 12.5, color: TOW.parch, lineHeight: 1.4 }}>
            <span style={{ color: TOW.muted }}>{wie(p.kant)}: </span>{rol(postSamenvatting(def, p))}
          </div>
          {p.uitleg && <div style={{ fontFamily: serif, fontStyle: 'italic', fontSize: 11.5, color: TOW.muted, lineHeight: 1.35 }}>{rol(p.uitleg)}</div>}
        </li>
      ))}
    </ul>
  );
}

// ── Wrath Triggers ─────────────────────────────────────────────────────────────────────────────────

/** De Wrath van één battle, zoals de schermen hem tonen. */
export interface WrathStand {
  /** Geldt de Wrath hier (Act 3+, geen Battle March)? Zo niet, dan toont niemand iets. */
  geldt: boolean;
  /** De twee actieve triggers in worp-volgorde. Leeg = geldt wel, maar er is (nog) geen worp. */
  triggers: WrathTrigger[];
  /** Lokaal gegooid (Scenario lab / scenario-test) in plaats van door de campagne. */
  lokaal: boolean;
  /** Alleen in het Scenario lab: opnieuw gooien. */
  reroll: (() => void) | null;
}

/**
 * DE WRATH VAN DEZE BATTLE (23-10-2026). Een campagne-battle leest de server-worp (`battle.wrath`, gezet
 * bij het begin van de War phase); er valt niets aan te vinken. Het lab en de scenario-test hebben geen
 * server-battle: daar gooit de Companion zelf met dezelfde regel (twee verschillende), één keer per code
 * onthouden, en in het lab mag je opnieuw gooien.
 */
export function useWrath(battle: CampaignBattle | null | undefined, code: string | null | undefined): WrathStand {
  const lab = useLab();
  const sleutelCode = code || battle?.code || '';
  const lokaal = isScenarioTestCode(sleutelCode);
  const [raw, zet] = usePersistentState<number[]>(wrathSleutel(sleutelCode), []);
  const fase = battle ? battle.fase ?? asNum(sheetVan(battle).fase) : null;
  const geldt = !!battle && wrathGeldt(fase, battle.battleMarch);
  const lokaleWorp = lokaal ? volledigeWorp(raw) : null;
  const heeftWorp = !!lokaleWorp;
  // Lokaal en nog geen (bruikbare) worp: nu gooien. Na een reset van het lab staat er weer [] en komt er
  // vanzelf een nieuwe.
  useEffect(() => {
    if (lokaal && geldt && !heeftWorp) zet(gooiWrath());
  }, [lokaal, geldt, heeftWorp, zet]);
  const d6 = lokaal ? lokaleWorp ?? [] : battle?.wrath ?? [];
  return {
    geldt,
    triggers: geldt ? wrathActief(d6) : [],
    lokaal,
    reroll: lokaal && lab ? () => zet(gooiWrath()) : null,
  };
}

/**
 * DE WRATH-SECTIE (23-10-2026, was de aanvinkstap van 22-10): de twee triggers van deze battle, vast.
 * Nog geen worp in een Act 3+-campagnebattle → "rolled when the War phase begins". In het lab staat er
 * een Reroll-knop. Dezelfde component in de briefing en in het scenario-overzicht tijdens het spel.
 */
export function WrathVast({ stand, compact = false }: { stand: WrathStand; compact?: boolean }) {
  if (!stand.geldt) return null;
  return (
    <div data-testid="wrath-vast">
      <div style={{ fontFamily: serif, fontStyle: 'italic', fontSize: 12, color: TOW.muted, lineHeight: 1.4, margin: '0 0 8px' }}>
        {stand.lokaal ? 'Rolled here for this test with the campaign rule: two different triggers, a double is rolled again.' : WRATH_REGEL}
      </div>
      {stand.triggers.length === 0 ? (
        <div data-testid="wrath-nog-niet" style={{ fontFamily: serif, fontSize: 13, color: TOW.parch, lineHeight: 1.45, border: `1px dashed ${TOW.lineStrong}`, borderRadius: 9, padding: compact ? '6px 8px' : '8px 10px' }}>
          {WRATH_NOG_NIET}. You will see the two here, on the campaign battle page and on the battle sheet.
        </div>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {stand.triggers.map((t) => (
            <li
              key={t.d6}
              aria-label={`Wrath Trigger ${t.d6}: ${t.naam}`}
              style={{ display: 'flex', alignItems: 'flex-start', gap: 9, padding: compact ? '6px 8px' : '8px 10px', borderRadius: 9, border: `1px solid ${TOW.blood}`, background: 'rgba(160,40,30,0.12)' }}
            >
              <span style={{ width: 24, height: 24, flexShrink: 0, borderRadius: 6, border: `1px solid ${TOW.blood}`, background: TOW.blood, color: '#fbfaf6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: display, fontWeight: 700, fontSize: 13 }}>{t.d6}</span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontFamily: display, fontWeight: 700, fontSize: 13.5, color: TOW.ink }}>{t.naam}</span>
                <span style={{ display: 'block', fontFamily: serif, fontSize: 12, color: TOW.parchDim, lineHeight: 1.35 }}><span style={{ color: TOW.muted }}>When: </span>{t.wanneer}</span>
                <span style={{ display: 'block', fontFamily: serif, fontSize: 12, color: TOW.parch, lineHeight: 1.35 }}>{t.effect}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {stand.reroll && (
        <button
          type="button"
          data-testid="wrath-reroll"
          onClick={stand.reroll}
          style={{ marginTop: 8, fontFamily: display, fontWeight: 700, fontSize: 12.5, color: TOW.blood, background: 'transparent', border: `1px solid ${TOW.blood}`, borderRadius: 8, padding: '5px 12px', cursor: 'pointer' }}
        >
          Reroll the Wrath Triggers
        </button>
      )}
    </div>
  );
}

/** WrathVast met de hook erin, voor schermen die hem niet zelf bovenaan kunnen aanroepen (de briefing
 *  heeft vroege returns vóór de plek waar de Wrath-sectie staat). */
export function WrathVoorBattle({ battle, code, compact = false }: { battle: CampaignBattle; code: string; compact?: boolean }) {
  const stand = useWrath(battle, code);
  return <WrathVast stand={stand} compact={compact} />;
}

// ── Het scenario tijdens het spel ──────────────────────────────────────────────────────────────────

/**
 * HET SCENARIO TIJDENS HET SPEL (22-10-2026). Joost wil de kaart en de scenarioteksten ook halverwege
 * kunnen teruglezen, niet alleen in de briefing vooraf. Compact: naam, eerste beurt, kaart, opstelling,
 * einde, de objectives, de scenario-VP, de Wrath Triggers en het terrein. Geopend als overlay vanuit
 * GameView (knop "Battlefield"), zoals de battle sheet van een potje buiten de campagne.
 */
export function CampaignScenarioOverlay({ battle, code, mySeat, onClose }: {
  battle: CampaignBattle;
  code: string;
  mySeat: 'host' | 'guest' | null;
  onClose: () => void;
}) {
  useBackClose(true, onClose);
  const sheet = sheetVan(battle);
  const naam = asStr(sheet.scenarioNaam);
  // 25-10-2026 (Joost): claim-battle zonder aanvaller/verdediger -- de teksten van de sheet met namen.
  const rol = (t: string): string => zonderRollen(t, battle);
  const deployNote = asStr(sheet.deployNote) ? rol(asStr(sheet.deployNote)!) : null;
  const gameEnd = asStr(sheet.gameEnd) ? rol(asStr(sheet.gameEnd)!) : null;
  const def = scenarioBonusVan(sheet);
  const terrain = parseSheetTerrain(sheet.terrain);
  const eerste = eersteBeurtZin(battle);
  const fase = battle.fase ?? asNum(sheet.fase);
  const wrath = useWrath(battle, code);
  const secundair = (Array.isArray(sheet.secondaries) ? sheet.secondaries : []).map(asStr).filter((s): s is string => !!s);
  const objectives = secundair.map((id) => ({ id, ...(CAMPAGNE_OBJECTIVES[id] ?? null) })).filter((o) => o.naam);
  const [open, setOpen] = useState<Record<string, boolean>>({ terrein: false });
  const kop = (t: string) => <div style={{ ...eb, fontSize: 8, color: TOW.muted, margin: '12px 0 5px' }}>{t}</div>;
  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 85, background: 'rgba(30,20,8,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 14 }}
    >
      <div
        data-testid="scenario-overlay"
        onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 560, maxHeight: '88vh', overflowY: 'auto', background: TOW.panel2, border: `1px solid ${TOW.lineStrong}`, borderRadius: 16, padding: 16, color: TOW.ink, boxSizing: 'border-box' }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ ...eb, fontSize: 8.5, color: TOW.goldDeep }}>Battlefield · {code}</div>
            {naam && <div style={{ fontFamily: display, fontSize: 20, color: TOW.gold, lineHeight: 1.15 }}>{naam}</div>}
          </div>
          <button onClick={onClose} aria-label="Close" style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 22, lineHeight: 1, color: TOW.muted, padding: '0 4px' }}>×</button>
        </div>
        {eerste && <div style={{ marginTop: 8, fontFamily: serif, fontSize: 13, color: TOW.parch, borderLeft: `3px solid ${TOW.goldDeep}`, padding: '2px 0 2px 9px' }}>{eerste}</div>}

        <div style={{ marginTop: 10 }}><ScenarioKaart battle={battle} mySeat={mySeat} /></div>
        {deployNote && <>{kop('Deployment')}<div style={{ fontFamily: serif, fontSize: 12.5, color: TOW.parchDim, lineHeight: 1.45 }}>{deployNote}</div></>}
        {gameEnd && <>{kop('Game end and scoring')}<div style={{ fontFamily: serif, fontSize: 12.5, color: TOW.parchDim, lineHeight: 1.45 }}>{gameEnd}</div></>}

        {objectives.length > 0 && (
          <>
            {kop('Objectives')}
            {objectives.map((o) => (
              <div key={o.id} style={{ marginBottom: 6 }}>
                <div style={{ fontFamily: display, fontWeight: 700, fontSize: 13.5, color: TOW.goldDeep }}>{rol(o.naam)}</div>
                <div style={{ fontFamily: serif, fontSize: 12.5, color: TOW.parchDim, lineHeight: 1.4 }}>{rol(o.uitleg)}</div>
              </div>
            ))}
          </>
        )}
        {def && <>{kop('Scenario victory points')}<ScenarioVpLijst def={def} battle={battle} compact /></>}

        {wrath.geldt && <>{kop('Wrath Triggers')}<WrathVast stand={wrath} compact /></>}

        {terrain.length > 0 && (
          <>
            <button
              type="button"
              onClick={() => setOpen((o) => ({ ...o, terrein: !o.terrein }))}
              style={{ display: 'flex', alignItems: 'center', gap: 7, width: '100%', background: 'none', border: 'none', padding: '12px 0 4px', cursor: 'pointer', textAlign: 'left' }}
            >
              <span style={{ ...eb, fontSize: 8, color: TOW.muted, flex: 1 }}>Terrain ({terrain.length} pieces)</span>
              <span style={{ fontFamily: serif, fontSize: 13, color: TOW.faint }}>{open.terrein ? '▾' : '▸'}</span>
            </button>
            {open.terrein && (
              <>
                <TerreinLijst terrain={terrain} compact battle={battle} />
                <div style={{ fontFamily: serif, fontSize: 12, color: TOW.parchDim, lineHeight: 1.45, marginTop: 8 }}>
                  {rol(terrainPlacementShort({ battleMarch: (fase ?? 3) <= 2, building: terrain.some((t) => t.preplaced) }))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
