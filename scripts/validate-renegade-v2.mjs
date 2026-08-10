// Structural and high-risk regression checks for the compiled Renegade V2 overlays.
// This deliberately validates the generated public contract rather than importer internals.
import { readFileSync } from 'node:fs';

const REN = new URL('../public/renegade/', import.meta.url);
const OWB = new URL('../public/owb/', import.meta.url);
const PUBLIC = new URL('../public/', import.meta.url);
const PACKS = ['de', 'sk', 'ok', 'cd', 'doc', 'lm'];
const fail = (message) => { throw new Error(message); };
const read = (name) => JSON.parse(readFileSync(new URL(name, REN), 'utf8'));
const assert = (condition, message) => { if (!condition) fail(message); };
const norm = (value) => String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

for (const key of PACKS) {
  const overlay = read(`${key}-renegade-v2.json`);
  const reference = read(`${key}-renegade-v2-reference.json`);
  const coverage = read(`${key}-renegade-v2-coverage.json`);

  assert(reference.schemaVersion === 3, `${key}: reference must use schema v3`);
  assert(overlay.id === `${key}-renegade-v2`, `${key}: wrong overlay id`);
  assert(overlay.scope === 'points-and-rules', `${key}: incomplete overlay scope`);
  assert(overlay.inheritsComposition || overlay.composition, `${key}: composition mapping missing`);

  const changed = reference.blocks.filter((block) =>
    block.scope === 'army-list' && Array.isArray(block.changeKinds) && block.changeKinds.length);
  assert(coverage.blocks.length === changed.length, `${key}: coverage does not contain every changed block`);
  assert(new Set(coverage.blocks.map((block) => block.blockId)).size === changed.length,
    `${key}: duplicate or missing coverage block ids`);
  assert((coverage.counts.unresolved ?? 0) === 0, `${key}: unresolved non-todo source blocks remain`);
  assert((coverage.counts.unsupported ?? 0) === 0, `${key}: unsupported non-todo source blocks remain`);

  // De basiscatalogus van dit pack — nodig om te toetsen of een MOUNT die de overlay toevoegt
  // überhaupt bij die unit hoort. Ontbreekt het bestand, dan slaan we die toets over in plaats van
  // de hele validatie te laten vallen.
  let basis = null;
  try { basis = JSON.parse(readFileSync(new URL(`${overlay.baseArmy}.json`, OWB), 'utf8')); } catch { basis = null; }
  const basisUnit = (id) => {
    if (!basis) return null;
    for (const arr of Object.values(basis)) {
      if (!Array.isArray(arr)) continue;
      const hit = arr.find((u) => u && u.id === id);
      if (hit) return hit;
    }
    return null;
  };

  for (const [unitId, patch] of Object.entries(overlay.units)) {
    if (patch.points != null) assert(Number.isFinite(patch.points) && patch.points >= 0, `${key}/${unitId}: invalid points`);
    if (patch.minimum != null) assert(Number.isInteger(patch.minimum) && patch.minimum > 0, `${key}/${unitId}: invalid minimum`);
    if (patch.maximum != null) assert(Number.isInteger(patch.maximum) && patch.maximum >= patch.minimum, `${key}/${unitId}: invalid maximum`);
    assert(!/[,;]\s*$/.test(patch.specialRules ?? ''), `${key}/${unitId}: truncated special-rules line`);
    for (const option of patch.options ?? []) {
      assert(['command', 'equipment', 'armor', 'options', 'mounts'].includes(option.group),
        `${key}/${unitId}: invalid option group ${option.group}`);
      assert(option.name_en && typeof option.name_en === 'string', `${key}/${unitId}: option without name`);
      if (option.points != null) assert(Number.isFinite(option.points) && option.points >= 0,
        `${key}/${unitId}/${option.name_en}: invalid option points`);
      // MOUNTS: een unit mag alleen een rijdier krijgen dat de basiscatalogus al voor die unit kent.
      //
      // Dit is een tripwire, geen smaakkwestie. Op 02-08 gaf de overlay de Khainite Assassin drie
      // mounts, de Firebelly een Stonehorn en de Hunter "Ambushers" en "Scouts" als rijdier. Oorzaak:
      // de zin "A Tyrant, Bruiser or Hunter may be mounted on a:" werd door de extractie op de komma
      // als KOP gelezen, waardoor het unit-anker verschoof en een gedeelde "Character Mounts"-sectie
      // aan de verkeerde unit hing. Dat is stil fout gegaan tot een speler het zag.
      //
      // Een nieuwe mount is bijna nooit wat Renegade doet — het herprijst er hooguit een. Dus: staat
      // hij niet in de basis, dan is het vrijwel zeker drift en moet de compilatie klappen in plaats
      // van het in de app te zetten. Is het tóch bedoeld, dan hoort de mount eerst in de catalogus.
      if (option.group === 'mounts' && option.action !== 'remove') {
        const bu = basisUnit(unitId);
        if (bu) {
          const kent = (bu.mounts ?? []).some((m) => m && norm(m.name_en) === norm(option.name_en));
          assert(kent, `${key}/${unitId}: overlay voegt mount "${option.name_en}" toe die de catalogus niet voor deze unit kent — waarschijnlijk anker-drift in de extractie`);
        }
      }
    }
  }

  // LORES: een pack dat een lore aanpast moet die lore ook als REGELPAGINA overschrijven.
  //
  // De wiki heeft per lore één pagina met de spreukteksten eringebakken, plus losse spreukpagina's.
  // De compiler overschreef alleen die losse pagina's, dus de speler kreeg de lore-pagina van het
  // v1-pack te zien: Cursing Word op 7+ in plaats van 9+, en Power of Darkness ontbrak helemaal
  // (Joost 10-08). De losse spreuk klopte wel — maar niemand opent die; je tikt op de special rule.
  for (const [loreSlug, patch] of Object.entries(overlay.lores ?? {})) {
    const rule = Object.values(overlay.rules ?? {})
      .find((r) => typeof r.overrides === 'string' && r.overrides.startsWith(loreSlug));
    assert(rule, `${key}/${loreSlug}: pack past de lore aan maar overschrijft de lore-PAGINA niet — dan leest de speler de oude versie`);
    const body = (rule.body ?? []).join(' ').toLowerCase();
    for (const spell of patch.spells ?? []) {
      assert(body.includes(String(spell.name).toLowerCase()),
        `${key}/${loreSlug}: "${spell.name}" staat niet op de lore-pagina van het pack`);
    }
  }

  for (const [name, profile] of Object.entries(overlay.profiles ?? {})) {
    for (const row of profile.stats ?? []) {
      for (const field of ['Name', 'M', 'WS', 'BS', 'S', 'T', 'W', 'I', 'A', 'Ld']) {
        assert(typeof row[field] === 'string' && row[field].length > 0, `${key}/${name}: incomplete stat row (${field})`);
      }
    }
  }

  for (const [slug, rule] of Object.entries(overlay.rules ?? {})) {
    assert(rule.name_en && Array.isArray(rule.body), `${key}/${slug}: malformed rule`);
    if (rule.weaponProfile) {
      for (const field of ['range', 'strength', 'ap', 'specialRules']) {
        assert(typeof rule.weaponProfile[field] === 'string', `${key}/${slug}: malformed weapon profile (${field})`);
      }
    }
  }

  for (const [listId, items] of Object.entries(overlay.magicItems ?? {})) {
    const names = items.map((item) => norm(item.name_en));
    assert(new Set(names).size === names.length, `${key}/${listId}: duplicate magic-item names`);
    for (const item of items) assert(item.name_en && Number.isFinite(item.points) && item.type,
      `${key}/${listId}: malformed magic item`);
  }

  const serialised = JSON.stringify(overlay);
  assert(!/ï¿½|â€”|â€™|Â·/.test(serialised), `${key}: mojibake in overlay output`);
}

const de = read('de-renegade-v2.json');
const baseRules = JSON.parse(readFileSync(new URL('rules.json', PUBLIC), 'utf8'));
assert(de.composition?.includeOnly === true, 'de: explicit V2 composition allow-list missing');
assert(de.units['repeater-crossbowmen']?.minimum === 5, 'de: Repeater Crossbowmen minimum');
assert(de.rules['har-ganeth-greatsword-profile']?.weaponProfile?.ap === '-2'
  || de.rules['har-ganeth']?.weaponProfile?.ap === '-2', 'de: Har Ganeth greatsword AP');
assert(de.profiles.manticore?.stats?.[0]?.T === '(+2)', 'de: Manticore rider Toughness modifier');
assert(de.profiles.manticore?.stats?.[0]?.W === '(+4)', 'de: Manticore rider Wounds modifier');
assert(de.profiles.manticore?.specialRules?.includes('Wilful Beast'), 'de: Manticore popup rules missing');
assert(de.profiles.manticore?.troopType === 'Monstrous creature', 'de: Manticore troop type missing');
assert(de.profiles.manticore?.baseSize === '60 x 100 mm', 'de: Manticore base size missing');
assert(de.profiles.manticore?.equipment?.length, 'de: Manticore equipment missing');
const hydraRuleName = 'If One Head is Severed… Another Takes Its Place';
const hydraRule = de.rules['if-one-head-is-severed-another-takes-its-place'];
assert(de.units['war-hydra']?.specialRules?.split(',').map((rule) => rule.trim()).includes(hydraRuleName),
  'de: War Hydra does not reference its V2 regeneration rule');
assert(hydraRule?.name_en === hydraRuleName, 'de: War Hydra V2 regeneration rule name missing');
assert(hydraRule?.body?.join(' ').includes('roll a D6 for each wound that the War Hydra has lost')
  && hydraRule.body.join(' ').includes('On each roll of a 4+ the War Hydra immediately recovers a wound.'),
  'de: War Hydra V2 regeneration rule explanation missing or incomplete');
assert(!(de.magicItems['dark-elves'] ?? []).some((item) =>
  /upgrade one model|may purchase magic items/i.test(item.name_en)),
  'de: unit upgrades leaked into the global magic-item catalogue');
assert(!Object.values(de.magicItemText ?? {}).some((item) =>
  /(?:^|\n\n)(?:Magic Weapons|Magic Armour|Talismans|Enchanted Items|Arcane Items|Magic Standards)$/i.test(item.body ?? '')),
  'de: a magic-item popup contains the next category heading');
const naggarothBase = baseRules.lores?.['lore-of-naggaroth']?.spells ?? [];
const naggarothPatch = de.lores?.['lore-of-naggaroth']?.spells ?? [];
const naggarothMerged = [...naggarothBase];
for (const spell of naggarothPatch) {
  const at = naggarothMerged.findIndex((candidate) =>
    candidate.slug === spell.slug || norm(candidate.name) === norm(spell.name));
  if (at >= 0) naggarothMerged[at] = spell;
  else naggarothMerged.push(spell);
}
assert(['Black Horror', 'Cursing Word', 'Power of Darkness'].every((name) =>
  naggarothMerged.some((spell) => spell.name === name)),
  'de: Lore of Naggaroth popup does not contain the complete V2 spell list');
assert(de.rules['spell-cursing-word']?.body?.some((line) => /Casting Value: 9\+/.test(line))
  && de.rules['spell-power-of-darkness']?.body?.some((line) => /Casting Value: 7\+/.test(line)),
  'de: Lore of Naggaroth V2 spell text missing');

const sk = read('sk-renegade-v2.json');
assert(sk.addedUnits?.core?.some((unit) => unit.id === 'skaven-dregs' && unit.points === 2), 'sk: Skaven Dregs missing');

const ok = read('ok-renegade-v2.json');
assert(ok.units.yhetees?.options?.some((option) => norm(option.name_en) === 'ambushers' && option.points === 3),
  'ok: Yhetee Ambushers option');

const cd = read('cd-renegade-v2.json');
assert(cd.addedUnits?.core?.some((unit) => unit.id === 'chaos-dwarf-warriors'), 'cd: Chaos Dwarf Warriors missing');
assert(cd.addedUnits?.core?.some((unit) => unit.id === 'blunderbuss-decimators'), 'cd: Blunderbuss Decimators missing');

const doc = read('doc-renegade-v2.json');
assert(doc.units['bloodletters-of-khorne']?.points === 13, 'doc: Bloodletters must stay 13 points per model');

const lm = read('lm-renegade-v2.json');
assert(lm.addedUnits?.core?.some((unit) => unit.id === 'skink-cohorts' && unit.points === 5), 'lm: Skink Cohorts missing');
assert(/Furious Charge, Predatory Fighter/.test(lm.units['ripperdactyl-riders']?.specialRules ?? ''),
  'lm: Ripperdactyl rule separator');

console.log('Renegade V2 overlays validated: 6 packs');
