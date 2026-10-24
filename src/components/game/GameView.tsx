import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { TOW, towFont, engraved } from '../../design/tow';
import { Ornament } from '../../design/glyphs';
import { useGame } from '../../game';
import { useBackClose } from '../../lib/backStack';
import { parseArmyList } from '../../lib/armyParser';
import { makeTroopTypeLookup, enrichArmyTroopTypes } from '../../lib/troopTypes';
import { unitTotalStrength } from '../../lib/armyRules';
import { UnitCard, type ScenarioKnop } from './UnitCard';
import { BattleBar } from './BattleBar';
import { ReminderStrip, type KantReminders } from './ReminderStrip';
import { useCampaignBattle } from './useCampaignBattle';
import { ObjectivesTracker } from './ObjectivesTracker';
import { useScenarioBonus } from './useObjectives';
import { CampaignScenarioOverlay, eersteBeurtZin, useWrath } from './CampaignScenarioBits';
import { eersteBeurtVast } from '../../lib/campaignScenario';
import { isScenarioTestCode } from '../../lib/scenarioTest';
import { OwbInstructions } from './OwbInstructions';
import { ArmyListPicker } from './ArmyListPicker';
import { BattleSheetView } from './BattleSheetView';
import { EndBattleOverview } from './EndBattleOverview';
import { normSheet } from '../../lib/battleSheet';
import { berekenVictory } from '../../lib/victoryPoints';
import { useData } from '../../data';
import { inferOverlayId, isOverlay, OVERLAY_FILES } from '../../lib/overlays';
import type { KillDetail, Army, ArmyUnit } from '../../types';
import type { BattleSheet } from '../../lib/battleSheet';
import { VersterkingKiezer } from './VersterkingKiezer';
import { isVrijPotjeCode } from '../../lib/battleCode';
import { versterkingVan, versterkingVoorKant, voegVersterkingToe, zonderVersterking } from '../../lib/versterking';
import { postGeldtVoor } from '../../lib/scenarioBonus';
import { aangetikt, gedoodDoorVijand, knopLabel, postUitUnits, REKENREGEL, soortUitsluiting, tikUnit, uitsluiting, uitsluitingTekst, waardeNu } from '../../lib/scenarioUnits';
import type { VpUnitTrack } from '../../lib/victoryPoints';

const eb = engraved as React.CSSProperties;
const display = towFont.display;
const serif = towFont.serif;
const BASE = import.meta.env.BASE_URL;
let riCache: Record<string, { troopType?: string }> | null = null; // rules-index, fetched once

const Shield = ({ c, size = 22 }: { c: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><path d="M12 3.5l7 2.4v5.2c0 4.2-2.9 7.3-7 8.9-4.1-1.6-7-4.7-7-8.9V5.9z" stroke={c} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

// Active game roster + the shared battle tracker. Phone: a stacked header + scrolling roster.
// Wide: a "This game" sidebar (code, You/Opponent, round, VP) beside a roster reading pane.
export function GameView() {
  const { code, seat, myArmy, myName, opponentArmy, opponentName, setMyArmy, setOpponentArmy, tracker, setTracker, leaveGame } = useGame();
  const { setRuleOverlay } = useData();
  // GameView only mounts while a game is active, so a hardware Back here leaves the game.
  useBackClose(true, leaveGame);
  const [side, setSide] = useState<'me' | 'opp'>('me');
  const [endOpen, setEndOpen] = useState(false); // einde-battle-overzicht open?
  const [sheetOpen, setSheetOpen] = useState(false); // battle sheet als overlay open?
  // Roster units are collapsed by default; tapping a unit's header expands just that one (keeps the
  // list scannable). Tracked by unit id (ids are unique per army, so no clash between the two sides).
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleExpand = (id: string) => setExpanded((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const rootRef = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(420);
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver((es) => setW(es[0].contentRect.width));
    ro.observe(el);
    setW(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);
  const wide = w >= 700; // pane is window−76 when the global rail is shown

  const army: Army | null = side === 'me' ? myArmy : opponentArmy;
  // Wie kon deze kant killen? Het leger AAN DE ANDERE KANT van de tafel. Wordt de dropdown-inhoud bij
  // de kills, dus het moet meebewegen met de zijde die je bekijkt.
  const vijandLeger: Army | null = side === 'me' ? opponentArmy : myArmy;

  // The rule sheet lives outside the builder, so the selected pack must travel with the Army and be
  // restored here. This also switches correctly when both players use different community packs.
  useEffect(() => {
    const overlayId = army?.overlayId ?? inferOverlayId(army?.composition, army?.faction);
    const file = overlayId ? OVERLAY_FILES[overlayId] : undefined;
    let cancelled = false;
    if (!file) {
      setRuleOverlay(null);
      return;
    }
    fetch(`${BASE}renegade/${file}`)
      .then((response) => response.ok ? response.json() : null)
      .then((json) => {
        if (!cancelled) setRuleOverlay(isOverlay(json) && json.id === overlayId ? json : null);
      })
      .catch(() => {
        if (!cancelled) setRuleOverlay(null);
      });
    return () => {
      cancelled = true;
      setRuleOverlay(null);
    };
  }, [army?.overlayId, army?.composition, army?.faction, setRuleOverlay]);

  // Both armies are editable (you track spells and casualties for both sides).
  const editable = true;
  const applyArmy = side === 'me' ? setMyArmy : setOpponentArmy;
  const onUnitChange = (unitId: string, patch: Partial<ArmyUnit>) => {
    if (!army) return;
    applyArmy({ ...army, units: army.units.map((u) => (u.id === unitId ? { ...u, ...patch } : u)) });
  };

  // ── shared battle tracker (absolute seat keys so both players agree) ──
  const absSeat = (s: 'me' | 'opp'): string =>
    seat === 'solo' ? (s === 'me' ? 'host' : 'guest') : s === 'me' ? seat ?? 'host' : seat === 'host' ? 'guest' : 'host';
  const unitKey = (s: 'me' | 'opp', unitId: string) => `${absSeat(s)}:${unitId}`;
  const meKey = absSeat('me');

  // Absolute muteerhelpers voor de per-unit tracker (WoundTracker levert absolute waarden).
  // `prev` default = { lost: 0, fleeing: false }; oude trackers zonder `weg` blijven zo werken.
  const setCasualty = (unitId: string, lost: number) => {
    const u = army?.units.find((x) => x.id === unitId);
    if (!u) return;
    const total = unitTotalStrength(u);
    const key = unitKey(side, unitId);
    const prev = tracker.units[key] ?? { lost: 0, fleeing: false };
    const clamped = Math.min(total, Math.max(0, lost));
    setTracker({ ...tracker, units: { ...tracker.units, [key]: { ...prev, lost: clamped } } });
  };
  const setRemoved = (unitId: string, weg: boolean) => {
    const key = unitKey(side, unitId);
    const prev = tracker.units[key] ?? { lost: 0, fleeing: false };
    setTracker({ ...tracker, units: { ...tracker.units, [key]: { ...prev, weg } } });
  };
  // Absolute setter voor de per-unit kill-teller (enemy units destroyed + trofeeën); min 0.
  const setKills = (unitId: string, kills: number) => {
    const key = unitKey(side, unitId);
    const prev = tracker.units[key] ?? { lost: 0, fleeing: false };
    const n = Math.max(0, Math.round(kills));
    // De toelichting-rijen lopen mee met de teller: eén erbij geeft een lege rij, eraf gooit de
    // LAATSTE rij weg (niet de eerste — anders verlies je de kill die je al had ingevuld).
    const vorige = prev.killDetails ?? [];
    const details = n > vorige.length
      ? [...vorige, ...Array.from({ length: n - vorige.length }, () => ({}) as KillDetail)]
      : vorige.slice(0, n);
    setTracker({ ...tracker, units: { ...tracker.units, [key]: { ...prev, kills: n, killDetails: details } } });
  };
  /** Zet wie/wanneer bij één kill. `i` is de index in de kill-lijst van deze unit. */
  const setKillDetail = (unitId: string, i: number, patch: KillDetail) => {
    const key = unitKey(side, unitId);
    const prev = tracker.units[key] ?? { lost: 0, fleeing: false };
    const aantal = Math.max(0, Math.round(prev.kills ?? 0));
    const details = [...(prev.killDetails ?? [])];
    while (details.length < aantal) details.push({});
    if (i < 0 || i >= details.length) return;
    details[i] = { ...details[i], ...patch };
    setTracker({ ...tracker, units: { ...tracker.units, [key]: { ...prev, killDetails: details } } });
  };
  const toggleFleeing = (unitId: string) => {
    const key = unitKey(side, unitId);
    const prev = tracker.units[key] ?? { lost: 0, fleeing: false };
    setTracker({ ...tracker, units: { ...tracker.units, [key]: { ...prev, fleeing: !prev.fleeing } } });
  };
  // GAME-LENGTE. Warhammer Battles duurt zes rounds, BATTLE MARCH vijf — "All games of Battle March
  // last for five rounds" (General's Companion p.27, tow.whfb.app/battle-march/game-length-battle-march).
  // De vlag staat op de tracker en synct dus naar beide spelers; geen game-over-check, de teller is
  // een hulpmiddel aan tafel en niet de scheidsrechter.
  const maxRound = tracker.battleMarch ? 5 : 6;
  const adjRound = (dir: number) => setTracker({ ...tracker, round: Math.min(maxRound, Math.max(1, tracker.round + dir)) });

  // ── Centrale VP-uitslag (engine, absoluut host/guest) — één bron voor de bar, de banner én het
  // einde-battle-overzicht. De handmatige VP-teller is vervangen door deze auto-stand. ──
  const hostArmy: Army | null = meKey === 'host' ? myArmy : opponentArmy;
  const guestArmy: Army | null = meKey === 'host' ? opponentArmy : myArmy;
  // 22-10-2026: de scenario-posten van de campagne-sheet (Act 3+) tellen mee in de VP, en dus in de
  // uitslag. Zonder campagne-sheet (vrij potje) is dit null en rekent het precies zoals voorheen.
  const scenarioDef = useScenarioBonus();
  const res = useMemo(
    () => berekenVictory(hostArmy, guestArmy, tracker, tracker.bonus?.host, tracker.bonus?.guest, tracker.battleMarch === true, scenarioDef),
    [hostArmy, guestArmy, tracker, scenarioDef],
  );
  // DE SCENARIO-TEST (22-10-2026, testbuild): een lokaal potje zonder (verplicht) leger. De panelen
  // (ronde, VP, objectives, reminders, einde) staan er dan ook zonder leger, anders valt er niets te testen.
  const scenarioTest = isScenarioTestCode(code);
  const toonPanelen = !!army || scenarioTest;
  const hostName = meKey === 'host' ? (myName || 'You') : (opponentName || 'Opponent');
  const guestName = meKey === 'host' ? (opponentName || 'Opponent') : (myName || 'You');
  const vpMe = meKey === 'host' ? res.hostVp : res.guestVp;
  const vpOpp = meKey === 'host' ? res.guestVp : res.hostVp;
  const leader: 'me' | 'opp' | null = res.winnaar == null ? null : res.winnaar === meKey ? 'me' : 'opp';

  // ── BREAKTHROUGH (24-10-2026, lib/scenarioUnits.ts) ── Heeft de sheet een puntwaarde-post voor de kant die
  // het roster nu toont (de aanvaller, bij Breakthrough), dan krijgt elke unit die in aanmerking komt een
  // knopje. Characters en monsters nooit; een unit die vlucht of weg is alleen als hij al aan stond (om hem
  // uit te kunnen zetten). De post zelf rekent de som in berekenVictory, met dezelfde functies.
  const rosterZijde: 'host' | 'guest' = absSeat(side) === 'guest' ? 'guest' : 'host';
  const puntPosten = (scenarioDef?.posten ?? []).filter((p) => postUitUnits(p) && postGeldtVoor(p, rosterZijde));
  const gedoodRoster = puntPosten.length ? gedoodDoorVijand(rosterZijde, tracker) : null;
  const knoppenVoor = (u: ArmyUnit): ScenarioKnop[] | undefined => {
    if (!puntPosten.length || soortUitsluiting(u)) return undefined;
    const t = tracker.units[`${rosterZijde}:${u.id}`] as VpUnitTrack | undefined;
    const uit = uitsluiting(u, t, gedoodRoster?.has(u.id) ?? false);
    return puntPosten.map((p) => {
      const aan = aangetikt(tracker.bonus?.[rosterZijde], p.id)?.includes(u.id) ?? false;
      return {
        postId: p.id,
        label: knopLabel(p),
        aan,
        uitgesloten: uit ? uitsluitingTekst(uit) : null,
        nu: uit ? 0 : waardeNu(u, t),
        punten: Math.max(0, u.points ?? 0),
        uitleg: REKENREGEL,
        onToggle: () => setTracker({
          ...tracker,
          bonus: { ...(tracker.bonus ?? {}), [rosterZijde]: tikUnit(tracker.bonus?.[rosterZijde], p.id, u.id, !aan) },
        }),
      };
    });
  };

  const afield = army
    ? army.units.filter((u) => unitTotalStrength(u) - (tracker.units[unitKey(side, u.id)]?.lost ?? 0) > 0).length
    : 0;

  const groups: { category: string; units: ArmyUnit[] }[] = [];
  if (army) {
    for (const u of army.units) {
      // Een versterkings-unit (23-10-2026) in een eigen kop, zodat je aan tafel ziet wat er bij hoort.
      // `u.category` zelf blijft staan: het veteranen-rapport en de PDF lezen dat veld.
      const kop = u.versterking ? `Reinforcements · ${u.category}` : u.category;
      let g = groups.find((x) => x.category === kop);
      if (!g) { g = { category: kop, units: [] }; groups.push(g); }
      g.units.push(u);
    }
  }

  // ── shared bits ──
  const sideToggle = (
    <div style={{ display: 'flex', gap: 4 }}>
      {(['me', 'opp'] as const).map((s) => {
        const on = s === side;
        const txt = s === 'me' ? myName || 'You' : opponentName || 'Opponent';
        return (
          <button key={s} onClick={() => setSide(s)} style={{ flex: 1, padding: '9px 6px', borderRadius: 9, cursor: 'pointer', border: `1px solid ${on ? TOW.goldDeep : TOW.line}`, background: on ? TOW.cardLt : 'transparent', color: on ? TOW.ink : TOW.muted, fontFamily: display, fontWeight: 600, fontSize: 13.5, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{txt}</button>
        );
      })}
    </div>
  );

  const battleBar = toonPanelen && (
    <BattleBar round={tracker.round} maxRound={maxRound} onRound={adjRound} vpMe={vpMe} vpOpp={vpOpp} leader={leader} myName={myName || 'You'} opponentName={opponentName || 'Opponent'} editable={editable} vertical={wide} />
  );
  // DE REMINDER-BALK (Joost 05-10-2026): vast onder de ronde/VP-balk, met het weer en — bij een
  // campagne-battle — wat beide kanten meebrengen. Host = aanvaller, guest = verdediger: dezelfde
  // toewijzing als waarmee openCampaignBattle de stoelen vult. Perks, items en de first-turn-bonus
  // staan niet op de tracker, dus die komen uit de campagne-battle zelf (één keer opgehaald).
  const campagne = useCampaignBattle(code);
  // 22-10-2026: ligt de eerste beurt vast (Breakthrough, Plunder, The Forge), dan geen roll-off-bonussen
  // in de balk maar wie er begint. En vanaf Act 3 de Wrath Triggers van deze battle.
  const eersteVast = eersteBeurtVast(campagne?.scenario);
  const kantVan = (abs: string, naam: string): KantReminders | null => {
    if (!campagne) return null;
    const k = abs === 'host' ? 'aanvaller' : 'verdediger';
    return {
      naam,
      perks: campagne.perks?.[k] ?? [],
      items: campagne.items?.[k] ?? [],
      rollOff: eersteVast ? [] : campagne.rollOff?.[k] ?? [],
    };
  };
  // 23-10-2026: de Wrath komt van de campagne (server-worp bij het begin van de War phase); het lab en de
  // scenario-test gooien lokaal. Geldt hij niet (Act 1-2, geen campagne), dan geen Wrath-regel in de balk.
  const wrathStand = useWrath(campagne, code);
  const reminderStrip = toonPanelen && (
    <ReminderStrip
      weer={tracker.weer ?? null}
      mij={kantVan(meKey, myName || 'You')}
      tegen={kantVan(absSeat('opp'), opponentName || 'Opponent')}
      wrath={wrathStand.geldt ? wrathStand.triggers : null}
      eersteBeurt={campagne ? eersteBeurtZin(campagne) : null}
    />
  );
  // Objective-VP hoort bij de RONDE, niet bij het eindscherm: troves en landmarks scoren per
  // speler-turn, dus je tikt ze aan zodra die turn voorbij is. Stond dit alleen achter "End
  // battle", dan moest je aan het eind reconstrueren hoeveel beurten je wat vasthield (Joost,
  // 29-08). Het volgt de kant-schakelaar hierboven, net als het roster eronder — je scoort voor
  // wie je op dat moment bijhoudt. Buiten een campagne (geen objectives) rendert het niets.
  const objectivesPaneel = toonPanelen && (
    <ObjectivesTracker
      zijde={absSeat(side) === 'guest' ? 'guest' : 'host'}
      naam={side === 'me' ? (myName || 'You') : (opponentName || 'Opponent')}
      editable={editable}
      round={tracker.round}
    />
  );
  // DE BATTLE SHEET AAN TAFEL (13-09). Halverwege een potje wil je terug kunnen lezen wat er ook
  // alweer gold: welk scenario, waar de zones liggen, welke secondaries meetellen, welk weer er
  // staat. Dat blad stond tot nu toe alleen vóór het potje, dus tijdens het spelen was het weg.
  // Als OVERLAY en niet als vierde kolom: het is iets wat je even opslaat en weer wegklapt, en dit
  // scherm is het drukst gebruikte van de app — daar hoort niets permanents bij.
  //
  // De sheet gaat hier door `normSheet` omdat dit een LEESPLEK is: de rij kan van een andere
  // appversie of van de tegenstander komen. Geen sheet = geen knop; een campagne-battle en elk
  // potje van vóór de wizard hebben er geen, en een knop die een leeg paneel opent is erger dan
  // geen knop.
  const sheet = normSheet(tracker.sheet);
  // 22-10-2026: bij een CAMPAGNE-battle komt de sheet van de server (geen `tracker.sheet`), en ook dan
  // wil je de kaart en de scenarioteksten tijdens het spel kunnen teruglezen: dezelfde knop opent dan
  // het compacte scenario-overzicht (CampaignScenarioOverlay).
  const campagneSheet = !sheet && !!campagne && !!campagne.scenario;
  const sheetKnop = (sheet || campagneSheet) && (
    <button
      onClick={() => setSheetOpen(true)}
      style={{ width: '100%', padding: '10px 14px', borderRadius: 10, cursor: 'pointer', border: `1px solid ${TOW.lineStrong}`, background: TOW.cardLt, color: TOW.ink, fontFamily: display, fontWeight: 600, fontSize: 13.5 }}
    >
      Battlefield
    </button>
  );
  const sheetModal = sheetOpen && (sheet
    ? <BattlefieldOverlay sheet={sheet} onClose={() => setSheetOpen(false)} />
    : campagneSheet && campagne && code
      ? <CampaignScenarioOverlay battle={campagne} code={code} mySeat={meKey === 'guest' ? 'guest' : 'host'} onClose={() => setSheetOpen(false)} />
      : null);

  // ── REINFORCEMENT DETACHMENT (23-10-2026, lib/versterking.ts) ──────────────────────────────────────
  // Bij een campagne-battle alleen als de server een versterking voor DEZE kant meegeeft (twee tegen
  // drie). Bij een vrij potje mag het altijd: de spelers weten zelf of ze met twee tegen drie staan.
  // Alleen je EIGEN leger, en in solo ook dat van de tegenstander (je bedient dan beide kanten).
  const kantVanZijde: 'aanvaller' | 'verdediger' = absSeat(side) === 'guest' ? 'verdediger' : 'aanvaller';
  const rfMax = campagne ? versterkingVoorKant(campagne.versterking, kantVanZijde) : null;
  // Een campagne-code (geen vier tekens) is een campagne-battle, ook zolang hij nog laadt.
  const campagneCode = !!code && !isVrijPotjeCode(code);
  const rfNu = versterkingVan(army);
  // Staat er al een versterking bij, dan blijft het blok staan (om hem weg te kunnen halen).
  const rfMag = !!army && (side === 'me' || seat === 'solo') && (!!rfNu || (campagneCode ? !!rfMax : true));
  const versterkingPaneel = rfMag && army && (
    <VersterkingKiezer
      key={`${side}-${rfNu ? 'aan' : 'uit'}`}
      testid="game-versterking"
      max={rfMax ?? army.versterking?.max ?? null}
      // Alleen versterkingen van hetzelfde army book. Het leger draagt de leesbare factienaam, de lijsten
      // een slug: de kiezer vergelijkt die twee, en valt terug op alle versterkingslijsten als er niets past.
      leger={null}
      factie={army.faction}
      gekozen={rfNu ? { naam: rfNu.naam, punten: rfNu.punten } : null}
      onPick={(rf) => applyArmy(voegVersterkingToe(army, rf, rfMax ?? null))}
      onWeg={() => applyArmy(zonderVersterking(army))}
    />
  );

  const endModal = endOpen && (
    <EndBattleOverview res={res} hostName={hostName} guestName={guestName} hostArmy={hostArmy} guestArmy={guestArmy} onClose={() => setEndOpen(false)} />
  );

  const rosterBody = army ? (
    groups.map((g) => (
      <div key={g.category} style={{ marginBottom: 8 }}>
        <div style={{ ...eb, fontSize: 9, color: TOW.goldDeep, margin: '12px 2px 8px' }}>{g.category}</div>
        {g.units.map((u) => {
          const t = tracker.units[unitKey(side, u.id)];
          return (
            <UnitCard key={u.id} unit={u} faction={army.faction} editable={editable} onChange={(patch) => onUnitChange(u.id, patch)} lost={t?.lost ?? 0} weg={t?.weg ?? false} fleeing={t?.fleeing ?? false} kills={t?.kills ?? 0} onSetLost={(lost) => setCasualty(u.id, lost)} onRemoved={() => setRemoved(u.id, !(t?.weg ?? false))} onFlee={() => toggleFleeing(u.id)} onSetKills={(k) => setKills(u.id, k)} killDetails={t?.killDetails ?? []} onSetKillDetail={(i, patch) => setKillDetail(u.id, i, patch)} vijandUnits={vijandLeger?.units ?? []} maxRound={maxRound} collapsed={!expanded.has(u.id)} onToggleCollapse={() => toggleExpand(u.id)} scenarioKnoppen={knoppenVoor(u)} />
          );
        })}
      </div>
    ))
  ) : side === 'opp' ? (
    // Tegenstander-leger toevoegen kan in ELKE modus (solo én campagne/online) — zo kun je een battle
    // testen door zelf één van je eigen lijsten voor de opponent te kiezen (ArmyPaste bevat de list-picker).
    <>
      {seat !== 'solo' && (
        <div style={{ padding: '12px 2px 0', fontFamily: serif, fontStyle: 'italic', fontSize: 13.5, color: TOW.muted }}>
          Waiting for your opponent to join and add their army — or add one from your own saved lists below to test the battle solo.
        </div>
      )}
      <ArmyPaste title="Opponent army list" cta="Add opponent army" onSet={setOpponentArmy} />
    </>
  ) : (
    <ArmyPaste title="Your army list" cta="Add your army" onSet={setMyArmy} />
  );

  // ════════════════ WIDE — "This game" sidebar + roster pane ════════════════
  if (wide) {
    return (
      <div ref={rootRef} className="tow-field" style={{ height: '100%', display: 'flex', flexDirection: 'row', color: TOW.ink }}>
        <div style={{ width: 284, flexShrink: 0, borderRight: `1px solid ${TOW.lineStrong}`, background: TOW.panel, display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '20px 18px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <Shield c={TOW.goldDeep} />
              <div style={{ fontFamily: display, fontWeight: 700, fontSize: 21, color: TOW.ink }}>Armies</div>
            </div>
            <Ornament w={180} color={TOW.goldDeep} style={{ display: 'block', marginTop: 12, opacity: 0.6 }} />
          </div>
          <div style={{ margin: '14px 14px 0', display: 'flex', flexDirection: 'column', gap: 9, overflowY: 'auto', flex: 1, minHeight: 0, paddingBottom: 18 }}>
            <div style={{ ...eb, fontSize: 8.5, color: TOW.muted }}>This game</div>
            <CodeBadge code={code} onLeave={leaveGame} waiting={!!(code && seat === 'host' && !opponentArmy)} solo={seat === 'solo'} />
            {sideToggle}
            {battleBar}
            {reminderStrip}
            {sheetKnop}
            {objectivesPaneel}
            {(myArmy || opponentArmy || scenarioTest) && (
              <button onClick={() => setEndOpen(true)} style={{ width: '100%', border: 'none', borderRadius: 11, cursor: 'pointer', padding: '12px 16px', background: `linear-gradient(180deg, ${TOW.goldBright}, ${TOW.gold} 55%, ${TOW.goldDeep})`, color: TOW.onGrad, fontFamily: display, fontWeight: 700, fontSize: 14 }}>End battle</button>
            )}
          </div>
        </div>

        <div className="tow-field" style={{ flex: 1, minWidth: 0, overflowY: 'auto' }}>
          <div style={{ maxWidth: 720, margin: '0 auto', padding: '26px 32px 52px' }}>
            {army && (
              <>
                <div style={{ ...eb, fontSize: 9.5, color: TOW.goldDeep, marginBottom: 5 }}>{side === 'me' ? 'Your army' : "Opponent's army"} · {afield}/{army.units.length} afield</div>
                <div style={{ fontFamily: display, fontWeight: 700, fontSize: 27, color: TOW.ink, lineHeight: 1.05 }}>{army.name}</div>
                <div style={{ fontFamily: serif, fontStyle: 'italic', fontSize: 15, color: TOW.parchDim, marginTop: 4 }}>{army.faction || ''}{army.points != null ? ` · ${army.points} pts` : ''}</div>
                <Ornament w={150} color={TOW.goldDeep} style={{ display: 'block', margin: '14px 0 2px', opacity: 0.5 }} />
              </>
            )}
            {versterkingPaneel}
            {rosterBody}
          </div>
        </div>
        {sheetModal}
        {endModal}
      </div>
    );
  }

  // ════════════════ PHONE — stacked ════════════════
  return (
    <div ref={rootRef} className="tow-field" style={{ height: '100%', display: 'flex', flexDirection: 'column', color: TOW.ink }}>
      <div className="tow-leather" style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: `1px solid ${TOW.lineStrong}` }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ ...eb, fontSize: 8.5, color: TOW.muted }}>Game</div>
          {code ? (
            <div style={{ fontFamily: display, fontWeight: 700, fontSize: 18, color: TOW.goldDeep, letterSpacing: '0.18em' }}>{code}</div>
          ) : (
            <div style={{ fontFamily: display, fontWeight: 700, fontSize: 16, color: TOW.ink }}>Local game</div>
          )}
        </div>
        {code && seat === 'host' && !opponentArmy && (
          <span style={{ fontFamily: serif, fontStyle: 'italic', fontSize: 12.5, color: TOW.muted }}>waiting for opponent…</span>
        )}
        {(sheet || campagneSheet) && (
          <button onClick={() => setSheetOpen(true)} style={{ border: `1px solid ${TOW.lineStrong}`, borderRadius: 9, background: TOW.cardLt, color: TOW.ink, cursor: 'pointer', padding: '6px 12px', fontFamily: display, fontSize: 12 }}>Battlefield</button>
        )}
        <button onClick={leaveGame} style={{ border: `1px solid ${TOW.lineStrong}`, borderRadius: 9, background: 'transparent', color: TOW.muted, cursor: 'pointer', padding: '6px 12px', fontFamily: display, fontSize: 12 }}>Leave</button>
      </div>

      <div style={{ flexShrink: 0, padding: 10 }}>{sideToggle}</div>

      {battleBar && (
        <div style={{ flexShrink: 0, padding: '0 10px 8px', maxWidth: 620, width: '100%', margin: '0 auto', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {battleBar}
          {reminderStrip}
        </div>
      )}

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '4px 12px 28px', maxWidth: 620, width: '100%', margin: '0 auto' }}>
        {objectivesPaneel}
        {army && (
          <div style={{ fontFamily: serif, fontStyle: 'italic', fontSize: 14, color: TOW.parchDim, margin: '4px 2px 12px' }}>
            {side === 'me' ? myName || 'You' : opponentName || 'Opponent'} — {army.faction || army.name}{army.points != null ? ` · ${army.points} pts` : ''} · {afield}/{army.units.length} afield
          </div>
        )}
        {versterkingPaneel}
        {rosterBody}
        {(myArmy || opponentArmy || scenarioTest) && (
          <div style={{ marginTop: 16 }}>
            <button onClick={() => setEndOpen(true)} style={{ width: '100%', border: 'none', borderRadius: 11, cursor: 'pointer', padding: '13px 16px', background: `linear-gradient(180deg, ${TOW.goldBright}, ${TOW.gold} 55%, ${TOW.goldDeep})`, color: TOW.onGrad, fontFamily: display, fontWeight: 700, fontSize: 15 }}>End battle</button>
          </div>
        )}
      </div>
      {sheetModal}
      {endModal}
    </div>
  );
}

/** De battle sheet als weglegbaar paneel. Eigen component zodat `useBackClose` alleen leeft zolang
 *  de overlay open staat — precies zoals ExportSheet het doet: de hardware-terugknop sluit dan de
 *  bovenste laag en verlaat niet het potje eronder. */
function BattlefieldOverlay({ sheet, onClose }: { sheet: BattleSheet; onClose: () => void }): React.JSX.Element {
  useBackClose(true, onClose);
  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 85, background: 'rgba(30,20,8,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 14 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 560, maxHeight: '88vh', display: 'flex', flexDirection: 'column', overflowY: 'auto', background: TOW.panel2, border: `1px solid ${TOW.lineStrong}`, borderRadius: 16, padding: 16 }}
      >
        <BattleSheetView
          sheet={sheet}
          titel="Battlefield"
          rechts={(
            <button onClick={onClose} aria-label="Close" style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 22, lineHeight: 1, color: TOW.muted, padding: '0 4px' }}>×</button>
          )}
        />
      </div>
    </div>
  );
}

function CodeBadge({ code, onLeave, waiting, solo = false }: { code: string | null; onLeave: () => void; waiting: boolean; solo?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 12px', borderRadius: 11, background: TOW.cardLt, border: `1px solid ${TOW.line}` }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ ...eb, fontSize: 7.5, color: TOW.muted }}>{waiting ? 'Waiting for opponent' : code && !solo ? 'Shared game' : 'Local game'}</div>
        <div style={{ fontFamily: display, fontWeight: 700, fontSize: 17, color: code ? TOW.goldDeep : TOW.ink, letterSpacing: code ? '0.2em' : 0 }}>{code || 'Solo'}</div>
      </div>
      <button onClick={onLeave} style={{ ...eb, fontSize: 8, color: TOW.muted, border: `1px solid ${TOW.lineStrong}`, borderRadius: 8, background: 'transparent', cursor: 'pointer', padding: '7px 11px' }}>Leave</button>
    </div>
  );
}

function ArmyPaste({ title, cta, onSet }: { title: string; cta: string; onSet: (a: Army) => void }) {
  const [paste, setPaste] = useState('');
  const [ri, setRi] = useState(riCache);
  useEffect(() => {
    if (ri) return;
    fetch(`${BASE}owb/rules-index.json`).then((r) => r.json()).then((d) => { riCache = d; setRi(d); }).catch(() => {});
  }, [ri]);
  const troopTypeFor = useMemo(() => makeTroopTypeLookup(ri), [ri]);
  const army = paste.trim() ? enrichArmyTroopTypes(parseArmyList(paste), troopTypeFor) : null;
  return (
    <div style={{ padding: '12px 2px' }}>
      <div style={{ ...eb, fontSize: 9, color: TOW.muted, marginBottom: 6 }}>{title}</div>
      <ArmyListPicker onPick={onSet} />
      <textarea value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="Paste the Old World Builder export…" rows={7} style={{ width: '100%', borderRadius: 10, border: `1px solid ${TOW.lineStrong}`, background: TOW.cardLt, color: TOW.ink, padding: '10px 12px', fontFamily: serif, fontSize: 13, lineHeight: 1.4, boxSizing: 'border-box', resize: 'vertical' }} />
      <OwbInstructions defaultOpen={!paste.trim()} />
      <button onClick={() => army && onSet(army)} disabled={!army} style={{ marginTop: 10, border: 'none', borderRadius: 11, cursor: 'pointer', padding: '11px 18px', width: '100%', background: `linear-gradient(180deg, ${TOW.goldBright}, ${TOW.gold} 55%, ${TOW.goldDeep})`, color: TOW.onGrad, fontFamily: display, fontWeight: 700, fontSize: 14, opacity: army ? 1 : 0.5 }}>{cta}</button>
    </div>
  );
}
