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
};

const itemTitle = (block) => {
  const candidates = [block.text, ...(block.headingPath ?? []).slice().reverse()];
  for (const raw of candidates) {
    const text = decodeEntities(raw).replace(/\s+/g, ' ').trim();
    const match = /^(.+?)\*?\s+(\d+)\s+points?\s*$/i.exec(text);
    if (match) return { title: text, name: match[1].trim(), points: Number(match[2]), common: /\*/.test(text) };
  }
  return null;
};
const directItemTitle = (block) => {
  const text = decodeEntities(block.text).replace(/\s+/g, ' ').trim();
  const match = /^(.+?)\*?\s+(\d+)\s+points?\s*$/i.exec(text);
  return match ? { title: text, name: match[1].trim(), points: Number(match[2]), common: /\*/.test(text) } : null;
};

const itemListFor = (pack, block, existing) => {
  if (existing) return existing.listId;
  const path = (block.headingPath ?? []).map(norm);
  if (pack === 'doc') {
    for (const part of path) if (DOC_ITEM_LISTS[part]) return DOC_ITEM_LISTS[part];
  }
  if (pack === 'lm' && path.includes('disciplines of the old ones')) return 'disciplines-old-ones';
  if (pack === 'ok' && path.includes('big names')) return 'big-names';
  return ARMY_ITEM_LIST[pack];
};

const itemTypeFor = (block, existing, listId) => {
  if (existing) return existing.item.type;
  for (const part of (block.headingPath ?? []).map(norm)) if (ITEM_SECTION_TYPES[part]) return ITEM_SECTION_TYPES[part];
  if (listId?.startsWith('daemonic-icons-')) return listId.replace('daemonic-icons-', 'daemonic-icon-');
  if (listId?.startsWith('daemonic-gifts-')) return listId.replace('daemonic-gifts-', 'daemonic-gift-');
  if (listId === 'disciplines-old-ones') return 'discipline-old-ones';
  if (listId === 'big-names') return 'big-name';
  return 'enchanted-item';
};

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
    return existing.length >= 4 && wanted.length >= 4 && (existing.includes(wanted) || wanted.includes(existing));
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
  if (/ies$/.test(last)) out.add([...words.slice(0, -1), last.replace(/ies$/, 'y')].join(' '));
  else if (/s$/.test(last)) out.add([...words.slice(0, -1), last.replace(/s$/, '')].join(' '));
  else if (last) out.add([...words.slice(0, -1), `${last}s`].join(' '));
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
    if (!/Magic Items|Gifts & Icons|Disciplines|Big Names/i.test(top)) continue;
    const section = [seed];
    for (let next = at + 1; next < reference.blocks.length; next++) {
      const candidate = reference.blocks[next];
      if ((candidate.headingPath?.[0] ?? '') !== top || directItemTitle(candidate)) break;
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
    const safeBody = group.blocks.slice(1)
      .filter((block) => !block.changeKinds?.includes('todo'))
      .map((block) => decodeEntities(block.text).replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    if (!safeBody.length || !group.blocks.some(actionable)) continue;
    const ruleKey = slug(group.title);
    if (!overlay.rules[ruleKey]) {
      overlay.rules[ruleKey] = {
        name_en: group.title,
        body: safeBody,
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
    const current = overlay.rules[ruleKey] ?? {
      name_en: name,
      body: [],
      overrides: ruleSlugByName.get(norm(name)) ?? null,
    };
    const text = decodeEntities(block.text).replace(/\s+/g, ' ').trim();
    if (text && norm(text) !== norm(name) && !current.body.includes(text)) current.body.push(text);
    overlay.rules[ruleKey] = current;
    implementedBlocks.set(block.id, {
      status: block.entryKind === 'paragraph' ? 'applied' : 'captured',
      target: `rules.${ruleKey}`,
    });
  }

  for (const block of reference.blocks.filter((candidate) => candidate.scope === 'army-list' && changed(candidate))) {
    const result = {
      blockId: block.id,
      unitContext: block.unitContext,
      entryKind: block.entryKind,
      changeKinds: block.changeKinds,
      status: 'unresolved',
      targets: [],
    };
    if (block.changeKinds.includes('todo')) {
      result.status = 'todo';
      coverage.push(result);
      continue;
    }
    const compiledTarget = implementedBlocks.get(block.id);
    if (compiledTarget) {
      result.status = typeof compiledTarget === 'string' ? 'applied' : compiledTarget.status;
      result.targets.push(typeof compiledTarget === 'string' ? compiledTarget : compiledTarget.target);
      coverage.push(result);
      continue;
    }

    let hits = resolveUnits(index, block.unitContext);
    if (!hits.length && block.tableType !== 'statline') hits = resolveUnitGroup(index, block.unitContext);
    const profileKeys = hits.length
      ? [...new Set(hits.map(({ unit }) => norm(unit.name_en)))]
      : block.unitContext?.name ? [norm(block.unitContext.name)] : [];
    if (block.tableType === 'statline') {
      const stats = parseRectangularStats(block) ?? parseEmbeddedStats(block);
      if (stats) {
        if (hits.length) {
          for (const { unit } of hits) {
            overlay.profiles[norm(unit.name_en)] = { stats };
            result.targets.push(`profiles.${norm(unit.name_en)}`);
          }
        } else {
          // Character summary tables often contain multiple separately selectable catalogue units.
          const pricedRows = (block.statlineRows ?? []).filter((row) => row.points?.value != null && !row.points?.modifier);
          const separatelyResolved = pricedRows.map((row) => ({
            row,
            hits: resolveUnits(index, { name: row.name, profileNames: [row.name] }),
          }));
          if (separatelyResolved.length && separatelyResolved.every((entry) => entry.hits.length)) {
            for (const entry of separatelyResolved) {
              const stat = stats.find((row) => row.Name === entry.row.name);
              if (!stat) continue;
              for (const { unit } of entry.hits) {
                overlay.profiles[norm(unit.name_en)] = { stats: [stat] };
                result.targets.push(`profiles.${norm(unit.name_en)}`);
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
      const match = /^Unit Size:\s*(\d+)(\+)?/i.exec(block.text);
      if (match && hits.length) {
        for (const { unit } of hits) {
          const patch = overlay.units[unit.id] ?? {};
          patch.minimum = Number(match[1]);
          if (!match[2]) patch.maximum = Number(match[1]);
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
    } else if (block.entryKind === 'option' && hits.length) {
      for (const { unit } of hits) {
        const parsed = parsePricedOptions(block, unit);
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
        // A line wrap in the source currently drops the separator between these two Lizardmen rules.
        // Preserve both tokens as separate rule chips in the app.
        rulesText = rulesText.replace(/\bFurious Charge Predatory Fighter\b/g, 'Furious Charge, Predatory Fighter');
        for (const { unit } of hits) {
          const patch = overlay.units[unit.id] ?? {};
          patch.specialRules = rulesText;
          addChanged(patch, 'special-rules');
          overlay.units[unit.id] = patch;
          result.targets.push(`units.${unit.id}.specialRules`);
        }
        result.status = 'applied';
      } else if (match && profileKeys.length && !qualified) {
        const rules = splitRules(match[1].replace(/\bFurious Charge Predatory Fighter\b/g, 'Furious Charge, Predatory Fighter'));
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
    coverage.push(result);
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
