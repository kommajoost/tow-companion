// Breakthrough uit de units (24-10-2026). Zie src/lib/scenarioUnits.ts en src/lib/victoryPoints.ts.
// Vastgezet:
//   1. De rekenregel: volle punten zonder verliezen; meer modellen → punten × modellen over ÷ start
//      (een gewond voorste model staat nog); één model → punten × wonden over ÷ wonden.
//   2. Wie niet meetelt: characters, monsters (Monstrous Creature, Behemoth), fleeing, destroyed (Removed,
//      alle wonden weg, of in de kill-log van de tegenstander).
//   3. De post `bt-zone` is de som van de aangetikte units en telt mee in berekenVictory; alleen de
//      aanvaller (host); de stand hoort bij de tracker (per battle).
//   4. Terugval: zonder leger, of met een oud getypt getal en nog geen unit aangetikt, telt het getypte getal.
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

const su = require(path.join(root, 'src/lib/scenarioUnits.ts'));
const sb = require(path.join(root, 'src/lib/scenarioBonus.ts'));
const vp = require(path.join(root, 'src/lib/victoryPoints.ts'));
const SHEETS = require(path.join(root, 'scripts/fixtures/campaign-sheets-act3.json'));

const BT = sb.parseScenarioBonus(Object.values(SHEETS).find((s) => s.scenario === 'ad-breakthrough').scenarioBonus);
const POST = BT.posten.find((p) => p.id === 'bt-zone');

const prof = (w) => [{ label: 'X', stats: [{ k: 'W', v: String(w) }] }];
const unit = (id, o) => ({ id, name: id, count: null, points: 100, category: 'Core Units', options: [], specialRules: [], profiles: prof(1), ...o });

const halberds = unit('hal', { count: 20, points: 150, troopType: 'Regular Infantry' });
const knights = unit('kn', { count: 5, points: 200, troopType: 'Heavy Cavalry' });
const ogres = unit('og', { count: 4, points: 160, troopType: 'Monstrous Infantry', profiles: prof(3) });
const tank = unit('tank', { count: null, points: 250, troopType: 'Heavy Chariot', profiles: prof(10) });
const general = unit('gen', { points: 180, category: 'Characters', troopType: 'Regular Infantry', profiles: prof(3) });
const dragon = unit('drg', { points: 300, category: 'Rare Units', troopType: 'Monstrous Creature', profiles: prof(6) });
const steam = unit('st', { points: 280, category: 'Rare Units', troopType: 'Behemoth', profiles: prof(10) });
const LEGER = { name: 'A', points: 2000, system: '', faction: 'Empire', composition: '', raw: '', units: [halberds, knights, ogres, tank, general, dragon, steam] };
const VIJAND = { name: 'B', points: 2000, system: '', faction: 'Orcs', composition: '', raw: '', units: [unit('orc', { count: 20, points: 120 })] };

test('rekenregel: volle punten, naar rato van modellen, één model naar rato van wonden', () => {
  assert.equal(su.waardeNu(halberds, undefined), 150, 'geen verliezen = alles');
  assert.equal(su.waardeNu(halberds, { lost: 0 }), 150);
  assert.equal(su.waardeNu(halberds, { lost: 8 }), 90, '12/20 × 150');
  assert.equal(su.waardeNu(knights, { lost: 2 }), 120, '3/5 × 200');
  assert.equal(su.waardeNu(knights, { lost: 1 }), 160, '4/5 × 200 (round)');
  // Ogres W3: 4 wonden kwijt = 1 model dood + 1 gewond (staat nog) → 3/4.
  assert.equal(su.waardeNu(ogres, { lost: 4 }), 120);
  assert.equal(su.waardeNu(ogres, { lost: 6 }), 80, '2/4');
  // Eén model met wonden: naar rato van de wonden.
  assert.equal(su.waardeNu(tank, { lost: 3 }), 175, '7/10 × 250');
  assert.equal(su.waardeNu(tank, { lost: 10 }), 0, 'alles weg');
  assert.equal(su.restTekst(halberds, { lost: 8 }), '12/20 models');
  assert.equal(su.restTekst(tank, { lost: 3 }), '7/10 wounds');
});

test('uitsluiting: characters, monsters, fleeing, destroyed', () => {
  assert.equal(su.uitsluiting(general, undefined), 'character');
  assert.equal(su.uitsluiting(dragon, undefined), 'monster', 'Monstrous Creature');
  assert.equal(su.uitsluiting(steam, undefined), 'monster', 'Behemoth');
  assert.equal(su.uitsluiting(ogres, undefined), null, 'Monstrous Infantry is geen monster');
  assert.equal(su.uitsluiting(tank, undefined), null, 'een chariot telt');
  assert.equal(su.uitsluiting(halberds, { lost: 0, fleeing: true }), 'fleeing');
  assert.equal(su.uitsluiting(halberds, { lost: 0, weg: true }), 'destroyed');
  assert.equal(su.uitsluiting(halberds, { lost: 20 }), 'destroyed');
  assert.equal(su.uitsluiting(halberds, { lost: 0 }, true), 'destroyed', 'kill-log van de tegenstander');
  assert.equal(su.knopLabel(POST), 'Breakthrough');
});

test('bt-zone = som van de aangetikte units en telt mee in de uitslag', () => {
  let host = {};
  host = su.tikUnit(host, 'bt-zone', 'hal', true);
  host = su.tikUnit(host, 'bt-zone', 'kn', true);
  host = su.tikUnit(host, 'bt-zone', 'gen', true);   // character: telt 0
  host = su.tikUnit(host, 'bt-zone', 'hal', true);   // dubbel aantikken = één keer
  assert.deepEqual(host.scenarioUnits['bt-zone'], ['hal', 'kn', 'gen']);
  const tracker = { round: 6, vp: {}, units: { 'host:hal': { lost: 8, fleeing: false } }, bonus: { host, guest: {} } };
  const d = su.puntDetail(POST, 'host', host, LEGER, tracker);
  assert.equal(d.bron, 'units');
  assert.equal(d.som, 90 + 200, '90 (12/20 halberds) + 200 (knights) + 0 (general)');
  assert.deepEqual(d.regels.map((r) => [r.id, r.nu, r.uitgesloten]), [['hal', 90, null], ['kn', 200, null], ['gen', 0, 'character']]);

  const res = vp.berekenVictory(LEGER, VIJAND, tracker, host, {}, false, BT);
  assert.equal(res.hostVp, 290, 'alleen de Breakthrough-som, geen kills');
  assert.equal(res.guestVp, 0, '12/20 halberds is boven 25%: geen kill-VP voor de verdediger');
});

test('vluchten of sneuvelen na het aantikken: blijft staan, telt 0', () => {
  const host = su.tikUnit(su.tikUnit({}, 'bt-zone', 'hal', true), 'bt-zone', 'tank', true);
  const t1 = { round: 6, vp: {}, units: { 'host:hal': { lost: 0, fleeing: true }, 'host:tank': { lost: 3, fleeing: false } } };
  assert.equal(su.puntDetail(POST, 'host', host, LEGER, t1).som, 175, 'fleeing halberds 0, tank 7/10');
  const t2 = { round: 6, vp: {}, units: { 'guest:orc': { lost: 0, fleeing: false, kills: 1, killDetails: [{ unit: 'tank', turn: 4 }] } } };
  assert.equal(su.puntDetail(POST, 'host', host, LEGER, t2).som, 150, 'tank in de kill-log van de vijand: 0');
});

test('alleen de aanvaller; zonder aantikken nul; terugval op het getypte getal', () => {
  const tracker = { round: 1, vp: {}, units: {} };
  // De verdediger kan bt-zone niet scoren, ook niet met aangetikte units.
  const guest = su.tikUnit({}, 'bt-zone', 'orc', true);
  assert.equal(vp.berekenVictory(LEGER, VIJAND, tracker, {}, guest, false, BT).guestVp, 0);
  // Leger aanwezig, niets aangetikt: 0.
  assert.equal(su.puntDetail(POST, 'host', {}, LEGER, tracker).som, 0);
  // Een oud getypt getal en nog niets aangetikt: dat telt (terugval).
  assert.deepEqual(su.puntDetail(POST, 'host', { scenario: { 'bt-zone': 455 } }, LEGER, tracker), { bron: 'hand', som: 455, regels: [] });
  // Eén unit aangetikt: de units nemen het over, het getypte getal telt niet meer.
  const beide = su.tikUnit({ scenario: { 'bt-zone': 455 } }, 'bt-zone', 'kn', true);
  assert.equal(su.puntDetail(POST, 'host', beide, LEGER, tracker).som, 200);
  // Alles weer uitgetikt: 0, niet terug naar 455.
  assert.equal(su.puntDetail(POST, 'host', su.tikUnit(beide, 'bt-zone', 'kn', false), LEGER, tracker).som, 0);
  // Geen leger (scenario-test zonder legers): het getypte getal, zoals voorheen.
  assert.equal(vp.berekenVictory(null, null, tracker, { scenario: { 'bt-zone': 455 } }, {}, false, BT).hostVp, 455);
});

test('andere setups: niets verandert', () => {
  const tracker = { round: 1, vp: {}, units: {} };
  const host = su.tikUnit({ scenario: { x: 1 } }, 'bt-zone', 'kn', true);
  // Zonder definitie, of met een definitie zonder puntwaarde-post, blijft de stand de ruwe stand.
  assert.equal(su.effectieveStand(null, 'host', host, LEGER, tracker), host.scenario);
  const ander = sb.parseScenarioBonus({ versie: 1, posten: [{ id: 'cc', label: 'Feature', kant: 'beide', soort: 'eind', vp: 100 }] });
  assert.equal(su.effectieveStand(ander, 'host', host, LEGER, tracker), host.scenario);
  assert.equal(vp.berekenVictory(LEGER, VIJAND, tracker, host, {}, false, null).hostVp, 0);
});
