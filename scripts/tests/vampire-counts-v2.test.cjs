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
    ['vampire-count', 185, [['Be a Level 2 Wizard', 2, 30], ['Be a Level 3 Wizard', 3, 60]]],
    ['vampire-thrall', 70, [['Be a Level 1 Wizard', 1, 30], ['Be a Level 2 Wizard', 2, 60]]],
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

// ── Audit DOCX 1.5.3.1 (29-10-2026, Joost: "ja ok verwerk") ─────────────────────────────────────
test('Master of the Black Arts has the DOCX text (no struck Thrall clause); Flying Horror no longer glued to it', () => {
  const text = ov.applyOverlayMagicText(read('public/owb/magic-item-text.json'), overlay);
  assert.equal(text['master-of-the-black-arts'].body,
    'This Vampiric Power may only be taken by a Vampire Lord that is a Level 3 Wizard, This Vampire increases their Level of Wizardry by 1.');
  assert.doesNotMatch(text['master-of-the-black-arts'].body, /Thrall|Vampire Count/);
  assert.equal(text['flying-horror'].body, 'Models whose troop type is ‘infantry’ only. This Vampire gains the Fly (10) rule, but cannot join a unit.');
});

test('Corpse Cart must take Balefire or Tintinnabulation (new cart 70); Corpsemaster takes one weapon; Legacy untouched', () => {
  const u = unit('corpse-cart'), e = entry(u.id, 'special', 1);
  const balefire = key(u, 'equipment', 'Balefire Brazier'), bell = key(u, 'equipment', 'Warped Tintinnabulation');
  assert.equal(ow.entryPoints(u, e), 70);
  assert(ow.loadoutLabels(u, e).includes('Balefire Brazier'));
  assert.equal(ow.entryPoints(u, { ...e, opts: [balefire] }), 70); // explicitly saved pick: not charged twice
  assert.equal(ow.entryPoints(u, { ...e, opts: [bell] }), 75);
  assert(!ow.loadoutLabels(u, { ...e, opts: [bell] }).includes('Balefire Brazier'));
  assert.equal(validate([e]).byCategory.core.points, 70);
  const whip = key(u, 'options', 'Whip'), spear = key(u, 'options', 'Cavalry spear');
  const opts = ow.toggleOption(u, { ...e, opts: ow.toggleOption(u, e, whip) }, spear);
  assert.deepEqual(opts, [spear]);
  assert.equal(ow.entryPoints(u, { ...e, opts }), 73);
  assert(validate([{ ...e, opts: [whip, spear] }]).entryWarnings.some((w) => /choose only one of Whip, Cavalry spear/.test(w.message)));
  const legacy = ov.catalogueFor(base, 'vc-renegade').special.find((x) => x.id === 'corpse-cart');
  assert.equal(ow.entryPoints(legacy, entry('corpse-cart', 'special', 1)), legacy.points);
});

test('Mercenaries: Renegade V2 offers Free Company Militia and Empire Archers like the Legacy composition', () => {
  const vc = read('public/owb/the-old-world.json').armies.find((a) => a.id === 'vampire-counts');
  const legacy = vc.mercenaries['vc-renegade'];
  assert.deepEqual(legacy, [{ army: 'empire-of-man', units: ['free-company-militia', 'empire-archers'] }]);
  assert.deepEqual(ov.mercenarySources(vc.mercenaries, 'vampire-counts', 'vc-renegade-v2', overlay), legacy);
  assert.deepEqual(ov.mercenarySources(vc.mercenaries, 'vampire-counts', 'vc-renegade', overlay), legacy);
  assert.deepEqual(ov.mercenarySources(vc.mercenaries, 'vampire-counts', 'vampire-counts', overlay), []);
  assert.deepEqual(ov.mercenarySources(vc.mercenaries, 'dark-elves', 'vc-renegade-v2', overlay), []);
  const empire = Object.values(read('public/owb/empire-of-man.json')).filter(Array.isArray).flat();
  const mercs = legacy[0].units.map((id) => empire.find((x) => x.id === id));
  assert(mercs.every(Boolean));
  const withMercs = { ...cat, mercenaries: mercs };
  const merc = entry('free-company-militia', 'mercenaries', 10);
  const result = ow.validate(list([merc]), (c, id) => ow.findUnit(withMercs, c, id), items);
  assert.equal(result.byCategory.mercenaries.points, ow.entryPoints(mercs[0], merc));
});

test('Terrorgheist as Strigoi mount shows its DOCX special rules (sheet and game)', () => {
  const u = unit('strigoi-ghoul-king');
  const b = game([entry(u.id, 'characters', 1, [key(u, 'mounts', 'Terrorgheist {mount}')])]).units[0];
  assert.deepEqual(b.mounts[0].specialRules, ['Close Order', 'Fly (9)', 'Indomitable (1)', 'Infested', 'Large Target',
    'Necromantic Undead', 'Regeneration (5+)', 'Stomp Attacks (D6)', 'Swiftstride', 'Terror', 'Wailing Dirge (-2)']);
  assert(b.mounts[0].details.includes('Base size: 100 x 150 mm'));
  for (const k of ['terrorgheist', 'terrorgheist mount']) assert(!mounts[k].specialRules.some((r) => /\(X\+\)|^Wailing Dirge$/.test(r)), k);
  assert.equal(b.mounts[0].profiles[0].stats.find((s) => s.k === 'W').v, '(+5)');
});

test('0-1 unit per 1,000 points may: Skeleton magic standard / Implacable Defence and Grave Guard Drilled / Implacable Defence', () => {
  const pool = { test: [{ name_en: 'Test banner', type: 'banner', points: 25 }] };
  const sk = unit('skeleton-warriors');
  const id = key(sk, 'options', 'Implacable Defence'), bearer = key(sk, 'command', 'Standard bearer');
  const skel = (opts) => entry(sk.id, 'core', 10, opts);
  const warnings = (entries, points = 2000) => capWarnings(validate(entries, points, pool)).length;
  assert.equal(warnings([skel([id]), skel([id])]), 0);
  assert.equal(warnings([skel([id]), skel([id]), skel([id])]), 3);
  assert.equal(warnings([skel([id]), skel([id])], 1000), 2);
  // The magic standard counts, the plain standard bearer does not; both upgrades on one unit count once.
  assert.equal(warnings([skel([id]), skel([id]), skel([bearer])]), 0);
  assert.equal(warnings([skel([id]), skel([id]), skel([bearer, 'magic/banner/test-banner'])]), 3);
  assert.equal(warnings([skel([id, bearer, 'magic/banner/test-banner']), skel([id])]), 0);
  assert.equal(warnings([skel([bearer, 'magic/banner/test-banner'])], 999), 1);
  const gg = (unitId, category, name) => entry(unitId, category, 5, [key(unit(unitId, category), 'options', name)]);
  assert.equal(warnings([gg('grave-guard', 'special', 'Drilled'), gg('grave-guard-core', 'core', 'Implacable Defence')]), 0);
  assert.equal(warnings([gg('grave-guard', 'special', 'Drilled'), gg('grave-guard', 'special', 'Implacable Defence'),
    gg('grave-guard-core', 'core', 'Drilled')]), 3);
  // Blood Knights' Drilled is not limited by the DOCX.
  const bk = unit('blood-knights', 'rare');
  assert.equal(warnings([1, 2, 3].map(() => entry(bk.id, 'rare', 4, [key(bk, 'options', 'Drilled')])), 1000), 0);
});

test('Grave Guard: choosing great weapons replaces the shields (old Shields tick stays harmless)', () => {
  for (const [id, category] of [['grave-guard', 'special'], ['grave-guard-core', 'core']]) {
    const u = unit(id, category), e = entry(id, category, 5);
    const gw = key(u, 'equipment', 'Hand weapons, Great weapons (replace shields)');
    assert.equal(gw, 'equipment/1'); // same index as the old "Great weapons (replace shields)"
    assert.deepEqual(ow.loadoutLabels(u, e).filter((n) => /weapon|shield/i.test(n)), ['Hand weapons', 'Shields']);
    const great = { ...e, opts: [gw] };
    assert.deepEqual(ow.loadoutLabels(u, great).filter((n) => /weapon|shield/i.test(n)), ['Hand weapons', 'Great weapons (replace shields)']);
    assert.equal(ow.entryPoints(u, great), 60);
    const oldShieldsTick = `options/${u.options.findIndex((o) => o.name_en === 'Shields')}`;
    assert.equal(ow.entryPoints(u, { ...great, opts: [gw, oldShieldsTick] }), 60);
    assert(!game([{ ...great, opts: [gw, oldShieldsTick] }]).units[0].options.includes('Shields'));
  }
});

test('Vampire Lord is Regular Infantry; old "Vampire Count" lookups get only the Lord row', () => {
  const tt = require(path.join(root, 'src/lib/troopTypes.ts')).makeTroopTypeLookup(stats);
  assert.equal(tt('Vampire Lord'), 'Regular Infantry');
  assert.equal(tt('Vampire Thrall'), 'Regular Infantry');
  for (const name of ['Vampire Count', 'Vampire Count {renegade}', 'Vampire Lord']) {
    assert.deepEqual(ov.overlayStatsFor(stats, name, overlay).map((r) => `${r.Name} W${r.W} A${r.A} Ld${r.Ld}`), ['Vampire Lord W4 A5 Ld9'], name);
  }
});

test('General: Wights, Cairn Wraith and Tomb Banshee may be General; nothing links The Death of a General', () => {
  for (const id of ['wight-king', 'wight-lord', 'cairn-wraith', 'tomb-banshee']) {
    const u = unit(id), e = entry(id, 'characters', 1, [key(u, 'command', 'General')]);
    assert.equal(ow.entryPoints(u, e), u.points);
    assert(ow.selectedOptions(u, e).some(({ opt }) => opt.name_en === 'General'));
  }
  assert.equal(unit('wight-lord').command[0].name_en, 'Battle Standard Bearer'); // saved command/0 keeps meaning
  const idx = ar.buildRuleIndex(rules);
  for (const u of Object.values(cat).flat()) {
    for (const label of (u.specialRules?.name_en ?? '').split(',').map((s) => s.trim()).filter(Boolean)) {
      const slug = ar.resolveRuleSlug(label, idx, 'Vampire Counts');
      if (slug) assert.doesNotMatch(rules[slug].bodyIndex ?? '', /Death of a General/i, `${u.id}: ${label}`);
    }
  }
  assert.doesNotMatch(JSON.stringify(overlay), /Death of a General/i);
});

test('Small DOCX data fixes: Acolyte rules, Hexwraith rows, names, rule texts, Lore label, Spectral Lance, mount data', () => {
  assert(!unit('necromantic-acolyte').specialRules.name_en.includes('Level 1 (or 2) Wizard'));
  assert.deepEqual(ov.overlayStatsFor(stats, 'Hexwraiths', overlay).map((r) => r.Name), ['Hexwraith', 'Hellwraith', 'Skeletal Steed']);
  assert(unit('zombies').specialRules.name_en.endsWith('Shambling Horde'));
  assert.deepEqual(mounts['skeleton warriors'].equipment, ['Hand weapons and shields']);
  for (const id of ['vampire-count', 'vampire-thrall', 'wight-king', 'wight-lord']) {
    assert(unit(id).equipment.some((o) => o.name_en === 'Lance (if appropriately mounted)'), id);
  }
  assert(unit('master-necromancer').options[0].options.some((o) => o.name_en === 'Be a Level 4 Wizard'));
  assert(unit('necromantic-acolyte').options[0].options.some((o) => o.name_en === 'Be a Level 2 Wizard'));
  assert.equal(ow.wizardLevelOf(unit('master-necromancer'), entry('master-necromancer', 'characters', 1, ['subopt/options/0/1'])), 4);
  assert.match(rules['resurrecting-the-fallen'].bodyIndex, /^In a Vampire Counts army/);
  for (const slug of ['banner-of-the-count', 'wight-banner']) assert.match(rules[slug].bodyIndex, /\(see page 27\)/);
  const idx = ar.buildRuleIndex(rules);
  const lore = ar.resolveRuleSlug('Lore of Undeath', idx, 'Vampire Counts');
  assert.match(rules[lore].bodyIndex, /Vanhal’s Danse Macabre/);
  assert.doesNotMatch(rules[lore].bodyIndex, /Mystery shrouds/);
  assert(!overlay.rules['spell-hellish-vigour'].body.some((p) => typeof p === 'string' && /^[\s|]+$/.test(p)));
  for (const slug of ['accursed-reliquary-renegade', 'blasphemous-tome-renegade']) assert.doesNotMatch(rules[slug].bodyIndex, /Mortis Engines/, slug);
  const lance = Object.values(rules).find((r) => r.name === 'Spectral Lance');
  assert.match(JSON.stringify(lance.body), /S\+2.*-2.*Armour Bane \(1\)/);
  for (const [name, size] of [['zombie dragon', '100 x 150 mm'], ['abyssal terror', '50 x 100 mm'], ['mortis engine', '50 x 100 mm']]) {
    assert.equal(mounts[name].baseSize, size, name);
    assert(mounts[name].specialRules.length, name);
  }
  assert.equal(mounts['mortis engine'].armourValue, '4+');
  assert.equal(mounts['black coach'].armourValue, '3+');
  assert(!(mounts['black coach'].notes ?? []).some((n) => /\| M \| WS/.test(n)));
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
    assert.match(rebuilt.magicItemText['master-of-the-black-arts'].body, /^This Vampiric Power may only be taken by a Vampire Lord/);
    assert.doesNotMatch(rebuilt.magicItemText['flying-horror'].body, /Black Arts/);
    const cart = rebuiltCat.special.find((u) => u.id === 'corpse-cart');
    assert.equal(ow.entryPoints(cart, entry(cart.id, 'special', 1)), 70);
    assert.deepEqual(rebuilt.composition.mercenaries, overlay.composition.mercenaries);
  } finally {
    assert.equal(path.dirname(path.resolve(scratch)), tempRoot);
    assert(path.basename(scratch).startsWith('tow-vc-v2-test-'));
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});
