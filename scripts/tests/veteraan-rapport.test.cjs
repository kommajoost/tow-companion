// C9 (04-10-2026): een regiment dat in de kill-log van de tegenstander staat is vernietigd, ook als
// de eigen tracker geen verliezen kent. Dan: geen overlevings-XP, wel een scar-worp. Het gewone geval
// (eigen tracker, 60% over) blijft ongewijzigd.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, f);
const { collectVeteraan } = require(path.join(root, 'src/lib/veteraanRapport.ts'));

const regiment = (id, count) => ({
  id, name: 'Dark Elf Warriors', count, points: 100, category: 'Core Units',
  troopType: 'Regular Infantry', profiles: [{ name: 'Warrior', stats: [{ k: 'W', v: '1' }] }],
});
const vijandUnit = { id: 'v1', name: 'Kroxigors', count: 3, points: 150, category: 'Special Units', troopType: 'Monstrous Infantry', profiles: [] };
const leger = (units) => ({ name: 'Leger', units });

test('regiment in de killDetails van de tegenstander: geen overlevings-XP, wel scar', () => {
  const tracker = {
    units: {
      'host:u1': { lost: 0, fleeing: false },
      'guest:v1': { lost: 0, fleeing: false, kills: 1, killDetails: [{ unit: 'u1', turn: 4 }] },
    },
  };
  const [r] = collectVeteraan(tracker, leger([regiment('u1', 20)]), 'host', false, leger([vijandUnit]));
  assert.equal(r.vet.dood, true);
  assert.equal(r.vet.overleefd_50, false);
  assert.equal(r.vet.scar_trigger, true);
  assert.ok(!r.redenen.includes('+1 survived above half strength'));
  assert.ok(r.redenen.includes('destroyed, no survival XP'));
});

test('gewoon geval: eigen tracker, 60% over -> +1 overleefd, geen scar', () => {
  const tracker = { units: { 'host:u1': { lost: 8, fleeing: false }, 'guest:v1': { lost: 0, fleeing: false } } };
  const [r] = collectVeteraan(tracker, leger([regiment('u1', 20)]), 'host', false, leger([vijandUnit]));
  assert.equal(r.vet.dood, false);
  assert.equal(r.vet.overleefd_50, true);
  assert.equal(r.vet.scar_trigger, false);
  assert.deepEqual(r.redenen, ['+1 survived above half strength']);
});

test('eigen tracker onder 25%: geen overlevings-XP, scar (ongewijzigd gedrag)', () => {
  const tracker = { units: { 'host:u1': { lost: 16, fleeing: false } } };
  const [r] = collectVeteraan(tracker, leger([regiment('u1', 20)]), 'host', false, leger([]));
  assert.equal(r.vet.dood, false);
  assert.equal(r.vet.overleefd_50, false);
  assert.equal(r.vet.scar_trigger, true);
});
