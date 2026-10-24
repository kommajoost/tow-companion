// Het Scenario lab (23-10-2026, alleen test-build). Zie src/lib/scenarioLab.ts, src/lib/labSleutels.ts,
// src/lib/scenarioTest.ts en site/scripts/maak-scenario-lab.ts. Vastgezet:
//   1. De sleutel-omleiding: battle-sleutels krijgen een `tow:lab:`-kopie, gebruikersdata niet.
//   2. De sheet-set in public/scenario-lab is compleet: elke setup × elk hex-terrein in elke Act waar hij
//      hoort, met de juiste cap, en de zes setups van Act 3+ dragen hun scenario-VP. Setup 5 heet Plunder.
//   3. Een keuze over de grens (Battle March in Act 3, een setup in Act 2) wordt geldig gemaakt.
//   4. De payload en de nep-battle: Act, cap, Battle March, de kanten en de mock-legers kloppen.
//   5. De twee mock-legers bestaan echt in de catalogus en zitten rond de 1000 punten, zonder meldingen.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
const compile = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText, f);
require.extensions['.ts'] = compile;
require.extensions['.tsx'] = compile;

const sleutels = require(path.join(root, 'src/lib/labSleutels.ts'));
const lab = require(path.join(root, 'src/lib/scenarioLab.ts'));
const st = require(path.join(root, 'src/lib/scenarioTest.ts'));
const ob = require(path.join(root, 'src/lib/owbBuilder.ts'));
const ov = require(path.join(root, 'src/lib/overlays.ts'));
const LAB = path.join(root, 'public/scenario-lab');
const json = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const INDEX = lab.leesLabIndex(json(path.join(LAB, 'index.json')));

test('sleutels: battle-staat in een eigen lab-kopie, gebruikersdata gedeeld', () => {
  for (const k of ['tow:game', 'tow:solo-mine', 'tow:solo-opp', 'tow:solo-tracker', 'tow:campaign-battle', 'tow:battle', 'tow:scenario-test', 'tow:tab', 'tow:screen']) {
    assert.equal(sleutels.labSleutel(k), `tow:lab:${k.slice(4)}`, k);
  }
  assert.equal(sleutels.labSleutel('tow:wrath:SCENTEST'), 'tow:lab:wrath:SCENTEST');
  for (const k of ['tow:lists', 'tow:syncKey', 'tow:campaignCtx', 'tow:favorites', 'tow:theme']) assert.equal(sleutels.labSleutel(k), k, k);
  assert.equal(sleutels.labSleutel('tow:lab:keuze'), 'tow:lab:keuze', 'een lab-sleutel blijft zichzelf');
  assert.equal(sleutels.labSleutel(sleutels.labSleutel('tow:game')), 'tow:lab:game', 'idempotent');
});

test('sheet-set: compleet, juiste cap, scenario-VP vanaf Act 3, setup 5 heet Plunder', () => {
  assert.ok(INDEX, 'index leest');
  assert.deepEqual(INDEX.acts.map((a) => a.act), [1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(INDEX.terreinen.map((t) => t.id), ['vlakte', 'woud', 'heuvels', 'bergen', 'moeras']);
  assert.equal(INDEX.setups.length, 7);
  for (const a of INDEX.acts) {
    assert.equal(a.cap, 500 + 250 * (a.act - 1), `cap Act ${a.act}`);
    const sheets = json(path.join(LAB, a.bestand));
    const setups = INDEX.setups.filter((s) => s.acts.includes(a.act));
    assert.equal(Object.keys(sheets).length, setups.length * INDEX.terreinen.length, `aantal Act ${a.act}`);
    for (const s of setups) for (const t of INDEX.terreinen) {
      const sh = sheets[lab.labSheetSleutel(s.id, t.id)];
      assert.ok(sh, `${s.id}|${t.id} in Act ${a.act}`);
      assert.equal(sh.fase, a.act);
      assert.equal(sh.terrein, t.id);
      assert.ok(sh.layout && Array.isArray(sh.layout.zones), 'layout meegebakken');
      if (a.act >= 3) {
        assert.equal(sh.scenario, s.id);
        assert.ok(sh.scenarioBonus && sh.scenarioBonus.posten.length > 0, `scenarioBonus ${s.id} Act ${a.act}`);
      } else {
        // Battle March: Pitched Battle, op bergen dwingt de generator Mountain Pass af.
        assert.equal(sh.scenario, t.id === 'bergen' ? 'bm-mountain-pass' : 'bm-pitched');
        assert.equal(sh.scenarioBonus, undefined);
      }
    }
  }
  const plunder = json(path.join(LAB, 'act-3.json'))['ad-loot-cart|vlakte'];
  assert.equal(plunder.scenarioNaam, 'Plunder');
  assert.equal(INDEX.setups.find((s) => s.id === 'ad-loot-cart').naam, 'Plunder');
  assert.ok(!JSON.stringify(json(path.join(LAB, 'act-6.json'))).includes('Loot and Raid'), 'nergens meer de oude naam');
});

test('keuze geldig maken: de laatst gekozen as wint', () => {
  const g = (k, as, vorige) => lab.maakKeuzeGeldig(INDEX, k, as, vorige);
  assert.deepEqual(g({ setup: 'ad-strategic', act: 4, terrein: 'woud' }, 'setup'), { setup: 'ad-strategic', act: 4, terrein: 'woud' });
  // Battle March gekozen terwijl Act 4 stond: de Act schuift naar 2.
  assert.deepEqual(g({ setup: 'bm-pitched', act: 4, terrein: 'woud' }, 'setup'), { setup: 'bm-pitched', act: 2, terrein: 'woud' });
  // Act 3 gekozen terwijl Battle March stond: de vorige setup komt terug, anders de eerste van Act 3.
  assert.equal(g({ setup: 'bm-pitched', act: 3, terrein: 'vlakte' }, 'act', 'ad-special-feature').setup, 'ad-special-feature');
  assert.equal(g({ setup: 'bm-pitched', act: 3, terrein: 'vlakte' }, 'act', null).setup, 'ad-flank-attack');
  // Act 1 gekozen bij een setup van Act 3+: Battle March.
  assert.equal(g({ setup: 'ad-breakthrough', act: 1, terrein: 'vlakte' }, 'act').setup, 'bm-pitched');
  // Onbekend terrein of Act uit een oude opslag: terug naar het eerste.
  assert.equal(g({ setup: 'ad-breakthrough', act: 9, terrein: 'zee' }, 'terrein').terrein, 'vlakte');
});

test('payload en nep-battle: Act, cap, Battle March, kanten en mock-legers', () => {
  const act3 = INDEX.acts.find((a) => a.act === 3);
  const sh = json(path.join(LAB, act3.bestand))['ad-loot-cart|vlakte'];
  const p = lab.labPayload(sh, act3, { setup: 'ad-loot-cart', act: 3, terrein: 'vlakte', aanvaller: 'orcs', verdediger: 'empire' });
  assert.equal(p.fase, 3);
  assert.equal(p.cap, 1000);
  assert.deepEqual(p.legers, { aanvaller: 'orcs', verdediger: 'empire' });
  assert.equal(p.aanvaller.naam, 'Tuskgore Warband');
  const b = st.battleUitPayload(p);
  assert.equal(b.code, st.SCENARIO_TEST_CODE);
  assert.equal(b.fase, 3);
  assert.equal(b.cap, 1000);
  assert.equal(b.battleMarch, false);
  assert.equal(b.scenario.scenarioNaam, 'Plunder');
  assert.equal(b.aanvaller.factie, 'orc-and-goblin-tribes');
  const act2 = INDEX.acts.find((a) => a.act === 2);
  const bm = st.battleUitPayload(lab.labPayload(json(path.join(LAB, act2.bestand))['bm-pitched|heuvels'], act2, { setup: 'bm-pitched', act: 2, terrein: 'heuvels', aanvaller: 'empire', verdediger: 'orcs' }));
  assert.equal(bm.battleMarch, true);
  assert.equal(bm.cap, 750);
});

test('mock-legers: echte units, rond 1000 punten, geen meldingen', () => {
  const items = json(path.join(root, 'public/owb/magic-items.json'));
  assert.equal(lab.MOCK_LEGERS.length, 2);
  for (const m of lab.MOCK_LEGERS) {
    const cat = ov.catalogueFor(json(path.join(root, `public/owb/${m.lijst.army}.json`)), m.lijst.composition, null);
    for (const e of m.lijst.entries) assert.ok(ob.findUnit(cat, e.cat, e.unitId), `${m.id}: ${e.unitId}`);
    const v = ob.validate(m.lijst, (c, id) => ob.findUnit(cat, c, id), ov.itemsFor(items, m.lijst.composition, null));
    assert.ok(v.total >= 900 && v.total <= 1100, `${m.id}: ${v.total} pts`);
    assert.deepEqual([...v.warnings, ...v.entryWarnings], [], `${m.id}: geen meldingen`);
    assert.equal(new Set(m.lijst.entries.map((e) => e.uid)).size, m.lijst.entries.length, 'unieke uids');
  }
});
