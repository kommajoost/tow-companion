import { useEffect, useMemo, useState } from 'react';
import { TOW, towFont, engraved } from '../../design/tow';
import { FlaskIcon } from '../../design/icons';
import { usePersistentState, setPersisted } from '../../store';
import { useGame } from '../../game';
import { GameMode } from '../game/GameMode';
import { ScenarioKaart, TerreinLijst, ScenarioVpLijst, eersteBeurtZin } from '../game/CampaignScenarioBits';
import { parseSheetTerrain } from '../../lib/campaignTerrain';
import { scenarioBonusVan } from '../../lib/campaignScenario';
import { SCENARIO_TEST_CODE, battleUitPayload, scenarioTestPayload } from '../../lib/scenarioTest';
import {
  MOCK_LEGERS, labPayload, labSheetSleutel, maakKeuzeGeldig, mockLeger, mockVersterking,
  type LabIndex, type LabKeuze, type LabSheets,
} from '../../lib/scenarioLab';
import { laadLabAct, laadLabIndex, startLabBattle, wisLabPotje } from '../../lib/scenarioLabLaden';
import { vergeetCampagneBattle } from '../game/useCampaignBattle';
import { LabContext, type LabActies } from './labContext';
import { helftVan } from '../../lib/versterking';

// HET SCENARIO LAB (23-10-2026) — alleen in de TEST-build, via `?lab=1` (zie lib/labModus.ts).
//
// Joost: "een aparte pagina in de companion test, waar ik met twee mock armies de verschillende
// scenario's kan kiezen, en misschien ook de hexplek (…): de battle page, daarna de game zelf, en dan het
// battle result overzicht." Deze schil voegt ALLEEN het kiezen toe (setup, Act, hex-terrein, wie
// aanvalt) en een balk met "Back to the lab" en "Restart". Wat erna komt zijn de echte schermen van de
// Companion — GameMode met de campagne-briefing (CampaignBattlePanel), het potje (GameView) en het
// eindscherm (EndBattleOverview) — op de scenario-testcode SCENTEST: solo, niets naar de server.
//
// Opslag: in het lab leidt de store elke battle-sleutel om naar `tow:lab:` (labModus.ts), dus een
// lab-potje raakt het solo-potje, de campagne-battle en de wizard van de echte app niet. De lab-eigen
// sleutels hieronder (`tow:lab:scherm`, `tow:lab:keuze`) staan al onder dat voorvoegsel.

const eb = engraved as React.CSSProperties;
const display = towFont.display;
const serif = towFont.serif;
const ORANJE = '#b45309';

type Scherm = 'kies' | 'spel';
const STANDAARD_KEUZE: LabKeuze = { setup: 'ad-loot-cart', act: 3, terrein: 'vlakte', aanvaller: MOCK_LEGERS[0].id, verdediger: MOCK_LEGERS[1].id };

/** Het TEST-hoeklabel, zoals AppShell het toont (die is in het lab niet gemount). */
function TestMerk() {
  return (
    <div
      role="note"
      aria-label="TEST environment"
      data-testid="test-env-banner"
      style={{
        position: 'fixed', top: 0, left: 0, zIndex: 9999, pointerEvents: 'none',
        background: 'linear-gradient(90deg, #b91c1c, #ea580c)', color: '#fff', font: '800 11px/1 system-ui, sans-serif',
        letterSpacing: '.1em', padding: '5px 10px', borderBottomRightRadius: 8, boxShadow: '0 1px 4px rgba(0,0,0,0.35)',
        textTransform: 'uppercase',
      }}
    >
      TEST environment
    </div>
  );
}

/** De schil: kiezen, of de echte battle-schermen met de lab-balk erboven. */
export function ScenarioLabShell() {
  const [scherm, setScherm] = usePersistentState<Scherm>('tow:lab:scherm', 'kies');
  const { seat, leaveGame } = useGame();
  const [pending] = usePersistentState<string | null>('tow:campaign-battle', null);
  // Telt op bij elke start/herstart: GameMode (en alles eronder) mount dan echt opnieuw, zodat geen
  // component-staat van het vorige potje (een open eindscherm, een geladen leger) blijft hangen.
  const [nr, setNr] = useState(0);
  const lopend = !!seat || !!pending;

  // Geen potje en geen briefing meer (Leave in het potje, "back to the lab" in de briefing): terug naar het lab.
  useEffect(() => {
    if (scherm === 'spel' && !lopend) setScherm('kies');
  }, [scherm, lopend, setScherm]);

  const acties = useMemo<LabActies>(() => ({
    terug: () => setScherm('kies'),
    herstart: () => {
      leaveGame();
      wisLabPotje();
      vergeetCampagneBattle(SCENARIO_TEST_CODE);
      setPersisted('tow:campaign-battle', SCENARIO_TEST_CODE);
      setNr((n) => n + 1);
      setScherm('spel');
    },
  }), [leaveGame, setScherm]);

  const start = async (p: Parameters<typeof startLabBattle>[0]) => {
    leaveGame();
    await startLabBattle(p);
    setNr((n) => n + 1);
    setScherm('spel');
  };

  return (
    <LabContext.Provider value={acties}>
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', color: TOW.ink }}>
        <TestMerk />
        {scherm === 'spel' && lopend ? (
          <>
            <LabBalk acties={acties} />
            <div style={{ flex: 1, minHeight: 0 }}>
              <GameMode key={nr} />
            </div>
          </>
        ) : (
          <LabKiezer onStart={start} hervat={lopend ? () => setScherm('spel') : null} />
        )}
      </div>
    </LabContext.Provider>
  );
}

const TERREIN_NAAM: Record<string, string> = { vlakte: 'Plains', woud: 'Forest', heuvels: 'Hills', bergen: 'Mountains', moeras: 'Marsh' };

/** De balk boven de battle-schermen: wat je test, terug naar het lab, opnieuw beginnen. */
function LabBalk({ acties }: { acties: LabActies }) {
  const p = scenarioTestPayload();
  const sheet = (p?.sheet ?? {}) as Record<string, unknown>;
  const wat = [
    typeof sheet.scenarioNaam === 'string' ? sheet.scenarioNaam : null,
    p ? `Act ${p.fase}${p.cap ? ` · ${p.cap} pts` : ''}` : null,
    typeof sheet.terrein === 'string' ? TERREIN_NAAM[sheet.terrein] ?? sheet.terrein : null,
    p?.versterking ? '2 vs 3' : null,
  ].filter(Boolean).join(' · ');
  const knop: React.CSSProperties = {
    flexShrink: 0, padding: '6px 9px', borderRadius: 8, cursor: 'pointer', fontFamily: display, fontWeight: 700, fontSize: 12,
    border: `1px solid ${TOW.lineStrong}`, background: TOW.cardLt, color: TOW.ink, whiteSpace: 'nowrap',
  };
  // Eén rij, ook op een telefoon: de titel krimpt (ellipsis), de twee knoppen blijven heel. Bovenaan ruimte
  // voor het vaste TEST-hoeklabel.
  return (
    <div
      data-testid="lab-balk"
      className="tow-leather"
      style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6, padding: '22px 10px 7px', borderBottom: `1px solid ${TOW.lineStrong}` }}
    >
      <div style={{ flex: '1 1 0', minWidth: 0 }}>
        <div style={{ ...eb, fontSize: 8, color: ORANJE }}>Scenario lab</div>
        <div style={{ fontFamily: serif, fontSize: 13, color: TOW.parch, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{wat || 'Test battle'}</div>
      </div>
      <button type="button" onClick={acties.terug} style={knop}>‹ Back to the lab</button>
      <button type="button" onClick={acties.herstart} style={{ ...knop, borderColor: ORANJE }}>Restart</button>
    </div>
  );
}

/** Het kiesscherm: setup, Act, hex-terrein, wie aanvalt, en een voorbeeld van het bord. */
function LabKiezer({ onStart, hervat }: { onStart: (p: Parameters<typeof startLabBattle>[0]) => Promise<void>; hervat: (() => void) | null }) {
  const [index, setIndex] = useState<LabIndex | null>(null);
  const [indexFout, setIndexFout] = useState(false);
  const [keuze, setKeuze] = usePersistentState<LabKeuze>('tow:lab:keuze', STANDAARD_KEUZE);
  const [vorigeAd, setVorigeAd] = usePersistentState<string | null>('tow:lab:vorige-setup', null);
  const [sheets, setSheets] = useState<{ bestand: string; data: LabSheets | null } | null>(null);
  const [bezig, setBezig] = useState(false);

  useEffect(() => {
    let leeft = true;
    laadLabIndex().then((i) => { if (!leeft) return; setIndex(i); setIndexFout(!i); });
    return () => { leeft = false; };
  }, []);

  // De keuze uit de opslag kan van een oudere set zijn: maak hem geldig zodra de index er is.
  const k = useMemo(() => (index ? { ...keuze, ...maakKeuzeGeldig(index, keuze, 'setup', vorigeAd) } : keuze), [index, keuze, vorigeAd]);
  const act = index?.acts.find((a) => a.act === k.act) ?? null;

  useEffect(() => {
    if (!act) return;
    let leeft = true;
    laadLabAct(act).then((data) => { if (leeft) setSheets({ bestand: act.bestand, data }); });
    return () => { leeft = false; };
  }, [act]);

  const sheet = act && sheets?.bestand === act.bestand ? sheets.data?.[labSheetSleutel(k.setup, k.terrein)] ?? null : null;
  const payload = useMemo(() => (sheet && act ? labPayload(sheet, act, k) : null), [sheet, act, k]);
  const battle = useMemo(() => (payload ? battleUitPayload(payload) : null), [payload]);
  const vpDef = useMemo(() => (sheet ? scenarioBonusVan(sheet) : null), [sheet]);

  const zet = (wijz: Partial<LabKeuze>, as: 'setup' | 'act' | 'terrein') => {
    if (!index) return;
    const nieuw = { ...k, ...wijz };
    const geldig = maakKeuzeGeldig(index, nieuw, as, vorigeAd);
    if (geldig.setup !== 'bm-pitched') setVorigeAd(geldig.setup);
    setKeuze({ ...nieuw, ...geldig });
  };
  const wissel = () => setKeuze({ ...k, aanvaller: k.verdediger, verdediger: k.aanvaller });

  const chip = (aan: boolean): React.CSSProperties => ({
    padding: '8px 11px', borderRadius: 9, cursor: 'pointer', fontFamily: display, fontWeight: 600, fontSize: 13,
    border: `1px solid ${aan ? TOW.goldDeep : TOW.line}`, background: aan ? 'rgba(184,134,47,0.16)' : TOW.panel2,
    color: aan ? TOW.ink : TOW.parchDim, textAlign: 'left',
  });
  const kop = (t: string) => <div style={{ ...eb, fontSize: 8.5, color: TOW.muted, margin: '16px 0 6px' }}>{t}</div>;
  const goldGrad = `linear-gradient(180deg, ${TOW.goldBright}, ${TOW.gold} 55%, ${TOW.goldDeep})`;
  const aanv = mockLeger(k.aanvaller) ?? MOCK_LEGERS[0];
  const verd = mockLeger(k.verdediger) ?? MOCK_LEGERS[1];
  const lopendePayload = hervat ? scenarioTestPayload() : null;
  const setupDef = index?.setups.find((s) => s.id === k.setup) ?? null;
  // REINFORCEMENT DETACHMENT (23-10-2026): welke kant staat met twee tegen drie?
  const rf = k.versterking ?? 'uit';
  const rfAan = rf !== 'uit';
  const rfKant = (rol: 'Attacker' | 'Defender') => rfAan && (rf === 'beide' || (rol === 'Attacker' ? rf === 'aanvaller' : rf === 'verdediger'));

  return (
    <div className="tow-field" data-testid="scenario-lab" style={{ height: '100%', overflowY: 'auto' }}>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '34px 16px 48px', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: ORANJE }}>
          <FlaskIcon size={18} />
          <span style={{ ...eb, fontSize: 9, color: ORANJE }}>Test build only</span>
        </div>
        <h1 style={{ margin: '4px 0 0', fontFamily: display, fontWeight: 700, fontSize: 26, color: TOW.ink }}>Scenario lab</h1>
        <p style={{ fontFamily: serif, fontSize: 14, color: TOW.parchDim, lineHeight: 1.5, margin: '6px 0 0' }}>
          Pick a setup, an Act and the hex terrain, then play it through with two mock armies: the battle page,
          the game itself and the result overview. These are the screens players see; nothing is saved to the
          campaign and nothing is submitted.
        </p>

        {hervat && (
          <div style={{ marginTop: 14, padding: '10px 12px', borderRadius: 10, border: `1px solid ${TOW.goldDeep}`, background: 'rgba(184,134,47,0.08)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
            <span style={{ flex: '1 1 200px', fontFamily: serif, fontSize: 13.5, color: TOW.parch }}>
              A test battle is in progress{lopendePayload ? `: ${String((lopendePayload.sheet as Record<string, unknown>).scenarioNaam ?? '')}, Act ${lopendePayload.fase}` : ''}.
            </span>
            <button type="button" onClick={hervat} style={{ ...chip(true), fontWeight: 700 }}>Resume test battle</button>
          </div>
        )}

        {indexFout && (
          <p style={{ fontFamily: serif, fontSize: 13.5, color: TOW.blood, marginTop: 14 }}>
            The lab's sheet set could not be loaded (scenario-lab/index.json).
          </p>
        )}
        {!index && !indexFout && <p style={{ fontFamily: serif, fontSize: 13.5, color: TOW.muted, marginTop: 14 }}>Loading the sheet set…</p>}

        {index && (
          <>
            {kop('Setup')}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 6 }}>
              {index.setups.map((s) => (
                <button key={s.id} type="button" data-testid={`lab-setup-${s.id}`} onClick={() => zet({ setup: s.id }, 'setup')} style={chip(s.id === k.setup)}>
                  <span style={{ display: 'block' }}>{s.naam}</span>
                  <span style={{ display: 'block', fontFamily: serif, fontWeight: 400, fontSize: 11, color: TOW.muted }}>
                    {s.acts.length && s.acts[0] <= 2 ? 'Act 1-2' : `${s.d6 ? `D6 ${s.d6} · ` : ''}Act 3-7`}
                  </span>
                </button>
              ))}
            </div>
            {setupDef?.uitleg && <div style={{ fontFamily: serif, fontStyle: 'italic', fontSize: 12, color: TOW.muted, marginTop: 5 }}>{setupDef.uitleg}</div>}

            {kop('Act')}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {index.acts.map((a) => (
                <button key={a.act} type="button" data-testid={`lab-act-${a.act}`} onClick={() => zet({ act: a.act }, 'act')} style={chip(a.act === k.act)}>
                  Act {a.act} <span style={{ fontFamily: serif, fontWeight: 400, fontSize: 11.5, color: TOW.muted }}>· {a.cap} pts</span>
                </button>
              ))}
            </div>
            <div style={{ fontFamily: serif, fontStyle: 'italic', fontSize: 12, color: TOW.muted, marginTop: 5 }}>
              Battle March belongs to Act 1-2, the six attacker/defender setups to Act 3-7; picking across switches the other one.
            </div>

            {kop('Hex terrain')}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {index.terreinen.map((t) => (
                <button key={t.id} type="button" data-testid={`lab-terrein-${t.id}`} onClick={() => zet({ terrein: t.id }, 'terrein')} style={chip(t.id === k.terrein)}>{t.naam}</button>
              ))}
            </div>

            {kop('Armies')}
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'stretch', gap: 8 }}>
              {[{ rol: 'Attacker', m: aanv }, { rol: 'Defender', m: verd }].map(({ rol, m }) => (
                <div key={rol} style={{ flex: '1 1 200px', minWidth: 0, padding: '9px 12px', borderRadius: 10, border: `1px solid ${TOW.line}`, background: TOW.panel2 }}>
                  <div style={{ ...eb, fontSize: 8, color: TOW.muted }}>{rol}</div>
                  <div style={{ fontFamily: display, fontWeight: 700, fontSize: 15, color: TOW.ink }}>{m.naam}</div>
                  <div style={{ fontFamily: serif, fontSize: 12.5, color: TOW.parchDim }}>{m.factie} · {m.lijst.entries.length} units</div>
                  {rfKant(rol as 'Attacker' | 'Defender') && (
                    <div style={{ fontFamily: serif, fontSize: 12, color: TOW.goldDeep, marginTop: 2 }}>+ {mockVersterking(m.id)?.name ?? 'Reinforcements'}</div>
                  )}
                </div>
              ))}
              <button type="button" data-testid="lab-wissel" onClick={wissel} style={{ ...chip(false), flex: '0 0 auto', alignSelf: 'center' }}>⇅ Swap sides</button>
            </div>
            <button
              type="button"
              data-testid="lab-rolloff"
              aria-pressed={k.rollOff !== false}
              onClick={() => setKeuze({ ...k, rollOff: k.rollOff === false })}
              style={{ ...chip(k.rollOff !== false), marginTop: 8, display: 'block', width: '100%' }}
            >
              {k.rollOff !== false ? '✓ ' : ''}First-turn modifiers
              <span style={{ display: 'block', fontFamily: serif, fontWeight: 400, fontSize: 11.5, color: TOW.muted }}>
                Attacker: Scouting Outpost +1 · Defender: Watchtower +3, Scouting Outpost +1 (they drop out where the first turn is fixed)
              </span>
            </button>
            <button
              type="button"
              data-testid="lab-versterking"
              aria-pressed={rfAan}
              onClick={() => setKeuze({ ...k, versterking: rfAan ? 'uit' : 'aanvaller' })}
              style={{ ...chip(rfAan), marginTop: 8, display: 'block', width: '100%' }}
            >
              {rfAan ? '✓ ' : ''}Outnumbered side (2 vs 3): add a reinforcement of half the cap
              <span style={{ display: 'block', fontFamily: serif, fontWeight: 400, fontSize: 11.5, color: TOW.muted }}>
                Each general on the smaller side adds a detachment of up to {act ? helftVan(act.cap) : '½ the cap'} pts from the same army book, built under the rules of the full battle.
                The mock reinforcements are about 430-490 pts, built for a 1000-point battle.
              </span>
            </button>
            {rfAan && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                {([['aanvaller', 'Attacker is outnumbered'], ['verdediger', 'Defender is outnumbered'], ['beide', 'Both (test)']] as const).map(([w, t]) => (
                  <button key={w} type="button" data-testid={`lab-versterking-${w}`} onClick={() => setKeuze({ ...k, versterking: w })} style={chip(rf === w)}>{t}</button>
                ))}
              </div>
            )}
            <div style={{ fontFamily: serif, fontStyle: 'italic', fontSize: 12, color: TOW.muted, marginTop: 5 }}>
              Mock armies, points not to scale: both lists are about 1000 points in every Act{act ? ` (this Act's cap is ${act.cap})` : ''}.
              You play the attacker's seat and can track both sides.
            </div>

            {kop('Preview')}
            {!sheet || !battle ? (
              <p style={{ fontFamily: serif, fontSize: 13.5, color: TOW.muted }}>{sheets?.bestand === act?.bestand && sheets && !sheets.data ? 'This Act could not be loaded.' : 'Loading the sheet…'}</p>
            ) : (
              <div data-testid="lab-preview" style={{ border: `1px solid ${TOW.line}`, borderRadius: 12, background: TOW.panel2, padding: '12px 14px' }}>
                <div style={{ fontFamily: display, fontWeight: 700, fontSize: 18, color: TOW.ink }}>{String(sheet.scenarioNaam ?? '')}</div>
                <div style={{ fontFamily: serif, fontSize: 12.5, color: TOW.muted, marginBottom: 8 }}>
                  {[sheet.bordLabel, `Act ${k.act}`, act ? `${act.cap} pts cap` : null, TERREIN_NAAM[k.terrein]].filter(Boolean).join(' · ')}
                </div>
                <ScenarioKaart battle={battle} mySeat="host" />
                {eersteBeurtZin(battle) && <div style={{ fontFamily: serif, fontSize: 12.5, color: TOW.parchDim, marginTop: 8 }}>{eersteBeurtZin(battle)}</div>}
                {typeof sheet.reden === 'string' && <div style={{ fontFamily: serif, fontStyle: 'italic', fontSize: 12.5, color: TOW.muted, marginTop: 6, lineHeight: 1.45 }}>{sheet.reden}</div>}
                <div style={{ ...eb, fontSize: 8, color: TOW.muted, margin: '12px 0 5px' }}>Terrain</div>
                <TerreinLijst terrain={parseSheetTerrain(sheet.terrain)} compact />
                {vpDef && (
                  <>
                    <div style={{ ...eb, fontSize: 8, color: TOW.muted, margin: '12px 0 5px' }}>Scenario Victory Points</div>
                    <ScenarioVpLijst def={vpDef} battle={battle} compact />
                  </>
                )}
              </div>
            )}

            <button
              type="button"
              data-testid="lab-start"
              disabled={!payload || bezig}
              onClick={async () => {
                if (!payload) return;
                setBezig(true);
                try { await onStart(payload); } finally { setBezig(false); }
              }}
              style={{ marginTop: 16, width: '100%', border: 'none', borderRadius: 11, padding: '14px 18px', background: goldGrad, color: TOW.onGrad, fontFamily: display, fontWeight: 700, fontSize: 15.5, cursor: payload && !bezig ? 'pointer' : 'default', opacity: payload && !bezig ? 1 : 0.5 }}
            >
              {bezig ? 'Setting up…' : hervat ? 'Start a new test battle' : 'Start test battle'}
            </button>
            <div style={{ fontFamily: serif, fontSize: 11.5, color: TOW.faint, marginTop: 10, lineHeight: 1.45 }}>
              Sheets made {index.gemaakt ? new Date(index.gemaakt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '—'} by the campaign's own generator, one fixed seed per combination.
              {' '}<a href="/" style={{ color: TOW.muted }}>Leave the lab</a>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
