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
const overlay = read('public/renegade/vc-renegade-v2.json');
const base = read('public/owb/vampire-counts.json');
const rulesBase = read('public/rules.json').rules;
const cat = ov.catalogueFor(base, overlay.id, overlay);
const rules = ov.applyOverlayRules(rulesBase, overlay);
const stats = ov.applyOverlayStatIndex(read('public/owb/rules-index.json'), overlay);
const mounts = ov.applyOverlayMountText(read('public/owb/mount-text.json'), overlay);
const items = ov.applyOverlayItems(read('public/owb/magic-items.json'), overlay);
const unit = (id, category) => category ? cat[category].find((u) => u.id === id) : Object.values(cat).flat().find((u) => u.id === id);
let serial = 0;
const entry = (id, category = 'characters', count = 1, opts = []) => ({ uid: `${++serial}:${id}`, cat: category, unitId: id, count, opts });
const list = (entries, points = 2000) => ({ name: 'VC DOCX regression', composition: overlay.id, rule: 'grand-army', points, entries });
const game = (entries) => bt.builderListToArmy(list(entries), cat, (n) => ov.overlayStatsFor(stats, n, overlay), {
  faction: 'Vampire Counts', overlayId: overlay.id, itemsData: items, mountText: mounts,
});
const validate = (entries, points = 2000, pool = items) => ow.validate(list(entries, points), (c, id) => ow.findUnit(cat, c, id), pool);
const key = (u, g, name) => { const i = u[g].findIndex((o) => o.name_en === name); assert(i >= 0, name); return `${g}/${i}`; };
const capWarnings = (result) => result.entryWarnings.filter((w) => /Shared choice limit/.test(w.message));

test('Lord includes Level 1; Lord/Thrall/Strigoi upgrades are exclusive and correctly priced', () => {
  for (const [id, basePoints, levels] of [
    ['vampire-count', 185, [['Level 2 Wizard', 2, 30], ['Be a Level 3 Wizard', 3, 60]]],
    ['vampire-thrall', 70, [['Level 1 Wizard', 1, 30], ['Be a Level 2 Wizard', 2, 60]]],
    ['strigoi-ghoul-king', 145, [['Level 1 Wizard', 1, 30], ['Level 2 Wizard', 2, 60]]],
  ]) {
    const u = unit(id), e = entry(id);
    assert.equal(ow.entryPoints(u, e), basePoints);
    assert.equal(ow.wizardLevelOf(u, e), id === 'vampire-count' ? 1 : 0);
    for (const [name, level, price] of levels) {
      e.opts = ow.toggleOption(u, e, key(u, 'options', name));
      assert.equal(ow.wizardLevelOf(u, e), level);
      assert.equal(ow.entryPoints(u, e), basePoints + price);
    }
    assert.equal(e.opts.length, 1);
    assert(validate([{ ...e, opts: levels.map(([name]) => key(u, 'options', name)) }]).entryWarnings.some((w) => /choose only one/.test(w.message)));
  }
  assert(game([entry('vampire-count')]).units[0].options.some((n) => /Level 1 Wizard/.test(n)));
});

test('Vampires gain Accursed Weapons and Coven Throne is 165', () => {
  for (const id of ['vampire-count', 'vampire-thrall']) {
    const u = unit(id), e = entry(id, 'characters', 1, [key(u, 'mounts', 'Coven Throne')]);
    assert.equal(ow.entryPoints(u, e), u.points + 165);
    assert(game([e]).units[0].specialRules.includes('Accursed Weapons'));
  }
  assert.match(rules['accursed-weapons'].bodyIndex, /hand weapon/i);
});

test('Acolyte has Corpse Cart with mandatory paid equipment, no Corpsemaster and no Mortis Engine', () => {
  const u = unit('necromantic-acolyte');
  assert.equal(u.mounts.filter((m) => /Corpse Cart/.test(m.name_en)).length, 1);
  assert(!ow.unitBlocks(u).find((b) => b.key === 'mounts').items.some(({ opt }) => opt.name_en === 'Mortis Engine'));
  assert(!unit('master-necromancer').mounts.some((m) => /Corpse Cart/.test(m.name_en)));
  assert(unit('master-necromancer').mounts.some((m) => m.name_en === 'Mortis Engine' && !m.hidden));
  const mountKey = key(u, 'mounts', 'Corpse Cart (Acolyte mount)');
  const e = entry(u.id, 'characters', 1, [mountKey]);
  assert.equal(ow.entryPoints(u, e), 60 + 60 + 10);
  const b = game([e]).units[0];
  assert(b.options.includes('Balefire Brazier'));
  assert.deepEqual(b.mounts[0].profiles.map((p) => p.label), ['Corpse Cart', 'The Restless Dead']);
  assert(b.mounts[0].specialRules.includes('Vigor Mortis'));
  assert(b.mounts[0].details.includes('Armour value: 4+'));
  const next = { ...e, opts: ow.setExclusiveSubOption(u, e, 'mounts', Number(mountKey.split('/')[1]), 1) };
  assert.equal(ow.entryPoints(u, next), 135);
  assert(game([next]).units[0].options.includes('Warped Tintinnabulation'));
  assert(!game([next]).units[0].options.includes('Balefire Brazier'));
  assert(validate([entry(u.id, 'characters', 1, ['mounts/2'])]).entryWarnings.some((w) => /Mortis Engine is only/.test(w.message)));
  assert(ov.overlayStatsFor(stats, 'Corpse Cart', overlay).some((r) => /Corpsemaster/.test(r.Name)));
});

test('Strigoi loadout has heavy armour and Wicked Claws AP -2', () => {
  const b = game([entry('strigoi-ghoul-king')]).units[0];
  assert(b.options.some((n) => /heavy armour/.test(n)));
  assert(b.options.includes('Wicked claws'));
  assert.equal(ws.unitWeapons(b, rules).melee.find((w) => /wicked claws/i.test(w.name)).ap, -2);
});

test('Nightmare character movement 7; Black Coach Nightmares retain 8', () => {
  for (const id of ['vampire-count', 'vampire-thrall', 'master-necromancer', 'necromantic-acolyte']) {
    const u = unit(id), b = game([entry(id, 'characters', 1, [key(u, 'mounts', 'Nightmare')])]).units[0];
    assert.equal(b.mounts[0].profiles[0].stats.find((s) => s.k === 'M').v, '7');
  }
  assert.equal(ov.overlayStatsFor(stats, 'Black Coach', overlay).find((r) => /Nightmare/.test(r.Name)).M, '8');
});

test('Skeleton shields are free, armour costs 1/model and old armour/0 selection survives', () => {
  const u = unit('skeleton-warriors'), e = entry(u.id, 'core', 10);
  assert.equal(ow.entryPoints(u, e), 40);
  assert(ow.loadoutLabels(u, e).includes('Shields'));
  assert(!ow.loadoutLabels(u, e).some((n) => /Light armour/.test(n)));
  const armoured = { ...e, opts: ['armor/0'] };
  assert.equal(ow.entryPoints(u, armoured), 50);
  assert(game([armoured]).units[0].options.includes('Light armour'));
  assert(game([armoured]).units[0].options.includes('Shields'));
});

test('Zombies have a single WS1 profile and size 20+ with no old 40 cap', () => {
  const u = unit('zombies'), e = entry(u.id, 'core', 60);
  assert.equal(u.minimum, 20);
  assert.equal(u.maximum, 0);
  const b = game([e]).units[0];
  assert.equal(b.profiles.length, 1);
  assert.equal(b.profiles[0].stats.find((s) => s.k === 'WS').v, '1');
  assert(!validate([e]).entryWarnings.some((w) => /maximum size/.test(w.message)));
});

test('Correct natural armour in every Special/Rare variant and free Black Knight barding', () => {
  for (const [id, armour] of [['crypt-ghouls', 'light'], ['vargheists', 'light'], ['crypt-horrors', 'heavy'], ['terrorgheist', 'heavy'], ['varghulf', 'heavy']]) {
    for (const [category, units] of Object.entries(cat)) for (const u of units.filter((u) => u.id === id)) {
      const e = entry(id, category, u.minimum || 1);
      assert(game([e]).units[0].options.some((n) => n.includes(`${armour} armour`)), `${category}/${id}`);
      assert.equal(ow.entryPoints(u, e), u.points * e.count);
    }
  }
  for (const [id, category] of [['black-knights', 'special'], ['black-knights-core', 'core']]) {
    const u = unit(id), e = entry(id, category, 4);
    assert(ow.loadoutLabels(u, e).includes('Barding'));
    assert.equal(ow.entryPoints(u, e), 96);
    assert.equal(ow.entryPoints(u, { ...e, opts: ['options/0'] }), 96);
  }
});

test('Shared character limits are per full 1000 points, not individual caps', () => {
  for (const ids of [['vampire-count', 'master-necromancer'], ['wight-king', 'tomb-banshee']]) {
    const entries = ids.map((id) => entry(id));
    assert.equal(capWarnings(validate(entries, 1000)).length, 2);
    assert.equal(capWarnings(validate(entries, 2000)).length, 0);
    assert.equal(capWarnings(validate(entries.slice(0, 1), 999)).length, 1);
  }
});

test('At least one actual Wizard is required, not merely a non-wizard Vampire Thrall', () => {
  assert(validate([]).warnings.some((w) => /at least one Wizard/.test(w)));
  assert(validate([entry('vampire-thrall')]).warnings.some((w) => /at least one Wizard/.test(w)));
  assert(!validate([entry('vampire-count')]).warnings.some((w) => /at least one Wizard/.test(w)));
  assert(!validate([entry('vampire-thrall', 'characters', 1, ['options/1'])]).warnings.some((w) => /at least one Wizard/.test(w)));
});

test('Explicitly selected Battle March retains its one per-1000-choice exception', () => {
  const validateMarch = (entries) => ow.validate({ ...list(entries, 750), rule: 'battle-march' }, (c, id) => ow.findUnit(cat, c, id), items);
  assert.equal(capWarnings(validateMarch([entry('vampire-count')])).length, 0);
  assert(validateMarch([entry('vampire-count'), entry('black-coach', 'rare')]).warnings.some((w) => /Battle March allows a single/.test(w)));
});

test('Core Grave Guard/Black Knights share one slot without Wights; ordinary Special unrestricted', () => {
  const a = entry('grave-guard-core', 'core', 5), b = entry('black-knights-core', 'core', 4);
  assert.equal(validate([a]).entryWarnings.length, 0);
  assert.equal(capWarnings(validate([a, b], 4000)).length, 2);
  const entries = ['grave-guard', 'black-knights', 'crypt-horrors', 'fell-bats'].flatMap((id) =>
    [entry(id, 'special', unit(id).minimum), entry(id, 'special', unit(id).minimum)]);
  assert.equal(validate(entries, 1000).entryWarnings.length, 0);
});

test('Spirit Hosts and Hexwraiths each allow one unit per Wraith/Banshee', () => {
  const spirits = [entry('spirit-hosts', 'special', 2), entry('spirit-hosts', 'special', 2)];
  const hex = entry('hexwraiths', 'rare', 5), wraith = entry('cairn-wraith');
  assert.equal(capWarnings(validate([spirits[0], hex])).length, 2);
  assert.equal(capWarnings(validate([spirits[0], hex, wraith])).length, 0);
  assert.equal(capWarnings(validate([...spirits, hex, wraith])).length, 2);
  assert.equal(capWarnings(validate([...spirits, hex, wraith, entry('tomb-banshee')])).length, 0);
});

test('Special Blood Knights require a Vampire Lord GENERAL and have a flat cap', () => {
  const blood = entry('blood-knights', 'special', 4), lord = entry('vampire-count');
  assert.equal(ow.unitCategoryFor(unit('blood-knights', 'special'), overlay.id, 'special'), 'special');
  assert(validate([blood, lord]).entryWarnings.some((w) => /General/.test(w.message)));
  lord.opts = ['command/0'];
  assert(!validate([blood, lord]).entryWarnings.some((w) => /General/.test(w.message)));
  assert.equal(capWarnings(validate([blood, entry('blood-knights', 'special', 4), lord], 4000)).length, 2);
  assert.equal(validate([blood, lord]).byCategory.special.points, 156);
});

test('Strigoi Special choices share one slot and require General; Rare choices unrestricted', () => {
  const king = entry('strigoi-ghoul-king', 'characters', 1, ['command/0']);
  const varg = entry('vargheists', 'special', 2), terror = entry('terrorgheist', 'special');
  assert(validate([varg]).entryWarnings.some((w) => /General/.test(w.message)));
  assert.equal(capWarnings(validate([varg, terror, king], 4000)).length, 2);
  assert.equal(validate([varg, king]).entryWarnings.length, 0);
  const rare = ['vargheists', 'terrorgheist', 'blood-knights'].flatMap((id) =>
    [entry(id, 'rare', unit(id, 'rare').minimum || 1), entry(id, 'rare', unit(id, 'rare').minimum || 1)]);
  assert.equal(validate(rare, 1000).entryWarnings.length, 0);
  assert.equal(capWarnings(validate([entry('black-coach', 'rare'), entry('black-coach', 'rare')], 1000)).length, 2);
  assert.equal(capWarnings(validate([entry('black-coach', 'rare'), entry('black-coach', 'rare')], 2000)).length, 0);
});

test('Kastellan has independent 25+25 budgets in both categories; old mixed keys resolve', () => {
  const pool = { test: [
    { name_en: 'Test weapon', type: 'weapon', points: 15 },
    { name_en: 'Test armour', type: 'armor', points: 10 },
    { name_en: 'Too big', type: 'talisman', points: 30 },
    { name_en: 'Power one', type: 'vampiric-power', points: 15 },
    { name_en: 'Power two', type: 'vampiric-power', points: 10 },
  ] };
  for (const category of ['special', 'rare']) {
    const u = unit('blood-knights', category), e = entry(u.id, category, 4, ['command/0']);
    assert.equal(ow.magicCategories(u, ['test'], pool, { ...e, opts: [] }).length, 0);
    const cats = ow.magicCategories(u, ['test'], pool, e);
    assert.equal(cats.length, 2);
    assert.notEqual(cats[0].budgetGroup, cats[1].budgetGroup);
    assert(cats.every((c) => c.maxPoints === 25 && c.maxItems === Infinity));
    assert.equal(ow.magicWouldExceed(u, e, 'weapon', pool.test[2], pool), true);
    e.opts.push('magic/weapon/test-weapon', 'magic/weapon/power-one'); // historical mixed storage
    assert.equal(ow.magicWouldExceed(u, e, 'weapon', pool.test[1], pool), false);
    assert.equal(ow.magicWouldExceed(u, e, 'vampiric-power', pool.test[4], pool), false);
    e.opts.push('magic/weapon/test-armour', 'magic/vampiric-power/power-two');
    assert.equal(ow.magicItemsPoints(u, e, pool), 50);
    assert.equal(ow.magicGroupSpent(u, e, cats[0].budgetGroup, pool), 25);
    assert.equal(ow.magicGroupSpent(u, e, cats[1].budgetGroup, pool), 25);
  }
});

test('Actual label routing opens v2 Dark Vitality and parameterised Wailing Dirge', () => {
  const idx = ar.buildRuleIndex(rules);
  for (const label of ['Dark Vitality', 'Dark Vitality {renegade}']) {
    const slug = ar.resolveRuleSlug(label, idx, 'Vampire Counts');
    assert.match(rules[slug].bodyIndex, /Master of the Dead/);
    assert.doesNotMatch(rules[slug].bodyIndex, /Death of a General/);
  }
  for (const label of ['Wailing Dirge (-1)', 'Wailing Dirge (-2)', 'Wailing Dirge {renegade}']) {
    const slug = ar.resolveRuleSlug(label, idx, 'Vampire Counts');
    assert.match(rules[slug].bodyIndex, /Magical Attacks/);
    assert.match(rules[slug].bodyIndex, /even if it charged this turn/);
    assert.match(rules[slug].bodyIndex, /minimum of 2/);
    assert.doesNotMatch(rules[slug].bodyIndex, /marched/);
  }
  assert(game([entry('tomb-banshee')]).units[0].specialRules.includes('Wailing Dirge (-1)'));
});

test('Saved Kastellan mixed keys stay removable, over-budget items warn and powers stay army-unique', () => {
  const pool = { test: [
    { name_en: 'Power one', type: 'vampiric-power', points: 15 },
    { name_en: 'Too big', type: 'weapon', points: 30 },
  ] };
  const u = unit('blood-knights', 'rare');
  const e = entry(u.id, 'rare', 4, ['command/0', 'magic/weapon/power-one', 'magic/weapon/too-big', 'unknown/keep-me']);
  const canonical = ow.canonicalMagicOptions(u, e, pool);
  assert.deepEqual(canonical, ['command/0', 'magic/vampiric-power/power-one', 'magic/weapon/too-big', 'unknown/keep-me']);
  assert.equal(ow.magicItemsPoints(u, e, pool), ow.magicItemsPoints(u, { ...e, opts: canonical }, pool));
  assert(!ow.toggleMagicItem({ ...e, opts: canonical }, 'vampiric-power', pool.test[0], Infinity).includes('magic/vampiric-power/power-one'));
  assert(validate([e], 2000, pool).entryWarnings.some((w) => /Magic Items over its 25 pt allowance/.test(w.message)));
  const vampire = entry('vampire-thrall', 'characters', 1, ['magic/vampiric-power/power-one']);
  assert.equal(validate([e, vampire], 2000, pool).entryWarnings.filter((w) => /once per army/.test(w.message)).length, 2);
  assert.equal(ow.magicWouldExceed(unit('vampire-thrall'), { ...vampire, opts: [] }, 'vampiric-power', pool.test[0], pool, { entries: [e] }), true);
});

test('Correction is idempotent, version guarded, and does not mutate Legacy', async () => {
  const { correctVampireCountsV2 } = await import('../patch-vampire-counts-v2.mjs');
  assert.deepEqual(correctVampireCountsV2(structuredClone(overlay)), overlay);
  assert.throws(() => correctVampireCountsV2({ ...structuredClone(overlay), packVersion: 'new' }), /Re-review/);
  assert.equal(base.characters.find((u) => u.id === 'vampire-count').mounts[2].points, 210);
  assert.equal(base.core.find((u) => u.id === 'zombies').maximum, 40);
});

test('Real compiler retains reviewed corrections after reimport', () => {
  const tempRoot = path.resolve(os.tmpdir());
  const scratch = fs.mkdtempSync(path.join(tempRoot, 'tow-vc-v2-test-'));
  try {
    for (const file of [
      'scripts/compile-renegade-v2.mjs', 'scripts/patch-dark-elves-v2.mjs', 'scripts/patch-vampire-counts-v2.mjs',
      'public/rules.json', 'public/owb/magic-items.json', 'public/owb/vampire-counts.json',
      'public/renegade/vc-renegade-v2.json', 'public/renegade/vc-renegade-v2-reference.json',
    ]) {
      const dest = path.join(scratch, file);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(path.join(root, file), dest);
    }
    execFileSync(process.execPath, [path.join(scratch, 'scripts/compile-renegade-v2.mjs'), 'vc'], { timeout: 30000, stdio: 'pipe', windowsHide: true });
    const rebuilt = JSON.parse(fs.readFileSync(path.join(scratch, 'public/renegade/vc-renegade-v2.json'), 'utf8'));
    const rebuiltCat = ov.catalogueFor(base, rebuilt.id, rebuilt);
    const lord = rebuiltCat.characters.find((u) => u.id === 'vampire-count');
    assert.equal(ow.wizardLevelOf(lord, entry(lord.id)), 1);
    assert.equal(lord.mounts.find((m) => m.name_en === 'Coven Throne').points, 165);
    assert.equal(rebuilt.profiles.nightmare.stats[0].M, '7');
    assert.equal(rebuiltCat.special.find((u) => u.id === 'blood-knights').command[0].magic.maxPoints, 25);
    assert(rebuilt.profiles.zombies.replaceStats);
  } finally {
    assert.equal(path.dirname(path.resolve(scratch)), tempRoot);
    assert(path.basename(scratch).startsWith('tow-vc-v2-test-'));
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});
