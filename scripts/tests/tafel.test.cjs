// Act 4-tafel (blok E, 24-11-2026): de tempometer (src/lib/tempo.ts) en het schrijven in stukjes
// (src/lib/trackerPatch.ts). Vastgezet:
//   1. Turn done van team 1, dan team 2: de ronde gaat vanzelf omhoog; een dubbele tik telt één beurt.
//   2. Na ronde 6, of na de laatste-rondetijd (22:15), begint er geen nieuwe ronde.
//   3. Pauze telt niet als speeltijd; Undo draait de laatste stap terug (ook de plein-teller, via pleinDelta).
//   4. Achterstand: groen tot 3 min, oranje 3-10, rood daarboven; verwachte eindtijd en haalbare rondes.
//   5. trackerDiff schrijft alleen wat veranderde; pasPatchesToe doet hetzelfde als de server.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
const compile = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText, f);
require.extensions['.ts'] = compile;

const tempo = require(path.join(root, 'src/lib/tempo.ts'));
const tp = require(path.join(root, 'src/lib/trackerPatch.ts'));

const MIN = 60000;
// Een avond: 19:30 lokale tijd vandaag.
const d = new Date(); d.setHours(19, 30, 0, 0);
const T0 = d.getTime();

test('ronde gaat vanzelf omhoog als beide teams Turn done tikten; dubbele tik telt niet', () => {
  let t = tempo.pasToe(tempo.leegTempo(), { soort: 'start', eersteTeam: 'B' }, T0);
  assert.equal(t.huidig.ronde, 1);
  assert.equal(t.huidig.team, 'B');
  t = tempo.pasToe(t, { soort: 'beurtKlaar', verwacht: { ronde: 1, team: 'B' }, plein: 'B', raiders: [] }, T0 + 18 * MIN);
  assert.equal(t.huidig.ronde, 1);
  assert.equal(t.huidig.team, 'A');
  // Een tweede tik op dezelfde (al afgesloten) beurt doet niets.
  assert.equal(tempo.pasToe(t, { soort: 'beurtKlaar', verwacht: { ronde: 1, team: 'B' }, plein: 'B', raiders: [] }, T0 + 19 * MIN), null);
  t = tempo.pasToe(t, { soort: 'beurtKlaar', verwacht: { ronde: 1, team: 'A' }, plein: 'A', raiders: ['c9'] }, T0 + 40 * MIN);
  assert.equal(t.huidig.ronde, 2);
  assert.equal(t.huidig.team, 'B', 'het team dat begon begint ook ronde 2');
  assert.equal(t.beurten.length, 2);
  assert.equal(t.rev, 3);
  assert.equal(tempo.raiderBeurten(t, 'c9'), 1);
});

test('na ronde 6 en na 22:15 begint er geen nieuwe ronde', () => {
  let t = tempo.pasToe(tempo.leegTempo(), { soort: 'start', eersteTeam: 'A' }, T0);
  let nu = T0;
  for (let r = 1; r <= 6; r++) {
    for (const team of ['A', 'B']) {
      nu += 5 * MIN;
      t = tempo.pasToe(t, { soort: 'beurtKlaar', verwacht: { ronde: r, team }, plein: null, raiders: [] }, nu);
    }
  }
  assert.equal(t.huidig, null);
  assert.equal(t.einde.reden, 'zes-rondes');
  assert.equal(tempo.gespeeldeRondes(t), 6);

  // Laat: start om 21:40, ronde 1 klaar om 22:20. Joost 24-11: de timer eindigt de slag niet zelf; na 22:15
  // alleen de melding, ronde 2 begint gewoon, en de tafel drukt zelf op Battle ended (reden eindtijd).
  let l = tempo.pasToe(tempo.leegTempo(), { soort: 'start', eersteTeam: 'A' }, T0 + 130 * MIN);
  l = tempo.pasToe(l, { soort: 'beurtKlaar', verwacht: { ronde: 1, team: 'A' }, plein: null, raiders: [] }, T0 + 150 * MIN);
  assert.ok(tempo.tempoBeeld(l, T0 + 166 * MIN).laatsteRonde, 'na 22:15 de melding laatste ronde');
  l = tempo.pasToe(l, { soort: 'beurtKlaar', verwacht: { ronde: 1, team: 'B' }, plein: null, raiders: [] }, T0 + 170 * MIN);
  assert.equal(l.einde, null);
  assert.equal(l.huidig.ronde, 2);
  l = tempo.pasToe(l, { soort: 'einde', reden: 'eindtijd' }, T0 + 175 * MIN);
  assert.equal(l.einde.reden, 'eindtijd');
});

test('pauze telt niet als speeltijd; Undo draait terug, ook de plein-teller', () => {
  let t = tempo.pasToe(tempo.leegTempo(), { soort: 'start', eersteTeam: 'A' }, T0);
  t = tempo.pasToe(t, { soort: 'pauze' }, T0 + 5 * MIN);
  assert.equal(tempo.pasToe(t, { soort: 'pauze' }, T0 + 6 * MIN), null);
  t = tempo.pasToe(t, { soort: 'hervat' }, T0 + 15 * MIN);
  const voor = t;
  t = tempo.pasToe(t, { soort: 'beurtKlaar', verwacht: { ronde: 1, team: 'A' }, plein: 'A', raiders: [] }, T0 + 25 * MIN);
  assert.equal(t.beurten[0].duurMs, 15 * MIN);
  assert.equal(t.beurten[0].pauzeMs, 10 * MIN);
  assert.deepEqual(tempo.pleinDelta(voor, t), { A: 1, B: 0 });
  const terug = tempo.pasToe(t, { soort: 'undo' }, T0 + 26 * MIN);
  assert.equal(terug.beurten.length, 0);
  assert.equal(terug.huidig.team, 'A');
  assert.equal(terug.rev, t.rev + 1, 'undo is ook een nieuwe revisie (compare-and-set)');
  assert.deepEqual(tempo.pleinDelta(t, terug), { A: -1, B: 0 });
});

test('achterstand-kleur, verwachte eindtijd en haalbare rondes', () => {
  assert.equal(tempo.kleurVoor(2 * MIN), 'groen');
  assert.equal(tempo.kleurVoor(3 * MIN), 'groen');
  assert.equal(tempo.kleurVoor(7 * MIN), 'oranje');
  assert.equal(tempo.kleurVoor(11 * MIN), 'rood');
  let t = tempo.pasToe(tempo.leegTempo(), { soort: 'start', eersteTeam: 'A' }, T0);
  // Precies op schema: 180 minuten, eind 22:30, alle zes rondes.
  const b0 = tempo.tempoBeeld(t, T0 + MIN);
  assert.equal(b0.kleur, 'groen');
  assert.equal(b0.haalbaarTot, 6);
  assert.equal(Math.round((b0.verwachtEind - T0) / MIN), 180);
  // Ronde 1 team A duurt 32 minuten (12 te lang): rood, en het andere team houdt zijn eigen 20 minuten.
  t = tempo.pasToe(t, { soort: 'beurtKlaar', verwacht: { ronde: 1, team: 'A' }, plein: null, raiders: [] }, T0 + 32 * MIN);
  const b1 = tempo.tempoBeeld(t, T0 + 32 * MIN);
  assert.equal(b1.kleur, 'rood');
  assert.equal(Math.round(b1.restMs / MIN), 20);
  assert.ok(b1.haalbaarTot < 6, 'op dit tempo niet alle zes');
});

test('leesTempo is defensief', () => {
  assert.equal(tempo.leesTempo(null), null);
  const t = tempo.leesTempo({ rev: 2, beurten: [{ team: 'X' }, { ronde: 1, team: 'A', start: new Date(T0).toISOString(), eind: new Date(T0 + MIN).toISOString(), duurMs: MIN, pauzeMs: 0, plein: 'B', raiders: ['c9', 3] }] });
  assert.equal(t.beurten.length, 1);
  assert.deepEqual(t.beurten[0].raiders, ['c9']);
  assert.deepEqual(t.instelling, tempo.STANDAARD_INSTELLING);
  assert.equal(tempo.tempoLogboek(t).beurten[0].plein, 'unchained');
});

test('trackerDiff: alleen wat veranderde, per unit en per scenario-post', () => {
  const oud = { round: 1, vp: {}, units: { 'host:u1': { lost: 1, fleeing: false } }, bonus: { host: { scenario: { a: 1 } } } };
  const nieuw = { ...oud, units: { ...oud.units, 'host2:u3': { lost: 2, fleeing: false } }, bonus: { host: { scenario: { a: 1, b: 1 } } } };
  assert.deepEqual(tp.trackerDiff(oud, nieuw), [
    { p: ['units', 'host2:u3'], v: { lost: 2, fleeing: false } },
    { p: ['bonus', 'host', 'scenario', 'b'], v: 1 },
  ]);
  assert.deepEqual(tp.trackerDiff(oud, oud), []);
  const zonder = { ...oud };
  delete zonder.bonus;
  assert.deepEqual(tp.trackerDiff(oud, zonder), [{ p: ['bonus'], weg: true }]);
  // Toepassen geeft dezelfde tracker terug.
  assert.deepEqual(tp.pasPatchesToe(oud, tp.trackerDiff(oud, nieuw)), nieuw);
  // Optellen geklemd, ook als het pad nog niet bestaat.
  assert.deepEqual(tp.pasPatchesToe({}, [{ p: ['bonus', 'guest', 'scenario', 'ks'], plus: 1, min: 0, max: 12 }]), { bonus: { guest: { scenario: { ks: 1 } } } });
  assert.deepEqual(tp.pasPatchesToe({ a: { b: 12 } }, [{ p: ['a', 'b'], plus: 1, min: 0, max: 12 }]), { a: { b: 12 } });
});
