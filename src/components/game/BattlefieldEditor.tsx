import { useState } from 'react';
import { useUI } from '../../state';
import { TOW, towFont, engraved } from '../../design/tow';
import {
  scenariosInGroep, scenarioById, TERRAIN_TYPES, TABLE_PRESETS, TRAIT_RULE, SECONDARY_OBJECTIVES,
  recommendedTerrainCount, scatterTerrain, shufflePlacement, addPieceBalanced, terrainType,
  type BattleSetupState, type TerrainPiece, type TerrainTrait,
} from '../../lib/battle';
import { FORMATS, formatDef, type BattleFormat, type BattleSheet } from '../../lib/battleSheet';
import { BattleBoard } from './BattleBoard';
import { TerrainIcon, TraitIcon } from './terrainIcons';

// DE BATTLEFIELD-EDITOR: de "step by step"-tak van de nieuwe wizard.
//
// Dit is de oude `BattleSetup.tsx` (Map size → Scenario → Secondaries → Terrain), maar op twee
// punten anders (Joost, 13-09):
//
//  1. GESTUURD. Hij houdt niets meer zelf vast en schrijft NIET meer naar `tow:battle`. Hij krijgt
//     een `BattleSheet` binnen en geeft bij elke wijziging een nieuwe terug. Dat moest wel: de sheet
//     is inmiddels het gedeelde contract dat op de tracker woont en realtime naar je tegenstander
//     synct (zie battleSheet.ts). Een scherm dat stiekem naar een lokale sleutel schrijft zou die
//     hele afspraak weer stukmaken — precies de bug die de sheet moest oplossen.
//  2. EEN STAP ERBIJ: FORMAT. Het format bepaalt uit welke D6-tabel je je scenario trekt, hoeveel
//     rounds het potje duurt en op welke tafel je standaard speelt. Dat is dus de eerste vraag, niet
//     de laatste.
//
// DE STAP-NAVIGATIE ZIT ER NIET IN. De wizard eromheen heeft al een voortgangsbalk en Back/Next-
// knoppen, en twee setjes knoppen onder elkaar is precies het soort onduidelijkheid dat we aan het
// wegwerken zijn. Vandaar `stap`/`onStap`: de wizard bepaalt waar je bent, dit scherm toont het en
// laat je er met de balk bovenin doorheen springen.

const eb = engraved as React.CSSProperties;
const goldGrad = `linear-gradient(180deg, ${TOW.goldBright} 0%, ${TOW.gold} 55%, ${TOW.goldDeep} 100%)`;
const TRAITS: TerrainTrait[] = ['difficult', 'dangerous'];
const traitColor = (t: TerrainTrait) => (t === 'dangerous' ? '#b23b3b' : '#5c4326');
const clampN = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** De stappen van deze editor, in volgorde. De wizard leest deze lijst voor zijn eigen navigatie —
 *  en de ✎-knoppen in de Generate-tak springen hier met een index op binnen. */
export const BF_STEPS = ['Format', 'Map size', 'Scenario', 'Secondaries', 'Terrain'] as const;
/** Index van elke stap, zodat aanroepers niet met losse getallen hoeven te strooien. */
export const BF_STAP = { format: 0, tafel: 1, scenario: 2, secondaries: 3, terrein: 4 } as const;

/** Terreinstukken binnen de tafelgrenzen houden (identiek aan wat het oude scherm bij een
 *  tafelwijziging deed). */
const binnenTafel = (terrain: TerrainPiece[], w: number, h: number): TerrainPiece[] =>
  terrain.map((t) => ({ ...t, x: Math.min(t.x, Math.max(0, w - t.w)), y: Math.min(t.y, Math.max(0, h - t.h)) }));

/**
 * FORMAT WISSELEN — en wat er dan met het scenario en de tafel moet gebeuren.
 *
 * Het format kiest zijn scenario's uit precies één groep (`formatDef(...).groep`). Wissel je van
 * Matched Play naar Battle March, dan staat er dus een scenario in de sheet dat op de nieuwe tabel
 * niet eens bestaat. Dat laten staan is geen optie: je zou een potje starten met een scenario dat
 * niemand kan opzoeken, en de generator gaat er bij de eerstvolgende herrol tóch overheen. Dus:
 * scenario buiten de nieuwe groep → het eerste scenario van de nieuwe groep.
 *
 * DE TAFEL LIGT SUBTIELER. Elk format heeft een standaardtafel (Battle March speelt op 44×30″), maar
 * de speler mag die zelf aanpassen — en dan is het zíjn tafel, niet die van het format. We springen
 * daarom alleen mee als de huidige tafel nog exact de standaard van het OUDE format is. Dat is de
 * vraag "heeft hij zelf iets aangepast?" zonder er een apart vlaggetje voor bij te houden: die vlag
 * zou een veld op de sheet kosten (die naar je tegenstander synct en er niets mee te maken heeft),
 * of lokale state die je kwijt bent zodra je even naar een andere tab gaat. Wie 48×48″ heeft gekozen
 * houdt 48×48″, wat hij daarna ook met het format doet (Joost, 13-09).
 */
export function wisselFormat(sheet: BattleSheet, format: BattleFormat): BattleSheet {
  const oud = formatDef(sheet.format);
  const nieuw = formatDef(format);
  if (oud.id === nieuw.id) return sheet;
  const groep = scenariosInGroep(nieuw.groep);
  const scenarioOk = groep.some((s) => s.id === sheet.scenario);
  const standaardTafel = sheet.tableW === oud.tafel.w && sheet.tableH === oud.tafel.h;
  const tableW = standaardTafel ? nieuw.tafel.w : sheet.tableW;
  const tableH = standaardTafel ? nieuw.tafel.h : sheet.tableH;
  return {
    ...sheet,
    format: nieuw.id,
    scenario: scenarioOk ? sheet.scenario : (groep[0]?.id ?? sheet.scenario),
    tableW,
    tableH,
    // Terrein dat buiten de nieuwe (mogelijk kleinere) tafel valt terugduwen — zelfde behandeling
    // als bij het met de hand wijzigen van de tafelmaat.
    terrain: binnenTafel(sheet.terrain, tableW, tableH),
    // Verschuift het scenario, dan slaat de worp die erbij hoorde nergens meer op. Blijft het staan,
    // dan blijft ook de worp staan: die is aan tafel het bewijs dat het uit een eerlijke D6 kwam.
    worpen: scenarioOk ? sheet.worpen : { ...sheet.worpen, scenario: undefined },
  };
}

const eyeSvg = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

export function BattlefieldEditor({ sheet, onChange, stap, onStap }: {
  sheet: BattleSheet;
  onChange: (s: BattleSheet) => void;
  /** Welke stap uit BF_STEPS er getoond wordt. */
  stap: number;
  /** Springen naar een andere stap (de balk bovenin). */
  onStap: (i: number) => void;
}) {
  const { openRule } = useUI();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [enabledTypes, setEnabledTypes] = useState<Set<string>>(() => new Set(TERRAIN_TYPES.map((t) => t.id)));
  const [randomCount, setRandomCount] = useState<number | null>(null); // null → volg de aanbeveling

  const scenario = scenarioById(sheet.scenario);
  const recCount = recommendedTerrainCount(sheet.tableW, sheet.tableH);
  const count = randomCount ?? recCount;
  const isPreset = (w: number, h: number) => sheet.tableW === w && sheet.tableH === h;
  const huidigeGroep = scenariosInGroep(formatDef(sheet.format).groep);

  // Elke wijziging met de hand haalt het stempel 'generated' van de sheet: hij is nu deels gezet en
  // deels gerold, en 'manual' is het eerlijkste woord voor dat mengsel.
  const zet = (patch: Partial<BattleSheet>) => onChange({ ...sheet, ...patch, bron: 'manual' });

  const setTable = (w: number, h: number) => zet({ tableW: w, tableH: h, terrain: binnenTafel(sheet.terrain, w, h) });
  const setTerrain = (terrain: TerrainPiece[]) => zet({ terrain });
  const toggleType = (id: string) => setEnabledTypes((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const selectedPiece = selectedId ? sheet.terrain.find((t) => t.id === selectedId) ?? null : null;
  const setTrait = (id: string, trait: TerrainTrait, val: boolean) => setTerrain(sheet.terrain.map((t) => (t.id === id ? { ...t, [trait]: val } : t)));
  const removePiece = (id: string) => { setTerrain(sheet.terrain.filter((t) => t.id !== id)); setSelectedId(null); };

  // Secondary objectives — de drie Strategic Locations-varianten sluiten elkaar uit.
  const hasSec = (id: string) => sheet.secondaries.includes(id);
  const toggleSecondary = (id: string) => {
    const cur = sheet.secondaries;
    let next: string[];
    if (cur.includes(id)) next = cur.filter((x) => x !== id);
    else if (id.startsWith('strategic-')) next = [...cur.filter((x) => !x.startsWith('strategic-')), id];
    else next = [...cur, id];
    zet({ secondaries: next });
  };

  // BattleBoard leest de oude `BattleSetupState`-vorm. De sheet heeft alle velden die hij nodig
  // heeft, dus dit is puur een doorgeefluik en geen tweede waarheid.
  const boardSetup: BattleSetupState = {
    scenario: sheet.scenario, tableW: sheet.tableW, tableH: sheet.tableH,
    terrain: sheet.terrain, secondaries: sheet.secondaries,
  };

  const label: React.CSSProperties = { ...eb, fontSize: 8.5, color: TOW.muted, margin: '16px 0 7px' };

  return (
    <div>
      {/* De kaart — altijd in beeld; de lagen bouwen zich op terwijl je door de stappen loopt */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, flexWrap: 'wrap', margin: '2px 0 6px' }}>
        <span style={{ fontFamily: towFont.display, fontWeight: 700, fontSize: 13.5, color: TOW.ink }}>{scenario?.name ?? 'Battlefield'}</span>
        <span style={{ fontFamily: towFont.serif, fontSize: 11.5, color: TOW.faint }}>{sheet.tableW}″ × {sheet.tableH}″ · {formatDef(sheet.format).label}</span>
      </div>
      <BattleBoard setup={boardSetup} onChange={setTerrain} selectedId={selectedId} onSelect={setSelectedId} />

      {/* Geselecteerd stuk: difficult / dangerous zetten (met regels-oog) of verwijderen */}
      {selectedPiece && (
        <div style={{ marginTop: 8, padding: '9px 11px', borderRadius: 10, border: `1px solid ${TOW.goldDeep}`, background: 'rgba(184,134,47,0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ flexShrink: 0, color: TOW.inkDim, display: 'inline-flex' }}><TerrainIcon type={selectedPiece.type} size={18} /></span>
            <span style={{ flex: 1, minWidth: 0, fontFamily: towFont.display, fontWeight: 700, fontSize: 13.5, color: TOW.ink }}>{terrainType(selectedPiece.type).label}</span>
            <button onClick={() => removePiece(selectedPiece.id)} style={{ flexShrink: 0, padding: '5px 11px', borderRadius: 7, border: `1px solid ${TOW.line}`, background: 'transparent', color: TOW.muted, cursor: 'pointer', fontFamily: towFont.display, fontWeight: 600, fontSize: 12 }}>Remove</button>
          </div>
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
            {TRAITS.map((tr) => {
              const active = !!selectedPiece[tr];
              return (
                <div key={tr} style={{ display: 'inline-flex', alignItems: 'stretch', borderRadius: 8, overflow: 'hidden', border: `1px solid ${active ? TOW.goldDeep : TOW.line}`, background: active ? 'rgba(184,134,47,0.12)' : 'transparent' }}>
                  <button onClick={() => setTrait(selectedPiece.id, tr, !active)} aria-pressed={active} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 10px', border: 'none', cursor: 'pointer', background: 'transparent', color: active ? TOW.goldDeep : TOW.muted, fontFamily: towFont.display, fontWeight: 600, fontSize: 12.5 }}>
                    <span style={{ display: 'inline-flex', color: active ? traitColor(tr) : TOW.faint }}><TraitIcon trait={tr} size={14} /></span>
                    {TRAIT_RULE[tr].label}
                  </button>
                  <button onClick={() => openRule(TRAIT_RULE[tr].slug)} aria-label={`${TRAIT_RULE[tr].label} rules`} title={`${TRAIT_RULE[tr].label} rules`} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 8px', border: 'none', borderLeft: `1px solid ${active ? TOW.goldDeep : TOW.line}`, background: 'transparent', color: TOW.goldDeep, cursor: 'pointer' }}>{eyeSvg}</button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Sub-voortgang. Aanklikbaar: na een ✎ uit de Generate-tak land je middenin deze rij, en dan
          wil je er ook los doorheen kunnen springen — niet vier keer op Next hoeven drukken. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', margin: '14px 0 4px' }}>
        <div style={{ display: 'flex', gap: 4, flex: '1 1 150px', minWidth: 0 }}>
          {BF_STEPS.map((naam, i) => (
            <button
              key={naam}
              onClick={() => onStap(i)}
              aria-label={`Go to ${naam}`}
              title={naam}
              style={{ flex: 1, minWidth: 0, height: 14, padding: 0, border: 'none', background: 'transparent', cursor: 'pointer' }}
            >
              <span style={{ display: 'block', height: 4, borderRadius: 99, background: i <= stap ? goldGrad : 'rgba(74,55,22,0.12)' }} />
            </button>
          ))}
        </div>
        <span style={{ ...eb, fontSize: 8, color: TOW.muted, whiteSpace: 'nowrap' }}>{stap + 1}/{BF_STEPS.length} · {BF_STEPS[stap]}</span>
      </div>

      {stap === BF_STAP.format && (<>
        <div style={label}>Format</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {FORMATS.map((f) => {
            const on = sheet.format === f.id;
            return (
              <button key={f.id} onClick={() => onChange(wisselFormat(sheet, f.id))} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, textAlign: 'left', padding: '11px 13px', borderRadius: 10, cursor: 'pointer', border: `1px solid ${on ? TOW.goldDeep : TOW.line}`, background: on ? 'rgba(138,108,48,0.10)' : TOW.cardLt }}>
                <span style={{ width: 18, height: 18, marginTop: 2, flexShrink: 0, borderRadius: 99, border: `1px solid ${on ? TOW.goldDeep : TOW.lineStrong}`, background: on ? goldGrad : 'transparent', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: TOW.onGrad, fontSize: 11, fontWeight: 700 }}>{on ? '✓' : ''}</span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontFamily: towFont.display, fontWeight: 700, fontSize: 14.5, color: on ? TOW.goldDeep : TOW.ink }}>{f.label}</span>
                  <span style={{ display: 'block', fontFamily: towFont.serif, fontSize: 12, color: TOW.muted, lineHeight: 1.35 }}>{f.blurb}</span>
                </span>
              </button>
            );
          })}
        </div>
      </>)}

      {stap === BF_STAP.tafel && (<>
        <div style={label}>Map size</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
          {TABLE_PRESETS.map((t) => { const on = isPreset(t.w, t.h); return (
            <button key={t.label} onClick={() => setTable(t.w, t.h)} style={{ padding: '8px 12px', borderRadius: 8, border: `1px solid ${on ? TOW.goldDeep : TOW.line}`, cursor: 'pointer', fontFamily: towFont.display, fontWeight: 600, fontSize: 12.5, background: on ? 'rgba(138,108,48,0.14)' : TOW.cardLt, color: on ? TOW.gold : TOW.muted }}>{t.label}</button>
          ); })}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ ...eb, fontSize: 8, color: TOW.faint }}>Custom (inches)</span>
          <input type="number" inputMode="numeric" min={12} step={6} value={sheet.tableW} onChange={(e) => setTable(Math.max(12, Math.floor(Number(e.target.value) || 0)), sheet.tableH)} aria-label="Table width" style={{ width: 64, padding: '7px 9px', borderRadius: 8, border: `1px solid ${TOW.lineStrong}`, background: TOW.cardLt, fontFamily: towFont.display, fontWeight: 600, fontSize: 13, color: TOW.ink }} />
          <span style={{ color: TOW.muted }}>×</span>
          <input type="number" inputMode="numeric" min={12} step={6} value={sheet.tableH} onChange={(e) => setTable(sheet.tableW, Math.max(12, Math.floor(Number(e.target.value) || 0)))} aria-label="Table height" style={{ width: 64, padding: '7px 9px', borderRadius: 8, border: `1px solid ${TOW.lineStrong}`, background: TOW.cardLt, fontFamily: towFont.display, fontWeight: 600, fontSize: 13, color: TOW.ink }} />
          <span style={{ fontFamily: towFont.serif, fontSize: 12, color: TOW.muted }}>{sheet.tableW}″ × {sheet.tableH}″</span>
        </div>
      </>)}

      {stap === BF_STAP.scenario && (<>
        {/* Alleen de scenario's van het gekozen format: een Battle March-kaart aanbieden in een
            Matched Play-potje is geen keuze maar een valstrik. */}
        <div style={label}>Scenario · {formatDef(sheet.format).label}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {huidigeGroep.map((s) => {
            const on = sheet.scenario === s.id;
            return (
              <div key={s.id} style={{ display: 'flex', alignItems: 'stretch', gap: 6 }}>
                <button onClick={() => zet({ scenario: s.id, worpen: { ...sheet.worpen, scenario: undefined } })} style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', padding: '9px 11px', borderRadius: 9, cursor: 'pointer', border: `1px solid ${on ? TOW.goldDeep : TOW.line}`, background: on ? 'rgba(138,108,48,0.10)' : TOW.cardLt }}>
                  <span style={{ minWidth: 20, height: 20, padding: '0 4px', flexShrink: 0, borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: towFont.display, fontWeight: 700, fontSize: s.d6Label ? 10 : 12, color: on ? TOW.onGrad : TOW.muted, background: on ? goldGrad : 'transparent', border: on ? 'none' : `1px solid ${TOW.line}` }}>{s.d6Label ?? s.d6}</span>
                  <span style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: towFont.display, fontWeight: 600, fontSize: 14, color: on ? TOW.goldDeep : TOW.ink }}>{s.name}</div>
                    <div style={{ fontFamily: towFont.serif, fontSize: 11.5, color: TOW.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.blurb}</div>
                  </span>
                </button>
                <button onClick={() => openRule(s.ruleSlug)} aria-label={`${s.name} rules`} title={`${s.name} rules`} style={{ width: 38, flexShrink: 0, borderRadius: 9, border: `1px solid ${TOW.goldDeep}`, background: 'rgba(184,134,47,0.10)', color: TOW.goldDeep, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{eyeSvg}</button>
              </div>
            );
          })}
        </div>
        {scenario && (
          <div style={{ marginTop: 10, padding: '8px 10px', borderRadius: 9, background: 'rgba(138,108,48,0.07)', border: `1px solid ${TOW.line}` }}>
            <div style={{ display: 'flex', gap: 7, alignItems: 'flex-start' }}>
              <span style={{ flexShrink: 0, fontFamily: towFont.display, fontWeight: 700, fontSize: 11.5, color: TOW.goldDeep }}>Deployment</span>
              <span style={{ fontFamily: towFont.serif, fontSize: 11.5, color: TOW.ink, lineHeight: 1.35 }}>{scenario.deployNote}</span>
            </div>
            {scenario.gameEnd && (
              <div style={{ display: 'flex', gap: 7, alignItems: 'flex-start', marginTop: 5 }}>
                <span style={{ flexShrink: 0, fontFamily: towFont.display, fontWeight: 700, fontSize: 11.5, color: TOW.goldDeep }}>Game end</span>
                <span style={{ fontFamily: towFont.serif, fontSize: 11.5, color: TOW.ink, lineHeight: 1.35 }}>{scenario.gameEnd}</span>
              </div>
            )}
          </div>
        )}
      </>)}

      {stap === BF_STAP.secondaries && (<>
        <div style={label}>Secondary objectives</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {SECONDARY_OBJECTIVES.map((s) => {
            const on = hasSec(s.id);
            return (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 7px', borderRadius: 8, border: `1px solid ${on ? TOW.goldDeep : TOW.line}`, background: on ? 'rgba(138,108,48,0.10)' : TOW.cardLt }}>
                <button onClick={() => toggleSecondary(s.id)} role="checkbox" aria-checked={on} aria-label={`Toggle ${s.name}`} style={{ width: 19, height: 19, flexShrink: 0, borderRadius: 5, cursor: 'pointer', border: `1px solid ${on ? TOW.goldDeep : TOW.lineStrong}`, background: on ? goldGrad : 'transparent', color: TOW.onGrad, fontSize: 12, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>{on ? '✓' : ''}</button>
                <button onClick={() => toggleSecondary(s.id)} style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                  <div style={{ fontFamily: towFont.display, fontWeight: 600, fontSize: 13, color: on ? TOW.goldDeep : TOW.ink }}>{s.name}</div>
                  <div style={{ fontFamily: towFont.serif, fontSize: 11, color: TOW.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.blurb}</div>
                </button>
                <button onClick={() => openRule(s.ruleSlug)} aria-label={`${s.name} rules`} title={`${s.name} rules`} style={{ flexShrink: 0, width: 28, height: 28, borderRadius: 7, border: `1px solid ${TOW.goldDeep}`, background: 'rgba(184,134,47,0.10)', color: TOW.goldDeep, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>{eyeSvg}</button>
              </div>
            );
          })}
        </div>
      </>)}

      {stap === BF_STAP.terrein && (<>
        <div style={label}>Terrain mix</div>
        {(() => {
          const n = sheet.terrain.length;
          const met = n >= recCount;
          const over = n > recCount + 1;
          const tone = n === 0 ? TOW.muted : over ? TOW.blood : met ? '#4e7a45' : TOW.goldDeep;
          return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 11px', borderRadius: 10, border: `1px solid ${TOW.line}`, background: TOW.cardLt, marginBottom: 8 }}>
              <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 3, fontFamily: towFont.display, fontWeight: 700, color: tone }}>
                <span style={{ fontSize: 22, lineHeight: 1 }}>{n}</span>
                <span style={{ fontSize: 13, color: TOW.faint }}>/ {recCount}</span>
              </span>
              <span style={{ minWidth: 0, flex: 1, fontFamily: towFont.serif, fontSize: 11.5, color: TOW.muted, lineHeight: 1.3 }}>
                features · <span style={{ color: tone, fontWeight: 600 }}>{recCount} recommended</span> for a {sheet.tableW}″ table<br />
                <span style={{ color: TOW.faint }}>Rulebook: ~1 feature per 12″ of the longest edge.</span>
              </span>
              <button onClick={() => openRule('how-much-terrain')} aria-label="Terrain rules" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, flexShrink: 0, borderRadius: 8, border: `1px solid ${TOW.goldDeep}`, background: 'rgba(184,134,47,0.12)', color: TOW.goldDeep, cursor: 'pointer', padding: 0 }}>{eyeSvg}</button>
            </div>
          );
        })()}

        <div style={{ fontFamily: towFont.serif, fontSize: 11.5, color: TOW.muted, margin: '0 0 7px', lineHeight: 1.35 }}>
          Tick the types you want, then <b style={{ color: TOW.goldDeep }}>Randomise mix</b> to spread the total across them — or set each count by hand with − / +. Happy with it? <b style={{ color: TOW.goldDeep }}>Randomise locations</b> scatters them on the map.
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 9 }}>
          {TERRAIN_TYPES.map((t) => {
            const on = enabledTypes.has(t.id);
            const n = sheet.terrain.filter((p) => p.type === t.id).length;
            const removeOne = () => {
              const arr = sheet.terrain;
              let idx = -1;
              for (let i = arr.length - 1; i >= 0; i--) if (arr[i].type === t.id) { idx = i; break; }
              if (idx < 0) return;
              if (arr[idx].id === selectedId) setSelectedId(null);
              setTerrain(arr.slice(0, idx).concat(arr.slice(idx + 1)));
            };
            return (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 7px', borderRadius: 8, border: `1px solid ${n > 0 ? TOW.lineStrong : TOW.line}`, background: TOW.cardLt }}>
                <button onClick={() => toggleType(t.id)} role="checkbox" aria-checked={on} aria-label={`Include ${t.label} in the random mix`} title="Include in Randomise mix" style={{ width: 19, height: 19, flexShrink: 0, borderRadius: 5, cursor: 'pointer', border: `1px solid ${on ? TOW.goldDeep : TOW.lineStrong}`, background: on ? goldGrad : 'transparent', color: TOW.onGrad, fontSize: 12, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>{on ? '✓' : ''}</button>
                <span style={{ flexShrink: 0, color: TOW.inkDim, display: 'inline-flex' }}><TerrainIcon type={t.id} size={20} /></span>
                <span style={{ flex: 1, minWidth: 0, display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: towFont.serif, fontSize: 13, color: TOW.ink }}>
                  {t.label}
                  {t.defaultTrait && <span title={TRAIT_RULE[t.defaultTrait].label} style={{ flexShrink: 0, color: TOW.faint, display: 'inline-flex' }}><TraitIcon trait={t.defaultTrait} size={13} /></span>}
                </span>
                <div style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0, border: `1px solid ${TOW.lineStrong}`, borderRadius: 7, overflow: 'hidden', background: TOW.panel2 }}>
                  <button onClick={removeOne} disabled={n === 0} aria-label={`One fewer ${t.label}`} style={{ width: 26, height: 28, border: 'none', borderRight: `1px solid ${TOW.line}`, background: 'transparent', color: n === 0 ? TOW.faint : TOW.ink, cursor: n === 0 ? 'default' : 'pointer', fontSize: 16, fontFamily: towFont.display }}>−</button>
                  <span style={{ minWidth: 22, textAlign: 'center', fontFamily: towFont.display, fontWeight: 700, fontSize: 13.5, color: n > 0 ? TOW.ink : TOW.faint }}>{n}</span>
                  <button onClick={() => { const p = addPieceBalanced(boardSetup, t.id); setTerrain([...sheet.terrain, p]); }} aria-label={`One more ${t.label}`} style={{ width: 26, height: 28, border: 'none', borderLeft: `1px solid ${TOW.line}`, background: 'transparent', color: TOW.ink, cursor: 'pointer', fontSize: 16, fontFamily: towFont.display }}>+</button>
                </div>
                <button onClick={() => openRule(t.ruleSlug)} aria-label={`${t.label} rules`} title={`${t.label} rules`} style={{ flexShrink: 0, width: 28, height: 28, borderRadius: 7, border: `1px solid ${TOW.goldDeep}`, background: 'rgba(184,134,47,0.10)', color: TOW.goldDeep, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>{eyeSvg}</button>
              </div>
            );
          })}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 9 }}>
          <span style={{ ...eb, fontSize: 8, color: TOW.faint }}>Total</span>
          <div style={{ display: 'inline-flex', alignItems: 'center', border: `1px solid ${TOW.lineStrong}`, borderRadius: 8, overflow: 'hidden', background: TOW.cardLt }}>
            <button onClick={() => setRandomCount(clampN(count - 1, 1, 40))} aria-label="Lower total" style={{ width: 30, height: 32, border: 'none', borderRight: `1px solid ${TOW.line}`, background: 'transparent', color: TOW.ink, cursor: 'pointer', fontSize: 17, fontFamily: towFont.display }}>−</button>
            <span style={{ minWidth: 30, textAlign: 'center', fontFamily: towFont.display, fontWeight: 700, fontSize: 14, color: TOW.ink }}>{count}</span>
            <button onClick={() => setRandomCount(clampN(count + 1, 1, 40))} aria-label="Raise total" style={{ width: 30, height: 32, border: 'none', borderLeft: `1px solid ${TOW.line}`, background: 'transparent', color: TOW.ink, cursor: 'pointer', fontSize: 17, fontFamily: towFont.display }}>+</button>
          </div>
          <button onClick={() => { setTerrain(scatterTerrain(sheet.tableW, sheet.tableH, count, [...enabledTypes])); setSelectedId(null); }} disabled={enabledTypes.size === 0} title="Spread the total across the ticked types" style={{ padding: '8px 12px', borderRadius: 8, border: `1px solid ${TOW.goldDeep}`, background: 'rgba(184,134,47,0.12)', color: TOW.goldDeep, cursor: enabledTypes.size === 0 ? 'default' : 'pointer', opacity: enabledTypes.size === 0 ? 0.5 : 1, fontFamily: towFont.display, fontWeight: 600, fontSize: 12.5 }}>🎲 Randomise mix</button>
          {sheet.terrain.length > 0 && <button onClick={() => { setTerrain(shufflePlacement(sheet.terrain, sheet.tableW, sheet.tableH)); setSelectedId(null); }} title="Re-place the current features at random" style={{ padding: '8px 12px', borderRadius: 8, border: `1px solid ${TOW.goldDeep}`, background: 'rgba(184,134,47,0.12)', color: TOW.goldDeep, cursor: 'pointer', fontFamily: towFont.display, fontWeight: 600, fontSize: 12.5 }}>📍 Randomise locations</button>}
          {sheet.terrain.length > 0 && <button onClick={() => { setTerrain([]); setSelectedId(null); }} style={{ padding: '8px 12px', borderRadius: 8, border: `1px solid ${TOW.line}`, background: 'transparent', color: TOW.muted, cursor: 'pointer', fontFamily: towFont.display, fontWeight: 600, fontSize: 12.5 }}>Clear</button>}
        </div>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', marginTop: 4, fontFamily: towFont.serif, fontSize: 10.5, color: TOW.muted }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ display: 'inline-flex', color: traitColor('difficult') }}><TraitIcon trait="difficult" size={13} /></span> Difficult</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ display: 'inline-flex', color: traitColor('dangerous') }}><TraitIcon trait="dangerous" size={13} /></span> Dangerous</span>
          <span style={{ color: TOW.faint }}>· tap a feature on the map to edit it</span>
        </div>
      </>)}
    </div>
  );
}
