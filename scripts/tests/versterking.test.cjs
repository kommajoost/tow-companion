// REINFORCEMENT DETACHMENT en CALL TO ARMS (23-10-2026). Zie src/lib/versterking.ts en
// src/lib/campaignBattle.ts. Vastgezet:
//   1. Een versterkingslijst valideert onder de regels van de battle-grootte (`versterking.basis`):
//      categorie-percentages, Core-minimum en "0-X per 1000 points" op 1250, de som tegen 625.
//   2. Een tweede General of BSB in de versterking is een melding die niet blokkeert.
//   3. De mock-versterkingen van het lab bestaan echt, passen in de helft van een 1000-punten-battle, en
//      hebben geen meldingen.
//   4. In de battle komt de versterking bovenop het leger: eigen ids, geen campagne-sleutel, punten
//      opgeteld; nog eens toevoegen vervangt, weghalen herstelt.
//   5. Het veteranen-rapport slaat versterkings-units over (geen XP, geen scars), een kill OP een
//      versterkings-unit levert de doder wel XP op.
//   6. Het contract `versterking` op de battle-payload, en de lab-schakelaar die het vult.
//   7. Battle-type 'call': label, uitleg, Champion-regel, en een onbekend type breekt niets.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
const compile = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText, f);
require.extensions['.ts'] = compile;
require.extensions['.tsx'] = compile;

let antwoord = {};
const stubs = {
  './supabase': { supabase: { rpc: async (naam) => ({ data: antwoord[naam], error: null }) }, IS_TEST_DB: true },
  '../store': { getPersisted: (_k, d) => d, setPersisted: () => {} },
};
const origLoad = Module._load;
Module._load = function (req, ...rest) {
  if (stubs[req]) return stubs[req];
  return origLoad.call(this, req, ...rest);
};

const rf = require(path.join(root, 'src/lib/versterking.ts'));
const ob = require(path.join(root, 'src/lib/owbBuilder.ts'));
const ov = require(path.join(root, 'src/lib/overlays.ts'));
const lab = require(path.join(root, 'src/lib/scenarioLab.ts'));
const st = require(path.join(root, 'src/lib/scenarioTest.ts'));
const vr = require(path.join(root, 'src/lib/veteraanRapport.ts'));
const cb = require(path.join(root, 'src/lib/campaignBattle.ts'));
const json = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));

// Een nep-catalogus: precies genoeg om de grenzen te raken.
const UNITS = {
  core: [{ id: 'spears', name_en: 'Spearmen', points: 5, minimum: 10 }],
  rare: [{ id: 'beast', name_en: 'Big Beast', points: 300, minimum: 1, maximum: 1, notes: { name_en: '0-1 per 1000 points' } }],
  characters: [{ id: 'hero', name_en: 'Hero', points: 60, minimum: 1, maximum: 1, command: [{ name_en: 'General', points: 0 }, { name_en: 'Battle Standard Bearer', points: 25 }] }],
};
const getUnit = (c, id) => ob.findUnit(UNITS, c, id);
const ent = (uid, cat, unitId, count, opts = []) => ({ uid, cat, unitId, count, opts });

test('helftVan: de helft van de cap, naar beneden', () => {
  assert.equal(rf.helftVan(1250), 625);
  assert.equal(rf.helftVan(2000), 1000);
  assert.equal(rf.helftVan(1001), 500);
  assert.equal(rf.helftVan(0), 0);
  assert.equal(rf.helftVan(NaN), 0);
});

test('validate: een versterking van 625 speelt onder de regels van 1250', () => {
  const entries = [ent('a', 'core', 'spears', 40), ent('b', 'rare', 'beast', 1)];
  const rfLijst = { composition: 'x', rule: 'open-war', points: 625, entries, versterking: { basis: 1250 } };
  const v = ob.validate(rfLijst, getUnit);
  assert.equal(v.total, 500);
  assert.equal(v.byCategory.rare.cap, 312, 'Rare 25% van 1250');
  assert.equal(v.byCategory.characters.cap, 625, 'Characters 50% van 1250');
  assert.equal(v.byCategory.core.floor, 313, 'Core-minimum 25% van 1250');
  assert.deepEqual(v.warnings.filter((w) => /Rare|per 1000|points limit/.test(w)), [], 'geen Rare-, 0-X- of puntenmelding');
  assert.ok(v.warnings.some((w) => /Core below its 25% minimum \(200\/313/.test(w)), 'Core 200 van de 313');

  // Dezelfde units als GEWONE lijst van 625: alles op 625, en dan klapt Rare en de 0-1 per 1000.
  const gewoon = ob.validate({ ...rfLijst, versterking: undefined }, getUnit);
  assert.equal(gewoon.byCategory.rare.cap, 156);
  assert.ok(gewoon.warnings.some((w) => /Rare over its 25% cap/.test(w)));
  assert.ok(gewoon.warnings.some((w) => /Big Beast: 1 taken, 0 allowed/.test(w)));

  // De som tegen 625, niet tegen 1250.
  const zwaar = ob.validate({ ...rfLijst, entries: [ent('a', 'core', 'spears', 80), ent('b', 'rare', 'beast', 1)] }, getUnit);
  assert.equal(zwaar.total, 700);
  assert.ok(zwaar.warnings.includes('Over the points limit by 75'), zwaar.warnings.join(' | '));
});

test('validate: een General of BSB in de versterking is een melding, geen fout', () => {
  const lijst = { composition: 'x', rule: 'open-war', points: 625, versterking: { basis: 1250 },
    entries: [ent('h', 'characters', 'hero', 1, ['command/0', 'command/1']), ent('a', 'core', 'spears', 40)] };
  const v = ob.validate(lijst, getUnit);
  assert.deepEqual(v.advisories.map((a) => a.message), [
    'Hero: a reinforcement joins an army that already has its General',
    'Hero: a reinforcement joins an army that already has its Battle Standard Bearer',
  ]);
  assert.ok(!v.warnings.some((w) => /reinforcement/.test(w)), 'niet in warnings (die blokkeren)');
  assert.equal(ob.validate({ ...lijst, versterking: undefined }, getUnit).advisories.length, 0, 'gewone lijst: niets');
});

test('maakVersterkingLijst: zelfde army book, de helft, nooit een campagnelijst', () => {
  const l = rf.maakVersterkingLijst({ id: 'l1', name: 'Grudgebearers', army: 'dwarfen-mountain-holds', composition: 'dwarfen-mountain-holds', rule: 'combined-arms' }, 1250, 'l2', 5);
  assert.equal(l.points, 625);
  assert.deepEqual(l.versterking, { basis: 1250, voor: 'l1' });
  assert.equal(l.army, 'dwarfen-mountain-holds');
  assert.equal(l.rule, 'combined-arms');
  assert.equal(l.name, 'Grudgebearers · Reinforcements');
  assert.deepEqual(l.entries, []);
  assert.ok(!('campaign' in l) && !('campaignKey' in l));
  assert.ok(rf.isVersterkingLijst(l));
  assert.ok(!rf.isVersterkingLijst({ points: 1250 }));
  assert.ok(!rf.isVersterkingLijst({ versterking: { basis: 0 } }));
});

test('mock-versterkingen: echte units, binnen 500, geen meldingen', () => {
  const items = json(path.join(root, 'public/owb/magic-items.json'));
  for (const m of lab.MOCK_LEGERS) {
    const r = lab.mockVersterking(m.id);
    assert.ok(r, `${m.id}: heeft een versterking`);
    assert.equal(r.army, m.lijst.army, 'zelfde army book');
    assert.equal(r.composition, m.lijst.composition, 'zelfde composition');
    assert.ok(rf.isVersterkingLijst(r));
    const cat = ov.catalogueFor(json(path.join(root, `public/owb/${r.army}.json`)), r.composition, null);
    for (const e of r.entries) assert.ok(ob.findUnit(cat, e.cat, e.unitId), `${m.id}: ${e.unitId}`);
    const v = ob.validate(r, (c, id) => ob.findUnit(cat, c, id), ov.itemsFor(items, r.composition, null));
    assert.ok(v.total >= 400 && v.total <= 500, `${m.id}: ${v.total} pts`);
    assert.deepEqual([...v.warnings, ...v.entryWarnings, ...v.advisories], [], `${m.id}: geen meldingen`);
    const uids = new Set([...m.lijst.entries, ...r.entries].map((e) => e.uid));
    assert.equal(uids.size, m.lijst.entries.length + r.entries.length, 'geen uid gedeeld met het hoofdleger');
  }
});

const unit = (id, extra = {}) => ({ id, name: id, count: 10, points: 50, category: 'Core Units', options: [], specialRules: [], profiles: [{ label: id, stats: [{ k: 'W', v: '1' }] }], troopType: 'Regular Infantry', ...extra });
const leger = (naam, units, points) => ({ name: naam, points, system: 'TOW', faction: 'Empire of Man', composition: 'Grand Army', units, raw: '' });

test('voegVersterkingToe: bovenop het leger, zonder campagne-sleutel; vervangen en weghalen', () => {
  const hoofd = leger('Main', [unit('u1', { campaignId: 'u1', veteraan: { xp: 2, abilities: [], littekens: 0 } })], 1250);
  const r = leger('Reinforcements', [unit('u1', { campaignId: 'u1', veteraan: { xp: 3, abilities: [], littekens: 1 } }), unit('u2')], 600);
  const samen = rf.voegVersterkingToe(hoofd, r, 625);
  assert.equal(samen.units.length, 3);
  assert.equal(samen.points, 1850);
  assert.deepEqual(samen.versterking, { naam: 'Reinforcements', punten: 600, max: 625 });
  const extra = samen.units.filter((u) => u.versterking);
  assert.deepEqual(extra.map((u) => u.id), ['rf-u1', 'rf-u2']);
  assert.ok(extra.every((u) => u.campaignId === undefined && u.veteraan === undefined), 'geen campagne-unit');
  assert.equal(samen.units[0].campaignId, 'u1', 'het hoofdleger blijft wat het was');
  assert.deepEqual(rf.versterkingVan(samen), { naam: 'Reinforcements', punten: 600, max: 625, units: 2 });
  // Nog eens: vervangt, nooit twee versterkingen.
  const nogEens = rf.voegVersterkingToe(samen, leger('Other', [unit('x')], 50), 625);
  assert.deepEqual(nogEens.units.map((u) => u.id), ['u1', 'rf-x']);
  assert.equal(nogEens.points, 1300);
  const terug = rf.zonderVersterking(nogEens);
  assert.deepEqual(terug.units.map((u) => u.id), ['u1']);
  assert.equal(terug.points, 1250);
  assert.equal(terug.versterking, undefined);
  assert.equal(rf.versterkingVan(terug), null);
  assert.ok(rf.versterkingTeZwaar(700, 625));
  assert.ok(!rf.versterkingTeZwaar(625, 625));
  assert.ok(!rf.versterkingTeZwaar(700, null), 'zonder grens geen oordeel');
});

test('veteranen-rapport: versterkings-units doen niet mee, een kill op hen telt wel', () => {
  const host = rf.voegVersterkingToe(leger('Main', [unit('h1', { campaignId: 'h1' })], 500), leger('Rf', [unit('h2')], 250), 625);
  const guest = leger('Them', [unit('g1', { campaignId: 'g1' })], 500);
  const tracker = { round: 6, vp: {}, units: {
    'host:rf-h2': { lost: 10, fleeing: false, weg: true, kills: 1, killDetails: [{ unit: 'g1', turn: 2 }] },
    'guest:g1': { lost: 0, fleeing: false, kills: 1, killDetails: [{ unit: 'rf-h2', turn: 3 }] },
  } };
  const regelsHost = vr.collectVeteraan(tracker, host, 'host', false, guest);
  assert.deepEqual(regelsHost.map((r) => r.vet.unitId), ['h1'], 'alleen de campagne-unit');
  const regelsGuest = vr.collectVeteraan(tracker, guest, 'guest', true, host);
  assert.equal(regelsGuest[0].vet.kills, 1, 'de doder krijgt zijn kill');
  assert.deepEqual(regelsGuest[0].vet.killDetails, [{ turn: 3, unitId: 'rf-h2', naam: 'h2' }]);
});

test('contract: versterking op de battle-payload', () => {
  assert.equal(rf.parseVersterking({}), undefined, 'geen veld: geen versterking');
  assert.deepEqual(rf.parseVersterking({ versterking: 625 }), { aanvaller: 625, verdediger: 625 });
  assert.deepEqual(rf.parseVersterking({ versterking: 625, versterkingKant: 'verdediger' }), { aanvaller: null, verdediger: 625 });
  assert.deepEqual(rf.parseVersterking({ versterking: { aanvaller: 1000, verdediger: null } }), { aanvaller: 1000, verdediger: null });
  assert.equal(rf.parseVersterking({ versterking: 0 }), undefined);
  assert.equal(rf.parseVersterking({ versterking: null }), undefined);
  assert.equal(rf.parseVersterking({ versterking: 'veel' }), undefined);
  assert.equal(rf.versterkingVoorKant({ aanvaller: 625, verdediger: null }, 'verdediger'), null);
});

test('campagne-battle: versterking en type call komen door battleByCode', async () => {
  antwoord = { towc_battle_by_code: { ok: true, id: 7, code: 'CALL01', type: 'call', beideGelockt: true, fase: 4, cap: 1250,
    aanvaller: { id: 'a', naam: 'Arjen' }, verdediger: { id: 'b', naam: 'Ferry' }, versterking: 625, versterkingKant: 'aanvaller' } };
  const b = await cb.battleByCode('CALL01');
  assert.equal(b.type, 'call');
  assert.deepEqual(b.versterking, { aanvaller: 625, verdediger: null });
  antwoord = { towc_battle_by_code: { ok: true, id: 8, code: 'OUD001', type: 'attack', beideGelockt: true } };
  assert.equal((await cb.battleByCode('OUD001')).versterking, undefined, 'oude server: geen versterking');
});

test('lab: de schakelaar vult het contract met de helft van de cap', () => {
  const INDEX = lab.leesLabIndex(json(path.join(root, 'public/scenario-lab/index.json')));
  const act4 = INDEX.acts.find((a) => a.act === 4);
  const sh = json(path.join(root, 'public/scenario-lab', act4.bestand))['ad-strategic|vlakte'];
  const k = { setup: 'ad-strategic', act: 4, terrein: 'vlakte', aanvaller: 'empire', verdediger: 'orcs' };
  assert.equal(lab.labPayload(sh, act4, k).versterking, null, 'standaard uit');
  const p = lab.labPayload(sh, act4, { ...k, versterking: 'aanvaller' });
  assert.deepEqual(p.versterking, { aanvaller: 625, verdediger: null });
  assert.deepEqual(st.battleUitPayload(p).versterking, { aanvaller: 625, verdediger: null });
  assert.deepEqual(lab.labVersterking({ versterking: 'beide' }, 2000), { aanvaller: 1000, verdediger: 1000 });
  assert.deepEqual(lab.labVersterking({ versterking: 'verdediger' }, 1250), { aanvaller: null, verdediger: 625 });
});

test("type 'call': Call to Arms, de Champion en zijn regel", () => {
  assert.equal(cb.battleTypeLabel('call'), 'Call to Arms');
  assert.match(cb.battleTypeNote('call'), /Champion plays under challenge rules: \+1 Fame only on a Crushing Victory/);
  assert.equal(cb.kantLabel('call', 'aanvaller'), 'Caller');
  assert.equal(cb.kantLabel('call', 'verdediger'), 'Champion');
  assert.equal(cb.kantLabel('attack', 'verdediger'), 'Defender');
  assert.ok(cb.isChampion('call', 'verdediger'));
  assert.ok(!cb.isChampion('call', 'aanvaller'));
  assert.ok(!cb.isChampion('challenge', 'verdediger'));
  assert.match(cb.CHAMPION_REGEL, /Crushing Victory, loses nothing/);
  const fame = { challenge: false, aanv: 5, verd: 0, modAanv: 0, modVerd: 0, councilAanv: 0, councilVerd: 0, geverfdAanv: false, geverfdVerd: false, verdedigingsBonus: false, proxy: 0, highwayman: 0 };
  assert.equal(cb.fameOpbouw(fame, 'verd', 'RV', 'call'), 'Champion: Fame only on a Crushing Victory');
  assert.equal(cb.fameOpbouw({ ...fame, verd: 1 }, 'verd', 'CD', 'call'), 'Champion, Crushing Victory');
  assert.equal(cb.fameOpbouw(fame, 'aanv', 'RV', 'call'), 'TP 5', 'de oproeper: een gewone battle');
  // Een type dat de Companion niet kent: geen label, geen uitleg, gewone rollen.
  assert.equal(cb.battleTypeLabel('ruin-front'), null);
  assert.equal(cb.battleTypeNote('ruin-front'), null);
  assert.equal(cb.kantLabel('ruin-front', 'aanvaller'), 'Attacker');
  // De scenario-test neemt 'call' als intentie over.
  const p = { sheet: { scenario: 'x', intentie: 'call' }, fase: 4, cap: 1250, aanvaller: { naam: 'A', factie: '', kleur: '#000' }, verdediger: { naam: 'B', factie: '', kleur: '#000' }, geladen: 'nu' };
  assert.equal(st.battleUitPayload(p).type, 'call');
});
