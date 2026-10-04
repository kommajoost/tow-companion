// Elke unit in public/owb moet in het spel een statline en een troop type hebben (04-10-2026).
// Aanleiding: de Empire-Mortar toonde in een game geen profiel; "Mortar {empire}" viel op de kale
// sleutel "mortar" (de rulebook-pagina zonder statline). Zie src/lib/statSleutel.ts.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, f);
const ov = require(path.join(root, 'src/lib/overlays.ts'));
const tt = require(path.join(root, 'src/lib/troopTypes.ts'));
const read = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const stats = read('public/owb/rules-index.json');
const troopType = tt.makeTroopTypeLookup(stats);
const units = [];
for (const f of fs.readdirSync(path.join(root, 'public/owb'))) {
  let d; try { d = read(`public/owb/${f}`); } catch { continue; }
  if (!d || !d.core) continue;
  for (const lijst of Object.values(d)) for (const u of (Array.isArray(lijst) ? lijst : [])) units.push({ f, u });
}
const rijen = (naam) => ov.overlayStatsFor(stats, naam, null).map((r) => r.Name);

test('elke OWB-unit heeft een statline', () => {
  const leeg = units.filter(({ u }) => !rijen(u.name_en).length).map(({ f, u }) => `${f}: ${u.name_en}`);
  assert.deepEqual(leeg, []);
});

test('gedeelde datasheets met een tag pakken hun eigen profiel, niet de rulebook-pagina', () => {
  assert.deepEqual(rijen('Mortar {empire}'), ['Mortar', 'Gun Crew']);
  assert.deepEqual(rijen('Great Cannon {empire}'), ['Great Cannon', 'Gun Crew']);
  assert.equal(troopType('Mortar {empire}'), 'War Machine');
});

test('aliassen wijzen naar de juiste datasheet', () => {
  assert.deepEqual(rijen('Steam Tank'), ['Steam Tank', 'Engineer Commander (x1)']);
  assert.equal(rijen('Empire Knights of Morr')[0], 'Empire Knight');
  assert.equal(rijen('Inner Circle Knights Panther')[0], 'Inner Circle Knight');
  assert.equal(rijen('Demigryph Knights of the Blazing Sun')[0], 'Demigryph Knight');
  assert.deepEqual(rijen('Chaos Furies of Khorne'), ['Chaos Fury']);
  assert.equal(rijen('Orion')[0], 'Orion, the King in the Woods');
  assert.equal(rijen('Gors')[0] && /gor/i.test(rijen('Gors')[0]), true);
  assert.equal(troopType('Empire Knights of Morr'), 'Heavy Cavalry');
});

test('mortar-profiel: beide waarden, notities en geen To Hit', () => {
  const ws = require(path.join(root, 'src/lib/weaponStats.ts'));
  const rules = read('public/rules.json').rules;
  const m = ws.unitWeapons({ options: ['Mortar'] }, rules).ranged[0];
  assert.equal(m.range, '12-48"');
  assert.equal(m.sLabel, '2 (6)');
  assert.equal(m.apLabel, '-2 (-3)');
  assert.equal(m.noToHit, true);
  assert.match(m.notes, /5" blast template/);
  assert.match(m.notes, /Black Powder Misfire/);
  const hg = ws.unitWeapons({ options: ['Handgun'] }, rules).ranged[0];
  assert.equal(hg.noToHit, undefined);
  assert.equal(hg.sLabel, undefined);
});
