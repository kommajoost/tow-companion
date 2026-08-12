import { entryPoints, unitCategoryFor, type BuilderList, type ListEntry, type MagicItemsData, type OwbArmy, type OwbUnit, type Category } from './owbBuilder';
import { deriveList, optionSummary } from './builderDerived';
import { applyOverlayItems, catalogueFor, hasOverlay, OVERLAY_FILES, type CompositionOverlay } from './overlays';
import { makeUnitStrengthLookup } from './troopTypes';

/* ── Uitgerekende lijst-opsplitsing voor de campagne (30-07-2026) ───────────────────────────────
   De campagne-app (Isle of Celedon) kan geen punten of optie-labels berekenen: de catalogus met
   unit-kosten en wargear-opties leeft HIER. Zonder die opsplitsing bleef er in de campagne alleen
   een lijstnaam met kale unit-namen over — waardoor het leger van je tegenstander niet te laden was
   en geen van beide apps een volledige lijst kon tonen.

   Daarom rekent OWC bij elke lijst-sync per entry punten + opties uit en stuurt dat mee als
   `p_rendered` (kolom tow_lists.rendered). Bewust NIET in de lijst-objecten zelf: die worden weer
   teruggelezen in de lokale state en met een snapshot vergeleken, dus afgeleide data daarin zou
   tussen devices heen en weer blijven pushen.

   Eén bron van waarheid: `entryPoints` en `optionSummary` — exact wat de builder zelf op het scherm
   zet. Niets wordt hier nagerekend of benaderd. Lukt een catalogus niet, dan blijft `punten` weg
   (null) in plaats van een gok. */

const SEP = ' · '; // hetzelfde scheidingsteken als optionSummary gebruikt

/** Eén unit-regel zoals de campagne 'm toont. `punten` mag null zijn: onbekend is beter dan verzonnen. */
export interface RenderedEntry {
  uid: string;
  unitId: string;
  naam: string;
  /** De BASIS-categorie: de catalogus-array waar de unit uit komt, en de sleutel waarmee de builder
   *  hem opzoekt. Zegt wát voor entry dit is (een character blijft een character), NIET in welk
   *  slot hij deze lijst bezet. */
  cat: string;
  /** De EFFECTIEVE categorie onder de compositie van deze lijst — het slot dat de unit hier echt
   *  bezet. Composities kunnen een unit verplaatsen (Renegade V2 zet de Corpse Cart in Core en de
   *  Varghulf in Special), en dan zijn dit en `cat` verschillend. De campagne toonde tot 12-08-2026
   *  alleen `cat` en zette zo'n unit dus in het verkeerde vak (Ferry). Groeiplafonds blijven wél op
   *  `cat` lopen: characters +50, de rest +25 — een character dat een Rare-slot vult is nog steeds
   *  een character. */
  catEff: string;
  count: number;
  punten: number | null;
  opties: string[];
  /** De CATALOGUSNAAM ("Dark Elf Warriors"). `naam` kan de eigen campagne-naam dragen; overal waar
   *  een unit getoond wordt is het datasheet de hoofdregel en de eigen naam de extra regel. */
  datasheet: string | null;
  /** Unit Strength van de hele unit (models × US per model uit de Troop Type Table). De campagne
   *  gebruikt dit voor Fresh Blood, dat officieel op US gaat en niet op modellen — 3 ruiters erbij is
   *  al US 6. `null` = niet te bepalen (onbekend troop type, of een "As Starting Wounds"-type zonder
   *  bruikbare statline); de campagne valt dan terug op het aantal modellen. */
  us: number | null;
}
export interface RenderedList {
  id: string;
  naam: string;
  punten: number | null;
  entries: RenderedEntry[];
  /** De VOLLEDIGE validatie-uitslag van deze app (`deriveList().warnings`) — samenstellingsregels,
   *  unit-maxima, categorie-percentages, magic-item-budget, Battle March-minima, alles. De campagne
   *  kan die regels niet zelf nalopen (de catalogus zit hier), en zonder deze lijst kon je daar een
   *  ongeldige lijst indienen terwijl OWC 'm afkeurde (Joost 31-07). Leeg = niets te melden.
   *  `null` = niet te bepalen (catalogus/overlay ontbrak) — dan blokkeert de campagne NIET op iets
   *  wat we niet weten. */
  fouten: string[] | null;
}

/** Minimale vorm van een opgeslagen lijst die we hier nodig hebben. */
type SavedLike = BuilderList & { id?: string; name?: string; army?: string; computedPoints?: number };

const BASE = (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';

// Catalogus-cache per army-slug. De sync pusht gedebounced maar wel váák; opnieuw fetchen per push
// zou onnodig netwerkverkeer zijn voor data die binnen een sessie niet verandert.
const armyCache: Record<string, OwbArmy | null> = {};
let itemsByArmy: Record<string, string[]> | null = null;
const itemsCache: Record<string, MagicItemsData | null> = {};

async function haalArmy(slug: string): Promise<OwbArmy | null> {
  if (slug in armyCache) return armyCache[slug];
  try {
    const r = await fetch(`${BASE}owb/${slug}.json`);
    armyCache[slug] = r.ok ? ((await r.json()) as OwbArmy) : null;
  } catch {
    armyCache[slug] = null;
  }
  return armyCache[slug];
}

/** Magic-items-data per leger. Zonder deze data blijven item-punten buiten het totaal, dus we halen
 *  'm op dezelfde manier op als de builder/picker dat doen. */
async function haalItems(slug: string): Promise<MagicItemsData | null> {
  if (slug in itemsCache) return itemsCache[slug];
  try {
    if (!itemsByArmy) {
      const r = await fetch(`${BASE}owb/the-old-world.json`);
      const m = r.ok ? await r.json() : null;
      itemsByArmy = {};
      for (const a of (m?.armies ?? [])) itemsByArmy[a.id] = Array.isArray(a.items) ? a.items : [];
    }
    const files = itemsByArmy[slug] ?? [];
    if (!files.length) { itemsCache[slug] = null; return null; }
    const delen = await Promise.all(files.map((f: string) =>
      fetch(`${BASE}owb/${f}`).then((r) => (r.ok ? r.json() : null)).catch(() => null)));
    // De picker voegt de item-bestanden samen tot één set; hetzelfde hier.
    const samen = delen.filter(Boolean).reduce<MagicItemsData>((acc, deel) => {
      const d = deel as MagicItemsData;
      return { ...acc, ...d, items: [...((acc as { items?: unknown[] }).items ?? []), ...((d as { items?: unknown[] }).items ?? [])] } as MagicItemsData;
    }, {} as MagicItemsData);
    itemsCache[slug] = samen;
  } catch {
    itemsCache[slug] = null;
  }
  return itemsCache[slug];
}

// Overlay-cache per composition-slug (zelfde patroon als de catalogus-cache).
const overlayCache: Record<string, CompositionOverlay | null> = {};
async function haalOverlay(comp: string): Promise<CompositionOverlay | null> {
  if (comp in overlayCache) return overlayCache[comp];
  try {
    const bestand = OVERLAY_FILES[comp as keyof typeof OVERLAY_FILES];
    if (!bestand) { overlayCache[comp] = null; return null; }
    const r = await fetch(`${BASE}renegade/${bestand}`);
    overlayCache[comp] = r.ok ? ((await r.json()) as CompositionOverlay) : null;
  } catch {
    overlayCache[comp] = null;
  }
  return overlayCache[comp];
}

/** Splits de compacte optie-samenvatting terug in losse labels (de campagne toont ze als chips). */
const labels = (s: string): string[] => (s || '').split(SEP).map((x) => x.trim()).filter(Boolean);

// De rules-index (public/owb/rules-index.json) draagt per unit-naam het troop type en de statline —
// samen goed voor de Unit Strength. Eén fetch per sessie, net als de catalogus-cache hierboven.
type RuleIdx = Record<string, { troopType?: string; stats?: { W?: string }[] }>;
let ruleIdxCache: RuleIdx | null | undefined;
async function haalRuleIndex(): Promise<RuleIdx | null> {
  if (ruleIdxCache !== undefined) return ruleIdxCache;
  try {
    const r = await fetch(`${BASE}owb/rules-index.json`);
    ruleIdxCache = r.ok ? ((await r.json()) as RuleIdx) : null;
  } catch {
    ruleIdxCache = null;
  }
  return ruleIdxCache;
}

/** Reken één lijst uit. Onbekende unit (catalogus mist 'm) → wel de regel, geen punten. */
function renderEen(
  list: SavedLike,
  army: OwbArmy | null,
  itemsData: MagicItemsData | null,
  usVoor: (naam: string, models: number) => number | null,
): RenderedList {
  // Validatie via deriveList: `warnings` is volgens de eigen documentatie de AUTORITATIEVE, complete
  // set — precies wat de builder in z'n "N to fix"-paneel zet. Zonder catalogus valt er niets te
  // valideren; dan null (niet: leeg, want dat zou "alles in orde" beweren).
  let fouten: string[] | null = null;
  if (army) {
    try {
      fouten = deriveList(list as BuilderList, army, itemsData ?? undefined).warnings.slice(0, 20);
    } catch {
      fouten = null;
    }
  }
  const getUnit = (cat: Category, id: string): OwbUnit | undefined => army?.[cat]?.find((u) => u.id === id);
  const entries: RenderedEntry[] = (list.entries ?? []).map((e: ListEntry) => {
    const unit = getUnit(e.cat, e.unitId);
    const count = Math.max(1, e.count || 1);
    return {
      uid: e.uid,
      unitId: e.unitId,
      naam: (e.customName || unit?.name_en || e.unitId || 'Unit').trim(),
      cat: e.cat,
      // Zelfde bron als de builder zelf gebruikt om de secties te tellen (deriveList): de compositie
      // mag een unit verplaatsen. Zonder catalogus valt er niets te bepalen → dan de basis.
      catEff: unit ? unitCategoryFor(unit, list.composition, e.cat) : e.cat,
      count,
      punten: unit ? entryPoints(unit, e, itemsData ?? undefined) : null,
      opties: unit ? labels(optionSummary(unit, e, itemsData ?? undefined)) : [],
      datasheet: unit?.name_en ?? null,
      // Op de CATALOGUS-naam, niet op de custom naam: "The Bleeding Hand" staat niet in de
      // rules-index, "Witch Elves" wel.
      us: unit ? usVoor(unit.name_en, count) : null,
    };
  });
  const bekend = entries.every((x) => x.punten != null);
  return {
    id: String(list.id ?? ''),
    naam: (list.name ?? '').trim(),
    punten: bekend ? entries.reduce((s, x) => s + (x.punten ?? 0), 0) : (list.computedPoints ?? null),
    entries,
    fouten,
  };
}

/**
 * Reken de opsplitsing uit voor ÁLLE lijsten met een id.
 *
 * Eerst deden we alleen lijsten met de campagne-vlag — dat leek zuinig, maar de campagne leest ook
 * lijsten die die vlag niet hebben: de AI-dummy (gekozen op naam via towc_config.ai_dummy_lijst) en
 * lijsten uit de voorbereidingsfase. Die bleven dan zonder punten en opties in de app staan. De
 * kosten zijn laag: per army-slug één catalogus-fetch, gecached voor de hele sessie.
 */
export async function renderLists(lists: unknown[]): Promise<RenderedList[]> {
  const kandidaten = (Array.isArray(lists) ? lists : []).filter((l): l is SavedLike => {
    const x = l as { id?: unknown } | null;
    return !!x && typeof x === 'object' && !!x.id;
  });
  if (!kandidaten.length) return [];
  const slugs = Array.from(new Set(kandidaten.map((l) => l.army).filter((s): s is string => !!s)));
  const paren = await Promise.all(slugs.map(async (s) => [s, await haalArmy(s), await haalItems(s)] as const));
  const perSlug = new Map(paren.map(([s, a, i]) => [s, { a, i }]));
  // Composition-overlays (Renegade e.d.) veranderen de catalogus ÉN de item-pool. Zonder overlay zou
  // de validatie tegen de verkeerde regels lopen — en dan liever geen uitspraak dan een verkeerde.
  const comps = Array.from(new Set(kandidaten.map((l) => l.composition).filter((c): c is string => !!c && hasOverlay(c))));
  const overlays = new Map<string, CompositionOverlay | null>(
    await Promise.all(comps.map(async (c) => [c, await haalOverlay(c)] as const)),
  );
  const usVoor = makeUnitStrengthLookup(await haalRuleIndex());
  return kandidaten.map((l) => {
    const bron = perSlug.get(l.army ?? '') ?? { a: null, i: null };
    const nodig = !!l.composition && hasOverlay(l.composition);
    const ov = nodig ? overlays.get(l.composition) ?? null : null;
    // Overlay nodig maar niet geladen → geen catalogus doorgeven, dan blijft `fouten` null (onbekend).
    if (nodig && !ov) return renderEen(l, null, null, usVoor);
    const cat = bron.a ? catalogueFor(bron.a, l.composition, ov) : bron.a;
    const items = ov && bron.i ? applyOverlayItems(bron.i, ov) : bron.i;
    return renderEen(l, cat, items, usVoor);
  });
}
