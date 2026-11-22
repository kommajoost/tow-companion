// 22-11-2026: mathhammer — verwachte wounds (en de exacte verdeling) voor schieten en close combat.
// Handmatig narekenbare ketens, elke 'telt'-regel, echte units uit de lijstbouwer-pijplijn, en een
// adversariële ronde (lege profielen, "-", "*", T > 10, 0 modellen, …).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, f);
const read = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const mh = require(path.join(root, 'src/lib/mathhammer.ts'));
const bt = require(path.join(root, 'src/lib/builderToArmy.ts'));
const ov = require(path.join(root, 'src/lib/overlays.ts'));
const tt = require(path.join(root, 'src/lib/troopTypes.ts'));
const rules = read('public/rules.json').rules;
const statsIdx = read('public/owb/rules-index.json');
const mountText = read('public/owb/mount-text.json');

const close = (a, b, eps = 1e-6, msg) => assert.ok(Math.abs(a - b) < eps, `${msg ?? ''} expected ${b}, got ${a}`);
const COLS = ['M', 'WS', 'BS', 'S', 'T', 'W', 'I', 'A', 'Ld'];
const prof = (label, o) => ({ label, stats: COLS.map((k) => ({ k, v: String(o[k] ?? '-') })) });
const unit = (o) => ({
  id: o.name || 'u', name: o.name || 'Unit', count: o.count === undefined ? 10 : o.count, points: 0, category: 'Core',
  troopType: o.tt, options: o.options || [], specialRules: o.sr || [], profiles: o.profiles, mounts: o.mounts, magicItems: o.items, magicWeapons: o.mw,
});
// A plain attacker: N models WS4 BS4 S3 A1.
const krijger = (o = {}) => unit({ name: 'Krijgers', count: o.count ?? 10, options: o.options ?? ['Hand weapons'], sr: o.sr, tt: o.tt ?? 'Regular Infantry',
  profiles: o.profiles ?? [prof('Krijger', { M: 5, WS: o.WS ?? 4, BS: o.BS ?? 4, S: o.S ?? 3, T: 3, W: 1, I: 4, A: o.A ?? 1, Ld: 8 })] });
// A defender with WS 0 → every blow hits automatically (characteristics-of-zero-combat), so "10 attacks" = 10 hits.
const pop = (o = {}) => unit({ name: 'Doel', count: o.count ?? 10, options: o.options ?? [], sr: o.sr, tt: o.tt ?? 'Heavy Infantry', mounts: o.mounts, items: o.items,
  profiles: o.profiles ?? [prof('Doel', { M: 4, WS: o.WS ?? 0, BS: 3, S: 3, T: o.T ?? 3, W: o.W ?? 1, I: 3, A: 1, Ld: 7 })] });
const cc = (a, d, extra = {}) => mh.berekenAanval(a, d, { soort: 'combat', modellen: extra.modellen ?? (a.count ?? 1), ...extra }, rules);
const sh = (a, d, extra = {}) => mh.berekenAanval(a, d, { soort: 'schieten', modellen: extra.modellen ?? (a.count ?? 1), ...extra }, rules);

function checkVerdeling(r, label = '') {
  if (!r.verdeling) return;
  const som = r.verdeling.reduce((s, p) => s + p, 0);
  const ev = r.verdeling.reduce((s, p, k) => s + p * k, 0);
  close(som, 1, 1e-9, `${label} sum(verdeling)`);
  close(ev, r.wounds, 1e-9, `${label} E[verdeling]`);
}

// Builder pipeline (src/lib/builderToArmy.ts) → a real game ArmyUnit.
function echt(army, faction, name, opts = [], count) {
  const cat = read(`public/owb/${army}.json`);
  for (const c of ['characters', 'core', 'special', 'rare']) for (const u of cat[c] || []) if (u.name_en === name) {
    const e = { uid: u.id, cat: c, unitId: u.id, count: count ?? (u.minimum || 1), opts };
    return bt.builderListToArmy({ name: 't', composition: '', rule: '', points: 0, entries: [e] }, cat,
      (n) => ov.overlayStatsFor(statsIdx, n, null), { faction, troopTypeFor: tt.makeTroopTypeLookup(statsIdx), mountText }).units[0];
  }
  throw new Error(`unit ${name} not in ${army}`);
}

// ─────────────────────────── charts ───────────────────────────
test('To Hit and To Wound charts match the verbatim rules.json charts', () => {
  const parse = (slug) => {
    const toks = rules[slug].bodyIndex.replace('A\\T', '').trim().split(/\s+/).slice(10);
    const grid = [];
    for (let r = 0; r < 10; r++) grid.push(toks.slice(r * 11 + 1, r * 11 + 11).map((t) => (t === '-' ? 0 : parseInt(t, 10))));
    return grid;
  };
  assert.deepEqual(mh.TO_HIT_CHART, parse('to-hit-chart'));
  assert.deepEqual(mh.TO_WOUND_CHART, parse('to-wound-chart'));
});

test('dice expressions', () => {
  close(mh.dobbelVerdeling('D3+3').reduce((s, p, k) => s + p * k, 0), 5);
  close(mh.dobbelVerdeling('2D6').reduce((s, p, k) => s + p * k, 0), 7);
  assert.deepEqual(mh.dobbelVerdeling('2'), [0, 0, 1]);
  assert.equal(mh.dobbelVerdeling('*'), null);
});

// ─────────────────────────── bare chain ───────────────────────────
test('shooting chain: 10 shots BS4, S3 vs T3, 5+ save', () => {
  const a = unit({ name: 'Archers', count: 10, options: ['Hand weapons', 'Warbows'], profiles: [prof('Archer', { WS: 3, BS: 4, S: 3, T: 3, W: 1, A: 1, Ld: 7 })] });
  const d = pop({ options: ['Heavy armour'], WS: 3 });
  const r = sh(a, d);
  const st = r.groepen[0].stappen;
  assert.equal(st[0].worp, '3+'); close(st[0].aantal, 10 * 4 / 6);
  assert.equal(st[1].worp, '4+'); close(st[1].aantal, 10 * 4 / 6 / 2);
  assert.equal(st[2].worp, '5+'); close(st[2].kans, 4 / 6);
  close(r.wounds, 10 * (4 / 6) * 0.5 * (4 / 6));
  checkVerdeling(r);
  // long range −1 → 4+
  const r2 = sh(a, d, { situaties: { long: true } });
  assert.equal(r2.groepen[0].stappen[0].worp, '4+');
  // the custom penalty is on top
  assert.equal(sh(a, d, { situaties: { long: true }, toHitMod: 1 }).groepen[0].stappen[0].worp, '5+');
});

test('combat chain: WS vs WS chart, natural 6 always hits, AP worsens the save', () => {
  const a = krijger({ WS: 1 });
  const d = pop({ WS: 10, options: ['Heavy armour'] }); // WS1 vs WS10 → 5+ in the chart
  const r = cc(a, d);
  assert.equal(r.groepen[0].stappen[0].worp, '5+');
  const g = krijger({ WS: 4, options: ['Great weapon'] }); // S+2, AP -2, Armour Bane (1)
  const r2 = cc(g, pop({ options: ['Heavy armour'] }));
  const st = r2.groepen[0].stappen;
  assert.equal(st[0].worp, 'auto');
  assert.equal(st[1].worp, '2+'); // S5 vs T3
  assert.equal(st[2].worp, '7+'.replace('7+', '—')); // 5+ with AP -2 → 7+ → no save
  close(r2.wounds, 10 * 5 / 6);
  checkVerdeling(r2);
});

// ─────────────────────────── special rules (class telt) ───────────────────────────
test('Armour Bane (1): 10 hits, 4+ to wound, 5+ save, AP − → 3.61 vs 3.33', () => {
  const d = pop({ options: ['Heavy armour'] });
  const zonder = cc(krijger(), d);
  const met = cc(krijger({ sr: ['Armour Bane (1)'] }), d);
  close(zonder.wounds, 10 / 3, 1e-9);
  close(met.wounds, 10 * (2 / 6 * 4 / 6 + 1 / 6 * 5 / 6), 1e-9);
  assert.ok(Math.abs(met.wounds - 3.611) < 0.001);
  assert.ok(met.meegerekend.some((m) => /Armour Bane/.test(m.regel)));
  checkVerdeling(met);
});

test('Poisoned Attacks: natural 6 To Hit adds +2 To Wound (not on auto hits)', () => {
  const mk = (sr) => unit({ name: 'Sk', count: 10, options: ['Shortbows'], sr, profiles: [prof('Sk', { WS: 3, BS: 3, S: 3, T: 3, W: 1, A: 1, Ld: 6 })] });
  const d = pop({ T: 4, WS: 3 });
  close(sh(mk([]), d).wounds, 10 * (1 / 2) * (2 / 6));
  close(sh(mk(['Poisoned Attacks']), d).wounds, 10 * (1 / 6 * 4 / 6 + 2 / 6 * 2 / 6));
  // auto hits (target WS 0): poison cannot be used
  close(cc(krijger({ sr: ['Poisoned Attacks'] }), pop({ T: 4 })).wounds, 10 * 2 / 6);
});

test('Killing Blow / Cleaving Blow / Monster Slayer', () => {
  const ha = { options: ['Heavy armour'] };
  // KB vs heavy infantry W1: natural 6 To Wound ignores armour
  close(cc(krijger({ sr: ['Killing Blow'] }), pop(ha)).wounds, 10 * (2 / 6 * 4 / 6 + 1 / 6));
  // KB vs W2 infantry: the group table counts all Wounds of a fresh model
  const kbW2 = cc(krijger({ sr: ['Killing Blow'] }), pop({ ...ha, W: 2 }));
  close(kbW2.groepen[0].wounds, 10 * (2 / 6 * 4 / 6 * 1 + 1 / 6 * 2));
  checkVerdeling(kbW2, 'KB W2');
  // KB vs a monster: no effect
  close(cc(krijger({ sr: ['Killing Blow'] }), pop({ ...ha, tt: 'Monstrous Creature', T: 3 })).wounds, 10 / 3, 1e-9);
  // Cleaving vs heavy infantry; not vs monstrous infantry
  close(cc(krijger({ sr: ['Cleaving Blow'] }), pop(ha)).wounds, 10 * (2 / 6 * 4 / 6 + 1 / 6));
  close(cc(krijger({ sr: ['Cleaving Blow'] }), pop({ ...ha, tt: 'Monstrous Infantry' })).wounds, 10 / 3);
  // Monster Slayer vs a W6 monster: natural 6 → all 6 Wounds
  const ms = cc(krijger({ sr: ['Monster Slayer'] }), pop({ ...ha, tt: 'Behemoth', W: 6, count: null }));
  close(ms.groepen[0].wounds, 10 * (2 / 6 * 4 / 6 + 1 / 6 * 6));
  checkVerdeling(ms, 'MS');
  // KB is combat only: shooting with it changes nothing
  const bow = unit({ name: 'B', count: 10, options: ['Shortbows'], sr: ['Killing Blow'], profiles: [prof('B', { WS: 3, BS: 3, S: 3, T: 3, W: 1, A: 1, Ld: 6 })] });
  close(sh(bow, pop({ ...ha, WS: 3 })).wounds, 10 * 0.5 * 0.5 * 4 / 6);
});

test('Multiple Wounds (2) and (D3), capped at the model\'s Wounds', () => {
  const d3w = pop({ W: 3, T: 3, count: 5 });
  const r2 = cc(krijger({ sr: ['Multiple Wounds (2)'] }), d3w);
  close(r2.groepen[0].wounds, 10 * 0.5 * 2);
  checkVerdeling(r2, 'MW2');
  // vs W1 the excess is wasted
  close(cc(krijger({ sr: ['Multiple Wounds (2)'] }), pop()).wounds, 5, 1e-9);
  const rd3 = cc(krijger({ sr: ['Multiple Wounds (D3)'] }), pop({ W: 2, count: 10 }));
  close(rd3.groepen[0].wounds, 10 * 0.5 * (1 / 3 * 1 + 2 / 3 * 2));
  checkVerdeling(rd3, 'MWD3');
  // the distribution never exceeds the unit's Wounds
  const klein = cc(krijger({ sr: ['Multiple Wounds (2)'] }), pop({ W: 3, count: 1 }));
  assert.ok(klein.verdeling.length <= 4);
  checkVerdeling(klein);
});

test('Ward save then Regeneration stack (armour → ward → regeneration)', () => {
  const a = krijger({ S: 4 });
  const d = pop({ T: 4, sr: ['Ward save (5+)', 'Regeneration (4+)'] });
  const r = cc(a, d);
  close(r.wounds, 10 * 0.5 * (4 / 6) * 0.5);
  const labels = r.groepen[0].stappen.map((s) => s.label);
  assert.deepEqual(labels, ['To Hit', 'To Wound', 'Armour save', 'Ward save', 'Regeneration']);
  checkVerdeling(r);
  // best ward only (more-than-one-save)
  close(cc(a, pop({ T: 4, sr: ['Ward save (6+)', 'Ward save (4+)'] })).wounds, 10 * 0.5 * 0.5);
  // Regeneration with Multiple Wounds: one save per Wound lost
  const mw = cc(krijger({ S: 4, sr: ['Multiple Wounds (2)'] }), pop({ T: 4, W: 3, count: 4, sr: ['Regeneration (4+)'] }));
  close(mw.groepen[0].wounds, 10 * 0.5 * 2 * 0.5);
  checkVerdeling(mw);
});

test('Flaming Attacks vs Flammable; Magical vs Warp-spawned; Ethereal', () => {
  const d = pop({ T: 3, sr: ['Regeneration (4+)', 'Flammable'] });
  close(cc(krijger(), d).wounds, 10 * 0.5 * 0.5);
  close(cc(krijger({ sr: ['Flaming Attacks'] }), d).wounds, 10 * 0.5);
  const ws = pop({ T: 3, sr: ['Regeneration (4+)', 'Warp-spawned'] });
  close(cc(krijger({ sr: ['Magical Attacks'] }), ws).wounds, 10 * 0.5);
  const eth = pop({ sr: ['Ethereal'] });
  assert.match(cc(krijger(), eth).onmogelijk, /Ethereal/);
  close(cc(krijger({ sr: ['Magical Attacks'] }), eth).wounds, 5);
});

test('Extra Attacks, Furious Charge, Frenzy (not the mount), Random Attacks', () => {
  close(cc(krijger({ sr: ['Extra Attacks (+1)'] }), pop({ count: 40 })).wounds, 10);
  const fc = krijger({ sr: ['Furious Charge'] });
  close(cc(fc, pop()).wounds, 5);
  close(cc(fc, pop({ count: 40 }), { situaties: { charged: true } }).wounds, 10);
  assert.ok(mh.situatiesVoor(fc, pop(), { soort: 'combat' }, rules).some((s) => s.key === 'charged'));
  const ruiter = unit({ name: 'Riders', count: 5, tt: 'Heavy Cavalry', options: ['Hand weapons'], sr: ['Frenzy'],
    profiles: [prof('Rider', { WS: 4, S: 3, T: 3, W: 1, A: 1, Ld: 8 }), prof('Horse', { WS: 3, S: 3, A: 1 })] });
  const r = cc(ruiter, pop(), { situaties: { charged: true } });
  assert.equal(r.groepen.find((g) => g.naam === 'Rider').aanvallen, '10');
  assert.equal(r.groepen.find((g) => g.naam === 'Horse').aanvallen, '5');
  const rnd = unit({ name: 'Spawn', count: null, tt: 'Monstrous Creature', profiles: [prof('Spawn', { WS: 3, S: 4, T: 5, W: 4, A: 'D6', Ld: 10 })], sr: ['Random Attacks'] });
  const rr = cc(rnd, pop(), { modellen: 1 });
  close(rr.groepen[0].stappen[0].aantal, 3.5);
  checkVerdeling(rr);
});

test('Hatred re-rolls failed To Hit in the first round vs the hated enemy; Eternal Hatred every round', () => {
  const a = krijger({ sr: ['Hatred (High Elves)'] });
  const d = pop({ WS: 4 });
  close(cc(a, d).groepen[0].stappen[0].kans, 0.5);
  close(cc(a, d, { situaties: { firstRound: true } }).groepen[0].stappen[0].kans, 0.5);
  close(cc(a, d, { situaties: { firstRound: true, hatedTarget: true } }).groepen[0].stappen[0].kans, 0.75);
  const allen = krijger({ sr: ['Hatred (all enemies)'] });
  assert.ok(!mh.situatiesVoor(allen, d, { soort: 'combat' }, rules).some((s) => s.key === 'hatedTarget'));
  close(cc(allen, d, { situaties: { firstRound: true } }).groepen[0].stappen[0].kans, 0.75);
  const eh = krijger({ sr: ['Hatred (High Elves)', 'Eternal Hatred'] });
  close(cc(eh, d, { situaties: { hatedTarget: true } }).groepen[0].stappen[0].kans, 0.75);
});

test('Murderous (hand weapon only) and Murderous (Renegade) (first round)', () => {
  const d = pop();
  close(cc(krijger({ sr: ['Murderous'] }), d).wounds, 10 * (0.5 + 0.5 / 6));
  close(cc(krijger({ sr: ['Murderous'], options: ['Hand weapons', 'Great weapon'] }), d, { wapenSlug: 'great-weapon-profile' }).wounds, 10 * 5 / 6);
  const ren = krijger({ sr: ['Murderous {renegade}'] });
  close(cc(ren, d).wounds, 5);
  close(cc(ren, d, { situaties: { firstRound: true } }).wounds, 10 * (0.5 + 0.5 / 6));
});

test('Impact Hits (charged only, chariot Strength, Scythed Wheels) and Stomp Attacks (Thunderstomp)', () => {
  const ch = unit({ name: 'Chariot', count: null, tt: 'Heavy Chariot', options: ['Hand weapons', '4+'], sr: ['Impact Hits (D6+1)'],
    profiles: [prof('Chariot', { S: 5, T: 5, W: 4 }), prof('Crew (x2)', { WS: 4, BS: 4, S: 3, I: 4, A: 1, Ld: 8 }), prof('Horse (x2)', { WS: 3, S: 3, A: 1 })] });
  const d = pop({ options: ['Heavy armour'], T: 3 });
  const geen = cc(ch, d, { modellen: 1 });
  assert.ok(!geen.groepen.some((g) => g.naam === 'Impact Hits'));
  const r = cc(ch, d, { modellen: 1, situaties: { charged: true } });
  const ih = r.groepen.find((g) => g.naam === 'Impact Hits');
  close(ih.stappen[0].aantal, 4.5);
  assert.equal(ih.stappen[1].toelichting.startsWith('S5 vs T3'), true);
  assert.equal(ih.stappen[2].worp, '—'); // 5+ worsened by AP -2
  close(ih.wounds, 4.5 * 5 / 6);
  assert.equal(r.groepen.find((g) => /Crew/.test(g.naam)).aanvallen, '2');
  checkVerdeling(r);
  const draak = unit({ name: 'Dragon', count: null, tt: 'Behemoth', sr: ['Stomp Attacks (D6)'], options: ['3+'], profiles: [prof('Dragon', { WS: 6, S: 6, T: 6, W: 6, A: 5, Ld: 8 })] });
  const st = cc(draak, d, { modellen: 1 });
  const g = st.groepen[st.groepen.length - 1];
  assert.equal(g.naam, 'Stomp Attacks');
  assert.equal(g.stappen[2].worp, '—'); // 5+ with Thunderstomp AP -2 → 7+
  const vsMonster = cc(draak, pop({ tt: 'Monstrous Creature', options: ['Heavy armour'] }), { modellen: 1 });
  assert.equal(vsMonster.groepen[vsMonster.groepen.length - 1].stappen[2].worp, '5+');
});

test('Quick Shot, Ponderous, Move or Shoot, Ignores Cover / Large Target, skirmish penalty', () => {
  const d = pop({ WS: 3 });
  const qs = unit({ name: 'Q', count: 10, options: ['Shortbows'], profiles: [prof('Q', { WS: 3, BS: 4, S: 3, T: 3, W: 1, A: 1, Ld: 7 })] });
  // Shortbow has Quick Shot? check via the weapon rules
  const sb = rules['shortbow-profile'] || rules['short-bow-profile'];
  if (sb && /Quick Shot/.test(sb.bodyIndex)) assert.ok(!mh.situatiesVoor(qs, d, { soort: 'schieten' }, rules).some((s) => s.key === 'moved'));
  const mos = unit({ name: 'Bolt', count: null, tt: 'War Machine', options: ['Repeater bolt thrower'], profiles: [prof('Bolt thrower', { T: 6, W: 3 }), prof('Crew (x2)', { WS: 4, BS: 4, S: 3, T: 3, W: 1, A: 1, Ld: 8 })] });
  const rm = sh(mos, d, { modellen: 1, situaties: { moved: true } });
  assert.match(rm.onmogelijk, /Move or Shoot/);
  const large = pop({ WS: 3, sr: ['Large Target'] });
  assert.ok(!mh.situatiesVoor(qs, large, { soort: 'schieten' }, rules).some((s) => s.key === 'soft' || s.key === 'full'));
  assert.ok(mh.situatiesVoor(qs, pop({ WS: 3, sr: ['Skirmishers'] }), { soort: 'schieten' }, rules).some((s) => s.key === 'skirmish'));
});

test('Fear toggle: −1 To Hit if the Fear test failed; units that cause Fear are immune', () => {
  const d = pop({ WS: 4, sr: ['Fear'] });
  close(cc(krijger(), d, { situaties: { fearFailed: true } }).groepen[0].stappen[0].kans, 2 / 6);
  assert.ok(!mh.situatiesVoor(krijger({ sr: ['Fear'] }), d, { soort: 'combat' }, rules).some((s) => s.key === 'fearFailed'));
});

test('BS 6+: first roll 2+ with modifiers, a miss is rolled again at the chart value', () => {
  const a = unit({ name: 'Hero', count: null, options: ['Longbow'], profiles: [prof('Hero', { WS: 7, BS: 7, S: 4, T: 4, W: 3, A: 3, Ld: 9 })] });
  const r = sh(a, pop({ WS: 3 }), { modellen: 1 });
  close(r.groepen[0].stappen[0].kans, 5 / 6 + (1 / 6) * (2 / 6)); // 2+/5+
});

test('7+ To Hit: natural 6 then 4+ / 5+ / 6; 10+ impossible', () => {
  const a = unit({ name: 'Gob', count: 10, options: ['Shortbows'], profiles: [prof('Gob', { WS: 2, BS: 2, S: 3, T: 3, W: 1, A: 1, Ld: 5 })] });
  const d = pop({ WS: 3 });
  close(sh(a, d, { situaties: { long: true, stand: true } }).groepen[0].stappen[0].kans, (1 / 6) * (3 / 6)); // 7+ → 6 then 4+
  const imp = sh(a, d, { situaties: { long: true, full: true, stand: true }, toHitMod: 1 });
  assert.match(imp.onmogelijk, /impossible/i);
});

test('cannot wound: S vs T too great', () => {
  const a = krijger({ S: 1 });
  const r = cc(a, pop({ T: 7 }));
  assert.match(r.onmogelijk, /cannot wound/i);
  assert.equal(r.wounds, 0);
});

test('template weapon → onmogelijk', () => {
  const mortar = unit({ name: 'Mortar', count: null, tt: 'War Machine', options: ['Mortar'], profiles: [prof('Mortar', { T: 7, W: 3 }), prof('Gun Crew', { WS: 3, BS: 3, S: 3, T: 3, W: 3, A: 3, Ld: 7 })] });
  assert.match(sh(mortar, pop({ WS: 3 }), { modellen: 1 }).onmogelijk, /template/i);
  const geen = sh(krijger(), pop());
  assert.match(geen.onmogelijk, /no ranged weapon/i);
});

// ─────────────────────────── real units ───────────────────────────
test('REAL: 5 Dark Riders with repeater crossbows shoot Dark Elf Warriors (LA + shield = 5+ vs shooting)', () => {
  const dr = echt('dark-elves', 'Dark Elves', 'Dark Riders', ['equipment/1']);
  const war = echt('dark-elves', 'Dark Elves', 'Dark Elf Warriors', [], 20);
  assert.deepEqual(mh.wapensVoor(dr, 'schieten', rules).map((w) => w.slug), ['repeater-crossbow-profile']);
  const r = sh(dr, war, { modellen: 5 });
  const st = r.groepen[0].stappen;
  assert.equal(r.groepen[0].aanvallen, '10');
  assert.equal(st[0].worp, '4+'); // BS4 3+, Multiple Shots −1
  assert.equal(st[2].worp, '5+'); // Parry only counts in close combat
  close(r.wounds, 5 * (2 / 6 * 4 / 6 + 1 / 6 * 5 / 6)); // Armour Bane (1)
  checkVerdeling(r);
  // single shot mode: 5 shots at 3+
  close(sh(dr, war, { modellen: 5, multi: false }).groepen[0].stappen[0].kans, 4 / 6);
  assert.deepEqual(r.nietMeegerekend, []);
});

test('REAL: Cold One Knights (with Dread Knight) charging Dark Elf Warriors', () => {
  const cok = echt('dark-elves', 'Dark Elves', 'Cold One Knights', ['command/0']);
  const war = echt('dark-elves', 'Dark Elves', 'Dark Elf Warriors', [], 20);
  const r = cc(cok, war, { modellen: 5, situaties: { charged: true } });
  const namen = r.groepen.map((g) => `${g.naam}:${g.aanvallen}`);
  assert.deepEqual(namen, ['Cold One Knight · Lance:4', 'Dread Knight · Lance:2', 'Cold One:10']);
  const knight = r.groepen[0].stappen;
  assert.equal(knight[1].toelichting.startsWith('S6 vs T3'), true); // lance +2 on the charge
  assert.equal(knight[2].worp, '6+'); // 4+ (LA, shield, Parry) worsened by AP −2
  // Armour Bane (1 - Cold One only) lands on the Cold One row only; the knight's AB is the lance's own
  assert.match(r.groepen[2].stappen[2].toelichting, /Armour Bane \(1\)/);
  // not charging: the lance cannot be used → hand weapon
  const nc = cc(cok, war, { modellen: 5 });
  assert.equal(nc.groepen[0].naam, 'Cold One Knight');
  assert.match(nc.groepen[0].stappen[2].toelichting, /only usable when charging/);
  checkVerdeling(r);
});

test('REAL: a unit with a champion — 20 Dark Elf Warriors with Lordling (Martial Prowess, Hatred)', () => {
  const war = echt('dark-elves', 'Dark Elves', 'Dark Elf Warriors', ['command/0'], 20);
  const doel = echt('empire-of-man', 'Empire of Man', 'State Missile Troops', [], 10);
  const r = cc(war, doel, { modellen: 6 });
  assert.deepEqual(r.groepen.map((g) => `${g.naam}:${g.aanvallen}`), ['Dark Elf Warrior:5', 'Lordling:2']);
  const sit = mh.situatiesVoor(war, doel, { soort: 'combat' }, rules).map((s) => s.key);
  assert.ok(sit.includes('firstRound') && sit.includes('hatedTarget'));
  const r1 = cc(war, doel, { modellen: 6, situaties: { firstRound: true } });
  assert.ok(r1.meegerekend.some((m) => m.regel === 'Martial Prowess'));
  checkVerdeling(r1);
});

test('REAL: an unreviewed army-specific rule lands in nietMeegerekend', () => {
  const knights = echt('kingdom-of-bretonnia', 'Kingdom of Bretonnia', 'Mounted Knights of the Realm', [], 5);
  const war = echt('dark-elves', 'Dark Elves', 'Dark Elf Warriors', [], 20);
  const r = cc(war, knights, { modellen: 5 });
  assert.ok(r.nietMeegerekend.some((x) => x.van === 'doelwit' && /Blessings of the Lady/.test(x.regel)), JSON.stringify(r.nietMeegerekend));
  assert.ok(r.wounds > 0);
});

test('REAL: Cold One Chariot charging — Impact Hits D6+1 at S5 with AP −2', () => {
  const ch = echt('dark-elves', 'Dark Elves', 'Cold One Chariot');
  const war = echt('dark-elves', 'Dark Elves', 'Dark Elf Warriors', [], 20);
  const r = cc(ch, war, { modellen: 1, situaties: { charged: true } });
  assert.equal(r.groepen[0].naam, 'Impact Hits');
  close(r.groepen[0].stappen[0].aantal, 4.5);
  assert.ok(r.groepen.some((g) => /Knight Charioteer/.test(g.naam) && g.aanvallen === '2'));
  assert.ok(r.groepen.some((g) => /^Cold One/.test(g.naam) && g.aanvallen === '4')); // 2 beasts × A2
  checkVerdeling(r);
});

// ─────────────────────────── adversarial ───────────────────────────
test('adversarial: no profiles, single model, "*" Strength, "-" stats, mount-only, no armour, T>10, 0 models', () => {
  const d = pop({ WS: 3 });
  assert.match(cc(unit({ name: 'Leeg', profiles: [] }), d).onmogelijk, /no profile/i);
  // count null single model
  const held = unit({ name: 'Hero', count: null, options: ['Hand weapon'], profiles: [prof('Hero', { WS: 6, S: 4, T: 4, W: 3, A: 3, Ld: 9 })] });
  const rh = cc(held, d, { modellen: 1 });
  assert.equal(rh.groepen[0].aanvallen, '3');
  checkVerdeling(rh);
  // "*" Strength ranged weapon (variable) → onmogelijk, not a number
  const hydra = unit({ name: 'H', count: null, options: [], profiles: [prof('H', { WS: 4, BS: 3, S: 5, T: 5, W: 5, A: 4, Ld: 6 })], mw: [{ name: 'Odd bow', kind: 'ranged', specialRules: [] }] });
  const rs = sh(hydra, d, { modellen: 1 });
  assert.match(rs.onmogelijk, /variable Strength/);
  // a melee row with S "*" does not attack rather than inventing a number
  const ster = unit({ name: 'Ster', count: null, profiles: [prof('Ster', { WS: 3, S: '*', T: 3, W: 1, A: 2, Ld: 7 })] });
  assert.match(cc(ster, d, { modellen: 1 }).onmogelijk, /no model/i);
  // stat "-" everywhere (a chariot body only) → no attacks
  const romp = unit({ name: 'Romp', count: null, profiles: [prof('Romp', { S: 5, T: 5, W: 4 })] });
  assert.match(cc(romp, d, { modellen: 1 }).onmogelijk, /no model/i);
  // mount-only attacker (no Ld on any row)
  const beest = unit({ name: 'Hounds', count: 5, tt: 'War Beast', profiles: [prof('Hound', { WS: 4, S: 3, T: 3, W: 1, A: 1 })] });
  const rb = cc(beest, d, { modellen: 5 });
  assert.equal(rb.groepen[0].aanvallen, '5');
  // a chariot unit WITH a count (count 1): the crew row is rank-and-file, not a champion
  const wagen = unit({ name: 'Wagon', count: 1, tt: 'Light Chariot', options: ['Hand weapons'], profiles: [prof('Wagon', { S: 4, T: 4, W: 3 }), prof('Crew (x6)', { WS: 2, BS: 2, S: 2, I: 3, A: 1, Ld: 4 })] });
  assert.equal(cc(wagen, d, { modellen: 1 }).groepen[0].aanvallen, '6');
  // defender without armour
  const naakt = cc(krijger(), pop());
  assert.equal(naakt.groepen[0].stappen[2].worp, '—');
  close(naakt.wounds, 5);
  // T above 10 → chart clamps at 10 (noted)
  const tank = cc(krijger({ S: 10 }), pop({ T: 12 }));
  assert.match(tank.groepen[0].stappen[1].toelichting, /chart stops at 10/);
  // 0 models
  const nul = cc(krijger(), pop(), { modellen: 0 });
  assert.equal(nul.wounds, 0);
  assert.deepEqual(nul.verdeling, [1]);
  const nulD = cc(krijger(), pop(), { doelwitModellen: 0 });
  assert.equal(nulD.wounds, 0);
  // defender without Toughness
  assert.match(cc(krijger(), unit({ name: 'X', profiles: [prof('X', { WS: 3 })] })).onmogelijk, /Toughness/);
});

test('unknown target Wounds: no capping, no models-killed', () => {
  const r = cc(krijger({ sr: ['Multiple Wounds (2)'] }), pop({ W: '-' }));
  close(r.wounds, 10, 1e-9);
  assert.equal(r.modellenGedood, null);
  checkVerdeling(r);
});

test('REAL: Dreadlord on a Cold One Chariot — the mount\'s rules stay on the mount; ridden-monster defender', () => {
  const dl = echt('dark-elves', 'Dark Elves', 'Dark Elf Dreadlord', ['mounts/4']);
  const war = echt('dark-elves', 'Dark Elves', 'Dark Elf Warriors', [], 20);
  const r = cc(dl, war, { modellen: 1, situaties: { charged: true } });
  assert.equal(r.groepen[0].naam, 'Impact Hits');
  const lord = r.groepen.find((g) => /Dreadlord/.test(g.naam));
  assert.doesNotMatch(lord.stappen[2].toelichting, /Armour Bane/);
  assert.match(r.groepen.find((g) => g.naam === 'Cold One').stappen[2].toelichting, /Armour Bane/);
  assert.ok(r.nietMeegerekend.some((x) => /^Armour Bane/.test(x.regel) && /mount/.test(x.reden)));
  checkVerdeling(r);
  // as a target: Toughness of the chariot (higher), Wounds of character + chariot
  const terug = cc(war, dl, { modellen: 5 });
  assert.match(terug.groepen[0].stappen[1].toelichting, /T5/);
  // Monster Slayer vs a Dreadlord on a Black Dragon (the whole model is a behemoth)
  const draak = echt('dark-elves', 'Dark Elves', 'Dark Elf Dreadlord', ['mounts/5']);
  const ms = cc(krijger({ sr: ['Monster Slayer'], S: 6 }), draak, { modellen: 10 });
  assert.match(ms.groepen[0].stappen[2].toelichting, /Monster Slaying Blow/);
  checkVerdeling(ms);
});

// ─────────────────────────── ranks & files (breedte) ───────────────────────────
// Target: WS 0 (automatic hits), T3, no armour, 60 models → every attack is worth exactly 0.5 wound, no capping.
const ruim = () => pop({ count: 60 });
const aanvallenVan = (r) => r.groepen.reduce((s, g) => s + g.stappen[0].aantal, 0);
const groepen = (r) => r.groepen.map((g) => `${g.naam}:${g.aanvallen}`);

test('breedteVoor: default = the troop type\'s Models per Rank; not for single models or war machines', () => {
  assert.deepEqual(mh.breedteVoor(krijger({ count: 20 }), 20), { vanToepassing: true, standaard: 5, max: 20 });
  assert.equal(mh.breedteVoor(krijger({ count: 20, tt: 'Heavy Infantry' }), 20).standaard, 4);
  assert.equal(mh.breedteVoor(krijger({ count: 6, tt: 'Monstrous Infantry' }), 6).standaard, 3);
  assert.equal(mh.breedteVoor(krijger({ count: 3 }), 3).standaard, 3);
  assert.equal(mh.breedteVoor(krijger({ count: 4, tt: 'Swarm' }), 4).standaard, 4);
  assert.equal(mh.breedteVoor(unit({ name: 'Hero', count: null, profiles: [prof('Hero', { WS: 5, S: 4, T: 4, W: 2, A: 3, Ld: 8 })] }), 1).vanToepassing, false);
  assert.equal(mh.breedteVoor(unit({ name: 'Bolt', count: 1, tt: 'War Machine', profiles: [prof('B', { T: 6, W: 3 })] }), 1).vanToepassing, false);
  assert.equal(mh.breedteVoor(krijger({ count: 1 }), 1).vanToepassing, false);
});

test('Files: 20 infantry A2, 5 wide — Press of Battle (not on the charge)', () => {
  const a = krijger({ count: 20, A: 2 }); // Regular Infantry → Press of Battle
  const r = cc(a, ruim(), { modellen: 20, breedte: 5 });
  assert.deepEqual(groepen(r), ['Krijger:10', 'Krijger · rank 2 (Press of Battle):5']);
  close(r.wounds, 15 * 0.5, 1e-9);
  assert.ok(r.meegerekend.some((m) => m.regel === 'Press of Battle' && /\+5 models/.test(m.effect)));
  checkVerdeling(r);
  const ch = cc(a, ruim(), { modellen: 20, breedte: 5, situaties: { charged: true } });
  close(aanvallenVan(ch), 10);
  // without Press of Battle (Monstrous Infantry)
  const mi = krijger({ count: 20, A: 2, tt: 'Monstrous Infantry' });
  close(aanvallenVan(cc(mi, ruim(), { modellen: 20, breedte: 5 })), 10);
  // Monstrous Ranks (Renegade): Ogre Monstrous Infantry gain Press of Battle (not Yhetees)
  const ogre = { ...krijger({ count: 9, A: 3, tt: 'Monstrous Infantry', sr: ['Monstrous Ranks {renegade}'] }), name: 'Ogre Bulls' };
  close(aanvallenVan(cc(ogre, ruim(), { modellen: 9, breedte: 3 })), 3 * 3 + 3);
  close(aanvallenVan(cc({ ...ogre, name: 'Yhetees' }, ruim(), { modellen: 9, breedte: 3 })), 9);
  // deeper than wide = Marching Column, not Combat Order → no Press of Battle
  close(aanvallenVan(cc(a, ruim(), { modellen: 20, breedte: 2 })), 4);
  // square (4×4) is Combat Order
  close(aanvallenVan(cc(krijger({ count: 16, A: 2 }), ruim(), { modellen: 16, breedte: 4 })), 12);
  // old behaviour unchanged without breedte
  close(aanvallenVan(cc(a, ruim(), { modellen: 20 })), 40);
});

test('Files: Fight in Extra Rank — rank behind the (two-deep) fighting rank; spears not on the charge', () => {
  const sp = krijger({ count: 20, A: 2, options: ['Hand weapons', 'Thrusting spears'] });
  const r = cc(sp, ruim(), { modellen: 20, breedte: 5 });
  assert.deepEqual(groepen(r), ['Krijger · Thrusting Spear:10', 'Krijger · Thrusting Spear · rank 2 (Press of Battle):5', 'Krijger · Thrusting Spear · rank 3 (supporting):5']);
  close(r.wounds, 20 * 0.5, 1e-9);
  assert.ok(!r.nietMeegerekend.some((x) => /Fight in Extra Rank/i.test(x.regel)));
  checkVerdeling(r);
  close(aanvallenVan(cc(sp, ruim(), { modellen: 20, breedte: 5, situaties: { charged: true } })), 10);
  // a model rule (no spear restriction): on the charge no Press of Battle, so rank 2 supports
  const fier = krijger({ count: 20, A: 2, sr: ['Fight in Extra Rank'] });
  const rc = cc(fier, ruim(), { modellen: 20, breedte: 5, situaties: { charged: true } });
  assert.deepEqual(groepen(rc), ['Krijger:10', 'Krijger · rank 2 (supporting):5']);
  // without breedte the old "not counted" entry stays
  assert.ok(cc(fier, ruim(), { modellen: 20 }).nietMeegerekend.some((x) => /Fight in Extra Rank/i.test(x.regel)));
});

test('Files: the champion is one of the front-rank models', () => {
  const a = krijger({ count: 20, A: 1, profiles: [prof('Krijger', { WS: 4, BS: 4, S: 3, T: 3, W: 1, A: 1, Ld: 8 }), prof('Kapitein', { WS: 4, BS: 4, S: 3, T: 3, W: 1, A: 3, Ld: 8 })] });
  const r = cc(a, ruim(), { modellen: 20, breedte: 5 });
  assert.deepEqual(groepen(r), ['Krijger:4', 'Krijger · rank 2 (Press of Battle):5', 'Kapitein:3']);
  close(aanvallenVan(r), 12);
  checkVerdeling(r);
});

test('Files: cavalry 5 wide — mounts only in base contact, riders support (Cavalry Support)', () => {
  const cav = unit({ name: 'Ruiters', count: 10, tt: 'Heavy Cavalry', options: ['Hand weapons', 'Cavalry spears'],
    profiles: [prof('Ruiter', { WS: 4, S: 3, T: 3, W: 1, A: 1, Ld: 8 }), prof('Paard', { WS: 3, S: 3, A: 1 })] });
  const r = cc(cav, ruim(), { modellen: 10, breedte: 5 });
  assert.deepEqual(groepen(r), ['Ruiter · Cavalry Spear:5', 'Ruiter · Cavalry Spear · rank 2 (supporting):5', 'Paard:5']);
  assert.ok(r.meegerekend.some((m) => m.regel === 'Cavalry Support'));
  checkVerdeling(r);
  const ch = cc(cav, ruim(), { modellen: 10, breedte: 5, situaties: { charged: true } });
  assert.deepEqual(groepen(ch), ['Ruiter · Cavalry Spear:5', 'Paard:5']);
});

test('Files: impact hits only from the front rank', () => {
  const ch = unit({ name: 'Chariots', count: 6, tt: 'Light Chariot', options: ['Hand weapons'], sr: ['Impact Hits (1)'],
    profiles: [prof('Chariot', { S: 4, T: 4, W: 3 }), prof('Crew (x2)', { WS: 3, BS: 3, S: 3, A: 1, Ld: 7 })] });
  const r = cc(ch, ruim(), { modellen: 6, breedte: 3, situaties: { charged: true } });
  assert.deepEqual(groepen(r), ['Impact Hits:3', 'Crew:6']);
});

test('Files: 20 archers 10 wide — Volley Fire, moved, Stand & Shoot, hill, rounding up', () => {
  const arch = (n) => unit({ name: 'Archers', count: n, options: ['Hand weapons', 'Warbows'], profiles: [prof('Archer', { WS: 3, BS: 4, S: 3, T: 3, W: 1, A: 1, Ld: 7 })] });
  const d = pop({ count: 60, WS: 3 });
  const per = (4 / 6) * 0.5;
  const r = sh(arch(20), d, { modellen: 20, breedte: 10 });
  assert.equal(r.groepen[0].aanvallen, '10 + 5');
  close(r.wounds, 15 * per, 1e-9);
  assert.ok(r.meegerekend.some((m) => m.regel === 'Volley Fire' && /\+5/.test(m.effect)));
  assert.ok(!r.nietMeegerekend.some((x) => x.regel === 'Volley Fire'));
  checkVerdeling(r);
  close(sh(arch(20), d, { modellen: 20, breedte: 10, situaties: { moved: true } }).wounds, 10 * (3 / 6) * 0.5, 1e-9); // moved: no volley AND −1
  close(sh(arch(20), d, { modellen: 20, breedte: 10, situaties: { stand: true } }).groepen[0].stappen[0].aantal, 10 * 3 / 6);
  close(sh(arch(20), d, { modellen: 20, breedte: 10, situaties: { hill: true } }).groepen[0].stappen[0].aantal, 20 * 4 / 6);
  close(sh(arch(30), d, { modellen: 30, breedte: 10, situaties: { hill: true } }).groepen[0].stappen[0].aantal, 25 * 4 / 6);
  close(sh(arch(13), d, { modellen: 13, breedte: 5 }).groepen[0].stappen[0].aantal, (5 + 3 + 2) * 4 / 6); // 5,5,3 → 5 + ⌈5/2⌉ + ⌈3/2⌉
  // without Volley Fire (handgun): front rank only
  const hg = unit({ name: 'Gunners', count: 20, options: ['Handguns'], profiles: [prof('Gunner', { WS: 3, BS: 3, S: 3, T: 3, W: 1, A: 1, Ld: 7 })] });
  close(sh(hg, d, { modellen: 20, breedte: 10 }).groepen[0].stappen[0].aantal, 10 * 0.5);
  // Large Target: one extra full rank; Volley Fire combination not stated → rear ranks not counted, reported
  const lt = sh(arch(30), pop({ count: 60, WS: 3, sr: ['Large Target'] }), { modellen: 30, breedte: 10 });
  close(lt.groepen[0].stappen[0].aantal, 20 * 4 / 6);
  assert.ok(lt.nietMeegerekend.some((x) => x.regel === 'Volley Fire' && /Large Target/.test(x.reden)));
  // Quick Shot + Volley Fire (shortbow): 'moved' is offered with Files (it stops the volley), costs no To Hit
  const sb = unit({ name: 'Sb', count: 20, options: ['Shortbows'], profiles: [prof('Sb', { WS: 3, BS: 4, S: 3, T: 3, W: 1, A: 1, Ld: 7 })] });
  assert.ok(mh.situatiesVoor(sb, d, { soort: 'schieten', breedte: 10 }, rules).some((s) => s.key === 'moved'));
  const sbm = sh(sb, d, { modellen: 20, breedte: 10, situaties: { moved: true } });
  close(sbm.groepen[0].stappen[0].aantal, 10 * 4 / 6);
});

test('Files: Skirmish formation has no ranks — all shoot, reported', () => {
  const sk = unit({ name: 'Scouts', count: 10, options: ['Shortbows'], sr: ['Skirmishers'], profiles: [prof('Scout', { WS: 3, BS: 4, S: 3, T: 3, W: 1, A: 1, Ld: 7 })] });
  const r = sh(sk, pop({ count: 60, WS: 3 }), { modellen: 10, breedte: 5 });
  close(r.groepen[0].stappen[0].aantal, 10 * 4 / 6);
  assert.ok(r.nietMeegerekend.some((x) => x.regel === 'Skirmish formation'));
  // with Open Order as well, the table decides
  const both = { ...sk, specialRules: ['Skirmishers', 'Open Order'] };
  assert.ok(mh.situatiesVoor(both, pop(), { soort: 'schieten', breedte: 5 }, rules).some((s) => s.key === 'skirmishFormation'));
  close(sh(both, pop({ count: 60, WS: 3 }), { modellen: 10, breedte: 5 }).groepen[0].stappen[0].aantal, (5 + 3) * 4 / 6); // ranked: front 5 + Volley Fire ⌈5/2⌉
  close(sh(both, pop({ count: 60, WS: 3 }), { modellen: 10, breedte: 5, situaties: { skirmishFormation: true } }).groepen[0].stappen[0].aantal, 10 * 4 / 6);
});

test('REAL: 20 Dark Elf Warriors with spears, 5 wide (Press of Battle + Fight in Extra Rank)', () => {
  const war = echt('dark-elves', 'Dark Elves', 'Dark Elf Warriors', ['equipment/1'], 20);
  const sp = mh.wapensVoor(war, 'combat', rules).find((w) => w.standaard);
  const r = cc(war, ruim(), { modellen: 20, breedte: 5, wapenSlug: sp.slug });
  if (/spear/i.test(sp.naam)) close(aanvallenVan(r), 5 + 5 + 5);
  else close(aanvallenVan(r), 5 + 5);
  checkVerdeling(r);
  assert.equal(mh.breedteVoor(war, 20).standaard, 5);
});

// ─────────────────────────── combat exchange (berekenGevecht) ───────────────────────────
// Two War Beast blocks (no Press of Battle), WS4 vs WS4 (4+), S3 vs T1 (2+), no armour → every attack slays a W1
// model with probability 1/2 · 5/6 = 5/12. 10 models, 5 wide: 5 attack.
const blok = (naam, I, o = {}) => unit({ name: naam, count: 10, tt: o.tt ?? 'War Beast', options: o.options ?? ['Hand weapons'], sr: o.sr,
  profiles: o.profiles ?? [prof(naam, { M: 5, WS: 4, S: 3, T: 1, W: 1, I, A: 1, Ld: 7 })] });
const gv = (a, b, extra = {}) => mh.berekenGevecht(a, b, { ik: { modellen: 10, breedte: 5, ...(extra.ik || {}) }, vijand: { modellen: 10, breedte: 5, ...(extra.vijand || {}) }, situaties: extra.situaties }, rules);
const beide = (r) => { checkVerdeling(r.uit, 'uit'); checkVerdeling(r.terug, 'terug'); };
const P = 5 / 12;

test('exchange: equal Initiative is simultaneous — nobody loses attacks', () => {
  const r = gv(blok('A', 4), blok('B', 4));
  close(r.uit.wounds, 5 * P, 1e-9);
  close(r.terug.wounds, 5 * P, 1e-9);
  assert.ok(r.volgorde.every((v) => v.initiatief === 'I4'));
  assert.match(r.volgorde[0].toelichting, /simultaneous/);
  beide(r);
});

test('exchange: higher Initiative kills first and reduces the return attacks', () => {
  const r = gv(blok('A', 5), blok('B', 3));
  close(r.uit.wounds, 5 * P, 1e-9);
  // B strikes with 5 − k models, k ~ Bin(5, 5/6): E = (5 − 5·5/6)·5/6
  close(r.terug.wounds, (5 - 5 * P) * P, 1e-9);
  assert.deepEqual(r.volgorde.map((v) => `${v.zijde}@${v.initiatief}`), ['ik@I5', 'vijand@I3']);
  assert.ok(r.terug.meegerekend.some((m) => m.regel === 'Casualties before striking'));
  assert.match(r.terug.groepen[0].aanvallen, /of 5/);
  beide(r);
  // without Files: all 10 strike; k ~ Bin(10, 5/6) slain first
  const z = mh.berekenGevecht(blok('A', 5), blok('B', 3), { ik: { modellen: 10 }, vijand: { modellen: 10 } }, rules);
  close(z.terug.wounds, (10 - 10 * P) * P, 1e-9);
  beide(z);
});

test('exchange: the charger gets +3 Initiative and the order flips', () => {
  const r = gv(blok('A', 5), blok('B', 3), { situaties: { enemyCharged: true } });
  assert.deepEqual(r.volgorde.map((v) => `${v.zijde}@${v.initiatief}`), ['vijand@I6', 'ik@I5']);
  close(r.terug.wounds, 5 * P, 1e-9);
  close(r.uit.wounds, (5 - 5 * P) * P, 1e-9);
  // I charged: 5 + 3 = 8
  assert.equal(gv(blok('A', 5), blok('B', 3), { situaties: { charged: true } }).volgorde[0].initiatief, 'I8');
  // both charged (Counter Charge): both +3 → order as without a charge
  assert.deepEqual(gv(blok('A', 5), blok('B', 3), { situaties: { charged: true, enemyCharged: true } }).volgorde.map((v) => v.initiatief), ['I8', 'I6']);
  const sit = mh.situatiesVoorGevecht(blok('A', 5), blok('B', 3), { ik: { modellen: 10 }, vijand: { modellen: 10 } }, rules).map((s) => s.key);
  assert.ok(sit.includes('charged') && sit.includes('enemyCharged'));
  beide(r);
});

test('exchange: a Strike Last weapon (great weapon) strikes at Initiative 1', () => {
  const a = blok('A', 5, { options: ['Hand weapons', 'Great weapon'] });
  const r = gv(a, blok('B', 3), { ik: { wapenSlug: 'great-weapon-profile' } });
  assert.deepEqual(r.volgorde.map((v) => `${v.zijde}@${v.initiatief}`), ['vijand@I3', 'ik@I1']);
  close(r.uit.wounds, (5 - 5 * P) * P, 1e-9); // the great weapon also wounds T1 on 2+
  assert.ok(r.uit.meegerekend.some((m) => m.regel === 'Strike Last'));
  // Strike Last + charge: 1 + 3 = 4 → before B (I3)
  assert.equal(gv(a, blok('B', 3), { ik: { wapenSlug: 'great-weapon-profile' }, situaties: { charged: true } }).volgorde[0].initiatief, 'I4');
  beide(r);
});

test('exchange: Impact Hits come before every Initiative step', () => {
  const ch = unit({ name: 'Chariot', count: null, tt: 'Light Chariot', options: ['Hand weapons'], sr: ['Impact Hits (2)'],
    profiles: [prof('Chariot', { WS: '-', S: 3, T: 1, W: 1 }), prof('Crew', { WS: 4, S: 3, I: 1, A: 1, Ld: 7 })] });
  const r = mh.berekenGevecht(ch, blok('B', 10), { ik: { modellen: 1 }, vijand: { modellen: 10, breedte: 5 }, situaties: { charged: true } }, rules);
  assert.deepEqual(r.volgorde.map((v) => `${v.zijde}:${v.naam}@${v.initiatief}`), ['ik:Impact Hits@Impact', 'vijand:B@I10', 'ik:Crew@I4']);
  // 2 automatic impact hits (S3 vs T1: 5/6 each) slay front models of B before B strikes at I10; B's survivors then
  // need only one success (1/2 · 5/6) to slay the one-Wound chariot: P(chariot slain) = E[1 − (7/12)^(5 − k)].
  let pDood = 0;
  for (let k = 0; k <= 2; k++) pDood += [1 / 36, 10 / 36, 25 / 36][k] * (1 - Math.pow(7 / 12, 5 - k));
  close(r.terug.wounds, pDood, 1e-9);
  beide(r);
});

test('exchange: cavalry — rider and mount strike at their own Initiative; slain riders take their mounts', () => {
  const cav = unit({ name: 'Knights', count: 10, tt: 'Heavy Cavalry', options: ['Hand weapons'],
    profiles: [prof('Knight', { WS: 4, S: 3, T: 1, W: 1, I: 5, A: 1, Ld: 8 }), prof('Steed', { WS: 3, S: 3, I: 2, A: 1 })] });
  const r = gv(cav, blok('B', 3));
  assert.deepEqual(r.volgorde.map((v) => `${v.naam}@${v.initiatief}`), ['Knight@I5', 'B@I3', 'Steed@I2']);
  // B (5 − k1 models) strikes back; the steeds of slain knights are lost: steeds = 5 − k2 where k2 ~ B's kills
  const steed = r.uit.groepen.find((g) => g.naam === 'Steed');
  const eB = (5 - 5 * P) * P; // expected knights slain by B
  close(steed.stappen[0].aantal / steed.stappen[0].kans, 5 - eB, 1e-9); // attacks = hits / P(hit)
  beide(r);
});

test('exchange: a single monster against a ranked unit', () => {
  const mon = unit({ name: 'Troll', count: null, tt: 'Monstrous Creature', options: ['Hand weapons'],
    profiles: [prof('Troll', { WS: 3, S: 5, T: 4, W: 6, I: 1, A: 4, Ld: 6 })] });
  const r = mh.berekenGevecht(mon, krijger({ count: 20 }), { ik: { modellen: 1 }, vijand: { modellen: 20, breedte: 5 } }, rules);
  assert.deepEqual(r.volgorde.map((v) => v.zijde), ['vijand', 'vijand', 'ik']);
  assert.ok(r.uit.wounds > 0 && r.terug.wounds > 0);
  beide(r);
  const terug = mh.berekenGevecht(krijger({ count: 20 }), mon, { ik: { modellen: 20, breedte: 5 }, vijand: { modellen: 1 } }, rules);
  close(terug.uit.wounds, r.terug.wounds, 1e-9);
  close(terug.terug.wounds, r.uit.wounds, 1e-9);
  beide(terug);
});

test('exchange REAL: Cold One Knights charging Dark Elf Warriors, and the Warriors charging', () => {
  const cok = echt('dark-elves', 'Dark Elves', 'Cold One Knights', ['command/0']);
  const war = echt('dark-elves', 'Dark Elves', 'Dark Elf Warriors', ['command/0'], 20);
  const r = mh.berekenGevecht(cok, war, { ik: { modellen: 5, breedte: 5 }, vijand: { modellen: 20, breedte: 5 }, situaties: { charged: true } }, rules);
  assert.equal(r.volgorde[0].initiatief, 'I8'); // I5 + 3
  assert.ok(r.volgorde.findIndex((v) => v.zijde === 'vijand') > r.volgorde.findIndex((v) => v.naam === 'Cold One'));
  // the knights strike before the warriors: same as the one-way attack
  close(r.uit.wounds, cc(cok, war, { modellen: 5, breedte: 5, doelwitModellen: 20, situaties: { charged: true } }).wounds, 1e-9);
  beide(r);
  const t = mh.berekenGevecht(war, cok, { ik: { modellen: 20, breedte: 5 }, vijand: { modellen: 5, breedte: 5 }, situaties: { charged: true } }, rules);
  assert.equal(t.volgorde[0].zijde, 'ik'); // warriors charge: I4 + 3 = 7 > 5
  beide(t);
  // no Press of Battle on the turn the warriors charged
  assert.ok(!t.uit.groepen.some((g) => /Press of Battle/.test(g.naam)));
});

test('exchange: sweep over builder units — no crashes, proper distributions, timing', () => {
  const cat = read('public/owb/dark-elves.json');
  const alle = [];
  for (const c of ['characters', 'core', 'special', 'rare']) for (const u of cat[c] || []) alle.push(echt('dark-elves', 'Dark Elves', u.name_en, [], u.minimum ? Math.max(u.minimum, 10) : undefined));
  const emp = read('public/owb/empire-of-man.json');
  for (const c of ['core', 'special']) for (const u of (emp[c] || []).slice(0, 8)) alle.push(echt('empire-of-man', 'Empire of Man', u.name_en, [], u.minimum ? Math.max(u.minimum, 10) : undefined));
  let n = 0;
  const t0 = Date.now();
  for (const a of alle) for (const b of alle) {
    const ma = mh.breedteVoor(a, a.count ?? 1);
    const mb = mh.breedteVoor(b, b.count ?? 1);
    const r = mh.berekenGevecht(a, b, { ik: { modellen: a.count ?? 1, breedte: ma.vanToepassing ? ma.standaard : undefined }, vijand: { modellen: b.count ?? 1, breedte: mb.vanToepassing ? mb.standaard : undefined }, situaties: { charged: n % 2 === 0 } }, rules);
    for (const x of [r.uit, r.terug]) {
      assert.ok(Number.isFinite(x.wounds), `${a.name} vs ${b.name}`);
      checkVerdeling(x, `${a.name} vs ${b.name}`);
    }
    n++;
  }
  const ms = (Date.now() - t0) / n;
  assert.ok(ms < 5, `${ms.toFixed(2)} ms per pair`);
});

test('performance: 60-attack unit vs W3 target with Multiple Wounds stays fast and exact', () => {
  const horde = krijger({ count: 30, A: 2, sr: ['Multiple Wounds (D3)'] });
  const d = pop({ W: 3, count: 20, T: 3, sr: ['Regeneration (5+)'] });
  const t0 = Date.now();
  let r;
  for (let i = 0; i < 20; i++) r = cc(horde, d);
  assert.ok(Date.now() - t0 < 2000, `took ${Date.now() - t0}ms`);
  assert.ok(r.verdeling);
  checkVerdeling(r, 'horde');
  assert.ok(r.modellenGedood > 0 && r.modellenGedood <= 20);
});

// ─────────────────────────── which model carries which weapon (unit-details.json) ───────────────────────────
// 22-11-2026, Joost: "Nu lijkt het alsof de Beast handlers ook met de claws vechten". The wiki's equipment
// line per model (public/unit-details.json) decides which profile row fights with which weapon.
const ud = require(path.join(root, 'src/lib/unitDetails.ts'));
const ws = require(path.join(root, 'src/lib/weaponStats.ts'));
const details = read('public/unit-details.json').units;
const numCel = (v) => /\d/.test(String(v ?? ''));
const indexRijen = (k) => statsIdx[k].stats.map((s) => ({ label: s.Name, wielder: numCel(s.Ld) && numCel(s.S) }));
const unitRijen = (u) => u.profiles.map((p) => ({ label: p.label, wielder: numCel(p.stats.find((s) => s.k === 'Ld')?.v) && numCel(p.stats.find((s) => s.k === 'S')?.v) }));

test('unit-details: rows match their wiki line (plural, "(x2)", champion, mount, spelling slips, unit prefix)', () => {
  const regel = (k) => ud.rijUitrusting(indexRijen(k), details[k].equipment).map((e) => e && e.model);
  assert.deepEqual(regel('war hydra'), ['War Hydra', 'Beastmaster Handlers']);
  assert.deepEqual(regel('cold one knights'), ['Cold One Knights', 'Cold One Knights', 'Cold Ones']); // Dread Knight shares
  assert.deepEqual(regel('dark riders'), ['Dark Riders', 'Dark Riders', 'Dark Steeds']);
  assert.deepEqual(regel('cold one chariot'), [null, 'Knight Charioteers', 'Cold Ones']); // the chariot body has no line
  assert.deepEqual(regel('empire knights'), ['Knights', 'Knights', 'Barded Warhorse']);
  assert.deepEqual(regel("chieftain's chariot"), [null, 'Charioteers', 'Characian Lions']); // the wiki writes "Characian"
  assert.deepEqual(regel('goblin wolf rider mob'), ['Wolf Riders', 'Wolf Riders', 'Giant Wolves']);
  // two kinds of rank and file: whose champion the Master of Horse is, is not said → unknown
  assert.deepEqual(regel('skeleton cavalry cohort'), ['Royal Host Horseman', 'Royal Host Horse Archer', null, 'Skeletal Steed']);
  // no data → every row unknown
  assert.deepEqual(ud.rijUitrusting([{ label: 'X', wielder: true }], null), [null]);
  // every unit in the file has a "Model:" line, and almost every line finds its row
  let los = 0;
  for (const [k, v] of Object.entries(details)) {
    assert.ok(v.equipment.some((e) => e.model), k);
    const m = ud.rijUitrusting(indexRijen(k), v.equipment);
    los += v.equipment.filter((e) => !m.includes(e)).length;
  }
  assert.ok(los <= 2, `${los} lines without a row`); // "Skeleton Crew" vs "Skeletal Crew", "Skeleton Horsemen" vs "Skeleton Horse Archer"
});

test('unit-details: lookup by statline key; a pasted list without statNaam finds it by name; unknown unit → null', () => {
  assert.equal(ud.equipmentVoor({ name: 'War Hydra' }, details)[1].model, 'Beastmaster Handlers');
  assert.ok(ud.equipmentVoor({ name: 'My hydra', datasheet: 'War Hydra' }, details));
  assert.ok(ud.equipmentVoor({ name: 'x', statNaam: 'War Hydra {renegade}' }, details));
  assert.equal(ud.equipmentVoor({ name: 'Dark Elf Warriors' }, details), null);
  assert.equal(ud.equipmentVoor({ name: 'War Hydra' }, null), null);
});

test('REAL: War Hydra: the Hydra fights with its claws, the handlers with their own weapon, never swapped', () => {
  const hy = echt('dark-elves', 'Dark Elves', 'War Hydra');
  const war = echt('dark-elves', 'Dark Elves', 'Dark Elf Warriors', [], 20);
  const uitrusting = ud.equipmentVoor(hy, details);
  // the chips offer the Hydra's weapons only (no hand weapon, no whip)
  assert.deepEqual(mh.wapensVoor(hy, 'combat', rules, uitrusting).map((w) => w.slug), ['wicked-claws-profile']);
  assert.ok(mh.wapensVoor(hy, 'combat', rules).some((w) => w.slug === 'whip-profile')); // without data: as before
  const r = cc(hy, war, { modellen: 1, uitrusting });
  assert.deepEqual(r.groepen.map((g) => g.naam), ['War Hydra · Wicked Claws', 'Beastmaster Handlers · Whip', 'Stomp Attacks']);
  const hydra = r.groepen[0].stappen;
  const handlers = r.groepen[1].stappen;
  assert.equal(hydra[2].worp, '6+'); // 4+ (LA, shield, Parry) worsened by the claws' AP −2
  assert.ok(handlers[1].toelichting.startsWith('S3 vs T3'), handlers[1].toelichting); // whip: the handler's own S, no AP
  assert.equal(handlers[2].worp, '4+');
  // the stopgap entry is gone; the whip's own rule is reported
  assert.ok(!r.nietMeegerekend.some((x) => /Counted with hand weapons/.test(x.reden)), JSON.stringify(r.nietMeegerekend));
  assert.ok(r.nietMeegerekend.some((x) => x.van === 'wapen' && /Fight In Extra Rank/i.test(x.regel)));
  // choosing the other row's weapon never moves it: whip asked → the Hydra still uses its claws
  const w = cc(hy, war, { modellen: 1, uitrusting, wapenSlug: 'whip-profile' });
  assert.deepEqual(w.groepen.map((g) => g.naam), r.groepen.map((g) => g.naam));
  close(w.wounds, r.wounds);
  checkVerdeling(r);
  // no data: the old fallback (handlers with hand weapons, and it says so)
  const oud = cc(hy, war, { modellen: 1 });
  assert.equal(oud.groepen[1].naam, 'Beastmaster Handlers');
  assert.ok(oud.nietMeegerekend.some((x) => /Counted with hand weapons/.test(x.reden)));
});

test('REAL: Cold One Knights: knights (and the Dread Knight) carry the lance, the Cold Ones a hand weapon', () => {
  const cok = echt('dark-elves', 'Dark Elves', 'Cold One Knights', ['command/0']);
  const war = echt('dark-elves', 'Dark Elves', 'Dark Elf Warriors', [], 20);
  const uitrusting = ud.equipmentVoor(cok, details);
  assert.deepEqual(mh.wapensVoor(cok, 'combat', rules, uitrusting).map((w) => `${w.slug}${w.standaard ? '*' : ''}`), ['hand-weapon-profile', 'lance-profile*']);
  const r = cc(cok, war, { modellen: 5, situaties: { charged: true }, uitrusting });
  assert.deepEqual(r.groepen.map((g) => `${g.naam}:${g.aanvallen}`), ['Cold One Knight · Lance:4', 'Dread Knight · Lance:2', 'Cold One:10']);
  // the data agrees with what the engine already did
  close(r.wounds, cc(cok, war, { modellen: 5, situaties: { charged: true } }).wounds);
  const per = ud.wapensPerRij(unitRijen(cok), uitrusting, ws.unitWeapons(cok, rules));
  assert.deepEqual(per[2].melee, []);
  assert.equal(per[2].hand, true); // "Claws and teeth (counts as a hand weapons)"
  // hand weapon chosen → knights with hand weapons, the Cold Ones unchanged
  const hw = cc(cok, war, { modellen: 5, situaties: { charged: true }, uitrusting, wapenSlug: 'hand-weapon-profile' });
  assert.deepEqual(hw.groepen.map((g) => g.naam), ['Cold One Knight', 'Dread Knight', 'Cold One']);
});

test('REAL: Dark Riders with bought repeater crossbows: an upgrade not in the wiki line goes to the main model (and its champion)', () => {
  const dr = echt('dark-elves', 'Dark Elves', 'Dark Riders', ['equipment/1', 'command/0'], 5);
  const war = echt('dark-elves', 'Dark Elves', 'Dark Elf Warriors', [], 20);
  const uitrusting = ud.equipmentVoor(dr, details);
  const per = ud.wapensPerRij(unitRijen(dr), uitrusting, ws.unitWeapons(dr, rules));
  assert.deepEqual(per.map((x) => x && x.ranged.map((w) => w.slug)), [['repeater-crossbow-profile'], ['repeater-crossbow-profile'], []]);
  assert.deepEqual(per.map((x) => x && x.melee.map((w) => w.slug)), [['hand-weapon-profile', 'cavalry-spear-profile'], ['hand-weapon-profile', 'cavalry-spear-profile'], []]);
  assert.equal(per[2].hand, true); // "Hooves (counts as a hand weapons)"
  assert.deepEqual(mh.wapensVoor(dr, 'schieten', rules, uitrusting).map((w) => w.slug), ['repeater-crossbow-profile']);
  const s = sh(dr, war, { modellen: 5, uitrusting });
  close(s.wounds, sh(dr, war, { modellen: 5 }).wounds);
  assert.equal(s.groepen[0].stappen[0].worp, '4+');
  const c = cc(dr, war, { modellen: 5, situaties: { charged: true }, uitrusting });
  assert.deepEqual(c.groepen.map((g) => g.naam), ['Dark Rider · Cavalry Spear', 'Herald · Cavalry Spear', 'Dark Steed']);
});

test('a unit absent from unit-details.json behaves exactly as before', () => {
  const war = echt('dark-elves', 'Dark Elves', 'Dark Elf Warriors', ['command/0'], 20);
  const doel = echt('empire-of-man', 'Empire of Man', 'State Missile Troops', [], 10);
  const uitrusting = ud.equipmentVoor(war, details);
  assert.equal(uitrusting, null);
  assert.deepEqual(cc(war, doel, { modellen: 6, uitrusting }), cc(war, doel, { modellen: 6 }));
  assert.deepEqual(mh.wapensVoor(war, 'combat', rules, uitrusting), mh.wapensVoor(war, 'combat', rules));
  // a pasted unit whose rows the data does not match: old behaviour per row
  const vreemd = unit({ name: 'War Hydra', count: null, options: ['Wicked claws', 'Hand weapons'], sr: ['Monster Handlers'], tt: 'Behemoth',
    profiles: [prof('Hydra Beast', { WS: 4, S: 5, T: 5, W: 5, A: 2, Ld: 6 })] });
  const u2 = ud.equipmentVoor(vreemd, details);
  assert.ok(u2);
  assert.deepEqual(cc(vreemd, pop({ WS: 3 }), { modellen: 1, uitrusting: u2 }), cc(vreemd, pop({ WS: 3 }), { modellen: 1 }));
});
