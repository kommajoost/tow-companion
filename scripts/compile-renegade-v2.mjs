// Compile the lossless Renegade V2 references into the fields that can be mapped without guessing.
//
// This script deliberately has a narrow write surface:
//   - complete, rectangular statline tables;
//   - explicit Unit Size lines;
//   - complete "Special Rules:" lines.
//
// Ambiguous text remains in the per-pack coverage ledger. Points, option prices and prose rules that
// already live in the overlay are preserved.
import { readFileSync, writeFileSync } from 'node:fs';

const REN = new URL('../public/renegade/', import.meta.url);
const OWB = new URL('../public/owb/', import.meta.url);
const allItems = JSON.parse(readFileSync(new URL('magic-items.json', OWB), 'utf8'));
const rulesData = JSON.parse(readFileSync(new URL('../rules.json', OWB), 'utf8'));
const baseRules = rulesData.rules;
const PACKS = {
  de: 'dark-elves',
  sk: 'skaven',
  ok: 'ogre-kingdoms',
  cd: 'chaos-dwarfs',
  doc: 'daemons-of-chaos',
  lm: 'lizardmen',
  vc: 'vampire-counts',
};
const only = process.argv[2];

const norm = (value) => String(value ?? '')
  .toLowerCase()
  .replace(/\{[^}]*\}/g, '')
  .replace(/[^a-z0-9 ]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();
const slug = (value) => norm(value).replace(/ /g, '-');
const decodeEntities = (value) => String(value ?? '')
  .replace(/&AElig;/gi, 'Æ')
  .replace(/&amp;/gi, '&')
  .replace(/&quot;/gi, '"')
  .replace(/&#39;/gi, "'");

const ruleSlugByName = new Map(Object.entries(baseRules).map(([key, rule]) => [norm(rule.name), key]));
const loreSlugByName = new Map(Object.entries(rulesData.lores ?? {}).map(([key, lore]) => [norm(lore.name), key]));
const itemByName = new Map();
for (const [listId, items] of Object.entries(allItems)) {
  for (const item of items) itemByName.set(norm(item.name_en), { listId, item });
}

const ITEM_SECTION_TYPES = {
  'magic weapons': 'weapon',
  'magic armour': 'armor',
  talismans: 'talisman',
  'enchanted items': 'enchanted-item',
  'arcane items': 'arcane-item',
  'magic standards': 'banner',
};
const DOC_ITEM_LISTS = {
  'chaotic gifts': 'daemonic-gifts-common',
  'chaotic icons': 'daemonic-icons-common',
  'gifts of khorne': 'daemonic-gifts-khorne',
  'icons of khorne': 'daemonic-icons-khorne',
  'gifts of nurgle': 'daemonic-gifts-nurgle',
  'icons of nurgle': 'daemonic-icons-nurgle',
  'gifts of slaanesh': 'daemonic-gifts-slaanesh',
  'icons of slaanesh': 'daemonic-icons-slaanesh',
  'gifts of tzeentch': 'daemonic-gifts-tzeentch',
  'icons of tzeentch': 'daemonic-icons-tzeentch',
};
const ARMY_ITEM_LIST = {
  de: 'dark-elves',
  sk: 'skaven',
  ok: 'ogre-kingdoms',
  cd: 'chaos-dwarfs',
  lm: 'lizardmen',
  vc: 'vampire-counts',
};

// Faction-specific ability lists that live beside the ordinary magic items. Without an entry here the
// whole section is invisible to the compiler: Vampire Counts prints eleven Vampiric Powers and the
// builder offered seven, two of them at the wrong price, because "Vampiric Powers" matched none of the
// magic-item headings (Joost, 11-08).
const ABILITY_LISTS = {
  'vampiric powers': { listId: 'vampiric-powers', type: 'vampiric-power' },
};

const inMagicItemSection = (block) => {
  if (block.unitContext) return false;
  const path = (block.headingPath ?? []).map(norm);
  return path.some((part) => ITEM_SECTION_TYPES[part] || DOC_ITEM_LISTS[part] || ABILITY_LISTS[part])
    || path.some((part) => /magic items|gifts & icons|disciplines of the old ones|big names/i.test(part));
};
const itemTitle = (block) => {
  // A unit option such as "A Draich Master may purchase magic items up to 50 points" has the same
  // textual shape as an item title. It is still a UNIT option and must never leak into the global
  // enchanted-item catalogue merely because a stale Docs heading mentions a magic-item section.
  if (!inMagicItemSection(block)) return null;
  const candidates = [block.text, ...(block.headingPath ?? []).slice().reverse()];
  for (const raw of candidates) {
    const text = decodeEntities(raw).replace(/\s+/g, ' ').trim();
    const match = /^(.+?)\*?\s+(\d+)\s+points?\s*$/i.exec(text);
    if (!match) continue;
    // An item title is short. The source sometimes runs a description and the NEXT title together in
    // one paragraph ("…but cannot join a unit. Master Of The Black Arts 30 points"), and the greedy
    // read of that produced an item whose name was a whole sentence. Too long means this is prose, so
    // fall through to the heading path, which names the item on its own.
    if (match[1].trim().length > 48) continue;
    return { title: text, name: match[1].trim(), points: Number(match[2]), common: /\*/.test(text) };
  }
  return null;
};
const directItemTitle = (block) => {
  const text = decodeEntities(block.text).replace(/\s+/g, ' ').trim();
  const match = /^(.+?)\*?\s+(\d+)\s+points?\s*$/i.exec(text);
  // Same length guard as `itemTitle`: a paragraph that ends in the NEXT item's title is prose, not a
  // title, and reading it as one created an item called "Models whose troop type is 'infantry' only…".
  if (!match || match[1].trim().length > 48) return null;
  return { title: text, name: match[1].trim(), points: Number(match[2]), common: /\*/.test(text) };
};

const itemListFor = (pack, block, existing) => {
  if (existing) return existing.listId;
  const path = (block.headingPath ?? []).map(norm);
  if (pack === 'doc') {
    for (const part of path) if (DOC_ITEM_LISTS[part]) return DOC_ITEM_LISTS[part];
  }
  if (pack === 'lm' && path.includes('disciplines of the old ones')) return 'disciplines-old-ones';
  if (pack === 'ok' && path.includes('big names')) return 'big-names';
  for (const part of path) if (ABILITY_LISTS[part]) return ABILITY_LISTS[part].listId;
  return ARMY_ITEM_LIST[pack];
};

const itemTypeFor = (block, existing, listId) => {
  if (existing) return existing.item.type;
  for (const part of (block.headingPath ?? []).map(norm)) if (ITEM_SECTION_TYPES[part]) return ITEM_SECTION_TYPES[part];
  if (listId?.startsWith('daemonic-icons-')) return listId.replace('daemonic-icons-', 'daemonic-icon-');
  if (listId?.startsWith('daemonic-gifts-')) return listId.replace('daemonic-gifts-', 'daemonic-gift-');
  if (listId === 'disciplines-old-ones') return 'discipline-old-ones';
  if (listId === 'big-names') return 'big-name';
  for (const spec of Object.values(ABILITY_LISTS)) if (listId === spec.listId) return spec.type;
  return 'enchanted-item';
};

// Een tabelblok als TABEL, niet als platgeslagen regel. De bron zet wapenprofielen en
// resultaattabellen (D3/D6) netjes op, maar `block.text` plakt ze tot één string aan elkaar — zo werd
// het profiel van Naptha Bombs "| R | S | AP | Special Rules Naptha Bomb | 9" | 3 | -1 | …" en kreeg
// de Darkforged Weapon-tabel zelfs een eigen regelpagina (Joost, 17-08).
const tabelUitBlok = (block) => {
  if (block.type !== 'table' || !(block.rows ?? []).length) return null;
  const cellen = (rij) => rij.map((cell) => decodeEntities(cell.text ?? '').replace(/\s+/g, ' ').trim());
  const rijen = block.rows.map(cellen).filter((rij) => rij.some(Boolean));
  if (!rijen.length) return null;
  // Kop = de eerste rij als die uit korte labels bestaat (R/S/AP/Special Rules, D3/Result). Een
  // tabel zonder zo'n rij krijgt geen kop in plaats van een verzonnen kop.
  const eerste = rijen[0];
  const isKop = eerste.every((c) => c.length <= 16) && eerste.filter(Boolean).length >= 2;
  return { headers: isKop ? eerste : [], rows: isKop ? rijen.slice(1) : rijen };
};
/** Een kop die in werkelijkheid een tabelkop is, mag nooit een regelpagina worden. */
const isTabelKop = (naam) => /^\s*(r|d3|d6)\s*\|/i.test(naam) || /^(R \| S|D3 \| Result|D6 \| Result)/i.test(naam);

const parseWeaponProfiles = (block) => {
  const rows = block.rows ?? [];
  if (rows.length < 2) return [];
  const headers = rows[0].map((cell) => cell.text.toUpperCase().replace(/\s+/g, ' ').trim());
  const specialAt = headers.findIndex((text) => text.includes('SPECIAL RULES'));
  const apAt = headers.findIndex((text) => text === 'AP');
  if (specialAt < 0 || apAt < 0) return [];
  const rangeAt = headers.findIndex((text) => text === 'R');
  const strengthAt = headers.findIndex((text) => text === 'S');
  const groupedAt = headers.findIndex((text) => text === 'R S');
  const out = [];
  let current = null;
  for (const row of rows.slice(1)) {
    const cells = row.map((cell) => cell.text.replace(/\s+/g, ' ').trim());
    const name = cells[0];
    if (name) {
      let range = rangeAt >= 0 ? cells[rangeAt] : '';
      let strength = strengthAt >= 0 ? cells[strengthAt] : '';
      if (groupedAt >= 0) {
        const parts = cells[groupedAt].split(/\s+/);
        range = parts[0] ?? '';
        strength = parts.slice(1).join(' ');
      }
      current = {
        name,
        range,
        strength,
        ap: cells[apAt] || '-',
        specialRules: cells[specialAt] || '',
      };
      out.push(current);
    } else if (current && cells[specialAt]) {
      current.specialRules = [current.specialRules, cells[specialAt]].filter(Boolean).join(', ');
    } else if (current && cells[0] === '' && cells.slice(1).every((cell) => !cell)) {
      continue;
    } else if (current && !current.range && name) {
      current.name = `${current.name} ${name}`.trim();
    }
  }
  // Google Docs occasionally wraps a weapon name into a following otherwise-empty row.
  for (let i = 2; i < rows.length; i++) {
    const cells = rows[i].map((cell) => cell.text.replace(/\s+/g, ' ').trim());
    if (cells[0] && cells.slice(1).every((cell) => !cell) && out.length) out[out.length - 1].name += ` ${cells[0]}`;
  }
  return out.filter((row) => row.name && (row.range || row.strength || row.specialRules));
};

const optionSlots = (unit) => {
  const out = [];
  for (const group of ['command', 'equipment', 'armor', 'options', 'mounts']) {
    const walk = (items) => {
      for (const option of items ?? []) {
        out.push({ group, option });
        walk(option.options);
      }
    };
    walk(unit[group]);
  }
  return out;
};

const cleanedOptionName = (raw) => raw
  .replace(/^the entire unit may (?:take|have|replace [^+]*? with)\s+/i, '')
  .replace(/^(?:any unit may|the unit may|this model may|may|can|must)\s+/i, '')
  .replace(/^upgrade one model to (?:an?|the)\s+/i, '')
  .replace(/^upgrade one model to\s+/i, '')
  .replace(/^include (?:one|an?)\s+/i, '')
  .replace(/^(?:have|take|purchase|be equipped with)\s+(?:the|an?)?\s*/i, '')
  // "The Ambushers special rule" is how the draft phrases buying a rule; the app shows the option name
  // on a button, where the wrapper is noise. It only survived until now because a leftover patch from
  // the old importer already carried the short name and the dedup kept that one.
  .replace(/^the\s+(.+?)\s+special rules?$/i, '$1')
  .replace(/\s+special rules?$/i, '')
  .replace(/\s*\(see (?:below|page[^)]*)\)/ig, '')
  .replace(/\s+/g, ' ')
  .trim();

const semanticOptionName = (value) => {
  const key = norm(cleanedOptionName(value)
  .replace(/\([^)]*\)/g, ' ')
  .replace(/\b(?:the|a|an|be|special rule)\b/gi, ' '));
  if (key.includes('engine of gods')) return 'engine of gods';
  if (key.includes('level 2 wizard')) return 'level 2 wizard';
  if (key.includes('level 4 wizard')) return 'level 4 wizard';
  return key;
};

const resolveOption = (unit, rawName) => {
  const wanted = norm(cleanedOptionName(rawName));
  const slots = optionSlots(unit);
  const exact = slots.filter(({ option }) => norm(option.name_en) === wanted);
  if (exact.length === 1) return exact[0];
  const fuzzy = slots.filter(({ option }) => {
    const existing = norm(option.name_en);
    if (existing.length < 4 || wanted.length < 4) return false;
    // Richting doet ertoe bij een GRATIS DEFAULT. "Light armour +1" mag de default
    // "Light armour, Shields" herprijzen (de default OMVAT wat het draft noemt), maar
    // "Additional Hand Weapon +3" mag niet op de gratis "Hand weapon" landen (het draft noemt
    // MEER dan de default is — dat is een andere optie, en elke Despot betaalde zo 3 punten
    // voor z'n eigen basiswapen).
    if (option.active === true && !(option.points > 0)) return existing.includes(wanted);
    return existing.includes(wanted) || wanted.includes(existing);
  });
  return fuzzy.length === 1 ? fuzzy[0] : null;
};

const inferredOptionGroup = (name) => {
  if (/\b(champion|standard bearer|musician)\b/i.test(name)) return 'command';
  if (/\bmount(?:ed)?\b/i.test(name)) return 'mounts';
  if (/\b(armour|armor|shield|weapon|spear|bow|crossbow|pistol|musket|blunderbuss|flail|halberd|lance|ironfist)\b/i.test(name)) return 'equipment';
  return 'options';
};
const splitRules = (text) => {
  const out = [];
  let current = '';
  let depth = 0;
  for (const char of text) {
    if (char === '(') depth++;
    if (char === ')') depth = Math.max(0, depth - 1);
    if (char === ',' && depth === 0) {
      if (current.trim()) out.push(current.trim());
      current = '';
    } else current += char;
  }
  if (current.trim()) out.push(current.trim());
  return out;
};

const parsePricedOptions = (block, unit) => {
  const priced = [];
  for (const segment of String(block.text ?? '').split(/\s*•\s*/)) {
    const text = segment.trim();
    const match = /^(.*?)\s*(?:\+|:\s*)(\d+)\s+points?(?:\s+(per model|per unit|each))?/i.exec(text)
      ?? /^(.*?)\s+Free$/i.exec(text)?.concat('0', undefined);
    if (!match) continue;
    const rawName = match[1].replace(/[:;,]\s*$/, '').trim();
    const resolved = resolveOption(unit, rawName);
    const name = resolved?.option.name_en ?? cleanedOptionName(rawName);
    if (!name) continue;
    priced.push({
      group: resolved?.group ?? inferredOptionGroup(name),
      action: resolved ? 'patch' : 'upsert',
      name_en: name,
      points: Number(match[2]),
      perModel: /per model|each/i.test(match[3] ?? ''),
    });
  }
  return priced;
};

const variants = (value) => {
  const words = norm(value).split(' ').filter(Boolean);
  const out = new Set([words.join(' ')]);
  const last = words.at(-1) ?? '';
  const swap = (form) => out.add([...words.slice(0, -1), form].join(' '));
  if (/ies$/.test(last)) swap(last.replace(/ies$/, 'y'));
  else if (/s$/.test(last)) swap(last.replace(/s$/, ''));
  else if (last) swap(`${last}s`);
  // -man/-men. A statline row names one model ("Repeater Crossbowman") where the catalogue names the
  // unit ("Repeater Crossbowmen"), and regular -s plurals never bridge that: the row resolved to
  // nothing, so its price was never written. It only looked fine because the superseded units importer
  // had left a patch behind, which a clean rebuild then dropped.
  if (/man$/.test(last)) swap(last.replace(/man$/, 'men'));
  else if (/men$/.test(last)) swap(last.replace(/men$/, 'man'));
  if (/[^aeiou]y$/.test(last)) swap(last.replace(/y$/, 'ies')); // Chaos Fury -> Chaos Furies
  return out;
};

const catalogueIndex = (catalogue) => {
  const rows = [];
  for (const [category, units] of Object.entries(catalogue)) {
    if (!Array.isArray(units)) continue;
    for (const unit of units) rows.push({ category, unit });
  }
  return rows;
};

const resolveUnits = (index, context) => {
  const wanted = variants(context?.name);
  let hits = index.filter(({ unit }) => wanted.has(norm(unit.name_en)));
  if (!hits.length) {
    const profiles = new Set((context?.profileNames ?? []).flatMap((name) => [...variants(name)]));
    hits = index.filter(({ unit }) => profiles.has(norm(unit.name_en)));
  }
  const names = new Set(hits.map(({ unit }) => norm(unit.name_en)));
  return names.size === 1 ? hits : [];
};

// A single army-list entry can deliberately combine multiple selectable datasheets (for example
// "Saurus Heroes" contains Oldblood and Scar-Veteran rows). For non-statline fields, apply a shared
// line to all of those units only when every matched profile name resolves unambiguously.
const resolveUnitGroup = (index, context) => {
  const groups = [];
  for (const profileName of context?.profileNames ?? []) {
    const wanted = variants(profileName);
    const hits = index.filter(({ unit }) => wanted.has(norm(unit.name_en)));
    const ids = new Set(hits.map(({ unit }) => unit.id));
    if (ids.size === 1) groups.push(...hits);
  }
  const byId = new Map(groups.map((entry) => [entry.unit.id, entry]));
  return byId.size > 1 ? [...byId.values()] : [];
};

const parseRectangularStats = (block) => {
  const columns = ['M', 'WS', 'BS', 'S', 'T', 'W', 'I', 'A', 'LD', 'POINTS'];
  const header = block.rows[block.headerRowIndex];
  if (!header?.length) return null;
  const groups = header.map((cell, cellIndex) => {
    const tokens = (cell.text.match(/[A-Za-z]+/g) ?? []).map((token) => token.toUpperCase());
    if (cellIndex === 0 && !tokens.length) return ['NAME'];
    return tokens.filter((token) => columns.includes(token));
  });
  if (!groups.some((group) => group.includes('POINTS'))) return null;
  const rows = [];
  for (const classified of block.statlineRows ?? []) {
    const source = block.rows[classified.rowIndex];
    if (source?.length !== groups.length || classified.rowIndex === block.headerRowIndex) return null;
    const values = {};
    for (let cellIndex = 0; cellIndex < groups.length; cellIndex++) {
      const keys = groups[cellIndex];
      if (!keys.length) continue;
      const text = source[cellIndex].text.trim();
      const parts = keys.length === 1 ? [text] : text.split(/\s+/);
      if (parts.length !== keys.length) return null;
      keys.forEach((key, index) => { values[key] = parts[index]; });
    }
    if (!values.NAME) values.NAME = source[0]?.text.trim();
    if (!values.NAME || columns.slice(0, -1).some((column) => values[column] == null)) return null;
    rows.push({
      Name: values.NAME,
      M: values.M,
      WS: values.WS,
      BS: values.BS,
      S: values.S,
      T: values.T,
      W: values.W,
      I: values.I,
      A: values.A,
      Ld: values.LD,
    });
  }
  return rows.length ? rows : null;
};

const afterHeaders = (text, headers) => {
  let value = String(text ?? '').replace(/\s+/g, ' ').trim();
  for (const header of headers) value = value.replace(new RegExp(`^${header}\\s*`, 'i'), '');
  return value.split(/\s+/).filter(Boolean);
};

// Some Docs tables collapse each header and its data into the same cell (typically character
// mounts), or group M/WS/BS into one cell. The lossless rows still preserve the token order, so this
// fallback can recover them without guessing values.
const parseEmbeddedStats = (block) => {
  const out = [];
  for (const classified of block.statlineRows ?? []) {
    const row = block.rows?.[classified.rowIndex];
    if (!row?.length) continue;
    const cells = row.map((cell) => cell.text.replace(/\s+/g, ' ').trim());
    let values = null;
    if (cells.length === 5) {
      const m = afterHeaders(cells[1], ['M WS BS']);
      const stwi = afterHeaders(cells[2], ['S T W I']);
      const ald = afterHeaders(cells[3], ['A Ld']);
      const points = afterHeaders(cells[4], ['Points']);
      if (m.length === 3 && stwi.length === 4 && ald.length === 2) {
        values = [...m, ...stwi, ...ald, points[0] ?? '-'];
      }
    } else if (cells.length === 6) {
      const m = afterHeaders(cells[1], ['M WS BS']);
      const stwi = afterHeaders(cells[2], ['S T W I']);
      const attacks = afterHeaders(cells[3], ['A']);
      const leadership = afterHeaders(cells[4], ['Ld']);
      const points = afterHeaders(cells[5], ['Points']);
      if (m.length === 3 && stwi.length === 4 && attacks.length === 1 && leadership.length === 1) {
        values = [...m, ...stwi, attacks[0], leadership[0], points[0] ?? '-'];
      }
    } else if (cells.length >= 9) {
      const m = cells[1].split(/\s+/);
      if (m.length === 3) values = [...m, ...cells.slice(2, 9)];
    }
    if (!values || values.length < 10) continue;
    out.push({
      Name: classified.name || cells[0],
      M: values[0], WS: values[1], BS: values[2], S: values[3], T: values[4],
      W: values[5], I: values[6], A: values[7], Ld: values[8],
    });
  }
  return out.length ? out : null;
};

// Datasheets a draft has renamed since upstream OWB last synced. Keyed by pack, draft name → catalogue
// name. Only for a pairing that the source itself forces: the Vampire Counts "Vampires" datasheet
// carries exactly two profiles, and the other one (Vampire Thrall) matches by name, so "Vampire Lord"
// can only be the entry OWB still calls "Vampire Count". Anything less certain belongs in the coverage
// ledger as unresolved, not here — this table is for facts, not for guesses about intent.
// A `null` alias means: this draft row is NOT the catalogue unit its name resembles — skip it here,
// it lives as an addedUnit. Needed because the fallback resolution matches on a unique name SUFFIX,
// and that is exactly wrong when a draft introduces a NEW unit whose name is a suffix of an existing
// one: the Chaos Dwarfs draft renames the lord-tier Infernal Castellan to "Despot" and adds a NEW,
// lighter "Castellan" (75 pts, Infernal Guard Commander). The suffix match put that 75 on the lord —
// a Taurus-riding lord for 75 points (speler-melding, 16-08).
const UNIT_ALIASES = {
  vc: new Map([['vampire lord', 'vampire count']]),
  cd: new Map([
    ['despot', 'infernal castellan'],
    ['castellan', null],
    // Zelfde unit, kortere draft-naam: zonder deze vertaling resolvet de "Chaos Dwarf Lords"-groep
    // tot alleen de Despot en blijft de Seneschal buiten elke gedeelde optieregel.
    ['seneschal', 'infernal seneschal'],
  ]),
};

const changed = (block) => Array.isArray(block.changeKinds) && block.changeKinds.length > 0;
const actionable = (block) => changed(block) && !block.changeKinds.includes('todo');
const addChanged = (patch, field) => {
  patch._changed = [...new Set([...(patch._changed ?? []), field])];
};
const addProfileValues = (overlay, keys, field, values) => {
  for (const key of keys) {
    const profile = overlay.profiles[key] ?? {};
    if (Array.isArray(values)) {
      profile[field] = [...new Set([...(profile[field] ?? []), ...values].filter(Boolean))];
    } else {
      profile[field] = values;
    }
    overlay.profiles[key] = profile;
  }
};

for (const [key, army] of Object.entries(PACKS)) {
  if (only && only !== key) continue;
  const overlayUrl = new URL(`${key}-renegade-v2.json`, REN);
  const reference = JSON.parse(readFileSync(new URL(`${key}-renegade-v2-reference.json`, REN), 'utf8'));
  const catalogue = JSON.parse(readFileSync(new URL(`${army}.json`, OWB), 'utf8'));
  const overlay = JSON.parse(readFileSync(overlayUrl, 'utf8'));
  // Draft-namen naar catalogus-namen vertalen vóór elke resolutie. Alleen string-aliassen: een
  // null-alias betekent "eigen addedUnit" en die naam moet juist blijven staan.
  for (const block of reference.blocks) {
    if (!block.unitContext?.profileNames?.length) continue;
    const vertaald = block.unitContext.profileNames.map((naam) => {
      const alias = UNIT_ALIASES[key]?.get(norm(naam));
      return typeof alias === 'string' ? alias : naam;
    });
    block.unitContext = { ...block.unitContext, profileNames: vertaald };
  }

  const index = [
    ...catalogueIndex(catalogue),
    ...Object.entries(overlay.addedUnits ?? {}).flatMap(([category, units]) =>
      (units ?? []).map((unit) => ({ category, unit }))),
  ];
  const coverage = [];
  const implementedBlocks = new Map();
  overlay.profiles = overlay.profiles ?? {};
  overlay.rules = overlay.rules ?? {};
  overlay.notes = [];
  overlay.magicItemText = {};
  overlay.composition = overlay.composition ?? {};
  overlay.composition.sourceRules = {};
  for (const block of reference.blocks.filter((candidate) =>
    candidate.scope === 'army-list'
    && actionable(candidate)
    && (candidate.headingPath ?? []).includes('Grand Army Composition List'))) {
    const section = block.headingPath?.at(-1) ?? 'General';
    const rules = overlay.composition.sourceRules[section] ?? [];
    const text = block.text.replace(/\s+/g, ' ').trim();
    if (text && !rules.includes(text)) rules.push(text);
    overlay.composition.sourceRules[section] = rules;
    implementedBlocks.set(block.id, { status: 'captured', target: `composition.sourceRules.${section}` });
  }

  // WHICH LIST A UNIT IS CHOSEN FROM. The composition list was only ever CAPTURED as display text, so
  // a draft that MOVES a unit between lists changed nothing you could build with: Vampire Counts puts
  // Corpse Carts in Core and the Varghulf in Special, and the builder still offered them where upstream
  // OWB had them (Special and Rare). Joost spotted both, 11-08.
  //
  // Only a bullet that plainly names units counts. A conditional one ("… may be taken as a Core
  // choice", "If your General is a Strigoi Ghoul King …") grants an EXTRA place without moving the
  // unit's home, and OWB already models those as separate `-core` datasheets. A unit named plainly in
  // two sections is left alone: that is a disagreement to report, not to resolve by picking one.
  const SECTIONS = { characters: 'characters', core: 'core', special: 'special', rare: 'rare' };
  const conditional = /may be taken as|if your general|\bper\b[^.]*\btaken\b/i;
  const byName = [...index].sort((a, b) => b.unit.name_en.length - a.unit.name_en.length);
  const seenIn = new Map(); // unit id -> Set of sections naming it plainly
  for (const block of reference.blocks.filter((candidate) =>
    candidate.scope === 'army-list'
    && candidate.type === 'list'
    && SECTIONS[norm(candidate.headingPath?.at(-1))]
    && (candidate.headingPath ?? []).includes('Grand Army Composition List'))) {
    const section = SECTIONS[norm(block.headingPath.at(-1))];
    for (const item of block.items ?? []) {
      if (conditional.test(item.text)) continue;
      let rest = ` ${norm(item.text)} `;
      for (const { unit } of byName) {
        for (const variant of variants(unit.name_en)) {
          if (!variant || !rest.includes(` ${variant} `)) continue;
          rest = rest.replace(` ${variant} `, ' ');
          if (!seenIn.has(unit.id)) seenIn.set(unit.id, new Set());
          seenIn.get(unit.id).add(section);
        }
      }
    }
  }
  // A bullet names a unit by NAME, so a move is only safe when that name points at exactly one
  // datasheet in exactly one list. Two situations break that, and both would do real damage:
  //   - OWB spells "may be taken as a Core choice" as a second datasheet with the same name
  //     (`grave-guard` + `grave-guard-core`). Moving the -core twin to Special deletes the Core option.
  //   - Some units are listed under two categories under ONE id (Terrorgheist in Special and Rare).
  //     A category patch is keyed by id, so it would move both copies and show the unit twice.
  const entriesById = new Map();
  const entriesByName = new Map();
  for (const entry of index) {
    if (!entriesById.has(entry.unit.id)) entriesById.set(entry.unit.id, []);
    entriesById.get(entry.unit.id).push(entry);
    const name = norm(entry.unit.name_en);
    if (!entriesByName.has(name)) entriesByName.set(name, new Set());
    entriesByName.get(name).add(entry.unit.id);
  }
  overlay.composition.units = overlay.composition.units ?? {};
  for (const [unitId, sections] of seenIn) {
    const entries = entriesById.get(unitId) ?? [];
    if (!entries.length) continue;
    const where = `${key}: ${unitId}`;
    if (sections.size !== 1) {
      console.warn(`${where} named plainly in ${[...sections].join(' and ')} — left in ${entries[0].category}`);
      continue;
    }
    const wanted = [...sections][0];
    if (entries.every((entry) => entry.category === wanted)) continue;
    if (entries.length > 1) {
      console.warn(`${where} sits in ${entries.map((e) => e.category).join(' and ')} under one id — not moved`);
      continue;
    }
    if ((entriesByName.get(norm(entries[0].unit.name_en)) ?? new Set()).size > 1) {
      console.warn(`${where} shares its name with another datasheet — not moved`);
      continue;
    }
    overlay.composition.units[unitId] = { ...(overlay.composition.units[unitId] ?? {}), category: wanted };
    console.warn(`${where} ${entries[0].category} -> ${wanted} (composition list)`);
  }
  for (const patch of Object.values(overlay.units)) {
    if (!patch.options?.length) continue;
    const unique = [];
    for (const option of patch.options) {
      const at = unique.findIndex((candidate) => semanticOptionName(candidate.name_en) === semanticOptionName(option.name_en));
      if (at < 0) unique.push(option);
      else unique[at] = {
        ...unique[at],
        ...(typeof option.points === 'number' ? { points: option.points } : {}),
        ...(typeof option.perModel === 'boolean' ? { perModel: option.perModel } : {}),
      };
    }
    patch.options = unique.filter((option, index, all) => {
      if (!/^the entire unit may/i.test(option.name_en)) return true;
      const key = semanticOptionName(option.name_en);
      return !all.some((candidate, other) => other !== index && semanticOptionName(candidate.name_en).includes(key));
    });
  }

  // Magic items are naturally grouped by their real Google Docs heading path. Compile every item
  // touched by a marked block, including its complete V2 prose, so price and displayed rule text move
  // together. Existing OWB metadata (type/stackability) wins whenever the item already exists.
  // Remove any lookalike unit options produced by an older compiler run. The overlay is read as its
  // own input, so merely rejecting them below would otherwise leave the stale generated rows behind.
  const unitOptionLookalikes = new Set(reference.blocks
    .filter((block) => block.unitContext)
    .map(directItemTitle)
    .filter(Boolean)
    .map((title) => norm(title.name)));
  for (const [listId, items] of Object.entries(overlay.magicItems ?? {})) {
    overlay.magicItems[listId] = items.filter((item) => !unitOptionLookalikes.has(norm(item.name_en)));
  }
  const touchedItems = new Map();
  for (const block of reference.blocks.filter((candidate) => candidate.scope === 'army-list' && actionable(candidate))) {
    const title = itemTitle(block);
    if (!title) continue;
    const signature = norm(title.title);
    if (!touchedItems.has(signature)) touchedItems.set(signature, { title, seed: block });
  }
  for (const { title, seed } of touchedItems.values()) {
    const existing = itemByName.get(norm(title.name));
    const listId = itemListFor(key, seed, existing);
    if (!listId) continue;
    const type = itemTypeFor(seed, existing, listId);
    const item = {
      ...(existing?.item ?? {}),
      name_en: decodeEntities(title.name).replace(/\*/g, '').trim(),
      name: existing?.item?.name ?? norm(title.name).replace(/\*/g, ''),
      points: title.points,
      type,
      onePerArmy: existing?.item?.onePerArmy ?? !title.common,
      ...(title.common ? { stackable: true, onePerArmy: false } : {}),
    };
    const list = overlay.magicItems[listId] ?? [];
    const at = list.findIndex((candidate) => norm(candidate.name_en) === norm(item.name_en));
    if (at >= 0) list[at] = { ...list[at], ...item };
    else list.push(item);
    overlay.magicItems[listId] = list;

    const matching = reference.blocks.filter((candidate) =>
      candidate.scope === 'army-list'
      && (candidate.headingPath ?? []).some((part) => norm(decodeEntities(part)) === norm(title.title)));
    const body = matching
      .filter((candidate) => norm(decodeEntities(candidate.text)) !== norm(title.title))
      .filter((candidate) => !candidate.changeKinds?.includes('todo'))
      .map((candidate) => candidate.text?.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .join('\n\n');
    if (body) overlay.magicItemText[slug(item.name)] = { body };
    for (const candidate of matching) implementedBlocks.set(candidate.id, `magicItemText.${slug(item.name)}`);
  }
  // Repair malformed Docs heading paths by also reading item sections sequentially: an item's body
  // runs from its own "Name N points" block to the next item title within the same top-level section.
  for (let at = 0; at < reference.blocks.length; at++) {
    const seed = reference.blocks[at];
    const title = directItemTitle(seed);
    if (!title) continue;
    const top = seed.headingPath?.[0] ?? '';
    // Ability lists belong here too. Red Fury and Honour or Death have their rule text styled as a
    // Docs HEADING, so it becomes its own heading instead of the item's body — exactly the malformed
    // path this pass exists to repair — and both powers reached the app with no description at all.
    if (!/Magic Items|Gifts & Icons|Disciplines|Big Names/i.test(top) && !ABILITY_LISTS[norm(top)]) continue;
    const section = [seed];
    for (let next = at + 1; next < reference.blocks.length; next++) {
      const candidate = reference.blocks[next];
      // A category heading ("Magic Armour", "Enchanted Items", …) closes the previous item's body.
      // Without this boundary it appeared as the final sentence in the previous item's popup.
      if ((candidate.headingPath?.[0] ?? '') !== top
        || directItemTitle(candidate)
        || ITEM_SECTION_TYPES[norm(candidate.text)]) break;
      section.push(candidate);
    }
    if (!section.some(actionable)) continue;
    const existing = itemByName.get(norm(title.name));
    const listId = itemListFor(key, seed, existing);
    if (!listId) continue;
    const item = {
      ...(existing?.item ?? {}),
      name_en: title.name.replace(/\*/g, '').trim(),
      name: existing?.item?.name ?? norm(title.name).replace(/\*/g, ''),
      points: title.points,
      type: itemTypeFor(seed, existing, listId),
      onePerArmy: existing?.item?.onePerArmy ?? !title.common,
      ...(title.common ? { stackable: true, onePerArmy: false } : {}),
    };
    const list = overlay.magicItems[listId] ?? [];
    const itemAt = list.findIndex((candidate) => norm(candidate.name_en) === norm(item.name_en));
    if (itemAt >= 0) list[itemAt] = { ...list[itemAt], ...item };
    else list.push(item);
    overlay.magicItems[listId] = list;
    const body = section.slice(1).filter((block) => !block.changeKinds?.includes('todo'))
      .map((block) => decodeEntities(block.text).replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n\n');
    if (body) overlay.magicItemText[slug(item.name)] = { body };
    for (const block of section) implementedBlocks.set(block.id, `magicItemText.${slug(item.name)}`);
  }

  const isRuleTitle = (block) => {
    const text = decodeEntities(block.text).replace(/\s+/g, ' ').trim();
    return text.length > 1 && text.length <= 80
      && !/[.:;!?]$/.test(text)
      && !/:/.test(text)
      && !/\bpoints?\b/i.test(text)
      && !/^(options|equipment|special rules|unit size|troop type|base size|armour value|notes?)$/i.test(text)
      && (block.entryKind === 'heading' || (block.entryKind === 'paragraph' && text.split(' ').length <= 8));
  };
  const proseGroups = [];
  let activeRule = null;
  for (const block of reference.blocks) {
    const globalRules = /special rules/i.test(block.headingPath?.[0] ?? '');
    const unitRules = !!block.unitContext;
    if (!globalRules && !unitRules) {
      activeRule = null;
      continue;
    }
    if (block.tableType === 'statline' || block.entryKind === 'weapon-profile') {
      activeRule = null;
      continue;
    }
    if (isRuleTitle(block)) {
      activeRule = { title: decodeEntities(block.text).replace(/\s+/g, ' ').trim(), blocks: [block], body: [] };
      proseGroups.push(activeRule);
      continue;
    }
    if (!activeRule) continue;
    if (unitRules && activeRule.blocks[0].unitContext?.sourceBlockId !== block.unitContext?.sourceBlockId) {
      activeRule = null;
      continue;
    }
    if (/^(Options|Equipment|Unit Size|Troop Type|Base Size|Armour Value|Special Rules)\s*:/i.test(block.text ?? '')) {
      activeRule = null;
      continue;
    }
    const text = decodeEntities(block.text).replace(/\s+/g, ' ').trim();
    if (text) {
      activeRule.blocks.push(block);
      activeRule.body.push(text);
    }
  }
  for (const group of proseGroups) {
    if (isTabelKop(group.title)) continue; // "R | S | AP | Special Rules" is geen regel
    const bruikbaar = group.blocks.slice(1).filter((block) => !block.changeKinds?.includes('todo'));
    const tabellen = bruikbaar.map(tabelUitBlok).filter(Boolean);
    const safeBody = bruikbaar
      .filter((block) => block.type !== 'table')
      .map((block) => decodeEntities(block.text).replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    if ((!safeBody.length && !tabellen.length) || !group.blocks.some(actionable)) continue;
    const ruleKey = slug(group.title);
    if (!overlay.rules[ruleKey]) {
      overlay.rules[ruleKey] = {
        name_en: group.title,
        body: safeBody,
        ...(tabellen.length ? { tables: tabellen } : {}),
        overrides: ruleSlugByName.get(norm(group.title)) ?? null,
      };
    }
    for (const block of group.blocks) implementedBlocks.set(block.id, `rules.${ruleKey}`);
  }

  overlay.lores = {};
  const spellGroups = new Map();
  for (const block of reference.blocks) {
    if (block.unitContext || !/^Lore Of/i.test(block.headingPath?.[0] ?? '')) continue;
    const loreName = decodeEntities(block.headingPath[0]);
    const spellName = decodeEntities(block.headingPath[1] ?? '');
    if (!spellName || /^(Characters|Core|Special|Rare|Character Mounts)$/i.test(spellName)) continue;
    const groupKey = `${norm(loreName)}|${norm(spellName)}`;
    const group = spellGroups.get(groupKey) ?? { loreName, spellName, blocks: [] };
    group.blocks.push(block);
    spellGroups.set(groupKey, group);
  }
  for (const group of spellGroups.values()) {
    if (!group.blocks.some(actionable)) continue;
    const loreSlug = loreSlugByName.get(norm(group.loreName));
    if (!loreSlug) continue;
    const body = group.blocks
      .filter((block) => norm(block.text) !== norm(group.spellName))
      .filter((block) => !block.changeKinds?.includes('todo'))
      .filter((block) => !['statline', 'unit-size', 'troop-type', 'base-size', 'equipment', 'option', 'special-rules'].includes(block.entryKind))
      .map((block) => decodeEntities(block.text).replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    if (!body.length) continue;
    const shortName = group.spellName.replace(/\s*\([^)]*\)\s*$/, '').trim();
    const override = ruleSlugByName.get(norm(group.spellName)) ?? ruleSlugByName.get(norm(shortName)) ?? null;
    const ruleKey = `spell-${slug(shortName)}`;
    overlay.rules[ruleKey] = {
      name_en: group.spellName,
      body,
      overrides: override,
    };
    const baseLore = rulesData.lores[loreSlug];
    const existingSpell = baseLore?.spells?.find((spell) =>
      spell.slug === override || norm(spell.name) === norm(group.spellName) || norm(spell.name) === norm(shortName));
    const targetSlug = override ?? `${ruleKey}-renegade-v2`;
    const lorePatch = overlay.lores[loreSlug] ?? { name: baseLore?.name ?? group.loreName, spells: [] };
    const spell = {
      slug: targetSlug,
      name: existingSpell?.name ?? group.spellName,
      number: existingSpell?.number ?? null,
      signature: existingSpell?.signature ?? true,
    };
    const at = lorePatch.spells.findIndex((candidate) => candidate.slug === spell.slug || norm(candidate.name) === norm(spell.name));
    if (at >= 0) lorePatch.spells[at] = spell;
    else lorePatch.spells.push(spell);
    overlay.lores[loreSlug] = lorePatch;
    for (const block of group.blocks) implementedBlocks.set(block.id, `lores.${loreSlug}.${targetSlug}`);
  }

  for (const block of reference.blocks.filter((candidate) =>
    candidate.scope === 'army-list'
    && actionable(candidate)
    && !candidate.unitContext
    && /^(Weapons Of|The Daemonic Armoury)/i.test(candidate.headingPath?.[0] ?? ''))) {
    const name = decodeEntities(block.headingPath?.[1] ?? block.text).replace(/\s+/g, ' ').trim();
    if (!name) continue;
    const ruleKey = slug(name);
    if (isTabelKop(name)) continue;
    const current = overlay.rules[ruleKey] ?? {
      name_en: name,
      body: [],
      overrides: ruleSlugByName.get(norm(name)) ?? null,
    };
    const tabel = tabelUitBlok(block);
    if (tabel) {
      current.tables = [...(current.tables ?? []), tabel];
    } else {
      const text = decodeEntities(block.text).replace(/\s+/g, ' ').trim();
      if (text && norm(text) !== norm(name) && !current.body.includes(text)) current.body.push(text);
    }
    overlay.rules[ruleKey] = current;
    implementedBlocks.set(block.id, {
      status: block.entryKind === 'paragraph' ? 'applied' : 'captured',
      target: `rules.${ruleKey}`,
    });
  }

  // ── Wat het draft zegt telt, óók als het blok ongekleurd is ─────────────────────────────────────
  // Joost, 17-08: "bij twijfel: neem de data over van de Renegades list, ook qua naamsveranderingen"
  // en "unit size max 1 afdwingen — dus geen plusje om meer mee te nemen". De kleurcodering is de
  // gids voor WAT de auteur veranderde, maar deze twee feiten staan er ondubbelzinnig, gekleurd of
  // niet, en de app week er zichtbaar van af.
  for (const block of reference.blocks) {
    if (block.scope !== 'army-list' || !block.unitContext) continue;
    const hits = resolveUnits(index, block.unitContext);
    const ids = new Set(hits.map((h) => h.unit.id));
    if (ids.size !== 1) continue;
    const { unit } = hits[0];
    const tekst = String(block.text ?? '').replace(/\s+/g, ' ').trim();

    // (a) VASTE unit size. Alleen een vaste maat ("Unit Size: 1"), nooit een open ondergrens
    //     ("5+"): bij Skaven Clanrats zegt het datasheet 20+ terwijl de changelog juist een cap van
    //     40 toevoegde, en een open maat zou die cap wegpoetsen. En nooit overschrijven wat een
    //     GEKLEURD blok al bepaalde — de Vargheists gingen van 3+ naar 2+.
    const maat = /^Unit Size:\s*(\d+)\s*$/i.exec(tekst);
    if (maat && block.entryKind === 'unit-size') {
      const patch = overlay.units[unit.id] ?? {};
      if (patch.minimum == null && patch.maximum == null) {
        const n = Number(maat[1]);
        if ((unit.minimum ?? 1) !== n || (unit.maximum ?? 0) !== n) {
          patch.minimum = n;
          patch.maximum = n;
          addChanged(patch, 'unit-size');
          overlay.units[unit.id] = patch;
        }
      }
    }

    // (b) HERNOEMDE command-rol. Een champion/standard bearer/musician is één rol per unit; het
    //     draft geeft hem soms een eigen naam ("Handmaiden of Shards" i.p.v. "Hag"). Hernoemen, niet
    //     een tweede exemplaar toevoegen — anders staan er twee champions in de lijst.
    for (const segment of tekst.split(/\s*•\s*/)) {
      const rol = /\b(champion|standard bearer|musician)\b/i.exec(segment);
      if (!rol || !/\+\s*\d+\s*points?/i.test(segment)) continue;
      const naam = segment
        .replace(/^.*?upgrade one model to(?:\s+(?:an?|the))?\s+/i, '')
        .replace(/\s*\+\s*\d+\s*points?.*$/i, '')
        .replace(/\s*\(see[^)]*\)/ig, '')
        .trim();
      if (!naam || naam.length > 48) continue;
      const groep = unit.command ?? [];
      const zelfdeRol = groep.filter((o) => new RegExp(`\b${rol[1]}\b`, 'i').test(o.name_en));
      if (zelfdeRol.length !== 1) continue;
      const huidig = zelfdeRol[0].name_en;
      if (norm(huidig) === norm(naam)) continue;
      const patch = overlay.units[unit.id] ?? {};
      patch.options = patch.options ?? [];
      const at = patch.options.findIndex((o) => o.group === 'command' && norm(o.name_en) === norm(huidig));
      const entry = { group: 'command', action: 'patch', name_en: huidig, renameTo: naam };
      if (at >= 0) patch.options[at] = { ...patch.options[at], ...entry };
      else patch.options.push(entry);
      addChanged(patch, 'command');
      overlay.units[unit.id] = patch;
    }

    // (c) GROEPSNAAM. "Dark Elf Nobles" is een overkoepelende kop boven meerdere datasheets. Doet nu
    //     niets in de UI, maar het draft kent hem en later hangen er upgrades aan; achtergronddata
    //     bewaren kost niets en scheelt straks opnieuw uitzoeken.
    // Ook als de groepsnaam uit de KOP boven de tabel komt in plaats van uit een titelrij: bij
    // "Sorcerers Of Hashut" en "Chaos Dwarf Lords" is dat precies dezelfde overkoepelende term.
    if (block.tableType === 'statline' && norm(block.unitContext.name) !== norm(unit.name_en)) {
      const patch = overlay.units[unit.id] ?? {};
      if (!patch.group) { patch.group = block.unitContext.name; overlay.units[unit.id] = patch; }
    }
  }

  // Een sectie die "<Regel> Table" heet hoort BIJ die regel. De Darkforged Weapon zegt "roll on the
  // table below" en de tabel stond als eigen pagina ernaast, dus de speler las de zin zonder de
  // tabel (Joost, 17-08). Samenvoegen als de bijbehorende regel bestaat; anders blijft de losse
  // pagina staan — dan is hij tenminste te vinden.
  for (const [ruleKey, rule] of Object.entries(overlay.rules)) {
    const match = /^(.*)-table$/.exec(ruleKey);
    if (!match || !rule.tables?.length) continue;
    const doel = overlay.rules[match[1]];
    if (!doel) continue;
    doel.tables = [...(doel.tables ?? []), ...rule.tables];
    if (rule.body?.length) doel.body = [...(doel.body ?? []), ...rule.body];
    delete overlay.rules[ruleKey];
  }


  // A wrapped "Special Rules:" line carries its colour on whichever PART the author touched. The
  // stitcher below walks forward from a changed special-rules block, but the Terrorgheist (vc) has
  // the mirror image — head line untouched, continuation marked new ("… Wailing Dirge (-2)") — and
  // the head never entered this loop, so the changed rule silently kept its old text. Lift the
  // continuation's colour onto the head, and mark the continuation as consumed so its fragment does
  // not ALSO land somewhere as a half-line note.
  const stitchedContinuations = new Map(); // continuation blockId -> head blockId
  const promotedHeads = new Map();         // head blockId -> its result, booked on the continuation
  for (let i = 0; i < reference.blocks.length; i++) {
    const head = reference.blocks[i];
    if (head.entryKind !== 'special-rules') continue;
    let tail = (head.text ?? '').trim();
    const parts = [];
    for (let j = i + 1; /[,;]$/.test(tail) && j < reference.blocks.length; j++) {
      const next = reference.blocks[j];
      if (next.unitContext?.sourceBlockId !== head.unitContext?.sourceBlockId || next.tableType === 'statline') break;
      if (!next.text || /^(Unit Size|Troop Type|Base Size|Armour Value|Equipment|Options)\s*:/i.test(next.text)) break;
      parts.push(next);
      tail = next.text.trim();
    }
    if (changed(head) || !parts.some(changed)) continue;
    // The coverage ledger stays 1:1 with the blocks the SOURCE marks as changed, so the head —
    // uncoloured in the source — borrows the colour to get processed but books its result on the
    // continuation block that actually carries the change.
    head.changeKinds = [...new Set(parts.flatMap((p) => p.changeKinds ?? []))];
    promotedHeads.set(head.id, null);
    parts.filter(changed).forEach((p) => stitchedContinuations.set(p.id, head.id));
  }

  // ── Doelwit binnen een groepstabel ─────────────────────────────────────────────────────────────
  // Een tabel als "Vampires" of "Chaos Dwarf Lords" bundelt meerdere datasheets, en de bron splitst
  // de opties met een kwalificatie: "A Vampire Lord may:" … "A Vampire Thrall may:" …. Zonder dat
  // onderscheid landde elk blok op de HELE groep — de Lord kreeg de Thrall-prijs voor Level 2
  // (+60 waar het draft +30 zegt), de Thrall een Level 3 die hij niet mag, en de Skink Priest de
  // opties van de Chief (speler-meldingen, 16-08). De kwalificatie kan aan het EIND van een blok
  // staan ("May take a shield +2 points • A Despot may:"), dus hij geldt segment-voor-segment en
  // draagt over naar volgende blokken tot de volgende kwalificatie of een nieuwe unit-sectie.
  const MARKER = /^(?:an?|the)\s+(.{2,40}?)\s+may:?$/i;
  // PRE-PASS over ALLE blokken, niet alleen de gekleurde: de kwalificatie zelf is vaak ongewijzigd
  // ("A Vampire Thrall may:" is ongekleurd terwijl de opties eronder nieuw zijn), en een state-machine
  // in de gefilterde hoofdlus zag die wissel dus nooit — de Thrall-prijzen landden op de Lord.
  const segmentenPerBlok = new Map();
  {
    const st = { bron: null, naam: null };
    for (const block of reference.blocks) {
      if (block.scope !== 'army-list' || !block.unitContext) { st.bron = null; st.naam = null; continue; }
      if (st.bron !== block.unitContext.sourceBlockId) { st.bron = block.unitContext.sourceBlockId; st.naam = null; }
      if (block.type !== 'list' && block.type !== 'paragraph') continue;
      const uit = [];
      for (const ruw of String(block.text ?? '').split(/\s*•\s*/)) {
        const segment = ruw.trim();
        if (!segment) continue;
        const marker = MARKER.exec(segment);
        if (block.id==='b0140') console.warn('DBGPRE src='+MARKER.source+' codes='+[...segment].map(c=>c.charCodeAt(0)).join(','));
        if (marker) { st.naam = marker[1]; continue; }
        uit.push({ segment, doelNaam: st.naam });
      }
      segmentenPerBlok.set(block.id, uit);
    }
  }
  const doelUnits = (hits, doelNaam) => {
    if (!doelNaam) return hits;
    const alias = UNIT_ALIASES[key]?.get(norm(doelNaam));
    const wil = norm(typeof alias === 'string' ? alias : doelNaam);
    const raak = hits.filter(({ unit }) => {
      const naam = norm(unit.name_en);
      const getoond = norm(overlay.units[unit.id]?.replace?.name_en ?? '');
      return naam === wil || naam.endsWith(' ' + wil) || getoond === wil;
    });
    // Geen match betekent dat de kwalificatie over iets anders gaat (een optie-naam, een titel) —
    // dan liever op iedereen dan stilletjes op niemand.
    return raak.length ? raak : hits;
  };

  for (const block of reference.blocks.filter((candidate) => candidate.scope === 'army-list' && changed(candidate))) {
    const viaHead = stitchedContinuations.get(block.id);
    if (viaHead) {
      const booked = promotedHeads.get(viaHead);
      coverage.push({
        blockId: block.id, unitContext: block.unitContext, entryKind: block.entryKind,
        changeKinds: block.changeKinds, status: booked?.status ?? 'applied',
        targets: booked?.targets ?? [],
        reason: 'continuation of a Special Rules line, applied via its head block',
      });
      continue;
    }
    const result = {
      blockId: block.id,
      unitContext: block.unitContext,
      entryKind: block.entryKind,
      changeKinds: block.changeKinds,
      status: 'unresolved',
      targets: [],
    };
    const boek = () => {
      if (promotedHeads.has(block.id)) promotedHeads.set(block.id, result);
      else coverage.push(result);
    };
    if (block.changeKinds.includes('todo')) {
      result.status = 'todo';
      boek();
      continue;
    }
    const compiledTarget = implementedBlocks.get(block.id);
    if (compiledTarget) {
      result.status = typeof compiledTarget === 'string' ? 'applied' : compiledTarget.status;
      result.targets.push(typeof compiledTarget === 'string' ? compiledTarget : compiledTarget.target);
      boek();
      continue;
    }

    let hits = resolveUnits(index, block.unitContext);
    if (!hits.length && block.tableType !== 'statline') hits = resolveUnitGroup(index, block.unitContext);
    const blokSegmenten = segmentenPerBlok.get(block.id) ?? null;
    const profileKeys = hits.length
      ? [...new Set(hits.map(({ unit }) => norm(unit.name_en)))]
      : block.unitContext?.name ? [norm(block.unitContext.name)] : [];
    if (block.tableType === 'statline') {
      // Points, straight off the statline. Until Vampire Counts every pack agreed with the catalogue
      // on every priced row, because upstream OWB had already absorbed those drafts — so the pipeline
      // never needed this and the handful of repricings came from the superseded units importer.
      // V1.5.3.1 is newer than upstream, and seven units silently kept their old price (Varghulf 140
      // where the pack says 110). At the table that reads as a legal list; it isn't.
      //
      // Narrow on purpose: one name, one plain integer, resolving to a single datasheet. A modifier
      // row ("+5" for a champion) is a command upgrade, not a unit price, and is left alone.
      // A statline row names one MODEL; the catalogue names the UNIT. Three signals bridge that, tried
      // strongest first, and each one only fires when its answer is unambiguous:
      //   1. the row name itself ("Vampire Thrall");
      //   2. the table's own unit, when the table prices exactly one primary row — "Executioner" 14 in
      //      the "Har Ganeth Executioners" table, "Stonehorn" 220 in "Stonehorns". Deliberately keyed on
      //      the context NAME only, never on its profile names: a summary table listing Vampire Lord and
      //      Vampire Thrall would otherwise hand the Lord's 185 to the Thrall;
      //   3. a unique name suffix — "Seneschal" 65 is "Infernal Seneschal", and no other datasheet ends
      //      that way. Two candidates ("Chariot") means we do not know, so nothing is written.
      // Without these the prices were simply never derived; they survived only as leftovers from the
      // superseded units importer, and a clean rebuild dropped them silently.
      const pricedRows = (block.statlineRows ?? []).filter((row) => row.points?.value != null && !row.points?.modifier);
      // The FIRST priced row is the unit's own price; later ones are extras bought alongside it (Ogre
      // Crew 25 next to Stonehorn 220, Skink Handler 1 next to Salamander 65). Role would be the tidier
      // signal, but the importer labels every row of a single-model entry 'base-model', so position is
      // the reliable one — and it is exactly how the entry reads on the page.
      const uniekeDeelnaam = (naam) => {
        const wanted = [...variants(naam)].filter((v) => v.length >= 4);
        if (!wanted.length) return [];
        const hits = index.filter(({ unit }) => {
          const n = norm(unit.name_en);
          return wanted.some((v) => n === v || n.endsWith(` ${v}`) || n.startsWith(`${v} `));
        });
        return new Set(hits.map(({ unit }) => norm(unit.name_en))).size === 1 ? hits : [];
      };
      for (const row of pricedRows) {
        const alias = UNIT_ALIASES[key]?.get(norm(row.name));
        if (alias === null) continue; // de rij hoort bij een addedUnit; punten staan dáár
        const lookup = alias ?? row.name;
        let hitsForRow = resolveUnits(index, { name: lookup, profileNames: [lookup] });
        if (!hitsForRow.length && pricedRows[0] === row && block.unitContext?.name) {
          hitsForRow = resolveUnits(index, { name: block.unitContext.name });
        }
        if (!hitsForRow.length) hitsForRow = uniekeDeelnaam(lookup);
        for (const { unit } of hitsForRow) {
          const patch = (overlay.units[unit.id] ??= {});
          if (alias) {
            // Show the draft's name, not the catalogue's — the player is holding the draft.
            patch.replace = { ...(patch.replace ?? {}), name_en: row.name };
            addChanged(patch, 'name');
            result.targets.push(`units.${unit.id}.name_en`);
            result.status = 'applied';
          }
          if (unit.points === row.points.value) continue;
          if (typeof patch.points === 'number' && patch.points !== row.points.value) {
            // Two sources disagreeing about a price is a real conflict; report it, never pick one.
            console.warn(`${key}: ${unit.id} points conflict — overlay ${patch.points}, statline ${row.points.value}`);
            continue;
          }
          patch.points = row.points.value;
          patch._was = unit.points;
          addChanged(patch, 'points');
          result.targets.push(`units.${unit.id}.points`);
          result.status = 'applied';
        }
      }
      // A cell the draft struck out and did not replace leaves a HOLE, not a value: the Lizardmen
      // Skink Handler lost its BS, T, W and Ld mid-edit. Publishing the row would either show blanks
      // where a characteristic belongs, or — worse — quietly keep the deleted numbers. We do not know
      // what replaces them, so we publish nothing and the base catalogue statline stands.
      const gatenDoorSchrapping = (block.rows ?? []).some((row) => row.some((cell) => cell.struckText && !cell.text));
      if (gatenDoorSchrapping) {
        console.warn(`${key}: ${block.unitContext?.name ?? block.id} statline has cells the draft struck without replacing — stats not published`);
      }
      const stats = gatenDoorSchrapping ? null : (parseRectangularStats(block) ?? parseEmbeddedStats(block));
      if (stats) {
        if (hits.length) {
          for (const { unit } of hits) {
            overlay.profiles[norm(unit.name_en)] = { stats };
            result.targets.push(`profiles.${norm(unit.name_en)}`);
          }
          // Een hernoemde rij wordt in de app onder de DRAFT-naam opgezocht ("Despot"), en dit pad
          // registreert alleen onder de catalogusnaam. Zet zo'n rij er apart bij, met alléén de
          // eigen statregel — niet de hele tabel.
          for (const row of block.statlineRows ?? []) {
            if (typeof UNIT_ALIASES[key]?.get(norm(row.name)) !== 'string') continue;
            const eigen = stats.find((statRow) => statRow.Name === row.name);
            if (eigen) overlay.profiles[norm(row.name)] = { stats: [eigen] };
          }
        } else {
          // Character summary tables often contain multiple separately selectable catalogue units.
          const pricedRows = (block.statlineRows ?? []).filter((row) => row.points?.value != null && !row.points?.modifier);
          const separatelyResolved = pricedRows.map((row) => {
            // Dezelfde alias als in de puntenlus: de rij heet "Despot", de catalogus-unit
            // "Infernal Castellan" — zonder vertaling resolvet de rij niet en valt het hele blok
            // terug op één profiel onder de sectienaam ("chaos dwarf lords").
            const rowAlias = UNIT_ALIASES[key]?.get(norm(row.name));
            const lookupRow = typeof rowAlias === 'string' ? rowAlias : row.name;
            return { row, hits: resolveUnits(index, { name: lookupRow, profileNames: [lookupRow] }) };
          });
          if (separatelyResolved.length && separatelyResolved.every((entry) => entry.hits.length)) {
            for (const entry of separatelyResolved) {
              const stat = stats.find((row) => row.Name === entry.row.name);
              if (!stat) continue;
              for (const { unit } of entry.hits) {
                overlay.profiles[norm(unit.name_en)] = { stats: [stat] };
                result.targets.push(`profiles.${norm(unit.name_en)}`);
                // Een hernoemde unit wordt in de app onder de DRAFT-naam getoond en dus ook zo
                // opgezocht ("Despot", "Vampire Lord") — registreer het profiel onder beide.
                if (typeof UNIT_ALIASES[key]?.get(norm(entry.row.name)) === 'string') {
                  overlay.profiles[norm(entry.row.name)] = { stats: [stat] };
                }
              }
            }
          } else if (block.unitContext?.name) {
            const profileKey = norm(block.unitContext.name);
            overlay.profiles[profileKey] = {
              ...(overlay.profiles[profileKey] ?? {}),
              stats,
            };
            result.targets.push(`profiles.${profileKey}`);
          }
        }
        if (result.targets.length) result.status = 'applied';
      } else {
        if (profileKeys.length) {
          addProfileValues(overlay, profileKeys, 'notes', [block.text.replace(/\s+/g, ' ').trim()]);
          result.targets.push(...profileKeys.map((keyName) => `profiles.${keyName}.notes`));
          result.status = 'captured';
          result.reason = 'non-rectangular statline retained losslessly';
        } else {
          result.status = 'unsupported';
          result.reason = 'non-rectangular statline table';
        }
      }
    } else if (block.tableType === 'weapon-profile') {
      const rows = parseWeaponProfiles(block);
      if (rows.length) {
        for (const row of rows) {
          const name = decodeEntities(row.name);
          const keyName = slug(name);
          overlay.rules[keyName] = {
            name_en: name,
            body: [],
            weaponProfile: {
              range: row.range || 'Combat',
              strength: row.strength || '-',
              ap: row.ap || '-',
              specialRules: row.specialRules,
            },
            overrides: ruleSlugByName.get(norm(name)) ?? null,
          };
          result.targets.push(`rules.${keyName}.weaponProfile`);
        }
        result.status = 'applied';
      } else if (profileKeys.length) {
        addProfileValues(overlay, profileKeys, 'notes', [block.text.replace(/\s+/g, ' ').trim()]);
        result.targets.push(...profileKeys.map((keyName) => `profiles.${keyName}.notes`));
        result.status = 'captured';
      }
    } else if (block.entryKind === 'unit-size') {
      // Three source shapes: "1" (fixed), "5+" (open), "2-6" (a range). The range variant arrived
      // with Vampire Counts (Spirit Hosts); the old expression read it as a fixed "2" and silently
      // capped the unit at its minimum.
      const match = /^Unit Size:\s*(\d+)\s*(?:-\s*(\d+))?\s*(\+)?/i.exec(block.text);
      if (match && hits.length) {
        for (const { unit } of hits) {
          const patch = overlay.units[unit.id] ?? {};
          patch.minimum = Number(match[1]);
          if (match[2]) patch.maximum = Number(match[2]);
          else if (!match[3]) patch.maximum = Number(match[1]);
          addChanged(patch, 'unit-size');
          overlay.units[unit.id] = patch;
          result.targets.push(`units.${unit.id}.minimum`);
        }
        result.status = 'applied';
      } else if (profileKeys.length) {
        addProfileValues(overlay, profileKeys, 'notes', [block.text.replace(/\s+/g, ' ').trim()]);
        result.targets.push(...profileKeys.map((keyName) => `profiles.${keyName}.notes`));
        result.status = 'captured';
      }
    } else if (block.entryKind === 'troop-type') {
      const match = /^Troop Type:\s*(.+)$/i.exec(block.text);
      if (match && (hits.length || block.unitContext?.name)) {
        const profileKeys = hits.length
          ? hits.map(({ unit }) => norm(unit.name_en))
          : [norm(block.unitContext.name)];
        for (const profileKey of profileKeys) {
          overlay.profiles[profileKey] = {
            ...(overlay.profiles[profileKey] ?? {}),
            troopType: match[1].trim(),
          };
          result.targets.push(`profiles.${profileKey}.troopType`);
        }
        result.status = 'applied';
      }
    } else if (block.entryKind === 'base-size' && profileKeys.length) {
      addProfileValues(overlay, profileKeys, 'baseSize', block.text.replace(/^Base Size:\s*/i, '').trim());
      result.targets.push(...profileKeys.map((keyName) => `profiles.${keyName}.baseSize`));
      result.status = 'captured';
    } else if (block.entryKind === 'armour-value' && profileKeys.length) {
      addProfileValues(overlay, profileKeys, 'armourValue', block.text.replace(/^Armour Value:\s*/i, '').trim());
      result.targets.push(...profileKeys.map((keyName) => `profiles.${keyName}.armourValue`));
      result.status = 'captured';
    } else if (block.entryKind === 'equipment' && profileKeys.length) {
      addProfileValues(overlay, profileKeys, 'equipment', [block.text.replace(/^Equipment:\s*/i, '').trim()]);
      result.targets.push(...profileKeys.map((keyName) => `profiles.${keyName}.equipment`));
      result.status = 'captured';
    } else if (block.type === 'list' && hits.length
      && (block.items ?? []).length
      && (block.items ?? []).every((it) => loreSlugByName.has(norm(it.text)))) {
      // Een lijst waarvan ELKE bullet een bekende Lore of Magic is, is de spreukscholen-keuze van
      // een Wizard ("Battle Magic • Daemonology • Dark Magic • Elementalism"). Tot nu toe werd die
      // alleen als tekst bewaard, dus de Sorcerers of Hashut misten Battle Magic — het draft voegt
      // die toe en de app bleef de drie catalogus-lores tonen (speler-melding, 16-08).
      const lores = (block.items ?? []).map((it) => loreSlugByName.get(norm(it.text)));
      for (const { unit } of hits) {
        const patch = overlay.units[unit.id] ?? {};
        patch.replace = { ...(patch.replace ?? {}), lores };
        addChanged(patch, 'lores');
        overlay.units[unit.id] = patch;
        result.targets.push(`units.${unit.id}.lores`);
      }
      result.status = 'applied';
    } else if (block.entryKind === 'option' && hits.length) {
      const segmenten = blokSegmenten ?? [];
      if (block.id==='b0141'||block.id==='b0143') console.warn('DBG '+block.id+' hits='+hits.map(h=>h.unit.id)+' segs='+JSON.stringify(segmenten.map(x=>[x.doelNaam,x.segment.slice(0,26)])));
      for (const { unit } of hits) {
        const eigen = segmenten
          .filter(({ doelNaam }) => doelUnits(hits, doelNaam).some((h) => h.unit.id === unit.id))
          .map(({ segment }) => segment);
        const parsed = eigen.length ? parsePricedOptions({ ...block, text: eigen.join(' • ') }, unit) : [];
        if (!parsed.length) continue;
        const patch = overlay.units[unit.id] ?? {};
        const current = patch.options ?? [];
        for (const option of parsed) {
          const wanted = semanticOptionName(option.name_en);
          const candidates = current
            .map((candidate, index) => ({ candidate, index, key: semanticOptionName(candidate.name_en) }))
            .filter(({ key }) => key === wanted);
          const at = candidates.length === 1 ? candidates[0].index : -1;
          if (at >= 0) current[at] = {
            ...current[at],
            points: option.points,
            perModel: option.perModel,
          };
          else current.push(option);
        }
        patch.options = current;
        addChanged(patch, 'options');
        overlay.units[unit.id] = patch;
        result.targets.push(`units.${unit.id}.options`);
      }
      if (result.targets.length) result.status = 'applied';
    } else if (block.entryKind === 'special-rules') {
      const match = /^Special Rules(?:\s*\([^)]*\))?:\s*(.+)$/i.exec(block.text);
      const qualified = /^Special Rules\s*\(/i.test(block.text);
      if (match && hits.length && !qualified) {
        let rulesText = match[1].trim();
        let nextIndex = reference.blocks.indexOf(block) + 1;
        while (/[,;]$/.test(rulesText) && nextIndex < reference.blocks.length) {
          const next = reference.blocks[nextIndex++];
          if (next.unitContext?.sourceBlockId !== block.unitContext?.sourceBlockId || next.tableType === 'statline') break;
          if (!next.text || /^(Unit Size|Troop Type|Base Size|Armour Value|Equipment|Options)\s*:/i.test(next.text)) break;
          rulesText = `${rulesText} ${next.text}`.replace(/\s+/g, ' ').trim();
        }
        for (const { unit } of hits) {
          const patch = overlay.units[unit.id] ?? {};
          patch.specialRules = rulesText;
          addChanged(patch, 'special-rules');
          overlay.units[unit.id] = patch;
          result.targets.push(`units.${unit.id}.specialRules`);
        }
        result.status = 'applied';
      } else if (match && profileKeys.length && !qualified) {
        // Geen reparatie meer voor "Furious Charge Predatory Fighter": dat leek een ontbrekende komma,
        // maar het was het DOORGESTREEPTE "Furious Charge" dat tegen de levende tekst aan plakte. Nu de
        // importer schrappingen respecteert komt de combinatie in geen enkel pack meer voor.
        const rules = splitRules(match[1]);
        addProfileValues(overlay, profileKeys, 'specialRules', rules);
        result.targets.push(...profileKeys.map((keyName) => `profiles.${keyName}.specialRules`));
        result.status = 'applied';
      } else if (match && profileKeys.length) {
        addProfileValues(overlay, profileKeys, 'notes', [block.text.replace(/\s+/g, ' ').trim()]);
        result.targets.push(...profileKeys.map((keyName) => `profiles.${keyName}.notes`));
        result.status = 'captured';
      }
    } else if (block.unitContext && profileKeys.length) {
      addProfileValues(overlay, profileKeys, 'notes', [block.text.replace(/\s+/g, ' ').trim()]);
      result.targets.push(...profileKeys.map((keyName) => `profiles.${keyName}.notes`));
      result.status = 'captured';
    } else if (block.text?.trim()) {
      const note = block.text.replace(/\s+/g, ' ').trim();
      if (!overlay.notes.includes(note)) overlay.notes.push(note);
      result.targets.push('notes');
      result.status = 'captured';
    }
    boek();
  }

  // A mount popup needs more than the highlighted delta: its complete troop type, base, equipment
  // and special-rule list are ordinary (uncoloured) source lines around the changed statline. Attach
  // that surrounding metadata only to profiles we actually compiled, so an eye on a V2 mount can
  // show the whole datasheet without treating every unmarked paragraph as a rules change.
  for (const block of reference.blocks.filter((candidate) =>
    candidate.scope === 'army-list' && candidate.unitContext?.name)) {
    const profileKey = norm(block.unitContext.name);
    if (!overlay.profiles[profileKey]?.stats?.length) continue;
    const text = decodeEntities(block.text).replace(/\s+/g, ' ').trim();
    if (!text) continue;
    if (block.entryKind === 'troop-type') {
      addProfileValues(overlay, [profileKey], 'troopType', text.replace(/^Troop Type:\s*/i, '').trim());
    } else if (block.entryKind === 'base-size') {
      addProfileValues(overlay, [profileKey], 'baseSize', text.replace(/^Base Size:\s*/i, '').trim());
    } else if (block.entryKind === 'armour-value') {
      addProfileValues(overlay, [profileKey], 'armourValue', text.replace(/^Armour Value:\s*/i, '').trim());
    } else if (block.entryKind === 'equipment') {
      addProfileValues(overlay, [profileKey], 'equipment', [text.replace(/^Equipment:\s*/i, '').trim()]);
    } else if (block.entryKind === 'special-rules') {
      const match = /^Special Rules(?:\s*\([^)]*\))?:\s*(.+)$/i.exec(text);
      if (match) addProfileValues(overlay, [profileKey], 'specialRules', splitRules(match[1]));
    } else if (/^(?:Note:|Character Mount:)/i.test(text)) {
      addProfileValues(overlay, [profileKey], 'notes', [text]);
    }
  }

  writeFileSync(overlayUrl, `${JSON.stringify(overlay, null, 2)}\n`);
  const counts = Object.fromEntries(['applied', 'captured', 'unresolved', 'unsupported', 'todo'].map((status) => [
    status,
    coverage.filter((row) => row.status === status).length,
  ]));
  writeFileSync(new URL(`${key}-renegade-v2-coverage.json`, REN), `${JSON.stringify({
    id: `${key}-renegade-v2-coverage`,
    army,
    reference: `${key}-renegade-v2-reference.json`,
    generatedBy: 'scripts/compile-renegade-v2.mjs',
    counts,
    blocks: coverage,
  }, null, 2)}\n`);
  console.error(`${key}: ${JSON.stringify(counts)}`);
}
