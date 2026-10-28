// 2 vs 2 in een solo-potje (Joost 28-10-2026). Zie src/lib/teams.ts en berekenTeamVictory in
// src/lib/victoryPoints.ts. Vastgezet:
//   1. 1v1 rekent ONVERANDERD: berekenVictory geeft voor een vast voorbeeld nog precies dezelfde stand.
//   2. Team-VP = Dead-or-Fled op beide vijandelijke legers + de bonussen van beide teamleden.
//   3. Een kill in de kill-log van host2 op een unit van guest2 telt voor team A.
//   4. De bonussen van beide teamleden tellen op.
//   5. Team-objectives tellen één keer per team (alleen die op host/guest).
//   6. Twee keer dezelfde lijst: een kill op de ene vijand raakt de andere niet.
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

const vp = require(path.join(root, 'src/lib/victoryPoints.ts'));
const teams = require(path.join(root, 'src/lib/teams.ts'));

const prof = (w) => [{ label: 'X', stats: [{ k: 'W', v: String(w) }] }];
const unit = (id, o) => ({ id, name: id, count: null, points: 100, category: 'Core Units', options: [], specialRules: [], profiles: prof(1), ...o });
const leger = (naam, units) => ({ name: naam, points: 1000, system: '', faction: 'Empire', composition: '', raw: '', units });

// Vier verschillende legers.
const A1 = leger('A1', [unit('a1x', { count: 10, points: 100 }), unit('a1y', { points: 200, profiles: prof(4) })]);
const A2 = leger('A2', [unit('a2x', { count: 5, points: 150 })]);
const B1 = leger('B1', [unit('b1x', { count: 20, points: 160 }), unit('b1y', { points: 120, profiles: prof(3) })]);
const B2 = leger('B2', [unit('b2x', { count: 10, points: 90 }), unit('b2y', { points: 250, profiles: prof(6) })]);

test('1v1: berekenVictory rekent nog precies zoals voorheen', () => {
  // Host verliest a1y helemaal (200), a1x vlucht (50). Guest: b1x tot ≤25% (80), b1y via de kill-log
  // van host (120). Bonussen: host General (+100) + 1 standaard (+50) + objective 30; guest BSB (+50).
  const tracker = {
    round: 3, vp: {},
    units: {
      'host:a1y': { lost: 4, fleeing: false },
      'host:a1x': { lost: 2, fleeing: true },
      'guest:b1x': { lost: 15, fleeing: false },
      'host:a1x-dummy': { lost: 0, fleeing: false, kills: 1, killDetails: [{ unit: 'b1y', turn: 2 }] },
    },
    bonus: {
      host: { generalDown: true, standaards: 1, objectives: { 'dom': 30 } },
      guest: { bsbDown: true },
    },
  };
  const res = vp.berekenVictory(A1, B1, tracker, tracker.bonus.host, tracker.bonus.guest);
  // host: 80 + 120 + 100 + 50 + 30 = 380 ; guest: 200 + 50 + 50 = 300
  assert.deepEqual(res, { hostVp: 380, guestVp: 300, verschil: 80, winnaar: null, uitslag: 'draw' });
  // Battle March halveert de bonussen; 1v1 blijft ook dan gelijk aan de regel.
  const bm = vp.berekenVictory(A1, B1, tracker, tracker.bonus.host, tracker.bonus.guest, true);
  assert.deepEqual(bm, { hostVp: 80 + 120 + 50 + 25 + 30, guestVp: 200 + 50 + 25, verschil: 30, winnaar: null, uitslag: 'draw' });
});

test('team-sommen: Dead or Fled op beide vijanden + bonussen van beide teamleden', () => {
  const legers = { host: A1, host2: A2, guest: B1, guest2: B2 };
  const tracker = {
    round: 4, vp: {}, teams: '2v2',
    units: {
      'guest:b1y': { lost: 0, fleeing: false, weg: true },      // 120 voor team A
      'guest2:b2y': { lost: 6, fleeing: false },                // 250 voor team A
      'host2:a2x': { lost: 0, fleeing: true },                  // 75 voor team B
    },
    bonus: {
      host: { generalDown: true },      // +100 team A
      host2: { standaards: 2 },         // +100 team A
      guest: { bsbDown: true },         // +50 team B
      guest2: { objectiveVp: 15 },      // +15 team B
    },
  };
  const res = vp.berekenTeamVictory(legers, tracker);
  assert.equal(res.hostVp, 120 + 250 + 100 + 100);
  assert.equal(res.guestVp, 75 + 50 + 15);
  assert.equal(res.verschil, 570 - 140);
  assert.equal(res.winnaar, 'host');
  assert.equal(res.uitslag, 'crushing');
  assert.equal(res.spelers.guest.afgestaan, 120);
  assert.equal(res.spelers.guest2.afgestaan, 250);
  assert.equal(res.spelers.host2.afgestaan, 75);
  assert.equal(res.spelers.host.afgestaan, 0);
  assert.equal(res.spelers.host2.bonus, 100);
  // Gelijke marges als 1v1: <100 verschil = draw.
  const gelijk = vp.berekenTeamVictory(legers, { round: 1, vp: {}, units: {}, teams: '2v2', bonus: { host: { generalDown: true }, guest2: { objectiveVp: 20 } } });
  assert.equal(gelijk.winnaar, null);
  assert.equal(gelijk.uitslag, 'draw');
  // Een lege stoel (nog geen leger) levert gewoon 0 op.
  const leeg = vp.berekenTeamVictory({ host: A1, host2: null, guest: B1, guest2: null }, tracker);
  assert.equal(leeg.hostVp, 120 + 100 + 100);
  assert.equal(leeg.guestVp, 50 + 15);
});

test('een kill in de kill-log van host2 op guest2 telt voor team A', () => {
  const legers = { host: A1, host2: A2, guest: B1, guest2: B2 };
  // De keuzelijst van host2 levert verwijzingen met stoel-voorvoegsel (vijandUnitsVoor).
  const keuze = teams.vijandUnitsVoor('host2', legers, { teams: '2v2' });
  assert.deepEqual(keuze.map((u) => u.id), ['guest:b1x', 'guest:b1y', 'guest2:b2x', 'guest2:b2y']);
  assert.match(keuze[2].name, /^Opponent 2 — /);
  const tracker = {
    round: 2, vp: {}, teams: '2v2',
    units: { 'host2:a2x': { lost: 0, fleeing: false, kills: 1, killDetails: [{ unit: 'guest2:b2y', turn: 2 }] } },
  };
  const res = vp.berekenTeamVictory(legers, tracker);
  assert.equal(res.hostVp, 250);
  assert.equal(res.spelers.guest2.afgestaan, 250);
  assert.equal(res.guestVp, 0);
  // Een kill van je BONDGENOOT is geen kill op jou: host's kill-log raakt team A niet.
  const eigen = vp.berekenTeamVictory(legers, { round: 2, vp: {}, teams: '2v2', units: { 'host:a1x': { lost: 0, fleeing: false, kills: 1, killDetails: [{ unit: 'host2:a2x' }] } } });
  assert.equal(eigen.spelers.host2.afgestaan, 0);
});

test('bonussen van beide teamleden tellen op', () => {
  const legers = { host: A1, host2: A2, guest: B1, guest2: B2 };
  const tracker = { round: 1, vp: {}, units: {}, teams: '2v2', bonus: { host: { generalDown: true, bsbDown: true }, host2: { generalDown: true, standaards: 1 } } };
  const res = vp.berekenTeamVictory(legers, tracker);
  assert.equal(res.hostVp, 100 + 50 + 100 + 50);
  assert.equal(res.spelers.host.bonus, 150);
  assert.equal(res.spelers.host2.bonus, 150);
  // Battle March halveert ze per speler.
  assert.equal(vp.berekenTeamVictory(legers, { ...tracker, battleMarch: true }).hostVp, 50 + 25 + 50 + 25);
});

test('team-objectives tellen één keer per team', () => {
  const legers = { host: A1, host2: A2, guest: B1, guest2: B2 };
  const tracker = {
    round: 1, vp: {}, units: {}, teams: '2v2',
    bonus: {
      host: { objectives: { 'dom-centre': 50, 'troves': 20 } },
      // Ook als er (per ongeluk) objectives op host2/guest2 staan: die tellen niet.
      host2: { objectives: { 'dom-centre': 50 } },
      guest: { objectives: { 'dom-centre': 25 } },
      guest2: { objectives: { 'troves': 40 } },
    },
  };
  const res = vp.berekenTeamVictory(legers, tracker);
  assert.equal(res.hostVp, 70);
  assert.equal(res.guestVp, 25);
  assert.equal(res.spelers.host.objectives, 70);
  assert.equal(res.spelers.host2.objectives, 0);
  assert.equal(res.spelers.host.bonus, 0);
});

test('twee keer dezelfde lijst: een kill op de ene vijand raakt de andere niet', () => {
  // Team B speelt twee keer B1 (zelfde unit-ids), team A twee keer A1.
  const legers = { host: A1, host2: A1, guest: B1, guest2: B1 };
  const tracker = {
    round: 3, vp: {}, teams: '2v2',
    units: {
      'host:a1x': { lost: 0, fleeing: false, kills: 1, killDetails: [{ unit: 'guest:b1y' }] },
      'guest2:b1x': { lost: 0, fleeing: false, kills: 1, killDetails: [{ unit: 'host2:a1y' }] },
      'host2:a1x': { lost: 3, fleeing: false },
    },
  };
  const res = vp.berekenTeamVictory(legers, tracker);
  assert.equal(res.spelers.guest.afgestaan, 120);
  assert.equal(res.spelers.guest2.afgestaan, 0);
  assert.equal(res.spelers.host2.afgestaan, 200);
  assert.equal(res.spelers.host.afgestaan, 0);
  assert.equal(res.hostVp, 120);
  assert.equal(res.guestVp, 200);
});

test('namen: eigen naam of het standaardlabel; lege namen vallen weg', () => {
  assert.equal(teams.naamVan({ spelers: { host2: '  Bram ' } }, 'host2'), 'Bram');
  assert.equal(teams.naamVan({ spelers: { host2: '   ' } }, 'host2'), 'Ally');
  assert.equal(teams.naamVan(null, 'guest2'), 'Opponent 2');
  assert.deepEqual(teams.schoneNamen({ host: '', guest: ' Kees ' }), { guest: 'Kees' });
  assert.equal(teams.schoneNamen({ host: ' ' }), undefined);
  assert.deepEqual(teams.leesKillVerwijzing('guest2:abc:1'), { stoel: 'guest2', id: 'abc:1' });
  assert.deepEqual(teams.leesKillVerwijzing('abc'), { stoel: null, id: 'abc' });
});
