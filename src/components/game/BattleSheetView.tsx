// DE BATTLE SHEET ALS LEESBAAR BLAD — wat er op tafel ligt, in één kolom.
//
// Joost (13-09): "het geheel moet gewoon veel duidelijker en gestructureerd worden voor mensen om
// samen een potje te starten." Dit is de LEES-kant daarvan: de wizard (van de collega) schrijft een
// `BattleSheet`, dit component toont hem — in de lobby, in het in-game Battlefield-paneel, en als
// voorbeeld in de laatste wizard-stap.
//
// WAAROM HIJ ERUITZIET ALS EEN CAMPAGNE-BATTLE. De campagne toont exact deze informatie al in
// `CampaignBattlePanel`: scenario als kop, het weer als eigen kaart met de VOLLEDIGE regeltekst, de
// deployment-kaart, en daaronder de losse feiten. Een potje buiten de campagne is hetzelfde potje —
// dus het hoort er niet anders uit te zien. Dezelfde blokvolgorde, dezelfde toon.
//
// ALLEEN LEZEN. Dit blad rekent niets uit en verandert niets: het krijgt een sheet en toont die. Wie
// hem mag WIJZIGEN is de host, en dat gebeurt in de wizard — vandaar `rechts` als open plek voor een
// "Edit"-knop in plaats van hier een eigen bewerk-modus.
import { TOW, towFont, engraved } from '../../design/tow';
import { useUI } from '../../state';
import { scenarioById, secondaryById, terrainType, type BattleSetupState } from '../../lib/battle';
import { formatDef, type BattleSheet } from '../../lib/battleSheet';
import { BattleBoard } from './BattleBoard';
import { Eye } from './Eye';

const eb = engraved as React.CSSProperties;
const display = towFont.display;
const serif = towFont.serif;

/** Een blok op het blad: dezelfde omlijsting als de weer-/deployment-kaarten in CampaignBattlePanel. */
const kaart: React.CSSProperties = {
  marginTop: 10, border: `1px solid ${TOW.line}`, borderRadius: 10, padding: '10px 12px',
};
const eyebrow: React.CSSProperties = { ...eb, fontSize: 8, color: TOW.muted };

/** Een onbekende id alsnog leesbaar maken ("mp-king-of-the-hill" → "Mp king of the hill"). Alleen
 *  nodig als een sheet iets bevat dat deze versie van de app niet kent — een lege plek tonen is
 *  erger dan een ruwe naam, want dan lijkt het alsof er géén scenario gekozen is. */
const pretty = (s: string) => s.replace(/[-_]/g, ' ').replace(/^./, (c) => c.toUpperCase());

/** Het terrein als TELLING per type ("2× Wood · 1× Hill"), niet als lijst losse stukken.
 *  Aan tafel pak je twee bossen uit de doos; wélke van de twee waar ligt zie je op de kaart
 *  hierboven, dus dat hier herhalen levert alleen een lange rij dubbele regels op. */
function terreinSamenvatting(sheet: BattleSheet): string {
  const tel = new Map<string, number>();
  for (const t of sheet.terrain) tel.set(t.type, (tel.get(t.type) ?? 0) + 1);
  return [...tel.entries()].map(([type, n]) => `${n}× ${terrainType(type).label}`).join(' · ');
}

export function BattleSheetView({ sheet, titel, rechts }: {
  sheet: BattleSheet;
  /** Kop boven het blad; weglaten = geen kop. */
  titel?: string;
  /** Optionele actie rechts in de kop (bv. een "Edit"-knop). */
  rechts?: React.ReactNode;
}): React.JSX.Element {
  const { openRule } = useUI();
  const fmt = formatDef(sheet.format);
  const scenario = scenarioById(sheet.scenario);
  const terrein = terreinSamenvatting(sheet);
  const secondaries = sheet.secondaries ?? [];

  // De sheet IS een BattleSetupState (zelfde vier velden), dus het bord kan hem rechtstreeks
  // tekenen. READ-ONLY via `editable={false}`: dat zet het slepen en het ×-knopje uit. `onChange` en
  // `onSelect` zijn verplichte props van BattleBoard en worden in die modus nooit aangeroepen — ze
  // staan hier als lege functie zodat dit blad de sheet gegarandeerd niet kan wijzigen.
  const setup: BattleSetupState = {
    scenario: sheet.scenario,
    tableW: sheet.tableW,
    tableH: sheet.tableH,
    terrain: sheet.terrain,
    secondaries,
  };

  return (
    <div>
      {(titel || rechts) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <div style={{ flex: 1, minWidth: 0, fontFamily: display, fontWeight: 700, fontSize: 18, color: TOW.ink }}>{titel}</div>
          {rechts && <div style={{ flexShrink: 0 }}>{rechts}</div>}
        </div>
      )}

      {/* FORMAT — bepaalt de lengte van het potje en (bij Battle March) de VP-schaal. Dat laatste
          staat erbij omdat het de enige regel is die de app zelf toepast maar die je nergens ziet:
          je telt straks halve bonussen zonder dat iemand dat heeft gezegd. */}
      <div style={{ ...kaart, marginTop: 0 }}>
        <div style={eyebrow}>Format</div>
        <div style={{ fontFamily: display, fontSize: 16, color: TOW.gold, marginTop: 3 }}>{fmt.label}</div>
        <div style={{ fontFamily: serif, fontSize: 12.5, color: TOW.parch, lineHeight: 1.45, marginTop: 3 }}>
          {fmt.rounds} battle rounds{fmt.battleMarch ? ' · Battle March: victory-point bonuses are halved (General 50, BSB 25, standard 25).' : ''}
        </div>
      </div>

      {/* HET SCENARIO — de kop van het blad. Naam groot, de D6-worp ernaast als er gerold is (dat is
          het verschil tussen "dit kwam eruit" en "dit is gekozen"), en het oogje opent de echte
          regelpagina — de app vat spelregels niet samen. */}
      <div style={kaart}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={eyebrow}>Scenario</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, flexWrap: 'wrap', marginTop: 3 }}>
              <span style={{ fontFamily: display, fontSize: 19, color: TOW.gold, lineHeight: 1.15 }}>{scenario?.name ?? pretty(sheet.scenario)}</span>
              {sheet.worpen?.scenario != null && (
                <span style={{ ...eb, fontSize: 8, color: TOW.goldDeep, border: `1px solid ${TOW.goldDeep}`, borderRadius: 999, padding: '3px 8px', background: 'rgba(184,134,47,0.10)' }}>
                  Roll {sheet.worpen.scenario}
                </span>
              )}
            </div>
          </div>
          {scenario && <Eye onClick={() => openRule(scenario.ruleSlug)} title={`${scenario.name} rules`} />}
        </div>
        {scenario?.blurb && (
          <div style={{ fontFamily: serif, fontSize: 13, color: TOW.parch, lineHeight: 1.45, marginTop: 5 }}>{scenario.blurb}</div>
        )}
        {scenario?.deployNote && (
          <div style={{ fontFamily: serif, fontSize: 12.5, color: TOW.muted, lineHeight: 1.45, marginTop: 5 }}>{scenario.deployNote}</div>
        )}
        {scenario?.gameEnd && (
          <div style={{ fontFamily: serif, fontSize: 12.5, color: TOW.muted, lineHeight: 1.45, marginTop: 5 }}>Game end: {scenario.gameEnd}</div>
        )}
      </div>

      {/* DE KAART. Alles wat hierboven in woorden staat, in één plaatje: zones, no-man's-land in
          inches, de secondary-objectives en het terrein. */}
      <div style={{ marginTop: 10 }}>
        <div style={{ ...eyebrow, marginBottom: 5 }}>Battlefield · {sheet.tableW}″ × {sheet.tableH}″</div>
        <BattleBoard setup={setup} onChange={() => {}} selectedId={null} onSelect={() => {}} editable={false} />
      </div>

      {/* SECONDARY OBJECTIVES — alleen als er gekozen zijn. Een regel "none" toevoegen suggereert dat
          er iets ontbreekt; buiten Matched Play speel je gewoon zonder. */}
      {secondaries.length > 0 && (
        <div style={kaart}>
          <div style={{ ...eyebrow, marginBottom: 5 }}>
            Secondary objectives{sheet.worpen?.secondary != null ? ` · roll ${sheet.worpen.secondary}` : ''}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {secondaries.map((id) => {
              const def = secondaryById(id);
              return (
                <div key={id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: display, fontWeight: 600, fontSize: 13.5, color: TOW.ink }}>{def?.name ?? pretty(id)}</div>
                    {def?.blurb && <div style={{ fontFamily: serif, fontSize: 12, color: TOW.muted, lineHeight: 1.4 }}>{def.blurb}</div>}
                  </div>
                  {def && <Eye onClick={() => openRule(def.ruleSlug)} title={`${def.name} rules`} />}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TERREIN — wat er uit de doos moet komen. */}
      {terrein && (
        <div style={kaart}>
          <div style={{ ...eyebrow, marginBottom: 4 }}>Terrain</div>
          <div style={{ fontFamily: serif, fontSize: 13, color: TOW.parch, lineHeight: 1.45 }}>{terrein}</div>
        </div>
      )}

      {/* DISRUPTIVE WEATHER — geldt de hele game, dus dit is de regel die je aan tafel het vaakst
          terugleest. Vandaar naam + worp + de VOLLEDIGE effecttekst, precies zoals in
          CampaignBattlePanel: een samenvatting van een spelregel is geen spelregel. */}
      {sheet.weer && (
        <div style={kaart}>
          <div style={eyebrow}>
            Disruptive weather{sheet.weer.worp ? ` · roll ${sheet.weer.worp}` : ''}
          </div>
          <div style={{ fontFamily: display, fontSize: 16, color: TOW.gold, marginTop: 3 }}>{sheet.weer.naam}</div>
          {sheet.weer.effect && (
            <div style={{ fontFamily: serif, fontSize: 12.5, color: TOW.parch, lineHeight: 1.45, marginTop: 4 }}>{sheet.weer.effect}</div>
          )}
          <div style={{ fontFamily: serif, fontSize: 12, color: TOW.muted, marginTop: 4 }}>
            Rolled before deployment; in play for the whole game.
          </div>
        </div>
      )}
    </div>
  );
}
