import { useEffect, useMemo, useRef, useState } from 'react';
import { usePersistentState } from '../../store';
import { TOW, towFont, engraved } from '../../design/tow';
import { validate, type OwbArmy, type OwbUnit, type BuilderList, type MagicItemsData, type CompositionRules } from '../../lib/owbBuilder';
import { compName } from '../../lib/armies';
import { troopTypeName } from '../../lib/troopTypes';
import { BuilderWorkspace } from './BuilderWorkspace';
import { BuilderFlow } from '../builder/BuilderFlow';
import { NewListSetup, type NewListValues } from './NewListSetup';
import { CeledonPanel } from './CeledonPanel';
import { LockedListView } from './LockedListView';
import { ListSettings } from './ListSettings';
import { useCampagnes, staatOpSlot } from '../../lib/campaign';
import { useListSync } from '../../listSync';
import { setPersisted } from '../../store';
import { COMPOSITION_RULES } from '../../lib/owbBuilder';
import { useBackClose } from '../../lib/backStack';
import { useData } from '../../data';
import { getRuleIndex, resolveOptionSlug, resolveRuleSlug, splitCompoundLabel } from '../../lib/armyRules';
import { useUI } from '../../state';
import { applyOverlayItems, catalogueFor, applyOverlayMagicText, applyOverlayMountText, applyOverlayStatIndex, hasOverlay, isOverlay, overlayCompsFor, overlayStatsFor, OVERLAY_FILES, type CompositionOverlay, type MountProfileText } from '../../lib/overlays';
import { InfoSheet, type InfoSheetData } from './InfoSheet';
import type { MagicText } from '../../lib/builderToArmy';
import type { UnitProfile } from '../../types';

const BASE = import.meta.env.BASE_URL;
const eb = engraved as React.CSSProperties;
const goldGrad = `linear-gradient(180deg, ${TOW.goldBright} 0%, ${TOW.gold} 55%, ${TOW.goldDeep} 100%)`;

// Multi-army list builder. This file owns the army registry (index.json), each army's composition +
// item-list metadata (the-old-world.json), an on-demand per-army catalogue cache, and the "My lists"
// collection (saved locally). The open list is edited in the responsive <BuilderWorkspace> (Claude
// Design's PC-columns / mobile-sheets builder on our OWB data); each list carries its own army.
const FALLBACK_ARMY = 'dark-elves';

interface SavedList extends BuilderList {
  id: string; name: string; army: string; createdAt: number; updatedAt: number; groupId?: string | null;
  // Campagne-koppeling (De Grensvorsten) — optioneel, zodat bestaande opgeslagen lijsten geldig blijven
  // en de list-sync (jsonb) deze velden vanzelf meeneemt.
  campaign?: boolean; campaignSpeler?: string; campaignNaam?: string; campaignFase?: number;
  /** Campagne: de BEREKENDE puntensom van deze lijst (incl. magic items). `points` is alleen het
   *  DOEL (de fase-cap waarop de lijst is aangemaakt); de campagne heeft de echte som nodig om te
   *  toetsen of de lijst binnen 500 + 250×(Act−1) blijft. Alleen gezet voor campagne-lijsten, en
   *  alleen als de som betrouwbaar te berekenen is (zie het effect in ListBuilder). */
  computedPoints?: number;
}
const newId = (p: string) => `${p}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;

// OWB's normalizeRuleName (rules index is keyed by this) + a final-word singular fallback.
interface StatRow { Name: string; M: string; WS: string; BS: string; S: string; T: string; W: string; I: string; A: string; Ld: string }
let statIndexCache: Record<string, { stats?: StatRow[]; troopType?: string }> | null = null;
type MountText = Record<string, MountProfileText>;
const normMountTag = (s: string) => (s || '').toLowerCase().replace(/ *\([^)]*\) */g, '')
  .replace(/[{}[\]*]/g, '').replace(/^[0-9]+x /g, '').replace(/\s+/g, ' ').trim();
const normMountProfile = (s: string) => (s || '').toLowerCase().replace(/\{[^}]*\}/g, '')
  .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

// Per-army metadata from the-old-world.json: which compositions it offers + which magic-item lists.
/** Eén huurlingen-bron: units die je uit `army` mag inhuren. */
interface MercBron { army: string; units: string[] }
interface ArmyMeta {
  comps: string[];
  items: string[];
  /** Welke huurlingen deze army per COMPOSITIE mag inhuren — OWB's eigen veld uit
   *  the-old-world.json, dat we tot 04-08 wegggooiden bij het inlezen. De units zelf staan gewoon in
   *  de catalogus van hun eigen leger; dit is puur een verwijzing. Vandaar dat een Dark Elves-speler
   *  geen Badlands Ogre Bulls kon toevoegen terwijl de regels dat wel toestaan. */
  mercenaries: Record<string, MercBron[]>;
}

export function ListBuilder() {
  // ── The redesigned builder is now the DEFAULT ─────────────────────────────────────────────────
  // `src/components/builder/` replaces this screen's workspace: compact roster on a phone, three-pane
  // layout on a wide screen. The old `BuilderWorkspace` is still in the bundle and still reachable by
  // setting `tow:builder-v2` to false, purely as a fallback if something turns out to be broken in
  // the field — not as an opt-in. Once the new flow has proven itself, both the flag and
  // BuilderWorkspace can go.
  const [useV2] = usePersistentState<boolean>('tow:builder-v2', true);
  const { rules, lores, setRuleOverlay } = useData();
  const { openRule } = useUI();
  const ruleIdx = useMemo(() => getRuleIndex(rules ?? {}), [rules]);

  const [armies, setArmies] = useState<{ slug: string; name: string }[]>([]);
  const [metaByArmy, setMetaByArmy] = useState<Record<string, ArmyMeta>>({});
  const [catalogues, setCatalogues] = useState<Record<string, OwbArmy>>({}); // slug → catalogue (on demand)
  const [itemsData, setItemsData] = useState<MagicItemsData | null>(null);
  /** De 0-X-beperkingen per compositie (OWB's rules.js, gesynchroniseerd). Null tot geladen: dan
   *  wordt er simpelweg nog niet op getoetst in plaats van ten onrechte te waarschuwen. */
  const [compRules, setCompRules] = useState<CompositionRules | null>(null);
  const [statIdx, setStatIdx] = useState<Record<string, { stats?: StatRow[]; troopType?: string }> | null>(statIndexCache);
  const [baseMountText, setBaseMountText] = useState<MountText>({});
  // Magic-item flavour + rules text, keyed by item slug. The rule SCRAPE has no page for magic items at
  // all, so this file is the only source for what an item does — without it the eye on every magic item
  // and banner has nothing to open.
  const [baseMagicText, setBaseMagicText] = useState<MagicText>({});
  const [mountInfo, setMountInfo] = useState<InfoSheetData | null>(null);
  const [lists, setLists] = usePersistentState<SavedList[]>('tow:lists', []);
  const [groups, setGroups] = usePersistentState<{ id: string; name: string }[]>('tow:list-groups', []);
  const [activeId, setActiveId] = usePersistentState<string | null>('tow:builder-active', null);
  const [setupOpen, setSetupOpen] = useState(false);
  /** Open het instellingen-blad van de open lijst (naam + army composition). */
  const [instellingenOpen, setInstellingenOpen] = useState(false);
  // De campagne(s) van het ingelogde account — bepaalt de band bovenaan en of een lijst op slot staat.
  const { actief: campagne } = useCampagnes();
  const sync = useListSync();
  const [dragOver, setDragOver] = useState<string | null>(null); // section id being hovered (group id, or '__ungrouped__')
  const [dragOverCard, setDragOverCard] = useState<{ id: string; before: boolean } | null>(null); // card hovered during a reorder drag (+ which edge)
  const [collapsed, setCollapsed] = usePersistentState<string[]>('tow:list-groups-collapsed', []); // collapsed section ids
  const toggleCollapse = (id: string) => setCollapsed((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));

  // In-app Back: each navigable layer owns one history entry (deepest registers last → handled first).
  useBackClose(!!activeId, () => setActiveId(null)); // open builder → back to My lists
  useBackClose(setupOpen, () => setSetupOpen(false)); // new-list dialog

  // Army registry + per-army comps/items + the army-agnostic stat index + magic-items data.
  useEffect(() => {
    fetch(`${BASE}owb/index.json`).then((r) => r.json()).then((idx) => {
      if (Array.isArray(idx?.armies)) setArmies(idx.armies.map((a: { slug: string; name: string }) => ({ slug: a.slug, name: a.name })));
    }).catch(() => {});
    fetch(`${BASE}owb/composition-rules.json`).then((r) => r.json()).then((r) => setCompRules(r)).catch(() => {});
    fetch(`${BASE}owb/the-old-world.json`).then((r) => r.json()).then((m) => {
      const map: Record<string, ArmyMeta> = {};
      for (const a of (m.armies ?? [])) map[a.id] = {
        comps: Array.isArray(a.armyComposition) ? a.armyComposition : [a.id],
        items: Array.isArray(a.items) ? a.items : [],
        mercenaries: (a.mercenaries && typeof a.mercenaries === 'object') ? a.mercenaries : {},
      };
      setMetaByArmy(map);
    }).catch(() => {});
    fetch(`${BASE}owb/magic-items.json`).then((r) => r.json()).then(setItemsData).catch(() => setItemsData(null));
    fetch(`${BASE}owb/mount-text.json`).then((r) => r.json()).then(setBaseMountText).catch(() => {});
    fetch(`${BASE}owb/magic-item-text.json`).then((r) => r.json()).then(setBaseMagicText).catch(() => {});
    if (statIndexCache) setStatIdx(statIndexCache);
    else fetch(`${BASE}owb/rules-index.json`).then((r) => r.json()).then((idx) => { statIndexCache = idx; setStatIdx(idx); }).catch(() => {});
  }, []);

  // One-time migration: fold an earlier single saved list (`tow:builder-de`) into the collection.
  useEffect(() => {
    if (lists.length > 0) return;
    try {
      const legacy = JSON.parse(localStorage.getItem('tow:builder-de') || 'null');
      if (legacy && Array.isArray(legacy.entries) && legacy.entries.length) {
        const id = newId('l');
        setLists([{ id, name: 'My list', army: FALLBACK_ARMY, composition: legacy.composition || 'dark-elves', rule: legacy.rule || 'open-war', points: legacy.points || 2000, entries: legacy.entries, createdAt: Date.now(), updatedAt: Date.now() }]);
        localStorage.removeItem('tow:builder-de');
      }
    } catch { /* ignore */ }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps


  // ── Composition overlays (Renegade Legacy Pack) ────────────────────────────────────────────────
  // Een pack is een PRIJS-patch op de OWB-catalogus, per compositie-id. We laden ze voor de compositie
  // van ELKE opgeslagen lijst, niet alleen de open lijst: de puntensom die de campagne beoordeelt moet
  // exact het getal zijn dat de builder toont, en de builder toont de herprijsde versie. Deed hij dat
  // niet, dan zag je "496/500 legal" in de builder en "501/500, over de cap" in de campagne-band.
  // Een ontbrekend of kapot bestand degradeert naar "geen overlay", zodat een slechte deploy nooit
  // iemand zijn lijst kan blokkeren.
  const [overlays, setOverlays] = useState<Record<string, CompositionOverlay>>({});
  useEffect(() => {
    const nodig = Array.from(new Set(lists.map((l) => l.composition).filter((c) => c && hasOverlay(c) && !overlays[c])));
    if (nodig.length === 0) return;
    let cancelled = false;
    Promise.all(nodig.map((comp) => fetch(`${BASE}renegade/${OVERLAY_FILES[comp]}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => (isOverlay(j) ? ([comp, j] as const) : null))
      .catch(() => null)))
      .then((paren) => {
        if (cancelled) return;
        const add: Record<string, CompositionOverlay> = {};
        for (const pr of paren) if (pr) add[pr[0]] = pr[1];
        if (Object.keys(add).length) setOverlays((m) => ({ ...m, ...add }));
      });
    return () => { cancelled = true; };
  }, [lists, overlays]);

  /** De puntensom van een lijst zoals de BUILDER hem berekent — inclusief de herprijzing van een
   *  Renegade-compositie. `null` = nog niet te bepalen (catalogus of overlay nog niet binnen); dan
   *  schrijven we liever niets dan een verkeerd getal. */
  const puntenVan = (l: SavedList): number | null => {
    const cat = catalogues[l.army];
    if (!cat || !itemsData) return null;
    let c: OwbArmy = cat;
    let items: MagicItemsData = itemsData;
    let ov: CompositionOverlay | null = null;
    if (hasOverlay(l.composition)) {
      ov = overlays[l.composition] ?? null;
      if (!ov || ov.baseArmy !== l.army) return null; // overlay nodig maar (nog) niet bruikbaar
      items = applyOverlayItems(itemsData, ov);
    }
    c = catalogueFor(cat, l.composition, ov);
    return validate(l, (k, id) => c[k]?.find((u) => u.id === id), items).total;
  };

  // ── Campagne: de ECHTE puntensom meeschrijven (`computedPoints`) ────────────────────────────────
  // De campagne moet kunnen toetsen of een campagne-lijst binnen de fase-cap valt, maar `points` is
  // enkel het DOEL waarop de lijst is aangemaakt — niet de som. Dit scherm is de betrouwbaarste plek:
  // het bezit `tow:lists`, laadt de catalogus én de overlay van elke army/compositie die voorkomt, dus
  // de som klopt inclusief items en herprijzing — ook voor lijsten die je niet openslaat (bv. van een
  // ander device gesynct). `updatedAt` bumpen we bewust niet (afgeleide waarde, geen bewerking); de
  // list-sync pikt de wijziging op via de snapshot en duwt het veld mee naar `tow_lists`.
  useEffect(() => {
    const sommen = new Map<string, number>();
    for (const l of lists) {
      if (!l.campaign) continue;
      const t2 = puntenVan(l);
      if (t2 != null && l.computedPoints !== t2) sommen.set(l.id, t2);
    }
    if (sommen.size === 0) return;
    setLists((ls) => ls.map((l) => {
      const t2 = sommen.get(l.id);
      return t2 === undefined ? l : { ...l, computedPoints: t2 };
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lists, catalogues, itemsData, overlays, setLists]);

  // ── Campagne: de lijst wordt AUTOMATISCH aangemaakt ─────────────────────────────────────────────
  // Er is niets te kiezen — factie, puntencap en compositie komen alle drie van de campagne — dus een
  // knop "start mijn lijst" vroeg alleen een klik zonder inhoud. De naam is achteraf te wijzigen via
  // het instellingen-blad. Voorwaarden voordat we schrijven:
  //   * de factie staat VAST (anders zou een speler die zijn keuze nog wijzigt een lijst voor het
  //     verkeerde leger krijgen) en bestaat in de catalogus;
  //   * de catalogus-metadata is binnen (we hebben de composities van dat leger nodig);
  //   * de list-sync is uitgereconcilieerd — anders maakt een tweede apparaat een dubbele lijst
  //     voordat het de bestaande uit de cloud heeft gezien.
  // De campagne-lijsten van de ACTIEVE campagne, en of hun leger nog klopt met de campagne-factie.
  // Dat laatste kan verschuiven: wie zich vergist bij het kiezen van zijn factie en het door de
  // grensmaster laat terugzetten, houdt anders een lijst voor het verkeerde leger — en de factie is
  // (terecht) niet in de builder te wijzigen, dus dan zit je vast.
  const factieSlug = campagne?.speler.factieSlug ?? null;
  const campagneLijsten = campagne ? lists.filter((l) => l.campaign && l.campaignSpeler === campagne.speler.id) : [];
  const verkeerdLeger = factieSlug ? campagneLijsten.filter((l) => l.army !== factieSlug) : [];

  const autoGedaan = useRef<string | null>(null);
  /** Maak de campagne-lijst aan (en gooi eventueel meegegeven verouderde lijsten weg). */
  const maakCampagneLijst = (weg: Set<string> = new Set()) => {
    if (!campagne || !factieSlug) return;
    // Bewust metaByArmy en niet compsByArmy: die laatste wordt hieronder pas berekend, en de
    // overlay-composities (Renegade-pack) zijn hier toch niet wat je als campagne-default wilt.
    const comps = metaByArmy[factieSlug]?.comps ?? [factieSlug];
    const regels = campagne.compositie.filter((id) => COMPOSITION_RULES.some((r) => r.id === id));
    const id = newId('l');
    setLists((ls) => [{
      id,
      name: `${campagne.label} army`,
      army: factieSlug,
      composition: comps[0] ?? factieSlug,
      rule: regels[0] ?? 'open-war',
      points: campagne.puntenCap,
      entries: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      campaign: true,
      campaignSpeler: campagne.speler.id,
      campaignNaam: campagne.speler.naam,
      campaignFase: campagne.fase,
    }, ...ls.filter((l) => !weg.has(l.id))]);
  };

  useEffect(() => {
    if (!campagne || !factieSlug) return;
    if (sync.status === 'syncing') return;
    if (armies.length === 0 || Object.keys(metaByArmy).length === 0) return;
    if (!campagne.factieVast || !armies.some((a) => a.slug === factieSlug)) return;
    // Sleutel op campagne + factie: verschuift de factie, dan mag dit opnieuw draaien.
    const sleutel = `${campagne.key}:${factieSlug}`;
    if (autoGedaan.current === sleutel) return;

    if (campagneLijsten.some((l) => l.army === factieSlug)) { autoGedaan.current = sleutel; return; }
    // Een LEGE lijst voor het verkeerde leger is niets waard: vervang 'm stil. Zit er werk in, dan
    // blijft hij staan en biedt het paneel de keuze — iemands units gooien we niet ongevraagd weg.
    if (verkeerdLeger.some((l) => (l.entries?.length ?? 0) > 0)) return;
    autoGedaan.current = sleutel;
    maakCampagneLijst(new Set(verkeerdLeger.map((l) => l.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campagne, factieSlug, sync.status, armies, metaByArmy, lists]);

  /** Herstel na een factie-wissel waar wél werk in de oude lijst zit: de oude lijst blijft bestaan
   *  als GEWONE lijst (niets weg) en er komt een nieuwe campagne-lijst voor het juiste leger. */
  const herstelCampagneLijst = () => {
    if (!campagne || !factieSlug) return;
    const oud = new Set(verkeerdLeger.map((l) => l.id));
    setLists((ls) => ls.map((l) => (oud.has(l.id)
      ? { ...l, campaign: undefined, campaignSpeler: undefined, campaignNaam: undefined, campaignFase: undefined, computedPoints: undefined, updatedAt: Date.now() }
      : l)));
    autoGedaan.current = null; // het effect hierboven maakt de juiste lijst aan
  };

  // ── Campagne: de puntenlimiet van een campagne-lijst volgt de Act ───────────────────────────────
  // `points` is het doel waartegen de builder valideert. Voor een campagne-lijst is dat NIET vrij: het
  // is de fase-cap (500 + 250×(Act−1)). Schuift de Act op, dan moet het doel mee, anders staat een
  // legale lijst van 750 punten in Act 2 "over budget". Dit hoort hier en niet in een builder-scherm:
  // ListBuilder bezit `tow:lists`, dus het geldt in elke builder-versie en ook voor een lijst die je
  // niet openslaat. Alleen de lijst van de ACTIEVE campagne — een lijst van een andere campagne heeft
  // een andere cap en wordt hier dus met rust gelaten.
  useEffect(() => {
    if (!campagne) return;
    const raak = lists.filter((l) => l.campaign && l.campaignSpeler === campagne.speler.id && l.points !== campagne.puntenCap);
    if (raak.length === 0) return;
    const ids = new Set(raak.map((l) => l.id));
    setLists((ls) => ls.map((l) => (ids.has(l.id) ? { ...l, points: campagne.puntenCap } : l)));
  }, [campagne, lists, setLists]);

  const active = lists.find((l) => l.id === activeId) || null;

  // Load the ACTIVE list's army catalogue on demand (cache by slug) before opening the workspace.
  const activeArmySlug = active?.army ?? null;
  useEffect(() => {
    if (!activeArmySlug || catalogues[activeArmySlug]) return;
    let cancelled = false;
    fetch(`${BASE}owb/${activeArmySlug}.json`).then((r) => r.json()).then((c) => { if (!cancelled) setCatalogues((m) => ({ ...m, [activeArmySlug]: c })); }).catch(() => {});
    return () => { cancelled = true; };
  }, [activeArmySlug, catalogues]);

  // ── Huurlingen ─────────────────────────────────────────────────────────────────────────────────
  // Een huurling staat in de catalogus van ZIJN EIGEN leger; de metadata zegt alleen wie hem mag
  // inhuren, per compositie. Dus eerst die bron-legers binnenhalen, en daarna de units erbij zoeken.
  /** De bron-legers die de compositie van de open lijst nodig heeft. */
  const mercBronnen = useMemo<MercBron[]>(() => {
    if (!active) return [];
    const perComp = metaByArmy[active.army]?.mercenaries;
    return perComp?.[active.composition] ?? [];
  }, [active, metaByArmy]);

  useEffect(() => {
    const need = Array.from(new Set(mercBronnen.map((b) => b.army))).filter((s) => s && !catalogues[s]);
    if (!need.length) return;
    let cancelled = false;
    Promise.all(need.map((slug) =>
      fetch(`${BASE}owb/${slug}.json`).then((r) => r.json()).then((c) => [slug, c] as const).catch(() => null)))
      .then((paren) => {
        if (cancelled) return;
        const verse = paren.filter((p): p is readonly [string, OwbArmy] => !!p);
        if (verse.length) setCatalogues((m) => ({ ...m, ...Object.fromEntries(verse) }));
      });
    return () => { cancelled = true; };
  }, [mercBronnen, catalogues]);

  /** De huurlingen-units zelf, opgezocht in het bron-leger. Een unit die (nog) niet te vinden is —
   *  catalogus nog aan het laden, of een id dat OWB hernoemde — wordt overgeslagen: liever een
   *  kortere lijst dan een rij die nergens op slaat. */
  const mercUnits = useMemo(() => {
    const uit: OwbUnit[] = [];
    for (const bron of mercBronnen) {
      const cat = catalogues[bron.army];
      if (!cat) continue;
      const alle = Object.values(cat).filter(Array.isArray).flat() as OwbUnit[];
      for (const id of bron.units) {
        const u = alle.find((x) => x && x.id === id);
        // De naam van het bron-leger erbij: "Badlands Ogre Bulls" zegt niet dat je Orcs inhuurt, en
        // in een lijst van drie huurlingen uit drie legers wil je dat wél weten.
        if (u) uit.push(u);
      }
    }
    return uit;
  }, [mercBronnen, catalogues]);

  // Load the catalogue of every distinct army among the saved lists (for the "My lists" totals).
  useEffect(() => {
    const need = Array.from(new Set(lists.map((l) => l.army))).filter((s) => s && !catalogues[s]);
    if (need.length === 0) return;
    let cancelled = false;
    Promise.all(need.map((s) => fetch(`${BASE}owb/${s}.json`).then((r) => r.json()).then((c) => [s, c] as const).catch(() => null)))
      .then((pairs) => { if (cancelled) return; const add: Record<string, OwbArmy> = {}; for (const p of pairs) if (p) add[p[0]] = p[1]; if (Object.keys(add).length) setCatalogues((m) => ({ ...m, ...add })); });
    return () => { cancelled = true; };
  }, [lists, catalogues]);

  const rawActiveCatalogue = activeArmySlug ? catalogues[activeArmySlug] ?? null : null;

  // ── Composition overlays (Renegade Legacy Pack) ────────────────────────────────────────────────
  // A pack is a POINTS patch on top of the OWB catalogue, keyed by composition id. Fetched on demand
  // and cached by id; a missing or malformed file degrades to "no overlay" so a bad deploy can never
  // leave someone unable to open their list.
  const activeComp = active?.composition ?? null;

  const activeOverlay = activeComp ? overlays[activeComp] ?? null : null;
  // Only patch when the overlay actually belongs to this army — a composition id is unique, but a
  // stale cache entry pointing at another faction would silently reprice the wrong units.
  const activeCatalogue = useMemo(() => {
    const bruikbaar = activeOverlay && activeOverlay.baseArmy === activeArmySlug ? activeOverlay : null;
    const basis = rawActiveCatalogue && activeComp
      ? catalogueFor(rawActiveCatalogue, activeComp, bruikbaar)
      : rawActiveCatalogue;
    if (!basis || !mercUnits.length) return basis;
    // De huurlingen als `mercenaries`-categorie erbij zetten in plaats van ergens apart. Die categorie
    // BESTAAT al in de hele keten — picker-chip, 20%-limiet in validate(), punten, roster, export —
    // dus alles werkt hierna vanzelf en er hoeft nergens anders iets van huurlingen te weten.
    // Overschrijft niet: een leger dat ze zelf al in z'n catalogus heeft (Empire, O&G, Dwarfs) houdt
    // die, en de metadata vult alleen aan wat er nog niet staat.
    const bestaand = Array.isArray(basis.mercenaries) ? basis.mercenaries : [];
    const ids = new Set(bestaand.map((u) => u.id));
    const extra = mercUnits.filter((u) => !ids.has(u.id));
    if (!extra.length) return basis;
    return { ...basis, mercenaries: [...bestaand, ...extra] };
  }, [rawActiveCatalogue, activeOverlay, activeArmySlug, mercUnits]);
  const activeItemsData = useMemo(() => {
    if (!itemsData || !activeOverlay || activeOverlay.baseArmy !== activeArmySlug) return itemsData;
    return applyOverlayItems(itemsData, activeOverlay);
  }, [itemsData, activeOverlay, activeArmySlug]);
  const activeStatIdx = useMemo(
    () => statIdx ? applyOverlayStatIndex(statIdx, activeOverlay) : statIdx,
    [statIdx, activeOverlay],
  );
  const activeMountText = useMemo(
    () => applyOverlayMountText(baseMountText, activeOverlay),
    [baseMountText, activeOverlay],
  );
  const activeMagicText = useMemo(
    () => applyOverlayMagicText(baseMagicText, activeOverlay),
    [baseMagicText, activeOverlay],
  );
  // The pack's own wording for the rules it changes, installed globally while a pack list is open. It
  // has to be global: the rule sheet renders outside this tree, so a local override would leave the
  // sheet showing the standard rule for a list the pack has already repriced.
  useEffect(() => {
    const on = activeOverlay && activeOverlay.baseArmy === activeArmySlug;
    setRuleOverlay(on ? activeOverlay : null);
    return () => setRuleOverlay(null);
  }, [activeOverlay, activeArmySlug, setRuleOverlay]);
  // Per army: the compositions from the synced OWB metadata, PLUS our own overlay compositions. The
  // overlay ids are appended here rather than written into `the-old-world.json`, because that file is
  // regenerated by `npm run sync-owb` and would silently drop them at the next data refresh.
  const compsByArmy = useMemo(() => Object.fromEntries(
    Object.entries(metaByArmy).map(([slug, v]) => {
      const extra = overlayCompsFor(slug).filter((id) => !v.comps.includes(id));
      return [slug, extra.length ? [...v.comps, ...extra] : v.comps];
    }),
  ), [metaByArmy]);
  // Army slug → its magic-item list ids (the same `items` array BuilderWorkspace gets as armyItemLists).
  const itemListsByArmy = useMemo(() => Object.fromEntries(Object.entries(metaByArmy).map(([slug, m]) => [slug, m.items ?? []])), [metaByArmy]);
  const armyName = (slug: string) => armies.find((a) => a.slug === slug)?.name ?? slug;
  const statsFor = useMemo(() => (unitName: string): StatRow[] => {
    if (!statIdx) return [];
    return overlayStatsFor(statIdx, unitName, activeOverlay);
  }, [statIdx, activeOverlay]);

  const updateActive = (p: Partial<BuilderList> | ((l: SavedList) => Partial<BuilderList>)) =>
    setLists((ls) => ls.map((l) => (l.id === activeId ? { ...l, ...(typeof p === 'function' ? p(l) : p), updatedAt: Date.now() } : l)));
  const setName = (name: string) => setLists((ls) => ls.map((l) => (l.id === activeId ? { ...l, name, updatedAt: Date.now() } : l)));

  const createListWith = (v: NewListValues) => {
    const id = newId('l');
    setLists((ls) => [{ id, name: v.name, army: v.army, composition: v.composition, rule: v.rule, points: v.points, entries: v.entries, createdAt: Date.now(), updatedAt: Date.now(), campaign: v.campaign, campaignSpeler: v.campaignSpeler, campaignNaam: v.campaignNaam, campaignFase: v.campaignFase }, ...ls]);
    setSetupOpen(false);
    setActiveId(id);
  };
  const duplicateList = (l: SavedList) => { const id = newId('l'); setLists((ls) => [{ ...l, id, name: `${l.name} (copy)`, createdAt: Date.now(), updatedAt: Date.now() }, ...ls]); };
  /** Copy a campaign list to a PLAIN one: same army and units, but no campaign tag, so the campaign
   *  keeps reading the submitted list while the player is free to tinker with the copy. */
  const duplicateAsPlain = (l: SavedList) => {
    const id = newId('l');
    setLists((ls) => [{
      ...l, id, name: `${l.name} (copy)`, createdAt: Date.now(), updatedAt: Date.now(),
      campaign: undefined, campaignSpeler: undefined, campaignNaam: undefined, campaignFase: undefined,
      computedPoints: undefined,
    }, ...ls]);
    setActiveId(id);
  };
  const deleteList = (id: string) => { setLists((ls) => ls.filter((l) => l.id !== id)); if (activeId === id) setActiveId(null); };

  // ── groups (folders) ──
  const addGroup = () => { const name = window.prompt('Group name'); if (name && name.trim()) setGroups((g) => [...g, { id: newId('g'), name: name.trim() }]); };
  const renameGroup = (id: string, current: string) => { const name = window.prompt('Group name', current); if (name && name.trim()) setGroups((g) => g.map((x) => (x.id === id ? { ...x, name: name.trim() } : x))); };
  const deleteGroup = (id: string, name: string) => {
    if (!window.confirm(`Delete folder “${name}”? Its lists move back to Ungrouped.`)) return;
    setGroups((g) => g.filter((x) => x.id !== id));
    setLists((ls) => ls.map((l) => (l.groupId === id ? { ...l, groupId: null } : l)));
  };
  // Reorder a list within the manual `lists` order (drag-drop). `targetId` null = append to the end of
  // `groupId`'s section; otherwise insert before/after the target card. Also adopts the target's group.
  const reorderList = (draggedId: string, targetId: string | null, before: boolean, groupId: string | null) =>
    setLists((ls) => {
      const arr = [...ls];
      const di = arr.findIndex((x) => x.id === draggedId);
      if (di < 0) return ls;
      const [moved] = arr.splice(di, 1);
      const next = { ...moved, groupId: groupId ?? null, updatedAt: Date.now() };
      if (targetId == null) { arr.push(next); }
      else {
        const ti = arr.findIndex((x) => x.id === targetId);
        if (ti < 0) { arr.push(next); }
        else { arr.splice(before ? ti : ti + 1, 0, next); }
      }
      return arr;
    });

  // A list is a HAIRLINE ROW, not a bordered card — the same primitive the redesigned roster uses, so
  // the overview and the builder read as one app. Cards put a frame around every entry and a gap
  // between them, which is a lot of furniture for "here are your lists": eight of them became eight
  // boxes. A shared separator does the same job with none of the weight.
  const card: React.CSSProperties = {
    borderBottom: `1px solid ${TOW.hairline}`, background: 'transparent',
  };
  /** A bare glyph action. Same reasoning as the option editor's eye: a column of outlined boxes down
   *  the right edge competes with the names, which are the thing you are scanning. */
  const glyphBtn: React.CSSProperties = {
    width: 34, height: 34, flexShrink: 0, border: 'none', background: 'transparent',
    borderRadius: 8, cursor: 'pointer', color: TOW.faint,
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, lineHeight: 1,
  };

  // Is this the campaign list that has been SUBMITTED for the current Act? Then it may be read, not
  // changed (the campaign already holds a snapshot of it, so this is about being clear rather than
  // about guarding the data — see LockedListView).
  //
  // Welke lijst de campagne op slot heeft, beslist `staatOpSlot` in lib/campaign.ts — dezelfde
  // helper die het Celedon-paneel gebruikt, zodat er nooit meer twee verschillende antwoorden zijn.
  const opSlot = staatOpSlot(campagne ?? null, active);

  // ── open list → the responsive builder (wait for that army's catalogue to load) ──
  if (active) {
    if (!activeCatalogue) return <div style={{ padding: 24, fontFamily: towFont.serif, color: TOW.muted }}>Loading the catalogue…</div>;
    const meta = metaByArmy[active.army];
    if (opSlot && campagne) {
      return (
        <LockedListView
          list={active}
          army={activeCatalogue}
          armyName={armyName(active.army)}
          compName={(c) => compName(c, active.army)}
          itemsData={activeItemsData ?? undefined}
          fase={campagne.fase}
          cap={campagne.puntenCap}
          onBack={() => setActiveId(null)}
          onDuplicate={() => duplicateAsPlain(active)}
        />
      );
    }
    // Het instellingen-blad hoort bij de open lijst: naam + army composition (en buiten de campagne
    // ook punten + game mode). Vóór 28-07 riepen de army-rijen in de builder een `onEditArmyField` aan
    // die de container nooit implementeerde, en op een telefoon was er helemaal geen ingang — een naam
    // die je bij het aanmaken typte, was definitief.
    const instellingenBlad = instellingenOpen && (
      <ListSettings
        naam={active.name}
        army={active.army}
        armyName={armyName(active.army)}
        composition={active.composition}
        comps={compsByArmy[active.army] ?? metaByArmy[active.army]?.comps ?? [active.army]}
        compName={(c) => compName(c, active.army)}
        rule={active.rule}
        points={active.points}
        campagneLabel={active.campaign && campagne ? campagne.label : null}
        campagneAct={active.campaign && campagne ? campagne.fase : null}
        onClose={() => setInstellingenOpen(false)}
        onOpslaan={(v) => {
          setLists((ls) => ls.map((l) => (l.id === active.id
            ? { ...l, name: v.naam, composition: v.composition, rule: v.rule, points: v.points, updatedAt: Date.now() }
            : l)));
          setInstellingenOpen(false);
        }}
      />
    );

    if (useV2) {
      return (
        <>
        <BuilderFlow
          list={active}
          name={active.name}
          onUpdate={updateActive}
          onSetName={setName}
          onBack={() => setActiveId(null)}
          army={activeCatalogue}
          armySlug={active.army}
          statsFor={statsFor}
          comps={compsByArmy[active.army] ?? meta?.comps ?? [active.army]}
          armyName={armyName(active.army)}
          compName={(c) => compName(c, active.army)}
          itemsData={activeItemsData ?? undefined}
          armyItemLists={meta?.items ?? []}
        compRules={compRules ?? undefined}
          statIdx={activeStatIdx}
          // The desktop rail no longer carries a list-switcher: switching or creating a list belongs on
          // the lists overview (reachable via "‹ LISTS" in the builder header), not in the left column
          // of a list being built, where it crowded out the unit catalogue.
          // The army-summary rows (and the phone header's title) open the list settings. Every field
          // routes to the same sheet: which one you tapped only tells us you want the settings, and a
          // four-field sheet is less surprising than four different one-field editors.
          onEditArmyField={() => setInstellingenOpen(true)}
          // Import OWB exists, but only as "create a list from a paste" — not as "import into THIS
          // list", which is what the top-bar button implies. Export and Print do not exist at all.
          // All three are left undefined so the shell disables them with an explanation.
          onImportOwb={undefined}
          // Rule resolution stays OUT of the builder: this screen owns the rules data and the app's
          // rule sheet, so it maps a label to a slug here. An unresolvable label opens nothing rather
          // than an empty sheet.
          onShowInfo={(what) => {
            if (what.kind === 'item') {
              // Magic items have NO page in rules.json — the scrape does not cover them — so there is no
              // slug for `openRule` to resolve and this used to `return` here, which is why the eye on
              // every magic item and banner did nothing. Their text lives in `magic-item-text.json`, and
              // `InfoSheet` exists precisely for "things with no rule page of their own". `body` is a
              // comma-separated list of special rules, and InfoSheet turns each into a rule link, so it
              // is split rather than shown as one string.
              const tx = activeMagicText[what.itemId];
              // De special rules UIT HET WAPENPROFIEL horen bij dezelfde chip-rij als die uit de body
              // (15-08-2026): Armour Bane, Magical Attacks en Multiple Wounds hebben allemaal hun eigen
              // regelpagina, dus als losse tekstregel zou je er niet op kunnen tikken. Dubbelen eruit,
              // want een item kan dezelfde regel in beide velden dragen.
              const uitProfiel = (tx?.profiel ?? []).flatMap((p) => (p.specialRules ?? '').split(','));
              const regels = [...(tx?.body ?? '').split(','), ...uitProfiel]
                .map((r) => r.trim())
                .filter(Boolean);
              // TERUGVAL OP DE REGELPAGINA (15-08-2026). Zeven catalogus-items zijn geen echte magic
              // item maar een FACTIE-UPGRADE — de Forbidden Poisons en Gifts of Khaine van de Dark
              // Elves — en die hebben upstream geen /magic-item-pagina, dus geen tekst in de
              // snapshot. Ze staan wél gewoon in rules.json ("Manbane: When this character makes a
              // roll To Wound, a roll of 4+ is always a success…"). Die tekst pakken we hier, zodat
              // je niet langer "No description recorded" krijgt voor een regel die we gewoon hebben.
              const heeftTekst = !!(tx?.description || tx?.body || tx?.profiel?.length);
              const regelSlug = heeftTekst ? null : (resolveRuleSlug(what.name, ruleIdx) ?? resolveOptionSlug(what.name, ruleIdx));
              const regelTekst = regelSlug ? String((rules?.[regelSlug] as { bodyIndex?: string } | undefined)?.bodyIndex ?? '').trim() : '';
              setMountInfo({
                title: what.name,
                flavour: tx?.description,
                rules: [...new Set(regels)],
                wapen: tx?.profiel,
                // Say so when there is no text at all, instead of opening a blank sheet.
                details: heeftTekst ? undefined
                  : regelTekst ? [regelTekst]
                    : ['No description recorded for this item.'],
              });
              return;
            }
            if (what.kind === 'lore') {
              const lore = lores[what.slug];
              if (lore) {
                setMountInfo({
                  title: lore.name,
                  details: [`${lore.spells.length} spell${lore.spells.length === 1 ? '' : 's'} in this army composition`],
                  // Mét de slug, niet alleen de naam: "Storm Call" bestaat twee keer — als signature
                  // spell van Elementalism en als bound spell op een item — en de naam-index koos de
                  // verkeerde. De lore weet z'n eigen spreukpagina's al, dus geef die door.
                  rules: lore.spells.map((spell) => ({ label: spell.name, slug: spell.slug })),
                });
              }
              return;
            }
            const label = what.name;
            if (what.kind === 'mount') {
              const profileKey = normMountProfile(label);
              const taggedKey = normMountTag(label);
              const rows = statsFor(label);
              const text = activeMountText[profileKey] ?? activeMountText[taggedKey] ?? {};
              const profiles: UnitProfile[] = rows.map((row) => ({
                label: row.Name,
                stats: ['M', 'WS', 'BS', 'S', 'T', 'W', 'I', 'A', 'Ld']
                  .map((key) => ({ k: key, v: row[key as keyof StatRow] ?? '-' })),
              }));
              const details = [
                text.baseSize ? `Base size: ${text.baseSize}` : null,
                text.armourValue ? `Armour value: ${text.armourValue}` : null,
                ...(text.equipment ?? []).map((value) => `Equipment: ${value}`),
                ...(text.notes ?? []),
              ].filter((value): value is string => !!value);
              setMountInfo({
                title: label.replace(/\s*\{[^}]*\}/g, '').trim(),
                // rules-index stores troop-type CODES ("MCa"), so this showed a raw "MCA" — unreadable,
                // and never resolvable to the rule page it names. Mapped to the rulebook's own wording.
                troopType: troopTypeName(text.troopType ?? activeStatIdx?.[profileKey]?.troopType
                  ?? activeStatIdx?.[taggedKey]?.troopType),
                profiles,
                rules: text.specialRules ?? [],
                details,
              });
              return;
            }
            // Kent de aanroeper de pagina al, gebruik die. Een spreuk deelt z'n naam soms met een
            // gewone special rule, en dan is opzoeken op naam een gok met een verkeerd antwoord.
            if (what.kind === 'rule' && what.slug) { openRule(what.slug); return; }
            const slug = resolveRuleSlug(label, ruleIdx) ?? resolveOptionSlug(label, ruleIdx);
            if (slug) { openRule(slug); return; }

            // A label naming SEVERAL pieces of wargear ("Hand weapons, Additional hand weapon",
            // "Light armour, Shields") matches no page, because no page is named after the
            // combination — so the eye on 261 of the catalogue's option rows did nothing at all.
            // The parts each have a page, so offer the parts: InfoSheet already turns a list of
            // labels into one tappable chip apiece, which is exactly the choice being offered.
            const parts = splitCompoundLabel(label);
            const slugs = parts.map((p) => resolveRuleSlug(p, ruleIdx) ?? resolveOptionSlug(p, ruleIdx));
            const found = slugs.filter((s): s is string => !!s);
            if (!found.length) return; // nothing to read — better than an empty sheet
            // Both halves pointing at one page ("Two Hand Weapons/Additional Hand Weapon" covers each)
            // means there is a single rule to read: open it, rather than a sheet holding one chip.
            if (found.length === parts.length && new Set(found).size === 1) { openRule(found[0]); return; }
            setMountInfo({ title: label, rules: parts });
          }}
        />
        {instellingenBlad}
        <InfoSheet info={mountInfo} onClose={() => setMountInfo(null)} />
        </>
      );
    }
    return (
      <>
      <BuilderWorkspace
        list={active}
        name={active.name}
        onUpdate={updateActive}
        onSetName={setName}
        onBack={() => setActiveId(null)}
        army={activeCatalogue}
        armySlug={active.army}
        statsFor={statsFor}
        comps={compsByArmy[active.army] ?? meta?.comps ?? [active.army]}
        armyName={armyName(active.army)}
        compName={(c) => compName(c, active.army)}
        itemsData={activeItemsData ?? undefined}
        armyItemLists={meta?.items ?? []}
        magicTextPatch={activeOverlay?.magicItemText}
        mountTextPatch={activeMountText}
      />
      {instellingenBlad}
      </>
    );
  }

  // ── My lists ──
  const UNGROUPED = '__ungrouped__'; // synthetic section id for the Ungrouped drop target
  const groupIds = new Set(groups.map((g) => g.id));
  // MANUAL order = the `lists` array order (drag to reorder; new lists prepend via createListWith).
  const listsInGroup = (gid: string) => lists.filter((l) => l.groupId === gid);
  // Ungrouped = no/null groupId OR a groupId that no longer maps to an existing group.
  const ungrouped = lists.filter((l) => !l.groupId || !groupIds.has(l.groupId));

  // One saved-list card. `sectionId` is the section it currently sits in (so a drop adopts that group).
  const renderCard = (l: SavedList, sectionId: string) => {
    // Same sum as the builder — via `puntenVan`, so a Renegade composition is counted at ITS prices.
    // Counting off the raw catalogue here showed Legacy points for a repriced list: the card and the
    // builder disagreed about the very same list. `null` renders as '…' rather than a wrong number.
    const total = puntenVan(l);
    // Group this card currently lives in (null = Ungrouped) — a drop adopts this section's group.
    const cardGroup = sectionId === UNGROUPED ? null : sectionId;
    const dropLine = dragOverCard?.id === l.id ? dragOverCard.before : null; // true=top, false=bottom, null=none
    return (
      <div
        key={l.id}
        draggable
        onDragStart={(e) => { e.dataTransfer.setData('text/plain', l.id); e.dataTransfer.effectAllowed = 'move'; }}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          const r = e.currentTarget.getBoundingClientRect();
          const before = e.clientY < r.top + r.height / 2;
          setDragOverCard({ id: l.id, before });
        }}
        onDragLeave={() => setDragOverCard((d) => (d?.id === l.id ? null : d))}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation(); // don't also fire the section's append-to-end drop
          const dragged = e.dataTransfer.getData('text/plain');
          const r = e.currentTarget.getBoundingClientRect();
          const before = e.clientY < r.top + r.height / 2;
          if (dragged && dragged !== l.id) reorderList(dragged, l.id, before, cardGroup);
          setDragOverCard(null);
        }}
        style={{ ...card, position: 'relative', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', cursor: 'grab' }}
      >
        {dropLine != null && <div style={{ position: 'absolute', left: 0, right: 0, [dropLine ? 'top' : 'bottom']: -1, height: 2, background: TOW.goldDeep, borderRadius: 2, pointerEvents: 'none' }} />}
        {/* Same anatomy as the roster's UnitRow: name on one line, a faint whisper beneath, and the
            number right-aligned in tabular figures so a column of lists lines up. */}
        <button onClick={() => setActiveId(l.id)} style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
          <span style={{ fontFamily: towFont.serif, fontWeight: 400, fontSize: 15.5, lineHeight: 1.25, color: TOW.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.name}</span>
          <span style={{ fontFamily: towFont.serif, fontSize: 11, lineHeight: 1.3, color: TOW.faint, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {armyName(l.army)} · {compName(l.composition, l.army)}
          </span>
        </button>
        <span style={{ fontFamily: towFont.serif, fontSize: 12.5, color: TOW.muted, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', flexShrink: 0 }}>
          {total ?? '…'}/{l.points}
        </span>
        <button onClick={() => duplicateList(l)} onMouseDown={(e) => e.stopPropagation()} aria-label="Duplicate" title="Duplicate" style={{ ...glyphBtn, fontSize: 14 }}>⧉</button>
        <button onClick={() => { if (confirm(`Delete “${l.name}”?`)) deleteList(l.id); }} onMouseDown={(e) => e.stopPropagation()} aria-label="Delete" title="Delete" style={{ ...glyphBtn, fontSize: 17 }}>×</button>
      </div>
    );
  };

  // A drop target wrapping a section's cards. `targetId` is the group id, or null for Ungrouped.
  const sectionId = (targetId: string | null) => targetId ?? UNGROUPED;
  const dropProps = (targetId: string | null) => ({
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOver(sectionId(targetId)); },
    onDragLeave: () => setDragOver((d) => (d === sectionId(targetId) ? null : d)),
    // Dropping on a section's empty area → move the dragged list to the END of that section.
    onDrop: (e: React.DragEvent) => { e.preventDefault(); const id = e.dataTransfer.getData('text/plain'); if (id) reorderList(id, null, false, targetId); setDragOver(null); setDragOverCard(null); },
  });

  // A collapsible section header: a chevron + title (+ count), with optional right-aligned actions.
  // No decorative folder icon — just the chevron, which also drives the collapse.
  const sectionHeader = (key: string, title: string, count: number | null, actions?: React.ReactNode) => {
    const isCol = collapsed.includes(key);
    return (
      // Mirrors the builder's SectionHeader: engraved label in Blood dark, then a hairline rule that
      // takes the slack, then the count on the right. The chevron stays — unlike the roster's sections
      // these collapse — but the rest of the anatomy is the same, so a folder here and a category there
      // read as the same kind of divider.
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 0 5px' }}>
        <button onClick={() => toggleCollapse(key)} aria-expanded={!isCol} style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6, border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, textAlign: 'left' }}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={TOW.goldDeep} strokeWidth="2.8" style={{ flexShrink: 0, transform: isCol ? 'none' : 'rotate(90deg)', transition: 'transform .15s ease' }} aria-hidden="true"><path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" /></svg>
          <span style={{ ...eb, fontSize: 8.5, color: TOW.goldDeep, whiteSpace: 'nowrap' }}>{title}</span>
        </button>
        <span style={{ flex: 1, height: 1, background: TOW.line }} />
        {count != null && <span style={{ fontFamily: towFont.serif, fontSize: 10.5, color: TOW.faint, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{count}</span>}
        {actions}
      </div>
    );
  };

  const renderSection = (targetId: string | null, title: string, sectionLists: SavedList[], actions?: React.ReactNode) => {
    const key = sectionId(targetId);
    const hovered = dragOver === key;
    const isCol = collapsed.includes(key);
    return (
      <div
        key={key}
        {...dropProps(targetId)}
        style={{ border: `1px ${hovered ? 'dashed' : 'solid'} ${hovered ? TOW.goldDeep : 'transparent'}`, borderRadius: 12, background: hovered ? 'rgba(176,141,87,0.10)' : 'transparent', padding: hovered ? '5px 5px' : '0 6px', transition: 'background 120ms' }}
      >
        {sectionHeader(key, title, targetId === null ? null : sectionLists.length, actions)}
        {!isCol && (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {sectionLists.length === 0
              ? <div style={{ fontFamily: towFont.serif, fontStyle: 'italic', fontSize: 12.5, color: TOW.faint, padding: '8px 4px' }}>Drop lists here</div>
              : sectionLists.map((l) => renderCard(l, key))}
          </div>
        )}
      </div>
    );
  };

  // Folder actions as quiet glyphs, not outlined buttons. Two bordered "Rename"/"Delete" pills sat in
  // every section header and out-shouted the folder name they belonged to — a divider should not be the
  // loudest thing between two lists.
  const groupActions = (g: { id: string; name: string }) => (
    <>
      <button onClick={() => renameGroup(g.id, g.name)} aria-label={`Rename folder ${g.name}`} title="Rename folder"
        style={{ ...glyphBtn, width: 28, height: 28, fontSize: 12 }}>✎</button>
      <button onClick={() => deleteGroup(g.id, g.name)} aria-label={`Delete folder ${g.name}`} title="Delete folder"
        style={{ ...glyphBtn, width: 28, height: 28, fontSize: 15 }}>×</button>
    </>
  );

  return (
    <div className="tow-field" style={{ height: '100%', overflowY: 'auto', color: TOW.ink }}>
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '14px 14px 48px' }}>
        {/* Campagne bovenaan: dit is waar een speler die vanaf Isle of Celedon binnenkomt landt. */}
        <CeledonPanel
          lijsten={lists.map((l) => ({
            id: l.id, name: l.name, army: l.army, units: l.entries?.length ?? 0, points: l.points,
            computed: puntenVan(l) ?? l.computedPoints ?? null,
            campaign: l.campaign, campaignSpeler: l.campaignSpeler,
          }))}
          onOpen={(id) => setActiveId(id)}
          onTour={() => setPersisted('tow:celedon-tour', 'pending')}
          onHerstel={herstelCampagneLijst}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <h1 style={{ fontFamily: towFont.display, fontWeight: 700, fontSize: 22, color: TOW.ink, margin: 0 }}>My lists</h1>
          <button onClick={addGroup} style={{ marginLeft: 'auto', fontFamily: towFont.display, fontWeight: 700, fontSize: 13, padding: '7px 13px', borderRadius: 9, cursor: 'pointer', border: `1px solid ${TOW.line}`, background: 'transparent', color: TOW.ink }}>＋ New group</button>
          <button onClick={() => setSetupOpen(true)} style={{ fontFamily: towFont.display, fontWeight: 700, fontSize: 13, padding: '7px 14px', borderRadius: 9, cursor: 'pointer', border: 'none', background: goldGrad, color: TOW.onGrad }}>＋ New list</button>
        </div>
        {lists.length === 0 && groups.length === 0 ? (
          <p style={{ fontFamily: towFont.serif, fontStyle: 'italic', fontSize: 14, color: TOW.muted }}>No saved lists yet — tap “New list” to start building.</p>
        ) : groups.length === 0 ? (
          // No folders yet — keep the original flat look.
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {ungrouped.map((l) => renderCard(l, UNGROUPED))}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {groups.map((g) => renderSection(g.id, g.name, listsInGroup(g.id), groupActions(g)))}
            {renderSection(null, 'Ungrouped', ungrouped)}
          </div>
        )}
        <p style={{ fontFamily: towFont.serif, fontSize: 11, color: TOW.faint, marginTop: 18, textAlign: 'center', lineHeight: 1.6 }}>
          Lists are saved on this device. Catalogue from <a href="https://github.com/nthiebes/old-world-builder" target="_blank" rel="noreferrer" className="underline">Old World Builder</a> (CC BY 4.0).
        </p>
      </div>
      {setupOpen && (
        <NewListSetup
          armies={armies}
          compsByArmy={compsByArmy}
          defaultArmy={armies.find((a) => a.slug === FALLBACK_ARMY)?.slug ?? armies[0]?.slug ?? FALLBACK_ARMY}
          defaultName={`New list ${lists.length + 1}`}
          onCancel={() => setSetupOpen(false)}
          onCreate={createListWith}
          itemsData={itemsData ?? undefined}
          itemListsByArmy={itemListsByArmy}
        />
      )}
    </div>
  );
}
