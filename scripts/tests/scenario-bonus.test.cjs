// Scenario-VP uit de sheet (22-10-2026). Zie src/lib/scenarioBonus.ts, src/lib/victoryPoints.ts,
// src/lib/wrathTriggers.ts en src/lib/scenarioTest.ts. Vastgezet:
//   1. Het contract `scenarioBonus` (versie 1) wordt defensief gelezen; rommel valt weg.
//   2. Per soort de juiste VP: eind, per-stuk/per-beurt met max, de pot die zakt per plundering
//      (niet onder 0), en de puntwaarde 1:1. Host = aanvaller, guest = verdediger.
//   3. berekenVictory telt het mee; zonder definitie rekent alles als voorheen.
//   4. Wrath Triggers: zes, letterlijk uit de briefing; de worp komt van de campagne (23-10-2026),
//      lokaal (lab/scenario-test) altijd twee verschillende.
//   5. De scenario-test leest een base64url-hash met UTF-8 (″, ×) goed terug.
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

const sb = require(path.join(root, 'src/lib/scenarioBonus.ts'));
const vp = require(path.join(root, 'src/lib/victoryPoints.ts'));
const wrath = require(path.join(root, 'src/lib/wrathTriggers.ts'));
const SHEETS = require(path.join(root, 'scripts/fixtures/campaign-sheets-act3.json'));

const def = (k) => sb.parseScenarioBonus(SHEETS[k].scenarioBonus);

test('parser: contract versie 1, rommel valt weg', () => {
  assert.equal(sb.parseScenarioBonus(undefined), null);
  assert.equal(sb.parseScenarioBonus({ versie: 2, posten: [{ id: 'x', label: 'X', kant: 'beide', soort: 'eind', vp: 1 }] }), null);
  assert.equal(sb.parseScenarioBonus({ versie: 1, posten: [] }), null);
  const d = sb.parseScenarioBonus({ versie: 1, posten: [
    { id: 'a', label: 'A', kant: 'aanvaller', soort: 'eind', vp: 100 },
    { id: 'a', label: 'dubbel', kant: 'aanvaller', soort: 'eind', vp: 5 },
    { id: 'b', label: 'B', kant: 'iemand', soort: 'eind', vp: 5 },
    { id: 'c', label: 'C', kant: 'verdediger', soort: 'raar', vp: 5 },
    { id: 'd', label: 'D', kant: 'verdediger', soort: 'per-beurt', vp: -5 },
    'rommel',
  ] });
  assert.deepEqual(d.posten.map((p) => p.id), ['a']);
  assert.equal(d.posten[0].vp, 100);
  for (const k of Object.keys(SHEETS)) {
    if (SHEETS[k].scenarioBonus) assert.ok(def(k), `fixture ${k} leest`);
  }
});

test('Plunder: plunderingen voor de aanvaller, de pot zakt per plundering en nooit onder 0', () => {
  const d = def('ad-loot-cart@3'); // 25 per plundering, pot 100 −10
  const z = (n) => sb.scenarioVp(d, { 'raid-plunder': n }, {});
  assert.deepEqual(z(0), { host: 0, guest: 100 }, 'onaangeroerd: de pot staat vol');
  assert.deepEqual(z(3), { host: 75, guest: 70 });
  assert.deepEqual(z(12), { host: 300, guest: 0 }, '12 × −10: niet onder 0');
  assert.deepEqual(z(40), { host: 1000, guest: 0 }, 'geen plafond voor de aanvaller (site: "No cap"); de pot stopt op 0');
  const d4 = def('ad-loot-cart@4'); // 40, pot 150 −15
  assert.deepEqual(sb.scenarioVp(d4, { 'raid-plunder': 4 }, {}), { host: 160, guest: 90 });
  // De verdediger kan zelf niets in de pot invoeren.
  assert.deepEqual(sb.scenarioVp(d, {}, { 'raid-pot': 50, 'raid-plunder': 5 }), { host: 0, guest: 100 });
});

test('The Forge, Strategic Locations, Baggage Train, C&C en Breakthrough', () => {
  const forge = def('ad-special-feature@3');
  assert.deepEqual(sb.scenarioVp(forge, {}, { 'forge-turn': 5 }), { host: 0, guest: 125 });
  assert.deepEqual(sb.scenarioVp(forge, { 'forge-turn': 5 }, {}), { host: 0, guest: 0 }, 'de aanvaller scoort niet voor de Forge');
  assert.deepEqual(sb.scenarioVp(forge, {}, { 'forge-turn': 99 }), { host: 0, guest: 300 }, 'max 12');

  const sl = def('ad-strategic@3');
  assert.deepEqual(sb.scenarioVp(sl, { 'sl-destroy': 2 }, { 'sl-hold': 1 }), { host: 200, guest: 60 });
  assert.deepEqual(sb.scenarioVp(sl, { 'sl-destroy': 5 }, { 'sl-hold': 9 }), { host: 300, guest: 180 }, 'max 3');

  const lc = def('ad-flank-attack@3');
  assert.deepEqual(sb.scenarioVp(lc, { 'loot-destroyed': 1 }, { 'loot-held': 1 }), { host: 300, guest: 120 });
  assert.deepEqual(sb.scenarioVp(lc, { 'loot-destroyed': 7 }, {}), { host: 300, guest: 0 }, 'eind = 0/1');

  const cc = def('ad-command-control@3'); // 24-10: 10 per spelerbeurt (samen max 12) + 200 aan het eind
  assert.deepEqual(sb.scenarioVp(cc, { 'cc-feature': 1 }, {}), { host: 200, guest: 0 });
  assert.deepEqual(sb.scenarioVp(cc, {}, { 'cc-feature': 1 }), { host: 0, guest: 200 }, 'beide kanten kunnen hem scoren');
  assert.deepEqual(sb.postenVoor(cc, 'host').map((p) => p.id), ['cc-turn', 'cc-feature']);
  assert.deepEqual(sb.postenVoor(cc, 'guest').map((p) => p.id), ['cc-turn', 'cc-feature']);
  assert.equal(def('ad-command-control@4').posten.find((p) => p.id === 'cc-turn').vp, 15);
  assert.equal(def('ad-command-control@4').posten.find((p) => p.id === 'cc-feature').vp, 300);

  const bt = def('ad-breakthrough@3');
  assert.deepEqual(sb.scenarioVp(bt, { 'bt-zone': 455 }, {}), { host: 455, guest: 0 }, 'puntwaarde 1:1');
  assert.deepEqual(sb.scenarioVp(bt, {}, { 'bt-zone': 455 }), { host: 0, guest: 0 }, 'alleen de aanvaller');
});

test('Command & Control per beurt: twee tellers, één per kant, samen hoogstens 12', () => {
  const cc = def('ad-command-control@3');
  const turn = cc.posten.find((p) => p.id === 'cc-turn');
  assert.equal(turn.kant, 'beide');
  assert.equal(turn.soort, 'per-beurt');
  assert.equal(turn.max, 12);
  assert.ok(sb.isGedeeldeTeller(turn));
  assert.ok(!sb.isGedeeldeTeller(cc.posten.find((p) => p.id === 'cc-feature')), 'de eind-post blijft één kant');
  assert.ok(!sb.isGedeeldeTeller(def('ad-special-feature@3').posten[0]), 'een teller van één kant is niet gedeeld');

  // De opdracht van Joost: aanvaller 4 beurten, verdediger 3 + de feature aan het eind.
  assert.deepEqual(sb.scenarioVp(cc, { 'cc-turn': 4 }, { 'cc-turn': 3, 'cc-feature': 1 }), { host: 40, guest: 230 });
  // Elk tot 12, samen tot 12.
  // Eén kant kan alle 12 momenten scoren (na zijn eigen beurt én na die van de tegenstander): 120 + 200.
  assert.deepEqual(sb.scenarioVp(cc, { 'cc-turn': 12, 'cc-feature': 1 }, {}), { host: 320, guest: 0 });
  assert.match(turn.uitleg, /after your own turn and after your opponent’s, so one side can score up to 12 times/);
  assert.deepEqual(sb.scenarioVp(cc, { 'cc-turn': 7 }, { 'cc-turn': 5 }), { host: 70, guest: 50 });
  // De invoer weigert boven de grens: de plus van de verdediger staat uit, tikken verandert niets.
  assert.equal(sb.ruimteVoor(turn, 'guest', { 'cc-turn': 7 }, { 'cc-turn': 5 }), 0);
  assert.equal(sb.ruimteVoor(turn, 'host', { 'cc-turn': 4 }, { 'cc-turn': 3 }), 5);
  assert.equal(sb.klemInvoer(turn, 'guest', 6, { 'cc-turn': 7 }, { 'cc-turn': 5 }), 5, 'weigeren, de ander blijft staan');
  assert.equal(sb.klemInvoer(turn, 'host', 99, { 'cc-turn': 4 }, { 'cc-turn': 3 }), 9, 'tot wat de ander overlaat');
  assert.equal(sb.klemInvoer(turn, 'host', 3, { 'cc-turn': 4 }, { 'cc-turn': 3 }), 3, 'omlaag mag altijd');
  // Staat de tracker er tóch overheen (twee telefoons tegelijk): geen voorkeur, beide leveren in.
  const p = sb.gedeeldeTellers(turn, { 'cc-turn': 7 }, { 'cc-turn': 6 });
  assert.deepEqual([p.host, p.guest, p.teVeel], [6, 5, true]);
  assert.deepEqual(sb.scenarioVp(cc, { 'cc-turn': 7 }, { 'cc-turn': 6 }), { host: 60, guest: 50 });
  assert.equal(sb.klemInvoer(turn, 'host', 6, { 'cc-turn': 7 }, { 'cc-turn': 6 }), 6, 'rechtzetten kan');
  assert.equal(sb.klemInvoer(turn, 'host', 8, { 'cc-turn': 7 }, { 'cc-turn': 6 }), 7, 'verder omhoog niet');
  assert.deepEqual(sb.scenarioVp(cc, { 'cc-turn': 40 }, { 'cc-turn': 40 }), { host: 0, guest: 0 }, 'elk eerst op 12, dan samen ≤ 12');

  // Generiek: een toekomstige gedeelde post (bv. de shrine) zonder plafond, en een per-stuk.
  const vrij = sb.parseScenarioBonus({ versie: 1, posten: [
    { id: 'shrine', label: 'Shrine', kant: 'beide', soort: 'per-beurt', vp: 5 },
    { id: 'relic', label: 'Relics', kant: 'beide', soort: 'per-stuk', vp: 30, max: 3 },
  ] });
  assert.deepEqual(sb.scenarioVp(vrij, { shrine: 20, relic: 2 }, { shrine: 15, relic: 1 }), { host: 160, guest: 105 });
  assert.equal(sb.ruimteVoor(vrij.posten[0], 'host', { shrine: 20 }, { shrine: 15 }), Infinity);
  assert.equal(sb.ruimteVoor(vrij.posten[1], 'guest', { relic: 2 }, { relic: 1 }), 0);
  assert.match(sb.postSamenvatting(cc, turn), /10 VP per turn, max 12 for both sides together/);
  // In berekenVictory, via het rapport.
  const tracker = { round: 6, vp: {}, units: {} };
  const v = vp.berekenVictory(null, null, tracker, { scenario: { 'cc-turn': 4 } }, { scenario: { 'cc-turn': 3, 'cc-feature': 1 } }, false, cc);
  assert.deepEqual([v.hostVp, v.guestVp], [40, 230]);
});

test('berekenVictory: scenario-VP tellen mee, zonder definitie niets anders', () => {
  const d = def('ad-loot-cart@3');
  const tracker = { round: 1, vp: {}, units: {} };
  const host = { generalDown: true, scenario: { 'raid-plunder': 2 } };
  const guest = { standaards: 1, scenario: {} };
  const zonder = vp.berekenVictory(null, null, tracker, host, guest);
  assert.deepEqual([zonder.hostVp, zonder.guestVp], [100, 50], 'zonder definitie: de stand telt niet mee');
  const met = vp.berekenVictory(null, null, tracker, host, guest, false, d);
  assert.deepEqual([met.hostVp, met.guestVp], [150, 130], 'host 100 + 2×25, guest 50 + pot 100 − 20');
  // bonusVp telt `scenario` zelf nooit (dat zijn aantallen, geen VP).
  assert.equal(vp.bonusVp({ scenario: { 'raid-plunder': 999 } }), 0);
});

test('Wrath Triggers: zes, letterlijk, alleen vanaf Act 3', () => {
  assert.equal(wrath.WRATH_TRIGGERS.length, 6);
  assert.deepEqual(wrath.WRATH_TRIGGERS.map((t) => t.naam), ['Rain of Blood', 'The Wrath Watches', 'Echo of Fury', 'The Weeping Rift', 'The Slayer Marked', 'The Wrath Offers']);
  // Alleen The Wrath Offers is once per player per battle.
  assert.deepEqual(wrath.WRATH_TRIGGERS.filter((t) => /once per/i.test(t.effect)).map((t) => t.d6), [6]);
  // Letterlijk gelijk aan de briefing van de campagne (als die repo naast deze staat).
  const briefing = path.resolve(root, '../The Old World Campaign/site/src/pages/devBriefingAct3.json');
  if (fs.existsSync(briefing)) {
    // 23-10: op de JSON vergelijken, niet op de tekst -- de briefing werd opnieuw opgemaakt (elke
    // cel op een eigen regel) en toen faalde de oude string-match terwijl er geen woord veranderd was.
    const rijen = [];
    const loop = (v) => {
      if (Array.isArray(v)) {
        if (v.length === 4 && v.every((x) => typeof x === 'string')) rijen.push(JSON.stringify(v));
        v.forEach(loop);
      } else if (v && typeof v === 'object') Object.values(v).forEach(loop);
    };
    loop(JSON.parse(fs.readFileSync(briefing, 'utf8')));
    for (const t of wrath.WRATH_TRIGGERS) {
      assert.ok(rijen.includes(JSON.stringify([`${t.d6}`, `**${t.naam}**`, t.wanneer, t.effect])), `trigger ${t.d6} letterlijk`);
    }
  }
  assert.deepEqual(wrath.normWrath([7, 2, 2, 'x', 4, 5]), [2, 4]);
  assert.equal(wrath.wrathGeldt(3, false), true);
  assert.equal(wrath.wrathGeldt(2, true), false);
  assert.equal(wrath.wrathGeldt(3, true), false);
  assert.equal(wrath.wrathGeldt(null, false), false);
  // De regel zegt dat de campagne gooit, niet de spelers.
  assert.match(wrath.WRATH_REGEL, /War phase begins/);
  assert.doesNotMatch(wrath.WRATH_REGEL, /does not roll/);
});

test('Wrath: de server-worp uit towc_battle_by_code', () => {
  assert.deepEqual(wrath.parseWrath({ d6: [5, 2], herrold: 1, gerold_at: '2026-10-23T11:33:37Z' }), [5, 2], 'worp-volgorde blijft');
  assert.equal(wrath.parseWrath(null), null);
  assert.equal(wrath.parseWrath(undefined), null);
  assert.equal(wrath.parseWrath({ d6: [3, 3] }), null, 'een dubbel is geen geldige worp');
  assert.equal(wrath.parseWrath({ d6: [3] }), null);
  assert.equal(wrath.parseWrath({ d6: [0, 7] }), null);
  assert.deepEqual(wrath.wrathActief([4, 6]).map((t) => t.naam), ['The Weeping Rift', 'The Wrath Offers']);
});

test('Wrath: lokaal gooien geeft altijd twee verschillende (dubbel = opnieuw)', () => {
  // Een vaste rng die eerst een dubbel 3 geeft en dan een 6: de tweede dobbelsteen gaat opnieuw.
  const rij = [2 / 6, 2 / 6, 2 / 6, 5 / 6];
  let i = 0;
  assert.deepEqual(wrath.gooiWrath(() => rij[i++]), [3, 6]);
  // Een kapotte rng (altijd 0) mag geen eindeloze lus geven.
  assert.deepEqual(wrath.gooiWrath(() => 0), [1, 2]);
  // Met Math.random: 5000 worpen, nooit een dubbel, alle zes de waarden komen voor.
  const gezien = new Set();
  for (let n = 0; n < 5000; n++) {
    const [a, b] = wrath.gooiWrath();
    assert.notEqual(a, b);
    assert.ok(a >= 1 && a <= 6 && b >= 1 && b <= 6);
    gezien.add(a); gezien.add(b);
  }
  assert.equal(gezien.size, 6);
});

test('scenario-test: base64url-hash met UTF-8 terug naar de sheet', () => {
  // `atob` en `TextDecoder` bestaan in Node 18+, net als in de browser.
  const st = require(path.join(root, 'src/lib/scenarioTest.ts'));
  const sheet = SHEETS['ad-special-feature@3'];
  const payload = { sheet, fase: 3, cap: 1000, aanvaller: 'Tim', verdediger: { naam: 'Jasper', factie: 'Dwarfs' } };
  const b64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const p = st.payloadUitHash(`#sheet=${b64}`);
  assert.ok(p);
  assert.equal(p.sheet.scenarioNaam, 'The Forge');
  assert.match(p.sheet.deployNote, /24″ on a 48×48 table/, 'UTF-8 heel');
  assert.equal(p.cap, 1000);
  assert.equal(p.aanvaller.naam, 'Tim');
  assert.equal(p.verdediger.factie, 'Dwarfs');
  assert.equal(st.payloadUitHash('#sheet=@@@'), null);
  assert.equal(st.payloadUitHash(''), null);
  assert.ok(st.isScenarioTestCode('scentest'));
  assert.ok(!st.isScenarioTestCode('TEST00'));
});
