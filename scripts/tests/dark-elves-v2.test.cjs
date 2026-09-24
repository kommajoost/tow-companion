// Exercise the same TS modules used by the app; no reimplementation of the overlay engine.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, f);
const ov = require(path.join(root, 'src/lib/overlays.ts'));
const ow = require(path.join(root, 'src/lib/owbBuilder.ts'));
const bt = require(path.join(root, 'src/lib/builderToArmy.ts'));
const ar = require(path.join(root, 'src/lib/armyRules.ts'));
const ws = require(path.join(root, 'src/lib/weaponStats.ts'));
const read = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const overlay = read('public/renegade/de-renegade-v2.json');
const base = read('public/owb/dark-elves.json');
const rulesBase = read('public/rules.json').rules;
const statsBase = read('public/owb/rules-index.json');
const cat = ov.catalogueFor(base, overlay.id, overlay);
const rules = ov.applyOverlayRules(rulesBase, overlay);
const stats = ov.applyOverlayStatIndex(statsBase, overlay);
const mounts = ov.applyOverlayMountText(read('public/owb/mount-text.json'), overlay);
const items = ov.applyOverlayItems(read('public/owb/magic-items.json'), overlay);
const unit = (id, category) => category ? cat[category].find((u) => u.id === id) : Object.values(cat).flat().find((u) => u.id === id);
const entry = (id, category = 'characters', count = 1, opts = []) => ({ uid: `${category}:${id}`, cat: category, unitId: id, count, opts });
const list = (entries, points = 2000) => ({ name: 'DOCX regression', composition: overlay.id, rule: 'grand-army', points, entries });
const game = (entries) => bt.builderListToArmy(list(entries), cat, (n) => ov.overlayStatsFor(stats, n, overlay), {
  faction: 'Dark Elves', overlayId: overlay.id, itemsData: items, mountText: mounts,
});
const validate = (entries, points = 2000) => ow.validate(list(entries, points), (c, id) => ow.findUnit(cat, c, id), items);
const optKey = (u, g, name) => `${g}/${u[g].findIndex((o) => o.name_en === name)}`;
const countWarnings = (result) => result.entryWarnings.filter((w) => /Shared choice limit/.test(w.message));

test('Shades armour included; upgrades share a per-1000 UNIT cap', () => {
  const u = unit('dark-elf-shades');
  const e = entry(u.id, 'special', 5);
  assert.equal(ow.entryPoints(u, e), 75);
  assert(ow.loadoutLabels(u, e).includes('Light armour'));
  for (const name of ['Ambushers', 'Chariot Runners', 'Veteran', 'Feigned Flight']) {
    const o = u.options.find((o) => o.name_en === name);
    assert.deepEqual(o.unitLimit, { group: 'de-v2-shades-upgrades', max: 1, perPoints: 1000 });
    assert.match(o.notes.name_en, /1,000/);
  }
  const a = { ...e, opts: [optKey(u, 'options', 'Ambushers'), optKey(u, 'options', 'Veteran')] };
  const b = { ...e, uid: 'second', opts: [optKey(u, 'options', 'Feigned Flight')] };
  assert.equal(ow.entryPoints(u, a), 85);
  assert.equal(countWarnings(validate([a], 1000)).length, 0); // two upgrades on ONE unit
  assert.equal(countWarnings(validate([a, b], 1999)).length, 2);
  assert.equal(countWarnings(validate([a, b], 2000)).length, 0);
  assert.equal(countWarnings(validate([a], 999)).length, 1);
  assert.equal(validate([e, { ...e, uid: 'unupgraded' }], 1000).entryWarnings.length, 0);
});

test('Champion names, allowances and actual profile rows', () => {
  const ex = unit('har-ganeth-executioners'), si = unit('sisters-of-slaughter');
  assert.equal(ex.command[0].magic.maxPoints, 50);
  assert.equal(si.command[0].name_en, 'Handmaiden of Shards (champion)');
  assert.equal(si.command[0].points, 7);
  assert.equal(si.command[0].magic.maxPoints, 25);
  for (const [u, max] of [[ex, 50], [si, 25]]) {
    const c = ow.magicCategories(u, ['general', 'dark-elves'], items, entry(u.id, 'special', 5, ['command/0']));
    assert(c.some((c) => c.budgetGroup === 'opt:command:0' && c.maxPoints === max));
  }
  const e = entry(si.id, 'rare', 5);
  assert.deepEqual(game([e]).units[0].profiles.map((p) => p.label), ['Sister of Slaughter']);
  assert.deepEqual(game([{ ...e, opts: ['command/0'] }]).units[0].profiles.map((p) => p.label), ['Sister of Slaughter', 'Handmaiden of Shards']);
  assert.deepEqual(stats['sisters of slaughter'].stats.map((p) => p.Name), ['Sister of Slaughter', 'Handmaiden of Shards']);
});

test('Noble missile choices are exclusive without losing shields or cloak; saved invalid combinations warn', () => {
  for (const id of ['dark-elf-dreadlord', 'dark-elf-master']) {
    const u = unit(id), e = entry(id);
    const shield = optKey(u, 'options', 'Shield'), cloak = optKey(u, 'options', 'Sea Dragon Cloak');
    const crossbow = optKey(u, 'options', 'Repeater crossbow'), handbow = optKey(u, 'options', 'Repeater handbow');
    const selected = { ...e, opts: [shield, cloak, crossbow] };
    const next = ow.toggleOption(u, selected, handbow);
    assert.deepEqual(next, [shield, cloak, handbow]);
    assert.deepEqual(ow.toggleOption(u, { ...e, opts: next }, handbow), [shield, cloak]);
    assert(validate([{ ...e, opts: [crossbow, handbow] }]).entryWarnings.some((w) => /choose only one/.test(w.message)));
    assert.equal(u.mounts.find((m) => m.name_en === 'Cold One Chariot').points, 110);
  }
});

test('Champion allowance permits multiple item types within ONE budget and preserves saved keys', () => {
  const pool = { test: [
    { name_en: 'Test weapon', type: 'weapon', points: 15 },
    { name_en: 'Test armour', type: 'armor', points: 10 },
    { name_en: 'Other weapon', type: 'weapon', points: 5 },
    { name_en: 'Test talisman', type: 'talisman', points: 30 },
  ] };
  for (const id of ['har-ganeth-executioners', 'sisters-of-slaughter']) {
    const u = unit(id), e = entry(id, 'special', 5, ['command/0', 'magic/weapon/test-weapon']);
    assert.equal(ow.magicWouldExceed(u, e, 'weapon', pool.test[1], pool), false);
    assert.equal(ow.magicWouldExceed(u, e, 'weapon', pool.test[2], pool), true);
    e.opts.push('magic/weapon/test-armour');
    assert.equal(ow.magicItemsPoints(u, e, pool), 25);
    assert.equal(ow.selectedMagicItems(u, e, pool).length, 2);
    assert.equal(ow.magicWouldExceed(u, e, 'weapon', pool.test[3], pool), true);
  }
});

test('Cold One character mounts have a profile, +1T and Counter Charge in battle', () => {
  for (const id of ['dark-elf-dreadlord', 'dark-elf-master', 'supreme-sorceress', 'sorceress']) {
    const u = unit(id), e = entry(id);
    const foot = game([e]).units[0];
    const mounted = game([{ ...e, opts: [optKey(u, 'mounts', 'Cold One {dark elves}')] }]).units[0];
    const toughness = (x) => Number(x.profiles[0].stats.find((s) => s.k === 'T').v);
    assert.equal(toughness(mounted), toughness(foot) + 1);
    assert.equal(mounted.mounts[0].profiles[0].label, 'Cold One');
    assert(mounted.mounts[0].specialRules.includes('Counter Charge'));
  }
});

test('Monster armour, Medusa halberds and Hydra export loadout', () => {
  for (const id of ['war-hydra', 'kharibdyss']) for (const c of ['special', 'rare']) {
    assert.equal(unit(id, c).armor[0].name_en, '4+');
  }
  for (const id of ['bloodwrack-medusas', 'bloodwrack-shrines']) {
    assert(ow.loadoutLabels(unit(id), entry(id, 'rare')).includes('Halberd'));
  }
  const hydra = game([entry('war-hydra', 'rare')]).units[0];
  assert(hydra.options.includes('Serrated maws'));
  assert(ws.unitWeapons(hydra, rules).melee.some((w) => /Serrated maws/i.test(w.name)));
});

test('Murderous and Hidden resolve to DOCX wording, including old labels', () => {
  const idx = ar.buildRuleIndex(rules);
  for (const label of ['Murderous', 'Murderous {renegade}']) for (const faction of [undefined, 'Dark Elves']) {
    const text = rules[ar.resolveRuleSlug(label, idx, faction)].bodyIndex;
    assert.match(text, /When engaged in combat/);
    assert.doesNotMatch(text, /first round/);
    assert.match(text, /mundane weapons/);
  }
  for (const faction of [undefined, 'Dark Elves']) {
    const text = rules[ar.resolveRuleSlug('Hidden', idx, faction)].bodyIndex;
    assert.match(text, /five or more/);
    assert.match(text, /including units with the Loner/);
  }
});

test('Sisters notes and weapons use the revised rules', () => {
  const note = ow.unitNote(unit('sisters-of-slaughter'), overlay.id);
  assert.match(note, /6\+ Ward save against any wounds/);
  assert.match(note, /Parry/);
  assert.doesNotMatch(note, /successful charge|armour value by 1/);
  assert.match(rules['lash-and-buckler'].bodyIndex, /Parry/);
  const weapons = ws.unitWeapons({ options: ['Petrifying gaze', 'Ravager harpoon', 'Lash & buckler'] }, rules);
  const gaze = weapons.ranged.find((w) => /Petrifying/i.test(w.name));
  assert.equal(gaze.multiShots, 'D3');
  assert.equal(gaze.apLabel, 'N/A');
  assert.match(gaze.notes, /Toughness with its Initiative/);
  assert.match(gaze.notes, /No armour save/);
  assert.match(rules['petrifying-gaze'].bodyIndex, /substitute the target’s Toughness with its Initiative/);
  assert.match(rules['petrifying-gaze'].bodyIndex, /No armour save/);
  assert(!weapons.ranged.find((w) => /Ravager/i.test(w.name)).specialRules.includes('Ponderous'));
});

test('Core Witch Elves require Death Hag and share a flat 0–1 cap; Special is unrestricted', () => {
  const core = unit('witch-elves', 'core'), special = unit('witch-elves', 'special');
  assert.equal(ow.unitCategoryFor(core, overlay.id, 'core'), 'core');
  assert.equal(ow.unitCategoryFor(special, overlay.id, 'special'), 'special');
  const a = entry('witch-elves', 'core', 5), b = { ...a, uid: 'second' }, hag = entry('death-hag');
  assert(validate([a]).entryWarnings.some((w) => /Death Hags/.test(w.message)));
  assert(!validate([a, hag]).entryWarnings.some((w) => /Death Hags/.test(w.message)));
  assert.equal(countWarnings(validate([a, b, hag], 3000)).length, 2);
  const s = entry('witch-elves', 'special', 5);
  assert.equal(countWarnings(validate([s, { ...s, uid: 's2' }, a, hag])).length, 0);
  assert.equal(validate([a, hag]).byCategory.core.points, ow.entryPoints(core, a));
});

test('Special Hydra/Kharibdyss require Beastmaster and share ONE slot; Rare stays unlimited', () => {
  const h = entry('war-hydra', 'special'), k = entry('kharibdyss', 'special'), b = entry('high-beastmaster');
  assert.equal(ow.unitCategoryFor(unit(h.unitId, 'special'), overlay.id, 'special'), 'special');
  assert.equal(ow.unitCategoryFor(unit(h.unitId, 'rare'), overlay.id, 'rare'), 'rare');
  assert(validate([h]).entryWarnings.some((w) => /High Beastmaster/.test(w.message)));
  assert(!validate([h, b]).entryWarnings.some((w) => /High Beastmaster/.test(w.message)));
  assert.equal(countWarnings(validate([h, k, b], 4000)).length, 2);
  assert.equal(countWarnings(validate([{ ...h, cat: 'rare' }, { ...k, cat: 'rare' }])).length, 0);
  assert.equal(ow.unitNote(unit('war-hydra', 'rare'), overlay.id), undefined);
  assert.equal(ow.unitNote(unit('kharibdyss', 'rare'), overlay.id), undefined);
});

test('Merwyrm is Rare, uses the referenced High Elf datasheet but not its army restriction', () => {
  const m = unit('merwyrms', 'rare');
  assert(m && ow.unitAllowedIn(m, overlay.id));
  assert.equal(m.points, 200);
  assert.equal(m.maximum, 1);
  assert.equal(ow.unitCategoryFor(m, overlay.id, 'rare'), 'rare');
  assert.doesNotMatch(ow.unitNote(m, overlay.id) ?? '', /Sea Guard/);
  assert.equal(game([entry(m.id, 'rare')]).units[0].profiles[0].label, 'Merwyrm');
});

test('Correction generator is idempotent; input catalogues/rules stay untouched', async () => {
  const { correctDarkElvesV2 } = await import('../patch-dark-elves-v2.mjs');
  assert.deepEqual(correctDarkElvesV2(structuredClone(overlay)), overlay);
  assert.throws(() => correctDarkElvesV2({ ...structuredClone(overlay), packVersion: 'new' }), /Re-review/);
  assert.deepEqual(base, read('public/owb/dark-elves.json'));
  assert.deepEqual(rulesBase, read('public/rules.json').rules);
  assert.deepEqual(statsBase, read('public/owb/rules-index.json'));
  assert.equal(base.characters[0].mounts.find((m) => m.name_en === 'Cold One Chariot').points, 125);
  assert.equal(ow.toggleOption({ options: [{ name_en: 'A' }, { name_en: 'B' }] }, { opts: ['options/0'] }, 'options/1').length, 2);
});

test('A real compiler rerun retains the reviewed corrections (isolated copy)', () => {
  const tempRoot = path.resolve(os.tmpdir());
  const scratch = fs.mkdtempSync(path.join(tempRoot, 'tow-de-v2-test-'));
  try {
    for (const file of [
      'scripts/compile-renegade-v2.mjs', 'scripts/patch-dark-elves-v2.mjs',
      'scripts/patch-vampire-counts-v2.mjs',
      'public/rules.json', 'public/owb/magic-items.json', 'public/owb/dark-elves.json', 'public/owb/high-elf-realms.json',
      'public/renegade/de-renegade-v2.json', 'public/renegade/de-renegade-v2-reference.json',
    ]) {
      const dest = path.join(scratch, file);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(path.join(root, file), dest);
    }
    execFileSync(process.execPath, [path.join(scratch, 'scripts/compile-renegade-v2.mjs'), 'de'], { timeout: 30000, stdio: 'pipe', windowsHide: true });
    const rebuilt = JSON.parse(fs.readFileSync(path.join(scratch, 'public/renegade/de-renegade-v2.json'), 'utf8'));
    const rebuiltCat = ov.catalogueFor(base, rebuilt.id, rebuilt);
    const shades = rebuiltCat.special.find((u) => u.id === 'dark-elf-shades');
    assert.equal(ow.entryPoints(shades, entry(shades.id, 'special', 5)), 75);
    assert.equal(shades.options.find((o) => o.name_en === 'Feigned Flight').unitLimit.max, 1);
    assert.equal(rebuilt.composition.units['witch-elves'].byCategory.core.requiresUnitIds[0], 'death-hag');
    assert.equal(rebuiltCat.characters[0].mounts.find((m) => m.name_en === 'Cold One Chariot').points, 110);
    assert.match(ov.applyOverlayRules(rulesBase, rebuilt)['murderous-renegade'].bodyIndex, /When engaged/);
    assert(rebuiltCat.rare.some((u) => u.id === 'merwyrms'));
    assert.equal(rebuilt.profiles['sisters of slaughter'].replaceStats, true);
    assert.equal(rebuilt.rules['petrifying-gaze-profile'].weaponProfile.specialRules, overlay.rules['petrifying-gaze-profile'].weaponProfile.specialRules);
  } finally {
    // Only the exact temporary directory created by this test, never the workspace or temp root.
    assert.equal(path.dirname(path.resolve(scratch)), tempRoot);
    assert(path.basename(scratch).startsWith('tow-de-v2-test-'));
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});
