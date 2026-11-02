import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { TOW, towFont, engraved } from '../../design/tow';
import { useGame } from '../../game';
import { useBackClose } from '../../lib/backStack';
import { parseArmyList } from '../../lib/armyParser';
import { makeTroopTypeLookup, enrichArmyTroopTypes } from '../../lib/troopTypes';
import { unitSize, unitTotalStrength } from '../../lib/armyRules';
import { UnitCard, korteStand, type ScenarioKnop } from './UnitCard';
import { SmalleKolom } from './ProfielTabel';
import { BattleBar } from './BattleBar';
import { ReminderStrip, type KantReminders } from './ReminderStrip';
import { useCampaignBattle } from './useCampaignBattle';
import { perksVoorKant, rollOffVoorKant } from '../../lib/campaignBattle';
import { ObjectivesTracker } from './ObjectivesTracker';
import { useScenarioBonus } from './useObjectives';
import { CampaignScenarioOverlay, eersteBeurtZin, useWrath } from './CampaignScenarioBits';
import { eersteBeurtVast } from '../../lib/campaignScenario';
import { isScenarioTestCode } from '../../lib/scenarioTest';
import { OwbInstructions } from './OwbInstructions';
import { ArmyListPicker } from './ArmyListPicker';
import { NewRecruitResultaat } from './NewRecruitResultaat';
import { useNewRecruitLeger } from '../../lib/lijstNaarLeger';
import { BattleSheetView } from './BattleSheetView';
import { EndBattleOverview } from './EndBattleOverview';
import { normSheet } from '../../lib/battleSheet';
import { berekenTeamVictory, berekenVictory } from '../../lib/victoryPoints';
import { isTeamTracker, naamVan, objectiefStoel, stoelenVan, TEAM_NAAM, TEAM_STOELEN, teamVan, vijandUnitsVoor } from '../../lib/teams';
import { useData } from '../../data';
import { usePersistentState } from '../../store';
import { inferOverlayId, isOverlay, OVERLAY_FILES } from '../../lib/overlays';
import type { KillDetail, Army, ArmyUnit, TeamStoel } from '../../types';
import type { BattleSheet } from '../../lib/battleSheet';
import { VersterkingKiezer } from './VersterkingKiezer';
import { isVrijPotjeCode } from '../../lib/battleCode';
import { VERSTERKING_OVERAL, versterkingVan, versterkingVoorKant, voegVersterkingToe, zonderVersterking } from '../../lib/versterking';
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
// Wide (28-10-2026): a compact two-row header (code, You/Opponent, round/VP, reminders) above a
// unit list on the left and the selected unit's full card on the right.
export function GameView() {
  const { code, seat, myArmy, myName, opponentArmy, opponentName, setMyArmy, setOpponentArmy, allyArmy, opponent2Army, setAllyArmy, setOpponent2Army, tracker, setTracker, leaveGame } = useGame();
  const { setRuleOverlay } = useData();
  // GameView only mounts while a game is active, so a hardware Back here leaves the game.
  useBackClose(true, leaveGame);
  const [side, setSide] = useState<'me' | 'opp'>('me');
  // ── 2 VS 2 (Joost 28-10-2026, alleen solo) ── Vier spelers in twee teams (zie lib/teams.ts). In plaats
  // van You/Opponent kies je dan één van vier stoelen; roster, wonden, flee en kills werken per stoel
  // precies als in 1v1, onder de sleutel `<stoel>:<unitId>`. Een 1v1-potje (ook solo) komt hier nooit:
  // zonder `tracker.teams` blijft `teamModus` false en loopt alles via `side` zoals voorheen.
  const teamModus = seat === 'solo' && isTeamTracker(tracker);
  const [speler, setSpeler] = useState<TeamStoel>('host');
  const legers: Record<TeamStoel, Army | null> = { host: myArmy, host2: allyArmy, guest: opponentArmy, guest2: opponent2Army };
  const zetLeger: Record<TeamStoel, (a: Army) => void> = { host: setMyArmy, host2: setAllyArmy, guest: setOpponentArmy, guest2: setOpponent2Army };
  const naam = (st: TeamStoel) => naamVan(tracker, st);
  const [endOpen, setEndOpen] = useState(false); // einde-battle-overzicht open?
  const [sheetOpen, setSheetOpen] = useState(false); // battle sheet als overlay open?
  // Roster units are collapsed by default; tapping a unit's header expands just that one (keeps the
  // list scannable). Tracked by unit id (ids are unique per army, so no clash between the two sides).
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleExpand = (id: string) => setExpanded((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  // 2v2: per stoel, want twee spelers mogen dezelfde lijst kiezen (dan zijn de unit-ids gelijk).
  const expKey = (id: string) => (teamModus ? `${speler}:${id}` : id);
  // De breedte meten we op de buitenste div. Telefoon en breed renderen elk een EIGEN buitenste div, dus
  // bij het oversteken van 700 px wisselt het element: met een callback-ref volgt de observer mee
  // (28-10-2026; met een vaste ref bleef hij aan de oude, losgekoppelde div hangen en sprong de layout
  // na één wissel niet meer terug).
  const [rootEl, rootRef] = useState<HTMLDivElement | null>(null);
  const [w, setW] = useState(420);
  useLayoutEffect(() => {
    if (!rootEl) return;
    const ro = new ResizeObserver((es) => setW(es[0].contentRect.width));
    ro.observe(rootEl);
    setW(rootEl.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, [rootEl]);
  const wide = w >= 700; // pane is window−76 when the global rail is shown

  // ── NAAST ELKAAR (Joost 02-11-2026, Fold opengeklapt): "de keuze voor links en rechts army op deze manier" —
  // beide legers tegelijk, elk als de pick-weergave van de telefoon (pillen boven, de gekozen unit eronder).
  // Daarom loopt alles wat van de bekeken kant afhangt via een ZICHT (kant + 2v2-stoel) in plaats van rechtstreeks
  // via `side`/`speler`: de gewone weergaven geven het huidige zicht mee, de twee kolommen elk hun eigen.
  // Een tik in een kolom maakt die kolom het huidige zicht (zie `kies`), zodat bv. het regelblad meeloopt.
  type Zicht = { side: 'me' | 'opp'; speler: TeamStoel };
  const zicht: Zicht = { side, speler };
  const legerVan = (z: Zicht): Army | null => (teamModus ? legers[z.speler] : z.side === 'me' ? myArmy : opponentArmy);
  const [breedWeergave, setBreedWeergave] = usePersistentState<'kies' | 'naast'>('tow:game-weergave-breed', 'kies');
  // 2v2 naast elkaar: links de laatst gekozen stoel van team A, rechts die van team B.
  const [teamStoel, setTeamStoel] = useState<Record<'A' | 'B', TeamStoel>>({ A: 'host', B: 'guest' });
  const kiesSpeler = (st: TeamStoel) => {
    setSpeler(st);
    setTeamStoel((t) => ({ ...t, [teamVan(st)]: st }));
  };

  const army: Army | null = legerVan(zicht);
  // Wie kon deze kant killen? Het leger AAN DE ANDERE KANT van de tafel. Wordt de dropdown-inhoud bij
  // de kills, dus het moet meebewegen met de zijde die je bekijkt.
  // 2v2: de units van BEIDE vijanden, met de stoel in de id (`guest2:<id>`) en de spelernaam ervoor —
  // zie vijandUnitsVoor: zo blijft een kill eenduidig, ook als twee spelers dezelfde lijst kozen.
  const vijandUnitsVan = (z: Zicht): ArmyUnit[] => (teamModus
    ? vijandUnitsVoor(z.speler, { host: myArmy, host2: allyArmy, guest: opponentArmy, guest2: opponent2Army }, tracker)
    : (z.side === 'me' ? opponentArmy : myArmy)?.units ?? []);

  // ── KIESLIJST OP BREED SCHERM (Joost 28-10-2026, Galaxy Fold) ── Links de units als dichte rijen,
  // rechts de gekozen unit volledig. De keuze is PER KANT: schakel je naar de tegenstander en terug,
  // dan staat je eigen unit weer klaar. Is er (nog) niets gekozen, of bestaat de gekozen unit niet meer
  // in dit leger (leger vervangen, unit eruit), dan valt hij terug op de EERSTE unit van het leger.
  // Afgeleid bij elke render, dus een realtime tracker-update laat de keuze ongemoeid. De telefoon
  // gebruikt dit niet: daar klappen de kaarten in de lijst zelf open (`expanded`).
  // 2v2 (28-10-2026): de keuze wordt per STOEL onthouden in plaats van per kant.
  const [gekozen, setGekozen] = useState<Record<string, string | null>>({ me: null, opp: null });
  const sleutelVan = (z: Zicht): string => (teamModus ? z.speler : z.side);
  // MOUNT ALS EIGEN TABJE (Joost 28-10-2026: "als een character een mount heeft … die wil ik ook zoals een gewone
  // unit kunnen zien, met al zijn stats en regels, en gewoon in de lijst"). Welke unit z'n mount-tab open heeft;
  // een gewone keuze in de lijst opent altijd de rider. Per zicht, want naast elkaar kunnen beide kanten
  // dezelfde lijst (en dus dezelfde unit-ids) hebben.
  const [mountTab, setMountTab] = useState<{ sleutel: string; id: string; i: number } | null>(null);
  const mountTabVan = (z: Zicht, unitId: string): number | null =>
    (mountTab?.sleutel === sleutelVan(z) && mountTab.id === unitId ? mountTab.i : null);
  const [telefoonWeergave, setTelefoonWeergave] = usePersistentState<'lijst' | 'kies'>('tow:game-weergave', 'lijst');
  const kiesKaartRef = useRef<HTMLDivElement>(null);
  // De scrollvlakken van de twee kolommen naast elkaar, per zicht-sleutel.
  const kolomRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const kies = (z: Zicht, unitId: string, mount: number | null = null) => {
    const sl = sleutelVan(z);
    setGekozen((g) => ({ ...g, [sl]: unitId }));
    setMountTab(mount == null ? null : { sleutel: sl, id: unitId, i: mount });
    if (z.side !== side) setSide(z.side);
    if (teamModus && z.speler !== speler) setSpeler(z.speler);
    // Pick-weergave op de telefoon: de kaart staat onder de kiesrijen, dus schuif hem in beeld.
    if (!wide && telefoonWeergave === 'kies') requestAnimationFrame(() => kiesKaartRef.current?.scrollTo({ top: 0 }));
    if (wide && breedWeergave === 'naast') requestAnimationFrame(() => kolomRefs.current[sl]?.scrollTo({ top: 0 }));
  };
  const selIdVan = (z: Zicht): string | null => {
    const a = legerVan(z);
    const g = gekozen[sleutelVan(z)];
    return a ? (a.units.some((u) => u.id === g) ? g ?? null : a.units[0]?.id ?? null) : null;
  };
  const selId = selIdVan(zicht);
  const selUnit: ArmyUnit | null = army?.units.find((u) => u.id === selId) ?? null;
  // Nieuwe unit gekozen → het rechterpaneel begint weer bovenaan (anders sta je midden in de vorige).
  const detailRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    detailRef.current?.scrollTo({ top: 0 });
  }, [selId, side, speler, mountTab]);

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
  const applyArmyVan = (z: Zicht) => (teamModus ? zetLeger[z.speler] : z.side === 'me' ? setMyArmy : setOpponentArmy);
  const onUnitChange = (z: Zicht, unitId: string, patch: Partial<ArmyUnit>) => {
    const a = legerVan(z);
    if (!a) return;
    applyArmyVan(z)({ ...a, units: a.units.map((u) => (u.id === unitId ? { ...u, ...patch } : u)) });
  };

  // ── shared battle tracker (absolute seat keys so both players agree) ──
  const absSeat = (s: 'me' | 'opp'): string =>
    seat === 'solo' ? (s === 'me' ? 'host' : 'guest') : s === 'me' ? seat ?? 'host' : seat === 'host' ? 'guest' : 'host';
  // 2v2: de sleutel volgt de gekozen STOEL (host/host2/guest/guest2); `s` doet dan niet mee.
  const unitKey = (z: Zicht, unitId: string) => `${teamModus ? z.speler : absSeat(z.side)}:${unitId}`;
  const meKey = absSeat('me');

  // Absolute muteerhelpers voor de per-unit tracker (WoundTracker levert absolute waarden).
  // `prev` default = { lost: 0, fleeing: false }; oude trackers zonder `weg` blijven zo werken.
  const setCasualty = (z: Zicht, unitId: string, lost: number) => {
    const u = legerVan(z)?.units.find((x) => x.id === unitId);
    if (!u) return;
    const total = unitTotalStrength(u);
    const key = unitKey(z, unitId);
    const prev = tracker.units[key] ?? { lost: 0, fleeing: false };
    const clamped = Math.min(total, Math.max(0, lost));
    setTracker({ ...tracker, units: { ...tracker.units, [key]: { ...prev, lost: clamped } } });
  };
  const setRemoved = (z: Zicht, unitId: string, weg: boolean) => {
    const key = unitKey(z, unitId);
    const prev = tracker.units[key] ?? { lost: 0, fleeing: false };
    setTracker({ ...tracker, units: { ...tracker.units, [key]: { ...prev, weg } } });
  };
  // Absolute setter voor de per-unit kill-teller (enemy units destroyed + trofeeën); min 0.
  const setKills = (z: Zicht, unitId: string, kills: number) => {
    const key = unitKey(z, unitId);
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
  const setKillDetail = (z: Zicht, unitId: string, i: number, patch: KillDetail) => {
    const key = unitKey(z, unitId);
    const prev = tracker.units[key] ?? { lost: 0, fleeing: false };
    const aantal = Math.max(0, Math.round(prev.kills ?? 0));
    const details = [...(prev.killDetails ?? [])];
    while (details.length < aantal) details.push({});
    if (i < 0 || i >= details.length) return;
    details[i] = { ...details[i], ...patch };
    setTracker({ ...tracker, units: { ...tracker.units, [key]: { ...prev, killDetails: details } } });
  };
  const toggleFleeing = (z: Zicht, unitId: string) => {
    const key = unitKey(z, unitId);
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
  const res1v1 = useMemo(
    () => berekenVictory(hostArmy, guestArmy, tracker, tracker.bonus?.host, tracker.bonus?.guest, tracker.battleMarch === true, scenarioDef),
    [hostArmy, guestArmy, tracker, scenarioDef],
  );
  // 2v2: de TEAM-stand (lib/victoryPoints.ts → berekenTeamVictory). Zelfde vorm als de 1v1-uitslag met
  // host = team A en guest = team B, dus de BattleBar en het eindscherm lezen hem zonder omweg.
  const teamRes = useMemo(
    () => (teamModus
      ? berekenTeamVictory({ host: myArmy, host2: allyArmy, guest: opponentArmy, guest2: opponent2Army }, tracker, tracker.battleMarch === true, scenarioDef)
      : null),
    [teamModus, myArmy, allyArmy, opponentArmy, opponent2Army, tracker, scenarioDef],
  );
  const res = teamRes ?? res1v1;
  // DE SCENARIO-TEST (22-10-2026, testbuild): een lokaal potje zonder (verplicht) leger. De panelen
  // (ronde, VP, objectives, reminders, einde) staan er dan ook zonder leger, anders valt er niets te testen.
  const scenarioTest = isScenarioTestCode(code);
  // 2v2: de ronde/VP-balk is van het hele potje, dus hij blijft staan zolang één van de vier een leger heeft
  // (ook als je net de stoel bekijkt die nog leeg is).
  const toonPanelen = (teamModus ? !!(myArmy || allyArmy || opponentArmy || opponent2Army) : !!army) || scenarioTest;
  const hostName = teamModus ? TEAM_NAAM.A : meKey === 'host' ? (myName || 'You') : (opponentName || 'Opponent');
  const guestName = teamModus ? TEAM_NAAM.B : meKey === 'host' ? (opponentName || 'Opponent') : (myName || 'You');
  const vpMe = meKey === 'host' ? res.hostVp : res.guestVp;
  const vpOpp = meKey === 'host' ? res.guestVp : res.hostVp;
  const leader: 'me' | 'opp' | null = res.winnaar == null ? null : res.winnaar === meKey ? 'me' : 'opp';

  // ── BREAKTHROUGH (24-10-2026, lib/scenarioUnits.ts) ── Heeft de sheet een puntwaarde-post voor de kant die
  // het roster nu toont (de aanvaller, bij Breakthrough), dan krijgt elke unit die in aanmerking komt een
  // knopje. Characters en monsters nooit; een unit die vlucht of weg is alleen als hij al aan stond (om hem
  // uit te kunnen zetten). De post zelf rekent de som in berekenVictory, met dezelfde functies.
  const knoppenVoor = (z: Zicht, u: ArmyUnit): ScenarioKnop[] | undefined => {
    const rosterZijde: 'host' | 'guest' = absSeat(z.side) === 'guest' ? 'guest' : 'host';
    // 2v2 (solo) heeft geen campagne-sheet en dus geen puntwaarde-posten; expliciet leeg voor de zekerheid.
    const puntPosten = teamModus ? [] : (scenarioDef?.posten ?? []).filter((p) => postUitUnits(p) && postGeldtVoor(p, rosterZijde));
    if (!puntPosten.length || soortUitsluiting(u)) return undefined;
    const gedoodRoster = gedoodDoorVijand(rosterZijde, tracker);
    const t = tracker.units[`${rosterZijde}:${u.id}`] as VpUnitTrack | undefined;
    const uit = uitsluiting(u, t, gedoodRoster.has(u.id));
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

  const afieldVan = (z: Zicht): number => {
    const a = legerVan(z);
    return a ? a.units.filter((u) => unitTotalStrength(u) - (tracker.units[unitKey(z, u.id)]?.lost ?? 0) > 0).length : 0;
  };
  const afield = afieldVan(zicht);
  // 2v2: hoe deze stoel heet in kopjes, en de knoptekst om een leger toe te voegen.
  const zonderEigenNaam = (st: TeamStoel) => !tracker.spelers?.[st]?.trim();
  const legerKop = (st: TeamStoel) => `${TEAM_NAAM[teamVan(st)]} · ${naam(st)}`;

  const groepenVan = (a: Army | null): { category: string; units: ArmyUnit[] }[] => {
    const groups: { category: string; units: ArmyUnit[] }[] = [];
    for (const u of a?.units ?? []) {
      // Een versterkings-unit (23-10-2026) in een eigen kop, zodat je aan tafel ziet wat er bij hoort.
      // `u.category` zelf blijft staan: het veteranen-rapport en de PDF lezen dat veld.
      const kop = u.versterking ? `Reinforcements · ${u.category}` : u.category;
      let g = groups.find((x) => x.category === kop);
      if (!g) { g = { category: kop, units: [] }; groups.push(g); }
      g.units.push(u);
    }
    return groups;
  };
  const groups = groepenVan(army);

  // ── shared bits ──
  const naast = wide && breedWeergave === 'naast' && !!(teamModus ? (myArmy || allyArmy || opponentArmy || opponent2Army) : (myArmy || opponentArmy));
  const zichtLinks: Zicht = { side: 'me', speler: teamStoel.A };
  const zichtRechts: Zicht = { side: 'opp', speler: teamStoel.B };
  const sideToggle = (
    <div style={{ display: 'flex', gap: 4 }}>
      {(['me', 'opp'] as const).map((s) => {
        const on = s === side;
        const txt = s === 'me' ? myName || 'You' : opponentName || 'Opponent';
        return (
          <button key={s} onClick={() => setSide(s)} style={{ flex: 1, padding: wide ? '5px 6px' : '9px 6px', borderRadius: 9, cursor: 'pointer', border: `1px solid ${on ? TOW.goldDeep : TOW.line}`, background: on ? TOW.cardLt : 'transparent', color: on ? TOW.ink : TOW.muted, fontFamily: display, fontWeight: 600, fontSize: 13.5, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{txt}</button>
        );
      })}
    </div>
  );

  // 2 VS 2: de spelerkeuze, per team gegroepeerd (Team A: You · Ally | Team B: Opponent 1 · Opponent 2).
  // Eén tik wisselt; een lege stoel staat gestippeld en cursief, zodat je ziet waar nog een leger mist.
  // Op de telefoon 12 px: "Opponent 1" past dan net in een kwart van 375 px.
  const spelerKeuze = teamModus && (
    <div data-testid="game-spelerkeuze" style={{ display: 'flex', gap: 8 }}>
      {(['A', 'B'] as const).map((team) => (
        <div key={team} role="group" aria-label={TEAM_NAAM[team]} style={{ flex: 1, minWidth: 0 }}>
          <div style={{ ...eb, fontSize: 7.5, color: naast || teamVan(speler) === team ? TOW.goldDeep : TOW.muted, margin: '0 0 3px 2px', whiteSpace: 'nowrap' }}>{TEAM_NAAM[team]}{naast ? (team === 'A' ? ' · left' : ' · right') : ''}</div>
          <div style={{ display: 'flex', gap: 4 }}>
            {stoelenVan(team).map((st) => {
              // Naast elkaar: per team de stoel die in die kolom staat.
              const on = naast ? st === teamStoel[team] : st === speler;
              const leeg = !legers[st];
              return (
                <button key={st} onClick={() => kiesSpeler(st)} aria-pressed={on} title={leeg ? `${naam(st)} — no army yet` : naam(st)} style={{ flex: 1, minWidth: 0, padding: '8px 2px', borderRadius: 9, cursor: 'pointer', border: `1px ${leeg ? 'dashed' : 'solid'} ${on ? TOW.goldDeep : leeg ? TOW.lineStrong : TOW.line}`, background: on ? TOW.cardLt : 'transparent', color: on ? TOW.ink : TOW.muted, fontFamily: display, fontWeight: 600, fontSize: wide ? 13 : 12, fontStyle: leeg ? 'italic' : 'normal', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{naam(st)}</button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
  const kantKeuze = spelerKeuze || sideToggle;

  const battleBar = toonPanelen && (
    <BattleBar round={tracker.round} maxRound={maxRound} onRound={adjRound} vpMe={vpMe} vpOpp={vpOpp} leader={leader} myName={teamModus ? TEAM_NAAM.A : myName || 'You'} opponentName={teamModus ? TEAM_NAAM.B : opponentName || 'Opponent'} editable={editable} vertical={false} compact={!wide} />
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
      // 25-10-2026 (Joost): claim-battle zonder aanvaller/verdediger -- geen Defense-perks, War Hall voor beide.
      perks: perksVoorKant(campagne, k),
      items: campagne.items?.[k] ?? [],
      rollOff: eersteVast ? [] : rollOffVoorKant(campagne, k),
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
  // 2v2: de objectives zijn van het TEAM en staan op host (team A) of guest (team B), zodat ze één keer tellen.
  const objectivesPaneelVan = (z: Zicht) => toonPanelen && (
    <ObjectivesTracker
      zijde={teamModus ? objectiefStoel(teamVan(z.speler)) : absSeat(z.side) === 'guest' ? 'guest' : 'host'}
      naam={teamModus ? TEAM_NAAM[teamVan(z.speler)] : z.side === 'me' ? (myName || 'You') : (opponentName || 'Opponent')}
      editable={editable}
      round={tracker.round}
    />
  );
  const objectivesPaneel = objectivesPaneelVan(zicht);
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
  // Breed: compacte knop in de kopbalk (28-10-2026), zelfde maat als op de telefoon.
  const sheetKnop = (sheet || campagneSheet) && (
    <button
      onClick={() => setSheetOpen(true)}
      style={{ flexShrink: 0, border: `1px solid ${TOW.lineStrong}`, borderRadius: 9, background: TOW.cardLt, color: TOW.ink, cursor: 'pointer', padding: wide ? '4px 10px' : '6px 12px', fontFamily: display, fontSize: 12 }}
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
  // Een campagne-code (geen vier tekens) is een campagne-battle, ook zolang hij nog laadt.
  const campagneCode = !!code && !isVrijPotjeCode(code);
  // KILLS ALLEEN BIJ EEN CAMPAGNE (Joost 28-10-2026): "die kills aangeven is echt alleen puur bij campagne,
  // dat hoeft normaal niet". Ze voeden alleen de veteraan-XP van de campagne; zonder campagne geen teller.
  const killsTonen = campagneCode || !!campagne;
  const versterkingPaneelVan = (z: Zicht) => {
    const a = legerVan(z);
    const kantVanZijde: 'aanvaller' | 'verdediger' = absSeat(z.side) === 'guest' ? 'verdediger' : 'aanvaller';
    const rfMax = campagne ? versterkingVoorKant(campagne.versterking, kantVanZijde) : null;
    const rfNu = versterkingVan(a);
    // Staat er al een versterking bij, dan blijft het blok staan (om hem weg te kunnen halen).
    // Vrij potje: sinds 28-10-2026 verborgen (VERSTERKING_OVERAL). Een campagne-battle waarvoor de server
    // een versterking meegeeft, en een leger dat er al een heeft, blijven gewoon werken.
    const rfMag = !!a && (z.side === 'me' || seat === 'solo') && (!!rfNu || (campagneCode ? !!rfMax : VERSTERKING_OVERAL));
    const applyArmy = applyArmyVan(z);
    return rfMag && a && (
      <VersterkingKiezer
        key={`${sleutelVan(z)}-${rfNu ? 'aan' : 'uit'}`}
        testid="game-versterking"
        max={rfMax ?? a.versterking?.max ?? null}
        // Alleen versterkingen van hetzelfde army book. Het leger draagt de leesbare factienaam, de lijsten
        // een slug: de kiezer vergelijkt die twee, en valt terug op alle versterkingslijsten als er niets past.
        leger={null}
        factie={a.faction}
        gekozen={rfNu ? { naam: rfNu.naam, punten: rfNu.punten } : null}
        onPick={(rf) => applyArmy(voegVersterkingToe(a, rf, rfMax ?? null))}
        onWeg={() => applyArmy(zonderVersterking(a))}
      />
    );
  };
  const versterkingPaneel = versterkingPaneelVan(zicht);

  const endModal = endOpen && (
    <EndBattleOverview
      res={res}
      hostName={hostName}
      guestName={guestName}
      hostArmy={hostArmy}
      guestArmy={guestArmy}
      onClose={() => setEndOpen(false)}
      team={teamRes ? { res: teamRes, spelers: TEAM_STOELEN.map((st) => ({ stoel: st, naam: naam(st), army: legers[st] })) } : undefined}
    />
  );

  // Eén UnitCard met ALLE tracker-koppelingen; alleen de weergave (dicht/open, kiesrij) verschilt per
  // plek. Zo krijgen de telefoonlijst, de kieslijst links en de detailkaart rechts precies dezelfde props.
  const unitKaart = (z: Zicht, a: Army, u: ArmyUnit, weergave: { collapsed: boolean; onToggleCollapse?: () => void; selected?: boolean }) => {
    const t = tracker.units[unitKey(z, u.id)];
    return (
      <UnitCard key={u.id} unit={u} faction={a.faction} editable={editable} onChange={(patch) => onUnitChange(z, u.id, patch)} lost={t?.lost ?? 0} weg={t?.weg ?? false} fleeing={t?.fleeing ?? false} kills={t?.kills ?? 0} onSetLost={(lost) => setCasualty(z, u.id, lost)} onRemoved={() => setRemoved(z, u.id, !(t?.weg ?? false))} onFlee={() => toggleFleeing(z, u.id)} onSetKills={killsTonen ? (k) => setKills(z, u.id, k) : undefined} killDetails={t?.killDetails ?? []} onSetKillDetail={(i, patch) => setKillDetail(z, u.id, i, patch)} vijandUnits={vijandUnitsVan(z)} maxRound={maxRound} collapsed={weergave.collapsed} onToggleCollapse={weergave.onToggleCollapse} selected={weergave.selected} scenarioKnoppen={knoppenVoor(z, u)} toonMount={mountTabVan(z, u.id)} onToonMount={(i) => setMountTab(i == null ? null : { sleutel: sleutelVan(z), id: u.id, i })} />
    );
  };

  // Het roster als uitklapkaarten, of (zonder leger op deze kant) het leger toevoegen.
  const rosterBodyVan = (z: Zicht) => {
    const a = legerVan(z);
    return a ? (
    groepenVan(a).map((g) => (
      <div key={g.category} style={{ marginBottom: 8 }}>
        <div style={{ ...eb, fontSize: 9, color: TOW.goldDeep, margin: '12px 2px 8px' }}>{g.category}</div>
        {g.units.map((u) => unitKaart(z, a, u, { collapsed: !expanded.has(expKey(u.id)), onToggleCollapse: () => toggleExpand(expKey(u.id)) }))}
      </div>
    ))
  ) : teamModus ? (
    // 2v2: een lege stoel vul je hier, net als het tegenstander-leger in 1v1. `key` per stoel, zodat
    // half geplakte tekst niet meeverhuist naar de volgende speler.
    <ArmyPaste
      key={z.speler}
      title={z.speler === 'host' && zonderEigenNaam('host') ? 'Your army list' : `${naam(z.speler)}'s army list`}
      cta={z.speler === 'host' && zonderEigenNaam('host') ? 'Add your army' : `Add ${naam(z.speler)}'s army`}
      onSet={zetLeger[z.speler]}
    />
  ) : z.side === 'opp' ? (
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
  };
  const rosterBody = rosterBodyVan(zicht);

  // END BATTLE KLEIN (Joost 28-10-2026): "die end battle knop moet echt veel minder aanwezig, die is
  // gewoon niet zo heel belangrijk". Was een volle goudrode balk onder de units; nu een kleine knop in
  // dezelfde stijl als Leave — breed in de kopbalk, op de telefoon klein onderaan de lijst.
  const magEinde = !!(myArmy || opponentArmy || (teamModus && (allyArmy || opponent2Army)) || scenarioTest);

  // TWEE KNOPPEN NAAST ELKAAR (Joost 28-10-2026: "doe gewoon twee knoppen naast elkaar, niet exit en dan end
  // battle / leave game"). End battle telt het potje en toont de uitslag; Leave sluit het op dit toestel.
  const knopStijl: React.CSSProperties = { flexShrink: 0, border: `1px solid ${TOW.lineStrong}`, borderRadius: 9, background: 'transparent', cursor: 'pointer', padding: wide ? '4px 10px' : '0 9px', height: wide ? undefined : 32, fontFamily: display, fontSize: 12, whiteSpace: 'nowrap' };
  const stopKnoppen = (
    <>
      {magEinde && <button onClick={() => setEndOpen(true)} title="Count the Victory Points and see the result" style={{ ...knopStijl, color: TOW.inkDim }}>End battle</button>}
      <button onClick={leaveGame} title="Close this game on this device, without a result" style={{ ...knopStijl, color: TOW.muted }}>Leave</button>
    </>
  );

  // EÉN KNOP (Joost 28-10-2026: "kan het ook één knopje zijn"): het icoon toont de weergave waar je naartoe gaat.
  const weergaveKnop = !!army && (
    <button
      onClick={() => setTelefoonWeergave(telefoonWeergave === 'kies' ? 'lijst' : 'kies')}
      aria-label={telefoonWeergave === 'kies' ? 'Switch to list view: all units as cards' : 'Switch to pick view: units on top, the chosen unit below'}
      title={telefoonWeergave === 'kies' ? 'List view' : 'Pick view'}
      style={{ flexShrink: 0, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${TOW.lineStrong}`, borderRadius: 9, cursor: 'pointer', background: 'transparent', color: TOW.goldDeep }}
    >
      {telefoonWeergave === 'kies' ? (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><path d="M2 3.5h12M2 8h12M2 12.5h12" /></svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="1.8" y="1.8" width="5.4" height="3.2" rx="0.8" /><rect x="8.8" y="1.8" width="5.4" height="3.2" rx="0.8" /><rect x="1.8" y="7.2" width="12.4" height="7" rx="1" /></svg>
      )}
    </button>
  );

  // DE COMPACTE KIESLIJST (Joost 28-10-2026): "de lijst van de army units mag compacter … dat die goed aan
  // de linkerkant past, zodat je snel kan schakelen tussen de units". Eén regel per unit — aantal, naam en
  // de korte stand (dezelfde `korteStand` als de ingeklapte kaart) — in plaats van een ingeklapte
  // UnitCard met z'n eigen kader. De volledige kaart staat rechts.
  const kiesRij = (u: ArmyUnit) => {
    const t = tracker.units[unitKey(zicht, u.id)];
    const stand = korteStand(u, { lost: t?.lost, weg: t?.weg, fleeing: t?.fleeing, kills: t?.kills });
    const uit = stand.some((s) => s.t === 'Removed' || s.t === 'Destroyed');
    const gekozen = u.id === selId;
    const aantal = unitSize(u);
    // Alleen de naam en de stand (Joost 28-10-2026): een regel met snelle stats eronder voegde aan tafel
    // niets toe — de stats staan rechts op de kaart.
    return (
      <button
        key={u.id}
        type="button"
        onClick={() => kies(zicht, u.id)}
        aria-pressed={gekozen}
        style={{
          width: '100%', display: 'block', boxSizing: 'border-box',
          padding: '5px 9px', margin: '1px 0', borderRadius: 8, cursor: 'pointer', textAlign: 'left',
          border: `1px solid ${gekozen ? TOW.goldDeep : 'transparent'}`,
          background: gekozen ? TOW.cardLt : 'transparent',
          boxShadow: gekozen ? `inset 3px 0 0 ${TOW.goldDeep}` : 'none',
          opacity: uit ? 0.7 : 1,
        }}
      >
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: display, fontWeight: gekozen ? 700 : 600, fontSize: 14, color: uit ? TOW.muted : TOW.ink, textDecoration: uit ? 'line-through' : 'none' }}>
            {aantal > 1 && <span style={{ color: TOW.goldDeep }}>{aantal}× </span>}{u.name}
          </span>
          {stand.length > 0 && (
            <span style={{ flexShrink: 0, fontFamily: serif, fontSize: 11.5, whiteSpace: 'nowrap' }}>
              {stand.map((st, i) => (
                <span key={st.t} style={{ color: st.rood ? TOW.blood : TOW.muted }}>{i > 0 ? ' · ' : ''}{st.t}</span>
              ))}
            </span>
          )}
        </span>
      </button>
    );
  };

  // DE PIL (telefoon, pick-weergave, en de kolommen naast elkaar): een unit als knopje, met een stip als hij
  // geraakt is (goud) of vlucht (rood).
  const pil = (z: Zicht, u: ArmyUnit) => {
    const t = tracker.units[unitKey(z, u.id)];
    const stand = korteStand(u, { lost: t?.lost, weg: t?.weg, fleeing: t?.fleeing, kills: t?.kills });
    const uit = stand.some((st) => st.t === 'Removed' || st.t === 'Destroyed');
    const vlucht = stand.some((st) => st.t === 'Fleeing');
    const geraakt = !uit && (t?.lost ?? 0) > 0;
    const aan = u.id === selIdVan(z);
    const aantal = unitSize(u);
    return (
      <button
        key={u.id}
        type="button"
        onClick={() => kies(z, u.id)}
        aria-pressed={aan}
        title={stand.map((st) => st.t).join(' · ') || undefined}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 5, maxWidth: '100%', boxSizing: 'border-box',
          padding: '5px 11px', borderRadius: 999, cursor: 'pointer',
          border: `1px solid ${aan ? TOW.goldDeep : TOW.line}`,
          background: aan ? 'rgba(184,134,47,0.16)' : TOW.cardLt,
          opacity: uit ? 0.55 : 1,
        }}
      >
        {(vlucht || geraakt) && <span aria-hidden style={{ width: 6, height: 6, borderRadius: 3, flexShrink: 0, background: vlucht ? TOW.blood : TOW.goldDeep }} />}
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: display, fontWeight: aan ? 700 : 600, fontSize: 12.5, color: aan ? TOW.ink : uit ? TOW.muted : TOW.inkDim, textDecoration: uit ? 'line-through' : 'none' }}>
          {aantal > 1 && <span style={{ color: TOW.goldDeep }}>{aantal}× </span>}{u.name}
        </span>
      </button>
    );
  };
  // BREED: NAAST ELKAAR (Joost 02-11-2026). Zelfde soort knop: het icoon toont de weergave waar je naartoe gaat.
  const breedKnop = !!(teamModus ? (myArmy || allyArmy || opponentArmy || opponent2Army) : (myArmy || opponentArmy)) && (
    <button
      onClick={() => setBreedWeergave(breedWeergave === 'naast' ? 'kies' : 'naast')}
      aria-label={breedWeergave === 'naast' ? 'Switch to one army: unit list left, the chosen unit right' : 'Switch to both armies side by side'}
      title={breedWeergave === 'naast' ? 'One army' : 'Both armies side by side'}
      style={{ flexShrink: 0, width: 30, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${TOW.lineStrong}`, borderRadius: 9, cursor: 'pointer', background: 'transparent', color: TOW.goldDeep }}
    >
      {breedWeergave === 'naast' ? (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="1.8" y="2" width="4.4" height="12" rx="0.8" /><rect x="7.6" y="2" width="6.6" height="12" rx="0.8" /></svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="1.6" y="1.8" width="5.6" height="2.6" rx="0.7" /><rect x="8.8" y="1.8" width="5.6" height="2.6" rx="0.7" /><rect x="1.6" y="6" width="5.6" height="8.2" rx="0.9" /><rect x="8.8" y="6" width="5.6" height="8.2" rx="0.9" /></svg>
      )}
    </button>
  );

  // ════════════════ WIDE — compacte kopbalk + kieslijst links / unit rechts ════════════════
  // Joost 28-10-2026 (Galaxy Fold 7): "links staat wat normaal bovenin staat … hou dat gewoon in de header
  // bovenin, maar wel vrij compact", en "mijn lijst met units links en de stats rechts, in plaats van het
  // uitklappen". De zijbalk is dus een kopbalk van twee regels geworden:
  //   rij 1 — wie/welk potje: code (of Solo) · You/Opponent · Battlefield · Leave
  //   rij 2 — de stand: ronde/VP (horizontaal) naast de reminder-balk (weer, perks, Wrath)
  // Daaronder twee panelen die elk zelf scrollen: links objectives, de legerkop, de units als kiesbare
  // dichte rijen en End battle (vast onderaan); rechts de gekozen unit volledig, met al z'n knoppen.
  if (wide) {
    const waiting = !!(code && seat === 'host' && !opponentArmy);
    // NAAST ELKAAR (Joost 02-11-2026): twee gelijke kolommen, links jouw kant (2v2: team A), rechts de
    // tegenstander (team B). Elke kolom is de pick-weergave van de telefoon: de legerkop en de unit-pillen
    // vast bovenaan, daaronder in een eigen scrollvlak de objectives, de versterking en de gekozen unit.
    const kolom = (z: Zicht) => {
      const a = legerVan(z);
      const sl = sleutelVan(z);
      const sel = a?.units.find((u) => u.id === selIdVan(z)) ?? null;
      const kop = teamModus ? legerKop(z.speler) : z.side === 'me' ? (myName || 'You') : (opponentName || 'Opponent');
      return (
        <div key={z.side} data-testid={`game-kolom-${z.side}`} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', borderLeft: z.side === 'opp' ? `1px solid ${TOW.lineStrong}` : 'none' }}>
          <div style={{ flexShrink: 0, padding: '7px 10px 8px', borderBottom: `1px solid ${TOW.line}`, background: TOW.panel }}>
            <div style={{ ...eb, fontSize: 8, color: TOW.goldDeep, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {kop}{a ? ` · ${afieldVan(z)}/${a.units.length} afield` : ''}
            </div>
            {a && (
              <>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0, marginTop: 1 }}>
                  <span style={{ flex: '0 1 auto', minWidth: 0, fontFamily: display, fontWeight: 700, fontSize: 15, color: TOW.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.name}</span>
                  <span style={{ flex: '0 1 auto', minWidth: 0, fontFamily: serif, fontStyle: 'italic', fontSize: 12, color: TOW.parchDim, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.faction || ''}{a.points != null ? ` · ${a.points} pts` : ''}</span>
                </div>
                <div style={{ maxHeight: '30vh', overflowY: 'auto', display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 7 }}>
                  {groepenVan(a).flatMap((gr) => gr.units).map((u) => pil(z, u))}
                </div>
              </>
            )}
          </div>
          {/* Smalle kolom: minder rand en compacte stattabellen, zodat de statline zonder scrollen past. */}
          <div ref={(el) => { kolomRefs.current[sl] = el; }} className="tow-field" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '6px 5px 24px' }}>
            <SmalleKolom.Provider value>
              {objectivesPaneelVan(z)}
              {versterkingPaneelVan(z)}
              {a ? (sel ? unitKaart(z, a, sel, { collapsed: false }) : null) : rosterBodyVan(z)}
            </SmalleKolom.Provider>
          </div>
        </div>
      );
    };
    return (
      <div ref={rootRef} className="tow-field" style={{ height: '100%', display: 'flex', flexDirection: 'column', color: TOW.ink }}>
        <div className="tow-leather" style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 6, padding: '6px 10px', borderBottom: `1px solid ${TOW.lineStrong}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <CodeBadge code={code} waiting={waiting} solo={seat === 'solo'} />
            {!(naast && !teamModus) && <div style={teamModus ? { flex: '0 1 560px', minWidth: 300 } : { flex: '0 1 380px', minWidth: 180 }}>{kantKeuze}</div>}
            {breedKnop}
            <div style={{ flex: 1 }} />
            {sheetKnop}
            {stopKnoppen}
          </div>
          {battleBar && (
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 6 }}>
              <div style={{ flex: '1 1 380px', minWidth: 0, maxWidth: 560 }}>{battleBar}</div>
              <div style={{ flex: '1 1 260px', minWidth: 0 }}>{reminderStrip}</div>
            </div>
          )}
        </div>

        {naast ? (
          <div data-testid="game-naast" style={{ flex: 1, minHeight: 0, display: 'flex' }}>
            {kolom(zichtLinks)}
            {kolom(zichtRechts)}
          </div>
        ) : (
        <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
          {/* LINKS — objectives, legerkop, kieslijst, End battle. SMALLER (Joost 28-10-2026: "die kolom is te
              breed … zodat je iets meer ruimte overhoudt rechts voor unit stats"): de rijen zijn één regel, dus
              ~30% van de breedte is genoeg; rechts krijgt de rest. */}
          <div style={{ width: '34%', minWidth: 240, maxWidth: 360, flexShrink: 0, display: 'flex', flexDirection: 'column', borderRight: `1px solid ${TOW.lineStrong}`, background: TOW.panel }}>
            <div data-testid="game-unitlijst" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '8px 8px 12px' }}>
              {objectivesPaneel}
              {army ? (
                <>
                  <div style={{ margin: '2px 2px 4px' }}>
                    <div style={{ ...eb, fontSize: 8, color: TOW.goldDeep, marginBottom: 2 }}>{teamModus ? legerKop(speler) : side === 'me' ? 'Your army' : "Opponent's army"} · {afield}/{army.units.length} afield</div>
                    <div style={{ fontFamily: display, fontWeight: 700, fontSize: 15, color: TOW.ink, lineHeight: 1.15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{army.name}</div>
                    <div style={{ fontFamily: serif, fontStyle: 'italic', fontSize: 12, color: TOW.parchDim }}>{army.faction || ''}{army.points != null ? ` · ${army.points} pts` : ''}</div>
                  </div>
                  {versterkingPaneel}
                  {groups.map((g) => (
                    <div key={g.category} style={{ marginBottom: 2 }}>
                      <div style={{ ...eb, fontSize: 8, color: TOW.goldDeep, margin: '9px 2px 2px' }}>{g.category}</div>
                      {g.units.map((u) => kiesRij(u))}
                    </div>
                  ))}
                </>
              ) : (
                <div style={{ padding: '10px 2px 0', fontFamily: serif, fontStyle: 'italic', fontSize: 13.5, color: TOW.muted }}>
                  {teamModus ? `No army for ${naam(speler)} yet — add one on the right.` : side === 'me' ? 'No army yet — add yours on the right.' : 'No opponent army yet — add one on the right.'}
                </div>
              )}
            </div>
          </div>

          {/* RECHTS — de gekozen unit volledig (of het leger toevoegen als deze kant er nog geen heeft) */}
          <div ref={detailRef} data-testid="game-unitdetail" className="tow-field" style={{ flex: 1, minWidth: 0, overflowY: 'auto' }}>
            <div style={{ maxWidth: 820, margin: '0 auto', padding: '10px 12px 28px' }}>
              {!army ? rosterBody : selUnit ? (
                unitKaart(zicht, army, selUnit, { collapsed: false })
              ) : (
                <div style={{ padding: '48px 12px', textAlign: 'center', fontFamily: serif, fontStyle: 'italic', fontSize: 15, color: TOW.muted }}>
                  Select a unit on the left to see its stats
                </div>
              )}
            </div>
          </div>
        </div>
        )}
        {sheetModal}
        {endModal}
      </div>
    );
  }

  // ════════════════ PHONE ════════════════
  // COMPACTE KOP (Joost 28-10-2026: "een enorme header, de bovenste 20% is weg"). Geen "Game"/"Local game"
  // meer (dat zie je aan de tabbalk; een gedeelde code blijft staan, die deel je), en geen regel "You — Dark
  // Elves · 1000 pts · 6/6 afield". Twee regels: de kant/speler-keuze met de weergaveknop, en daaronder ronde
  // en VP compact naast End battle en Leave.
  //
  // TWEE WEERGAVEN. "List" is de lijst met uitklapkaarten. "Pick" (Joost: "onderaan die kaart met de unit
  // info moet gewoon vast zijn … maak daar gewoon knoppen van, die pillen") zet alle units als pillen
  // bovenaan, zonder Characters/Core/Special/Rare, en daaronder de gekozen unit in een eigen scrollvlak:
  // een andere unit kiezen kan altijd, zonder eerst terug te scrollen. De keuze blijft per toestel bewaard.
  const kiesModus = telefoonWeergave === 'kies' && !!army;
  return (
    <div ref={rootRef} className="tow-field" style={{ height: '100%', display: 'flex', flexDirection: 'column', color: TOW.ink }}>
      <div className="tow-leather" style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 6, padding: '7px 10px', borderBottom: `1px solid ${TOW.lineStrong}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          {code && seat !== 'solo' && (
            <span title={seat === 'host' && !opponentArmy ? 'Waiting for opponent…' : 'Game code'} style={{ flexShrink: 0, fontFamily: display, fontWeight: 700, fontSize: 14, color: TOW.goldDeep, letterSpacing: '0.14em' }}>{code}</span>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>{kantKeuze}</div>
          {weergaveKnop}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <div style={{ flex: 1, minWidth: 0 }}>{battleBar}</div>
          {(sheet || campagneSheet) && (
            <button onClick={() => setSheetOpen(true)} style={{ ...knopStijl, background: TOW.cardLt, color: TOW.ink }}>Battlefield</button>
          )}
          {stopKnoppen}
        </div>
        {battleBar && reminderStrip}
      </div>

      {kiesModus ? (
        <>
          <div style={{ flexShrink: 0, maxHeight: '32vh', overflowY: 'auto', display: 'flex', flexWrap: 'wrap', gap: 5, padding: '8px 10px', borderBottom: `1px solid ${TOW.line}` }}>
            {groups.flatMap((gr) => gr.units).map((u) => pil(zicht, u))}
          </div>
          <div ref={kiesKaartRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '8px 10px 24px' }}>
            {objectivesPaneel}
            {versterkingPaneel}
            {selUnit && army ? unitKaart(zicht, army, selUnit, { collapsed: false }) : null}
          </div>
        </>
      ) : (
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '4px 12px 28px', maxWidth: 620, width: '100%', margin: '0 auto' }}>
          {objectivesPaneel}
          {versterkingPaneel}
          {rosterBody}
        </div>
      )}
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

/** Code van het potje in de brede kopbalk (28-10-2026: compact, zonder kader; Leave staat nu rechts in
 *  dezelfde rij). Het label zegt ook of je nog op de tegenstander wacht. */
function CodeBadge({ code, waiting, solo = false }: { code: string | null; waiting: boolean; solo?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0, minWidth: 0 }}>
      <Shield c={TOW.goldDeep} size={18} />
      <div style={{ minWidth: 0 }}>
        <div style={{ ...eb, fontSize: 7.5, color: waiting ? TOW.goldDeep : TOW.muted, whiteSpace: 'nowrap' }}>{waiting ? 'Waiting for opponent…' : code && !solo ? 'Shared game' : 'Local game'}</div>
        <div style={{ fontFamily: display, fontWeight: 700, fontSize: 16, lineHeight: 1.15, color: code ? TOW.goldDeep : TOW.ink, letterSpacing: code ? '0.18em' : 0, whiteSpace: 'nowrap' }}>{code || 'Solo'}</div>
      </div>
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
  // New Recruit (30-10-2026): via een tijdelijke builder-lijst naar een volwaardig leger, zodat de
  // units hun regels, profielen, rijdiers en magic items krijgen. Wordt niet in "My lists" bewaard.
  // Een OWB-export blijft gaan zoals altijd.
  const { lores } = useData();
  const loreKeys = useMemo(() => Object.keys(lores ?? {}), [lores]);
  const nr = useNewRecruitLeger(paste, loreKeys);
  const army = nr.isNR ? nr.resultaat?.army ?? null : paste.trim() ? enrichArmyTroopTypes(parseArmyList(paste), troopTypeFor) : null;
  return (
    <div style={{ padding: '12px 2px' }}>
      <div style={{ ...eb, fontSize: 9, color: TOW.muted, marginBottom: 6 }}>{title}</div>
      <ArmyListPicker onPick={onSet} />
      <textarea value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="Paste the Old World Builder or New Recruit export…" rows={7} style={{ width: '100%', borderRadius: 10, border: `1px solid ${TOW.lineStrong}`, background: TOW.cardLt, color: TOW.ink, padding: '10px 12px', fontFamily: serif, fontSize: 13, lineHeight: 1.4, boxSizing: 'border-box', resize: 'vertical' }} />
      <NewRecruitResultaat plak={nr} />
      <OwbInstructions defaultOpen={!paste.trim()} />
      <button onClick={() => army && onSet(army)} disabled={!army} style={{ marginTop: 10, border: 'none', borderRadius: 11, cursor: 'pointer', padding: '11px 18px', width: '100%', background: `linear-gradient(180deg, ${TOW.goldBright}, ${TOW.gold} 55%, ${TOW.goldDeep})`, color: TOW.onGrad, fontFamily: display, fontWeight: 700, fontSize: 14, opacity: army ? 1 : 0.5 }}>{cta}</button>
    </div>
  );
}
