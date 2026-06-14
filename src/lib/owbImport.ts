// Map an Old World Builder text export onto our editable builder list. The parser in
// armyParser.ts turns the paste into a loose `Army` (names + option lines); here we resolve
// those against the real OWB catalogue (same source data, so names line up) to produce
// `ListEntry[]` the builder can edit — matching each unit to its catalogue id and each option
// line to a "group/index" key. Best-effort: unmatched units are reported and skipped, unmatched
// option lines are silently dropped (the user can fix them in the editor).

import { parseArmyList } from './armyParser';
import { CATEGORIES, COMPOSITION_RULES, OPTION_GROUPS, type Category, type OwbArmy, type OwbUnit, type OwbOption, type ListEntry } from './owbBuilder';

// Strip OWB footnote markers ("{dark elves}", trailing "*") and collapse to a comparable key.
const clean = (s: string) => (s || '').replace(/\{[^}]*\}/g, ' ').replace(/\*/g, '').replace(/\s+/g, ' ').trim();
const norm = (s: string) => clean(s).toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/\[[^\]]*\]/g, ' ').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

const OPTION_GROUP_KEYS: (keyof OwbUnit)[] = ['command', 'equipment', 'armor', 'options', 'mounts'];
const RADIO_GROUPS = new Set(OPTION_GROUPS.filter((g) => g.radio).map((g) => String(g.key)));
const groupItems = (unit: OwbUnit, key: keyof OwbUnit): OwbOption[] =>
  (Array.isArray(unit[key]) ? (unit[key] as OwbOption[]) : []).filter((o) => o && o.name_en);

const newUid = () => 'e' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);

export interface ImportResult {
  entries: ListEntry[];
  matched: number;
  total: number;
  unmatched: string[];
  header: { name?: string; points?: number; rule?: string };
}

export function importOwbText(text: string, army: OwbArmy): ImportResult {
  const parsed = parseArmyList(text);

  // Catalogue lookup by normalised unit name (first category wins on a tie).
  const byName = new Map<string, { cat: Category; unit: OwbUnit }>();
  for (const cat of CATEGORIES) {
    for (const unit of army[cat] ?? []) {
      const k = norm(unit.name_en);
      if (k && !byName.has(k)) byName.set(k, { cat, unit });
    }
  }

  const entries: ListEntry[] = [];
  const unmatched: string[] = [];
  let matched = 0;

  for (const pu of parsed.units) {
    const key = norm(pu.name);
    if (!key) continue;
    let hit = byName.get(key);
    if (!hit) {
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
    // Single-choice groups keep at most one explicit (non-default) pick — the free default
    // stays implicit; toggle groups keep every match.
    const radioChoice = new Map<string, string>();
    const toggles: string[] = [];
    for (const optText of pu.options) {
      const on = norm(optText);
      if (!on) continue;
      const k = matchOpt(on);
      if (!k) continue;
      const [gk, iStr] = k.split('/');
      if (RADIO_GROUPS.has(gk)) {
        const opt = groupItems(unit, gk as keyof OwbUnit)[Number(iStr)];
        if (opt && !opt.active) radioChoice.set(gk, k);
      } else if (!toggles.includes(k)) {
        toggles.push(k);
      }
    }

    // Mount sub-options: if the chosen mount carries nested `options`, match any pasted option
    // names against them and store `mountopt/<mountIdx>/<subIdx>` (Feature 1). Best-effort only.
    const mountOpts: string[] = [];
    const mounts = groupItems(unit, 'mounts');
    const mountKey = radioChoice.get('mounts');
    const mountIdx = mountKey ? Number(mountKey.split('/')[1]) : mounts.findIndex((m) => m.active);
    const mountSubs = mountIdx >= 0 && Array.isArray(mounts[mountIdx]?.options) ? mounts[mountIdx].options! : [];
    if (mountSubs.length) {
      for (const optText of pu.options) {
        const on = norm(optText);
        if (!on) continue;
        const si = mountSubs.findIndex((s) => { const k = norm(s.name_en); return !!k && (k === on || k.includes(on) || on.includes(k)); });
        if (si >= 0) { const key = `mountopt/${mountIdx}/${si}`; if (!mountOpts.includes(key)) mountOpts.push(key); }
      }
    }

    entries.push({ uid: newUid(), cat, unitId: unit.id, count, opts: [...radioChoice.values(), ...toggles, ...mountOpts] });
  }

  const header: ImportResult['header'] = {};
  if (parsed.name && parsed.name !== 'Army') header.name = parsed.name;
  if (parsed.points != null) header.points = parsed.points;
  // The export's 3rd header field is the composition rule (e.g. "Open War").
  const compField = norm(parsed.composition);
  if (compField) { const r = COMPOSITION_RULES.find((x) => norm(x.name) === compField || compField.includes(norm(x.name))); if (r) header.rule = r.id; }

  return { entries, matched, total: parsed.units.length, unmatched, header };
}
