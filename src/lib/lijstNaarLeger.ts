// VAN BUILDER-LIJST NAAR SPEEL-LEGER, op één plek (30-10-2026).
//
// Drie wegen hadden elk hun eigen kopie van dit recept: ArmyListPicker (je eigen lijsten), de
// deelcode in de battle-wizard, en nu de geplakte New Recruit-lijst. Het recept is steeds hetzelfde:
// catalogus van het leger + eventuele compositie-overlay (Renegade V2) + statlines + magic items +
// magic-item-tekst + mount-tekst → builderListToArmy. Alleen dát geeft een battle-unit zijn regels,
// profielen en rijdier-tabs. De bestanden worden één keer per sessie opgehaald (module-cache).

import { useEffect, useMemo, useState } from 'react';
import type { Army } from '../types';
import { builderListToArmy, type MagicText, type MountText, type NamedBuilderList, type StatRow } from './builderToArmy';
import { makeTroopTypeLookup } from './troopTypes';
import { compName } from './armies';
import {
  itemsFor, catalogueFor, applyOverlayMagicText, applyOverlayMountText, applyOverlayStatIndex,
  hasOverlay, isOverlay, overlayCompsFor, overlayStatsFor, OVERLAY_FILES, type CompositionOverlay,
} from './overlays';
import type { OwbArmy, MagicItemsData } from './owbBuilder';
import { isNewRecruitText, parseNewRecruit, resolveNewRecruitHeader, type NewRecruitHeader } from './newRecruitParser';
import { importOwbText } from './owbImport';

const BASE = import.meta.env.BASE_URL;

export type StatIndex = Record<string, { stats?: StatRow[]; troopType?: string }>;

/** Alles wat (naast de catalogus) nodig is om een builder-lijst om te zetten. */
export interface OwbData {
  statIdx: StatIndex;
  itemsData: MagicItemsData | null;
  magicText: MagicText;
  mountText: MountText;
  /** slug → weergavenaam ("dark-elves" → "Dark Elves"), uit owb/index.json. */
  armyNames: Record<string, string>;
  /** slug → de magic-item-lijsten van dat leger (the-old-world.json `items`). */
  itemsByArmy: Record<string, string[]>;
  /** slug → composities: die van OWB plus onze eigen overlay-composities (zoals ListBuilder). */
  compsByArmy: Record<string, string[]>;
}

/** Wat een lijst minimaal moet hebben om om te zetten. */
export type OmzetbareLijst = NamedBuilderList & { army: string };

const haalJson = (pad: string) => fetch(`${BASE}${pad}`).then((r) => (r.ok ? r.json() : null)).catch(() => null);

let owbBelofte: Promise<OwbData> | null = null;
export function laadOwbData(): Promise<OwbData> {
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
      const compsByArmy: Record<string, string[]> = {};
      for (const a of (meta?.armies ?? [])) {
        itemsByArmy[a.id] = Array.isArray(a.items) ? a.items : [];
        const comps: string[] = Array.isArray(a.armyComposition) ? a.armyComposition : [a.id];
        compsByArmy[a.id] = [...comps, ...overlayCompsFor(a.id).filter((id) => !comps.includes(id))];
      }
      return {
        statIdx: (stats ?? {}) as StatIndex,
        itemsData: (items ?? null) as MagicItemsData | null,
        magicText: (magic ?? {}) as MagicText,
        mountText: (mount ?? {}) as MountText,
        armyNames,
        itemsByArmy,
        compsByArmy,
      };
    });
    // Een mislukte lading niet voor de hele sessie vastzetten.
    owbBelofte.catch(() => { owbBelofte = null; });
  }
  return owbBelofte;
}

const catCache = new Map<string, Promise<OwbArmy | null>>();
const overlayCache = new Map<string, Promise<CompositionOverlay | null>>();

export function laadCatalogus(slug: string): Promise<OwbArmy | null> {
  let p = catCache.get(slug);
  if (!p) {
    p = haalJson(`owb/${slug}.json`) as Promise<OwbArmy | null>;
    catCache.set(slug, p);
    // Geen catalogus (offline, fout) → volgende keer opnieuw proberen.
    p.then((c) => { if (!c) catCache.delete(slug); });
  }
  return p;
}

export function laadOverlay(composition: string): Promise<CompositionOverlay | null> {
  if (!hasOverlay(composition)) return Promise.resolve(null);
  let p = overlayCache.get(composition);
  if (!p) {
    p = haalJson(`renegade/${OVERLAY_FILES[composition]}`).then((j) => (isOverlay(j) ? j : null));
    overlayCache.set(composition, p);
    p.then((o) => { if (!o) overlayCache.delete(composition); });
  }
  return p;
}

/** De catalogus en de magic items zoals ze gelden voor DEZE compositie. */
export function compositieData(raw: OwbArmy, composition: string, overlay: CompositionOverlay | null, itemsData: MagicItemsData | null) {
  return {
    cat: catalogueFor(raw, composition, overlay),
    itemPool: itemsData ? itemsFor(itemsData, composition, overlay) : itemsData,
  };
}

/** Het recept zelf. Puur: alle data komt binnen als argument. */
export function lijstNaarLeger(l: OmzetbareLijst, raw: OwbArmy, overlay: CompositionOverlay | null, owb: OwbData): Army {
  const { cat, itemPool } = compositieData(raw, l.composition, overlay, owb.itemsData);
  const resolvedIndex = overlay ? applyOverlayStatIndex(owb.statIdx, overlay) : owb.statIdx;
  const statsFor = (naam: string): StatRow[] => overlayStatsFor(owb.statIdx, naam, overlay) as StatRow[];
  return builderListToArmy(l, cat, statsFor, {
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

/** Zelfde recept, maar haalt eerst op wat nodig is. Gooit een leesbare fout als iets ontbreekt. */
export async function lijstNaarLegerAsync(l: OmzetbareLijst): Promise<Army> {
  const [owb, raw, overlay] = await Promise.all([laadOwbData(), laadCatalogus(l.army), laadOverlay(l.composition)]);
  if (!raw) throw new Error(`No catalogue for “${l.army}” — update the app and try again.`);
  if (hasOverlay(l.composition) && !overlay) throw new Error('That list uses a composition this app could not load.');
  return lijstNaarLeger(l, raw, overlay, owb);
}

/** Hook-vorm voor een LIJST van lijsten (ArmyListPicker): laadt per leger de catalogus en per
 *  compositie de overlay zodra een lijst ze nodig heeft, en geeft synchrone helpers terug die `null`
 *  geven zolang iets nog laadt. */
export function useLijstNaarLeger(lijsten: { army: string; composition: string }[]) {
  const [owb, setOwb] = useState<OwbData | null>(null);
  const [catalogi, setCatalogi] = useState<Record<string, OwbArmy>>({});
  const [overlays, setOverlays] = useState<Record<string, CompositionOverlay>>({});

  useEffect(() => {
    let weg = false;
    laadOwbData().then((d) => { if (!weg) setOwb(d); }).catch(() => {});
    return () => { weg = true; };
  }, []);

  // Sleutels als string, zodat een nieuwe array met dezelfde inhoud niets opnieuw start.
  const legerSleutel = Array.from(new Set(lijsten.map((l) => l.army).filter(Boolean))).sort().join('|');
  const compSleutel = Array.from(new Set(lijsten.map((l) => l.composition).filter((c) => c && hasOverlay(c)))).sort().join('|');

  useEffect(() => {
    if (!legerSleutel) return;
    let weg = false;
    for (const slug of legerSleutel.split('|')) {
      laadCatalogus(slug).then((c) => { if (!weg && c) setCatalogi((m) => (m[slug] ? m : { ...m, [slug]: c })); });
    }
    return () => { weg = true; };
  }, [legerSleutel]);

  useEffect(() => {
    if (!compSleutel) return;
    let weg = false;
    for (const comp of compSleutel.split('|')) {
      laadOverlay(comp).then((o) => { if (!weg && o) setOverlays((m) => (m[comp] ? m : { ...m, [comp]: o })); });
    }
    return () => { weg = true; };
  }, [compSleutel]);

  return useMemo(() => {
    const overlayVoor = (comp: string) => (hasOverlay(comp) ? overlays[comp] ?? null : null);
    /** Catalogus + magic items van deze lijst, of null zolang de catalogus (of overlay) nog laadt. */
    const catalogusVoor = (l: { army: string; composition: string }) => {
      const raw = catalogi[l.army];
      if (!raw) return null;
      const overlay = overlayVoor(l.composition);
      if (hasOverlay(l.composition) && !overlay) return null;
      return compositieData(raw, l.composition, overlay, owb?.itemsData ?? null);
    };
    const naarLeger = (l: OmzetbareLijst): Army | null => {
      const raw = catalogi[l.army];
      // Zonder statlines geen leger (zoals ArmyListPicker altijd deed): liever even wachten dan units zonder profiel.
      if (!raw || !owb || !Object.keys(owb.statIdx).length) return null;
      const overlay = overlayVoor(l.composition);
      if (hasOverlay(l.composition) && !overlay) return null;
      return lijstNaarLeger(l, raw, overlay, owb);
    };
    const legerNaam = (slug: string) => owb?.armyNames[slug] ?? slug;
    return { owb, catalogusVoor, naarLeger, legerNaam };
  }, [owb, catalogi, overlays]);
}

// ── Geplakte New Recruit-lijst → speel-leger (30-10-2026) ─────────────────────────────────────────
//
// Toernooi: vlak voor de battle plak je de New Recruit-lijst van je tegenstander. Die tekst heeft geen
// regels of profielen, dus we bouwen er een TIJDELIJKE builder-lijst van (importOwbText tegen de
// catalogus van het juiste leger en de juiste compositie) en zetten die om met hetzelfde recept als een
// eigen lijst. De lijst wordt nergens bewaard: niet in `tow:lists`, niet in de cloud.

export interface PlakResultaat {
  army: Army;
  legerSlug: string;
  compositie: string;
  legerNaam: string;
  compNaam: string;
  matched: number;
  total: number;
  unmatched: string[];
  /** Het totaal volgens New Recruit (de kop), en volgens OWC (listTotal via builderListToArmy). */
  nrPunten: number | null;
  owcPunten: number | null;
}

export interface NewRecruitPlak {
  /** Is de geplakte tekst een New Recruit-export? Zo niet: niets van dit alles geldt. */
  isNR: boolean;
  kop: NewRecruitHeader | null;
  /** Gekozen (of herkend) leger + compositie; '' = nog niet bekend. */
  leger: string;
  compositie: string;
  /** Wat de kop zelf opleverde: zo weet de UI of de speler moet kiezen. */
  herkend: { leger: boolean; compositie: boolean };
  kies: (leger: string, compositie?: string) => void;
  legers: { slug: string; name: string }[];
  compsVoor: (slug: string) => string[];
  bezig: boolean;
  fout: string | null;
  resultaat: PlakResultaat | null;
}

/** Zet een geplakte New Recruit-tekst om in een speelbaar leger, met de kop als voorselectie. Als de
 *  kop niet (helemaal) herkend wordt, kiest de speler leger en compositie via `kies`. */
export function useNewRecruitLeger(tekst: string, loreKeys?: string[]): NewRecruitPlak {
  const isNR = useMemo(() => isNewRecruitText(tekst ?? ''), [tekst]);
  const kop = useMemo(() => (isNR ? parseNewRecruit(tekst).header : null), [isNR, tekst]);
  const [owb, setOwb] = useState<OwbData | null>(null);
  useEffect(() => {
    if (!isNR || owb) return;
    let weg = false;
    laadOwbData().then((d) => { if (!weg) setOwb(d); }).catch(() => {});
    return () => { weg = true; };
  }, [isNR, owb]);

  const legers = useMemo(
    () => Object.entries(owb?.armyNames ?? {}).map(([slug, name]) => ({ slug, name })).sort((a, b) => a.name.localeCompare(b.name)),
    [owb],
  );
  const compsVoor = useMemo(() => (slug: string) => owb?.compsByArmy[slug] ?? (slug ? [slug] : []), [owb]);
  const herkenning = useMemo(
    () => (kop && owb ? resolveNewRecruitHeader(kop, legers, owb.compsByArmy) : null),
    [kop, owb, legers],
  );

  // Een eigen keuze geldt alleen voor DEZE kop: plak je een andere lijst, dan begint het opnieuw.
  const kopSleutel = kop ? `${kop.faction}|${kop.composition}|${kop.name}` : '';
  const [keuze, setKeuze] = useState<{ sleutel: string; leger: string; compositie: string } | null>(null);
  const eigen = keuze && keuze.sleutel === kopSleutel ? keuze : null;
  const leger = eigen?.leger ?? herkenning?.army ?? '';
  const compositie = eigen ? eigen.compositie : (herkenning?.composition ?? '');
  const kies = (nieuwLeger: string, nieuweComp?: string) => {
    const comps = compsVoor(nieuwLeger);
    // Kies je zelf het leger (factie niet herkend), dan proberen we de compositie uit de kop alsnog
    // binnen DAT leger: "Druchii - Renegades v2.0" + Dark Elves → Renegade V2, niet de Grand Army.
    const binnenLeger = kop && owb && nieuwLeger
      ? resolveNewRecruitHeader({ ...kop, faction: owb.armyNames[nieuwLeger] ?? nieuwLeger }, legers, owb.compsByArmy)
      : null;
    const comp = nieuweComp && comps.includes(nieuweComp)
      ? nieuweComp
      : (binnenLeger?.army === nieuwLeger && binnenLeger.composition) || comps[0] || nieuwLeger;
    setKeuze({ sleutel: kopSleutel, leger: nieuwLeger, compositie: nieuwLeger ? comp : '' });
  };

  const [staat, setStaat] = useState<{ sleutel: string; bezig: boolean; fout: string | null; resultaat: PlakResultaat | null }>({ sleutel: '', bezig: false, fout: null, resultaat: null });
  const loreSleutel = (loreKeys ?? []).join('|');
  const werkSleutel = isNR && owb && leger && compositie ? `${leger}|${compositie}|${loreSleutel}|${tekst}` : '';
  useEffect(() => {
    if (!werkSleutel || !owb) return;
    let weg = false;
    setStaat({ sleutel: werkSleutel, bezig: true, fout: null, resultaat: null });
    Promise.all([laadCatalogus(leger), laadOverlay(compositie)]).then(([raw, overlay]) => {
      if (weg) return;
      if (!raw) throw new Error(`No catalogue for “${owb.armyNames[leger] ?? leger}” — update the app and try again.`);
      if (hasOverlay(compositie) && !overlay) throw new Error('This composition could not be loaded.');
      const { cat, itemPool } = compositieData(raw, compositie, overlay, owb.itemsData);
      const imp = importOwbText(tekst, cat, itemPool ?? undefined, owb.itemsByArmy[leger] ?? [], { loreKeys: loreSleutel ? loreSleutel.split('|') : undefined });
      const legerNaam = owb.armyNames[leger] ?? leger;
      const lijst: OmzetbareLijst = {
        // "Unnamed list" (New Recruits standaard) laat importOwbText weg; dan zegt de naam waar hij vandaan komt.
        name: imp.header.name ?? 'New Recruit list',
        army: leger,
        composition: compositie,
        rule: imp.header.rule ?? 'open-war',
        points: imp.header.points ?? 0,
        entries: imp.entries,
      };
      const army = lijstNaarLeger(lijst, raw, overlay, owb);
      setStaat({
        sleutel: werkSleutel, bezig: false, fout: null,
        resultaat: {
          army, legerSlug: leger, compositie, legerNaam, compNaam: compName(compositie, leger),
          matched: imp.matched, total: imp.total, unmatched: imp.unmatched,
          nrPunten: imp.header.points ?? null, owcPunten: army.points,
        },
      });
    }).catch((e: unknown) => {
      if (!weg) setStaat({ sleutel: werkSleutel, bezig: false, fout: e instanceof Error ? e.message : 'Could not read this list.', resultaat: null });
    });
    return () => { weg = true; };
    // `leger`, `compositie`, `tekst` en de lore-sleutels zitten allemaal in werkSleutel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [werkSleutel, owb]);

  const actueel = staat.sleutel === werkSleutel && !!werkSleutel;
  return {
    isNR,
    kop,
    leger,
    compositie,
    herkend: { leger: !!herkenning?.army, compositie: !!herkenning?.composition },
    kies,
    legers,
    compsVoor,
    bezig: isNR && (!owb || (!!werkSleutel && (!actueel || staat.bezig))),
    fout: actueel ? staat.fout : null,
    resultaat: actueel ? staat.resultaat : null,
  };
}
