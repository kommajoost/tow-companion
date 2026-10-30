import type { Army, ArmyUnit } from '../types';
import { COMPOSITION_RULES } from './owbBuilder';
import { compName, titleCase } from './armies';

// NEW RECRUIT-EXPORT (30-10-2026, Joost): op een toernooi krijg je vlak voor elke 2v2-battle de lijsten
// van je tegenstanders, gemaakt in New Recruit (newrecruit.eu). Die tekst ziet er anders uit dan een
// Old World Builder-export:
//
//   Dark Elves - Renegades v2.0 - Unnamed list - [1000 pts]
//
//   # ++ Combined Arms + Grand Melee ++ [1000 pts]
//   ## Characters [385 pts]
//   Sorceress [139 pts]: Hand Weapon, Wizard Level 2 [30 pts], Battle Magic, Dark Steed [14 pts] (Hand Weapon)
//
//   ## Core [268 pts]
//   Dark Riders [158 pts]:
//   • 4x Dark Rider [20 pts]: Hand Weapon, Cavalry Spear, …, Dark Steed (Hand Weapon)
//   • 1x Dark Rider [20 pts]: …, Musician [6 pts], Dark Steed (Hand Weapon)
//
//   Created with newrecruit.eu v37.6
//
// Geen stat- of Special Rules-regels: alleen namen. Dit bestand leest de tekst; owbImport legt de
// namen daarna op de OWB-catalogus, zodat het spel dezelfde regels en profielen krijgt als bij een
// lijst die in OWC gebouwd is. Hier wordt niets verzonnen — alleen tekst uit elkaar gehaald.

export interface NewRecruitHeader {
  /** "Dark Elves" — de factie zoals New Recruit hem noemt. */
  faction: string;
  /** "Renegades v2.0" — de compositie (army list) zoals New Recruit hem noemt; leeg als die ontbreekt. */
  composition: string;
  /** "Unnamed list" — de naam van de lijst. */
  name: string;
  points: number | null;
  /** "Combined Arms + Grand Melee" — de tekst uit de `# ++ … ++`-regel. */
  ruleText: string;
}

export interface NewRecruitUnit {
  name: string;
  /** De modelnaam van de eerste `•`-regel ("Repeater Crossbowman"), als terugval voor de unitnaam. */
  modelName?: string;
  /** Opgeteld over alle `•`-regels; 1 voor een unit op één regel. */
  count: number;
  points: number | null;
  category: string;
  /** Unieke items over alle modelregels, in volgorde, zonder "[n pts]" en zonder de sub-items. */
  options: string[];
  /** De sub-items tussen haakjes ("Dark Steed (Hand Weapon)" → Hand Weapon), apart gehouden: ze horen
   *  bij het rijdier of de crew, niet bij het model zelf. Een Manticore "(Wicked claws, Heavy Armour)"
   *  mag de berijder geen heavy armour geven. */
  subOptions: string[];
  /** Per item (kleine letters): op hoeveel modellen het staat — de som van de `•`-regels die het
   *  noemen. Voor een optie die per model telt (stackable) is dat het aantal dat betaalt. */
  itemCounts: Record<string, number>;
}

export interface NewRecruitList { header: NewRecruitHeader; units: NewRecruitUnit[] }

const PTS_RE = /\[\s*(\d+)\s*(?:pts|points)?\s*\]/i;
const PTS_ALL = /\s*\[\s*\d+\s*(?:pts|points)?\s*\]/gi;
const HEADER_RE = /^(.+?)\s+-\s+\[\s*(\d+)\s*(?:pts|points)?\s*\]\s*$/i;
const RULE_RE = /^#\s*\+\+\s*(.+?)\s*\+\+/;
const CAT_RE = /^##\s*(.+?)\s*$/;
const MODEL_RE = /^[•·*•-]\s*(\d+)\s*x\s+(.+)$/i;

const ptsOf = (s: string): number | null => { const m = s.match(PTS_RE); return m ? parseInt(m[1], 10) : null; };
const stripPts = (s: string) => s.replace(PTS_ALL, '').replace(/\s+/g, ' ').trim();

/** Herkent een New Recruit-tekstexport. De voettekst is het zekerst; zonder voettekst (iemand knipt
 *  hem weg) de combinatie van de `# ++ … ++`-krachtregel en een `## Categorie`-regel — die gebruikt een
 *  Old World Builder-export nooit (daar staat `++ Characters ++` zonder hekje). */
export function isNewRecruitText(text: string): boolean {
  const t = text ?? '';
  if (/created with newrecruit\.eu/i.test(t)) return true;
  return /^\s*#\s*\+\+.+\+\+/m.test(t) && /^\s*##\s+\S/m.test(t);
}

/** Splitst op komma's die NIET tussen haakjes staan: "Manticore [130 pts] (Wicked claws, Heavy Armour)"
 *  is één item. */
function splitTopLevel(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '(' || ch === '[') depth++;
    else if ((ch === ')' || ch === ']') && depth > 0) depth--;
    if (ch === ',' && depth === 0) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}

/** Eén item → naam (zonder punten) + de sub-items tussen haakjes. */
function parseItem(raw: string): { name: string; subs: string[] } {
  const subs: string[] = [];
  // De haakjes aan het EIND zijn sub-items; haakjes midden in een naam laten we staan.
  let rest = raw;
  const m = raw.match(/^(.*?)\s*\(([^()]*)\)\s*$/);
  if (m) {
    rest = m[1];
    subs.push(...splitTopLevel(m[2]).map(stripPts).filter(Boolean));
  }
  return { name: stripPts(rest), subs };
}

/** "Name [pts]: a, b" → { title, points, items }. Een regel zonder dubbele punt is een kale titel. */
function splitUnitLine(line: string): { title: string; points: number | null; items: string } {
  // De eerste dubbele punt NA de punten (of de eerste als er geen punten zijn).
  const idx = line.indexOf(':');
  const head = idx >= 0 ? line.slice(0, idx) : line;
  const items = idx >= 0 ? line.slice(idx + 1) : '';
  return { title: stripPts(head), points: ptsOf(head), items };
}

export function parseNewRecruitHeader(line: string): NewRecruitHeader {
  const header: NewRecruitHeader = { faction: '', composition: '', name: '', points: null, ruleText: '' };
  const t = (line ?? '').trim();
  const m = t.match(HEADER_RE);
  const body = m ? m[1] : stripPts(t);
  header.points = m ? parseInt(m[2], 10) : ptsOf(t);
  const parts = body.split(/\s+-\s+/).map((p) => p.trim()).filter(Boolean);
  header.faction = parts[0] ?? '';
  if (parts.length >= 3) {
    header.composition = parts[1];
    header.name = parts.slice(2).join(' - ');
  } else if (parts.length === 2) {
    // Twee delen: factie + naam. Of het tweede deel een compositie is weten we niet zeker; de
    // resolver probeert het daarom zelf ook als compositie (zie resolveNewRecruitHeader).
    header.name = parts[1];
  }
  return header;
}

export function parseNewRecruit(text: string): NewRecruitList {
  const lines = (text ?? '').split(/\r?\n/);
  const firstIdx = lines.findIndex((l) => l.trim());
  const header = parseNewRecruitHeader(firstIdx >= 0 ? lines[firstIdx] : '');
  const units: NewRecruitUnit[] = [];
  let category = '';
  let current: NewRecruitUnit | null = null;
  const push = () => { if (current) units.push(current); current = null; };

  const addItems = (u: NewRecruitUnit, items: string, models: number) => {
    for (const raw of splitTopLevel(items)) {
      const { name, subs } = parseItem(raw);
      if (name) u.itemCounts[name.toLowerCase()] = (u.itemCounts[name.toLowerCase()] ?? 0) + models;
      if (name && !u.options.some((o) => o.toLowerCase() === name.toLowerCase())) u.options.push(name);
      for (const s of subs) if (!u.subOptions.some((o) => o.toLowerCase() === s.toLowerCase())) u.subOptions.push(s);
    }
  };

  for (let i = firstIdx + 1; i < lines.length && firstIdx >= 0; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (/^created with newrecruit/i.test(line)) break;
    const rule = line.match(RULE_RE);
    if (rule) {
      push();
      if (!header.ruleText) header.ruleText = stripPts(rule[1]);
      continue;
    }
    const cat = line.match(CAT_RE);
    if (cat) { push(); category = stripPts(cat[1]); continue; }
    const model = line.match(MODEL_RE);
    if (model) {
      if (!current) continue; // een losse modelregel zonder unit: niets om aan te hangen
      const { title, items } = splitUnitLine(model[2]);
      const n = parseInt(model[1], 10) || 0;
      const u: NewRecruitUnit = current;
      // De eerste modelregel zet het aantal op nul: een titelregel telt alleen als 1 zolang er
      // geen modelregels onder staan.
      if (!u.modelName) { u.modelName = title; u.count = 0; }
      u.count += n;
      addItems(u, items, n);
      continue;
    }
    // Anders: een nieuwe unit ("Name [pts]: items" of alleen "Name [pts]:").
    push();
    const { title, points, items } = splitUnitLine(line);
    current = { name: title || 'Unit', count: 1, points, category, options: [], subOptions: [], itemCounts: {} };
    addItems(current, items, 1);
  }
  push();
  return { header, units };
}

/** New Recruit → hetzelfde losse `Army` als parseArmyList, zodat elk bestaand plakpad de tekst in elk
 *  geval accepteert. De sub-items komen als losse regels achter de items (zo staan ze in de opties van
 *  de unit); `importOwbText` leest de New Recruit-structuur zelf en houdt ze daar wel apart. */
export function newRecruitToArmy(text: string): Army {
  const nr = parseNewRecruit(text);
  const units: ArmyUnit[] = nr.units.map((u, i) => ({
    id: String(i),
    name: u.name,
    count: u.count > 1 ? u.count : null,
    points: u.points,
    category: u.category,
    options: [...u.options, ...u.subOptions.filter((s) => !u.options.some((o) => o.toLowerCase() === s.toLowerCase()))],
    specialRules: [],
    profiles: [],
  }));
  const name = nr.header.name && !/^unnamed list$/i.test(nr.header.name) ? nr.header.name : (nr.header.faction || 'Army');
  return {
    name,
    points: nr.header.points,
    system: 'Warhammer: The Old World',
    faction: nr.header.faction,
    composition: nr.header.composition,
    units,
    raw: text ?? '',
  };
}

// ── Header → OWC-leger, compositie en regel ─────────────────────────────────────────────────────

const key = (s: string) => (s || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
// "Renegades v2.0" → "renegade v2": versienummer na de v inkorten, meervoud-s weg.
const compKey = (s: string) => key(s).replace(/\bv\s*(\d+)(?:\s+\d+)*\b/g, 'v$1').replace(/\b(\w+?)s\b/g, '$1');

/** Unieke treffer: exact, anders precies één kandidaat die de ander bevat. Twee of meer → null. */
function uniqueMatch<T>(needle: string, items: T[], keysOf: (t: T) => string[]): T | null {
  if (!needle) return null;
  const exact = items.filter((t) => keysOf(t).some((k) => k && k === needle));
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return null;
  const loose = items.filter((t) => keysOf(t).some((k) => k && k.length >= 4 && needle.length >= 4 && (k.includes(needle) || needle.includes(k))));
  return loose.length === 1 ? loose[0] : null;
}

/** Een compositie-regel ("Combined Arms + Grand Melee") → het OWB-regel-id. Exact eerst; anders de
 *  LANGSTE naam die erin staat, zodat "Combined Arms + Grand Melee" niet als "Combined Arms" leest. */
export function resolveCompositionRule(text: string): string | undefined {
  const k = key(text);
  if (!k) return undefined;
  const exact = COMPOSITION_RULES.find((r) => key(r.name) === k);
  if (exact) return exact.id;
  const hits = COMPOSITION_RULES.filter((r) => k.includes(key(r.name))).sort((a, b) => key(b.name).length - key(a.name).length);
  return hits[0]?.id;
}

export interface ResolvedHeader { army: string | null; composition: string | null; rule?: string }

/** New Recruit-factie + -compositie → OWC-legerslug + compositie-id (+ regel-id). Voorzichtig: bij
 *  twijfel `null`, dan kiest de speler zelf. */
export function resolveNewRecruitHeader(
  header: NewRecruitHeader,
  armies: { slug: string; name: string }[],
  compsByArmy: Record<string, string[]>,
): ResolvedHeader {
  const rule = resolveCompositionRule(header.ruleText);
  const fKey = key(header.faction);
  const army = uniqueMatch(fKey, armies, (a) => [key(a.name), key(a.slug.replace(/-/g, ' '))])?.slug ?? null;

  const compsOf = (slug: string) => compsByArmy[slug] ?? [slug];
  const compNames = (slug: string, c: string) => [compKey(compName(c, slug)), compKey(titleCase(c)), compKey(c.replace(/-/g, ' '))];
  const findComp = (slug: string, text: string): string | null => {
    const k = compKey(text);
    if (!k) return null;
    const comps = compsOf(slug);
    if (/\bgrand army\b/.test(k)) return comps.includes(slug) ? slug : null;
    // Renegade: "v2" kiest het Renegade Legacy Pack (V2), anders de oude Renegade Crowns-lijst. Nooit
    // andersom — dat zijn twee verschillende dingen (zie compName).
    if (/\brenegade\b/.test(k)) {
      const v2 = /\bv2\b/.test(k);
      const hit = comps.filter((c) => v2 ? c.endsWith('-renegade-v2') : (c.endsWith('-renegade') || c === 'renegade-crowns'));
      return hit.length === 1 ? hit[0] : null;
    }
    return uniqueMatch(k, comps, (c) => compNames(slug, c));
  };

  // Geen factie-treffer: misschien noemt New Recruit de compositie (een Army of Infamy) als factie.
  if (!army && fKey) {
    const hits: { slug: string; comp: string }[] = [];
    for (const a of armies) for (const c of compsOf(a.slug)) if (c !== a.slug && compNames(a.slug, c).includes(compKey(header.faction))) hits.push({ slug: a.slug, comp: c });
    if (hits.length === 1) return { army: hits[0].slug, composition: hits[0].comp, rule };
  }
  if (!army) return { army: null, composition: null, rule };

  let composition: string | null;
  if (header.composition) composition = findComp(army, header.composition);
  else {
    // Geen aparte compositie in de kop: misschien staat hij als tweede deel (waar wij de naam lazen);
    // anders is het de Grand Army van het leger.
    composition = (header.name ? findComp(army, header.name) : null) ?? (compsOf(army).includes(army) ? army : null);
  }
  return { army, composition, rule };
}
