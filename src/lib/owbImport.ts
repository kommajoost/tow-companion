// Map an Old World Builder text export onto our editable builder list. The parser in
// armyParser.ts turns the paste into a loose `Army` (names + option lines); here we resolve
// those against the real OWB catalogue (same source data, so names line up) to produce
// `ListEntry[]` the builder can edit — matching each unit to its catalogue id and each option
// line to a "group/index" key. Best-effort: unmatched units are reported and skipped, unmatched
// option lines are silently dropped (the user can fix them in the editor).
//
// NEW RECRUIT (30-10-2026): een New Recruit-export gaat door dezelfde functie, maar via zijn eigen
// parser (newRecruitParser.ts) en met een paar extra stappen die New Recruit nodig heeft: andere
// schrijfwijzen ("Wizard Level 2" = "Level 2 Wizard"), de lore als los item, sub-opties onder een
// ouder (de Wizard-level), verborgen catalogusvarianten overslaan, en de sub-items tussen haakjes
// alleen tegen het rijdier houden. Die stappen gelden ALLEEN voor New Recruit-tekst: een OWB-export
// importeert precies zoals voorheen.

import { parseArmyList } from './armyParser';
import { isNewRecruitText, parseNewRecruit, resolveCompositionRule } from './newRecruitParser';
import { CATEGORIES, COMPOSITION_RULES, isCharacter, isRadioGroup, isStandardOption, magicCategories, magicItemId, type Category, type OwbArmy, type OwbUnit, type OwbOption, type ListEntry, type MagicItemsData } from './owbBuilder';

// Strip OWB footnote markers ("{dark elves}", trailing "*") and collapse to a comparable key.
const clean = (s: string) => (s || '').replace(/\{[^}]*\}/g, ' ').replace(/\*/g, '').replace(/\s+/g, ' ').trim();
const norm = (s: string) => clean(s).toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/\[[^\]]*\]/g, ' ').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
// Enkelvoud per woord (alleen New Recruit): "Shields" ↔ "Shield", "Crossbowmen" ↔ "Crossbowman".
const sing = (k: string) => k.split(' ').map((w) => w.replace(/men$/, 'man').replace(/([^s])s$/, '$1')).join(' ');
// New Recruit schrijft de Wizard-level andersom dan OWB.
const nrAlias = (s: string) => s.replace(/^\s*wizard\s+level\s+(\d+)\s*$/i, 'Level $1 Wizard');
// Lore-namen vergelijken zonder "Lore of (the)": de catalogus heeft "shadowlands", de tekst "Lore of the Shadowlands".
const loreKey = (s: string) => norm(s.replace(/-/g, ' ')).replace(/^lore of (the )?/, '');

const OPTION_GROUP_KEYS: (keyof OwbUnit)[] = ['command', 'equipment', 'armor', 'options', 'mounts'];
// Radio-of-toggle hangt van de UNIT af (18-08-2026), niet van de groep: een equipment-groep met een
// `equippedDefault`-basis is een toggle-set, en een enkele optionele upgrade zonder gratis default
// ook. Zie `isRadioGroup` in owbBuilder voor de drie vormen en waarom.
const groupItems = (unit: OwbUnit, key: keyof OwbUnit): OwbOption[] =>
  (Array.isArray(unit[key]) ? (unit[key] as OwbOption[]) : []).filter((o) => o && o.name_en);

const newUid = () => 'e' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);

export interface ImportResult {
  entries: ListEntry[];
  matched: number;
  total: number;
  unmatched: string[];
  /** `faction`/`composition` (30-10-2026): de kop zoals de export hem noemt, zodat de aanroeper het
   *  leger en de compositie kan voorselecteren (New Recruit; zie resolveNewRecruitHeader). */
  header: { name?: string; points?: number; rule?: string; faction?: string; composition?: string };
  /** Welk formaat er geplakt is. */
  source: 'owb' | 'newrecruit';
}

export interface ImportOptions {
  /** De lore-sleutels die de app kent (Object.keys van de lores-data). Zonder deze lijst wordt een
   *  New Recruit-lore als catalogus-slug bewaard; mét wordt hij opgelost zoals de builder dat doet
   *  ("primal-magic" → "lore-of-primal-magic"). */
  loreKeys?: string[];
}

/** Eén geplakte unit, los van het formaat. */
interface PastedUnit {
  name: string; modelName?: string; count: number | null; category: string; options: string[];
  /** Alleen New Recruit: de sub-items tussen haakjes (rijdier/crew). */
  subOptions?: string[];
  /** Alleen New Recruit: per item (kleine letters) op hoeveel modellen het staat. */
  itemCounts?: Record<string, number>;
}

export function importOwbText(text: string, army: OwbArmy, itemsData?: MagicItemsData, armyItemLists?: string[], importOpts: ImportOptions = {}): ImportResult {
  const nrList = isNewRecruitText(text ?? '') ? parseNewRecruit(text) : null;
  const nr = !!nrList;
  const parsed = nrList ? null : parseArmyList(text);
  const pastedUnits: PastedUnit[] = nrList
    ? nrList.units.map((u) => ({ name: u.name, modelName: u.modelName, count: u.count, category: u.category, options: u.options.map(nrAlias), subOptions: u.subOptions, itemCounts: u.itemCounts }))
    : parsed!.units.map((u) => ({ name: u.name, count: u.count, category: u.category, options: u.options }));

  // Catalogue lookup by normalised unit name (first category wins on a tie).
  const byName = new Map<string, { cat: Category; unit: OwbUnit }>();
  // New Recruit: ALLE treffers per naam, zodat de categorie uit de export (en zichtbaar boven verborgen)
  // kan beslissen. De War Hydra staat bij Renegade V2 in Special én Rare.
  const allByName = new Map<string, { cat: Category; unit: OwbUnit }[]>();
  const allBySing = new Map<string, { cat: Category; unit: OwbUnit }[]>();
  for (const cat of CATEGORIES) {
    for (const unit of army[cat] ?? []) {
      const k = norm(unit.name_en);
      if (k && !byName.has(k)) byName.set(k, { cat, unit });
      if (k) {
        allByName.set(k, [...(allByName.get(k) ?? []), { cat, unit }]);
        allBySing.set(sing(k), [...(allBySing.get(sing(k)) ?? []), { cat, unit }]);
      }
    }
  }

  const findUnitNr = (pu: PastedUnit): { cat: Category; unit: OwbUnit } | undefined => {
    const pref = norm(pu.category);
    const choose = (hits: { cat: Category; unit: OwbUnit }[]) => {
      const zichtbaar = hits.filter((h) => !(h.unit as { hidden?: boolean }).hidden);
      const pool = zichtbaar.length ? zichtbaar : hits;
      return pool.find((h) => h.cat === pref) ?? pool[0];
    };
    // Eerst de unitnaam, dan de modelnaam ("Dark Elf Crossbowmen" heet in OWB "Repeater Crossbowmen";
    // het model heet in beide "Repeater Crossbowman").
    const namen = [pu.name, pu.modelName].filter((n): n is string => !!n);
    for (const n of namen) {
      const k = norm(n);
      if (!k) continue;
      const hits = allByName.get(k) ?? allBySing.get(sing(k));
      if (hits?.length) return choose(hits);
    }
    for (const n of namen) {
      const k = norm(n);
      if (!k) continue;
      const hits: { cat: Category; unit: OwbUnit }[] = [];
      for (const [ck, v] of allByName) if (ck.includes(k) || k.includes(ck)) hits.push(...v);
      if (hits.length) return choose(hits);
    }
    return undefined;
  };

  const entries: ListEntry[] = [];
  const unmatched: string[] = [];
  let matched = 0;

  for (const pu of pastedUnits) {
    const key = norm(pu.name);
    if (!key) continue;
    let hit = nr ? findUnitNr(pu) : byName.get(key);
    if (!hit && !nr) {
      // looser containment match (handles "…of the …" suffixes, plurals, etc.)
      for (const [k, v] of byName) { if (k.includes(key) || key.includes(k)) { hit = v; break; } }
    }
    if (!hit) { unmatched.push(pu.name); continue; }
    matched++;

    const { cat, unit } = hit;
    const min = unit.minimum ?? 1;
    const max = (unit.maximum ?? 0) === 0 ? 9999 : unit.maximum!;
    const count = Math.max(min, Math.min(max, pu.count ?? min));

    const matchOpt = (on: string): string | null => {
      for (const gk of OPTION_GROUP_KEYS) { const i = groupItems(unit, gk).findIndex((o) => norm(o.name_en) === on); if (i >= 0) return `${String(gk)}/${i}`; }
      for (const gk of OPTION_GROUP_KEYS) { const i = groupItems(unit, gk).findIndex((o) => { const k = norm(o.name_en); return !!k && (k.includes(on) || on.includes(k)); }); if (i >= 0) return `${String(gk)}/${i}`; }
      return null;
    };
    // New Recruit: dezelfde twee passes, maar verborgen catalogusvarianten tellen niet mee (anders
    // pakt "Manticore" de verborgen "Manticore {dark elves}" in plaats van de Renegade-variant), en
    // enkel/meervoud is gelijk ("Shield" = "Shields"). Tussen de passes in: de sub-opties.
    const zichtbaar = (o: OwbOption) => !o.hidden;
    const matchOptExactNr = (on: string): string | null => {
      for (const gk of OPTION_GROUP_KEYS) { const i = groupItems(unit, gk).findIndex((o) => zichtbaar(o) && norm(o.name_en) === on); if (i >= 0) return `${String(gk)}/${i}`; }
      for (const gk of OPTION_GROUP_KEYS) { const i = groupItems(unit, gk).findIndex((o) => zichtbaar(o) && sing(norm(o.name_en)) === sing(on)); if (i >= 0) return `${String(gk)}/${i}`; }
      return null;
    };
    const matchOptLooseNr = (on: string): string | null => {
      for (const gk of OPTION_GROUP_KEYS) { const i = groupItems(unit, gk).findIndex((o) => { const k = norm(o.name_en); return zichtbaar(o) && !!k && (k.includes(on) || on.includes(k)); }); if (i >= 0) return `${String(gk)}/${i}`; }
      return null;
    };
    // Een sub-optie onder een ouder in een gewone groep ("Wizard" → "Level 2 Wizard"). Rijdier-sub-
    // opties niet: die komen uit de sub-items tussen haakjes (hieronder), anders kiest een los item
    // per ongeluk een ander rijdier.
    const matchSubNr = (on: string): { gk: keyof OwbUnit; pi: number; ci: number; parent: OwbOption; child: OwbOption } | null => {
      for (const gk of OPTION_GROUP_KEYS) {
        if (gk === 'mounts') continue;
        const parents = groupItems(unit, gk);
        for (let pi = 0; pi < parents.length; pi++) {
          const parent = parents[pi];
          if (parent.hidden || !Array.isArray(parent.options)) continue;
          const ci = parent.options.findIndex((c) => !!c && !!c.name_en && !c.hidden && (norm(c.name_en) === on || sing(norm(c.name_en)) === sing(on)));
          if (ci >= 0) return { gk, pi, ci, parent, child: parent.options[ci] };
        }
      }
      return null;
    };

    // Single-choice groups keep at most one explicit (non-default) pick — the free default
    // stays implicit; toggle groups keep every match. Lines that matched a normal option group are
    // tracked so they aren't ALSO consumed as magic items below (only true leftovers feed magic).
    const radioChoice = new Map<string, string>();
    const toggles: string[] = [];
    const subOpts: string[] = [];
    const stackCounts: Record<string, number> = {};
    const consumed = new Set<number>(); // indices into pu.options matched by a normal option group
    let lores: string[] | undefined;
    pu.options.forEach((optText, idx) => {
      // OWB writes a stackable option as "3x Additional hand weapon" (src/utils/unit.jsx), the count
      // being how many models take it. Strip it before matching — left on, it only ever matched via
      // the loose contains-pass — and keep the number, because for these the number IS the price.
      const qty = optText.match(/^\s*(\d+)\s*x\s+/i);
      const on = norm(qty ? optText.slice(qty[0].length) : optText);
      if (!on) return;
      let k: string | null;
      if (nr) {
        k = matchOptExactNr(on);
        if (!k) {
          const sub = matchSubNr(on);
          if (sub) {
            consumed.add(idx);
            const pkey = `${String(sub.gk)}/${sub.pi}`;
            // De ouder moet aan staan, anders telt de sub-optie niet (subOptionGroups).
            if (isRadioGroup(unit, sub.gk)) { if (!sub.parent.active) radioChoice.set(String(sub.gk), pkey); }
            else if (!sub.parent.alwaysActive && !isStandardOption(unit, sub.gk, sub.parent) && !toggles.includes(pkey)) toggles.push(pkey);
            // De gratis exclusieve default is impliciet, net als in de builder.
            if (!(sub.child.exclusive && sub.child.active)) {
              const sk = `subopt/${String(sub.gk)}/${sub.pi}/${sub.ci}`;
              if (!subOpts.includes(sk)) subOpts.push(sk);
            }
            return;
          }
          // De lore van een Wizard staat bij New Recruit als los item ("Battle Magic").
          const lore = (unit.lores ?? []).find((l) => loreKey(l) === loreKey(optText));
          if (lore) {
            consumed.add(idx);
            if (!lores) {
              const keys = importOpts.loreKeys;
              lores = [keys ? ([lore, `lore-of-${lore}`, `lore-of-the-${lore}`].find((c) => keys.includes(c)) ?? lore) : lore];
            }
            return;
          }
          k = matchOptLooseNr(on);
        }
      } else {
        k = matchOpt(on);
      }
      if (!k) return;
      consumed.add(idx);
      const [gk, iStr] = k.split('/');
      const opt = groupItems(unit, gk as keyof OwbUnit)[Number(iStr)];
      if (isRadioGroup(unit, gk as keyof OwbUnit)) {
        if (opt && !opt.active) radioChoice.set(gk, k);
      } else if (!toggles.includes(k)) {
        toggles.push(k);
        // No number on the line (a hand-typed list rather than an OWB export) means the intent is
        // unrecorded. Best-effort, in keeping with the rest of this importer: assume the whole unit
        // takes it, which is the ordinary case for a wargear upgrade, and let the option's own cap
        // pull it back where the data sets one. Never left at 0 — that would silently drop the cost.
        // New Recruit noemt het wél: zoveel modellen dragen dit item (som van hun `•`-regels).
        const nrQty = nr ? pu.itemCounts?.[optText.toLowerCase()] : undefined;
        if (opt?.stackable) stackCounts[k] = qty ? Number(qty[1]) : nrQty ?? count;
      }
    });

    // Mount sub-options: if the chosen mount carries nested `options`, match any pasted option
    // names against them and store `mountopt/<mountIdx>/<subIdx>` (Feature 1). Best-effort only.
    // New Recruit: alleen de sub-items tussen haakjes ("Manticore (Venomous tail)").
    const mountOpts: string[] = [];
    const mounts = groupItems(unit, 'mounts');
    const mountKey = radioChoice.get('mounts');
    const mountIdx = mountKey ? Number(mountKey.split('/')[1]) : mounts.findIndex((m) => m.active);
    const mountSubs = mountIdx >= 0 && Array.isArray(mounts[mountIdx]?.options) ? mounts[mountIdx].options! : [];
    if (mountSubs.length) {
      for (const optText of (nr ? pu.subOptions ?? [] : pu.options)) {
        const on = norm(optText);
        if (!on) continue;
        const si = mountSubs.findIndex((s) => { const k = norm(s.name_en); return !!k && (!nr || !s.hidden) && (k === on || k.includes(on) || on.includes(k)); });
        if (si >= 0) { const key = `mountopt/${mountIdx}/${si}`; if (!mountOpts.includes(key)) mountOpts.push(key); }
      }
    }

    // Magic items (characters only): the unit's `items[]` sections become magic categories; match
    // any LEFTOVER pasted option line (one not already consumed by a normal group) against an item's
    // name, respecting each category's `maxItems` cap and never adding a duplicate key. Best-effort —
    // a line that matches neither a normal group nor a magic item is still silently dropped (as today).
    // New Recruit: ook voor gewone units (een magic standard op een standard bearer); categorieën van
    // een andere compositie tellen dan niet mee.
    const magicOpts: string[] = [];
    if (itemsData && armyItemLists && (isCharacter(cat) || nr)) {
      // Pass an in-progress entry carrying the options matched so far, so OPTION-ATTACHED magic
      // categories — a Battle Standard Bearer's (or Standard Bearer's) magic banner, which is only
      // unlocked when that command option is active — are generated. Without the entry those
      // categories don't exist and the pasted banner line silently fails to import.
      const inProgress: ListEntry = { uid: '', cat, unitId: unit.id, count, opts: [...radioChoice.values(), ...toggles, ...subOpts, ...mountOpts] };
      const mcats = magicCategories(unit, armyItemLists, itemsData, inProgress).filter((mc) => !nr || !mc.hidden);
      const countByCat = new Map<string, number>();
      pu.options.forEach((optText, idx) => {
        if (consumed.has(idx)) return;
        const on = norm(optText);
        if (!on) return;
        for (const mc of mcats) {
          if ((countByCat.get(mc.id) ?? 0) >= mc.maxItems) continue;
          let item = mc.items.find((it) => norm(it.name_en) === on);
          if (!item) item = mc.items.find((it) => { const k = norm(it.name_en); return !!k && (k.includes(on) || on.includes(k)); });
          if (!item) continue;
          const key = `magic/${mc.id}/${magicItemId(item)}`;
          if (magicOpts.includes(key)) continue;
          magicOpts.push(key);
          countByCat.set(mc.id, (countByCat.get(mc.id) ?? 0) + 1);
          consumed.add(idx); // this line is now spoken for — don't match it in a later category
          break;
        }
      });
    }

    entries.push({
      uid: newUid(), cat, unitId: unit.id, count,
      opts: [...radioChoice.values(), ...toggles, ...subOpts, ...mountOpts, ...magicOpts],
      // Only when there is something to say: an entry with no stackable option keeps the exact shape
      // it had before counts existed, so nothing downstream sees a new empty field.
      ...(Object.keys(stackCounts).length ? { optCounts: stackCounts } : {}),
      ...(lores ? { lores, spells: [] } : {}),
    });
  }

  const header: ImportResult['header'] = {};
  if (nrList) {
    const h = nrList.header;
    // "Unnamed list" is New Recruits standaardnaam: dan houdt de aanroeper zijn eigen naam.
    if (h.name && !/^unnamed list$/i.test(h.name)) header.name = h.name;
    if (h.points != null) header.points = h.points;
    const rule = resolveCompositionRule(h.ruleText);
    if (rule) header.rule = rule;
    if (h.faction) header.faction = h.faction;
    if (h.composition) header.composition = h.composition;
    return { entries, matched, total: pastedUnits.length, unmatched, header, source: 'newrecruit' };
  }
  if (parsed!.name && parsed!.name !== 'Army') header.name = parsed!.name;
  if (parsed!.points != null) header.points = parsed!.points;
  // The export's 3rd header field is the composition rule (e.g. "Open War").
  const compField = norm(parsed!.composition);
  if (compField) { const r = COMPOSITION_RULES.find((x) => norm(x.name) === compField || compField.includes(norm(x.name))); if (r) header.rule = r.id; }

  return { entries, matched, total: parsed!.units.length, unmatched, header, source: 'owb' };
}
