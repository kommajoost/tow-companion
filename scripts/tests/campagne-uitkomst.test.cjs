// C2/C3/C6 (04-10-2026): de Companion leest wat towc_battle_by_code / towc_battle_quests /
// towc_battle_resultaat nu teruggeven. De supabase-client is hier een stub die de ECHTE antwoorden
// teruggeeft die de TEST-database op 04-10 gaf (battle 2067/2068 in een teruggedraaide transactie).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, f);

let antwoord = {};
const stubs = {
  './supabase': { supabase: { rpc: async (naam) => ({ data: antwoord[naam], error: null }) } },
  '../store': { getPersisted: () => null },
};
const origLoad = Module._load;
Module._load = function (req, ...rest) {
  if (stubs[req]) return stubs[req];
  return origLoad.call(this, req, ...rest);
};
const cb = require(path.join(root, 'src/lib/campaignBattle.ts'));

const item = (naam, punten, soort) => ({ naam, punten, soort, effect: 'x' });

test('C6: twee items per kant, en een oude server met alleen slot 1', async () => {
  antwoord = { towc_battle_by_code: { ok: true, id: 1, code: 'X', type: 'attack', beideGelockt: true,
    items: { aanvaller: item('Scroll', 15, 'consumable'), aanvaller2: item('Enchanted Shield', 10, 'magic-item'),
             verdediger: null, verdediger2: item('Enchanted Shield', 10, 'magic-item') } } };
  const b = await cb.battleByCode('X');
  assert.deepEqual(b.items.aanvaller.map((i) => i.naam), ['Scroll', 'Enchanted Shield']);
  assert.deepEqual(b.items.verdediger.map((i) => i.naam), ['Enchanted Shield']);
  antwoord = { towc_battle_by_code: { ok: true, id: 1, code: 'X', type: 'attack', beideGelockt: true,
    items: { aanvaller: item('Scroll', 15, 'consumable'), verdediger: null } } };
  const oud = await cb.battleByCode('X');
  assert.equal(oud.items.aanvaller.length, 1);
  assert.equal(oud.items.verdediger.length, 0);
});

test('C2: tredes komen mee en questTrede kiest de hoogste gehaalde', async () => {
  const tiers = [{ vp: 50, min: 2, fame: 1, goud: 6 }, { vp: 100, min: 3, fame: 1, goud: 8 }, { vp: 150, min: 4, fame: 1, goud: 9 }];
  antwoord = { towc_battle_quests: { ok: true, aanvaller: { questId: 'so-captured-colours', naam: 'Captured Colours', opdracht: 'x', fame: 1, goud: 6, tiers }, verdediger: { questId: 'gewoon', naam: 'G', opdracht: 'y', fame: 1, goud: 8 } } };
  const q = await cb.battleQuests('X');
  assert.equal(q.aanvaller.tiers.length, 3);
  assert.equal(q.verdediger.tiers, null);
  assert.equal(cb.questTrede(q.aanvaller, 1), null);
  assert.equal(cb.questTrede(q.aanvaller, 2).goud, 6);
  assert.equal(cb.questTrede(q.aanvaller, 9).goud, 9);
});

test('C2/C3: de uitkomst van het rapport (echt TEST-antwoord)', async () => {
  antwoord = { towc_battle_resultaat: { ok: true, res: 'RV', type: 'attack', battle: 2067, verwerkt: true,
    gevolg: 'Plot taken! - conquest +5g - Fame-modifier +1/-1 Fame',
    fame: { aanv: 6, verd: 1, proxy: 0, modAanv: 1, modVerd: -1, aanvaller: 'c5', scoreAanv: null, scoreVerd: null, highwayman: 0, verdediger: 'c11', councilAanv: 0, councilVerd: 0, geverfdAanv: false, geverfdVerd: false, verdedigingsBonus: true },
    quests: [
      { ok: false, min: 2, fout: 'QUEST_NIET_VOLDAAN: so-captured-colours vraagt er minstens 2 (gemeld: 1)', kant: 'aanvaller', naam: 'Captured Colours', aantal: 1, questId: 'so-captured-colours' },
      { ok: true, min: 1, fame: 1, goud: 9, kant: 'verdediger', naam: 'Calming of the Winds', aantal: 3, questId: 'so-calming-of-the-winds' },
    ] } };
  const u = await cb.reportBattleResult('X', { winnaar: null, vp: {}, kills: [], notities: null });
  assert.equal(u.res, 'RV');
  assert.equal(u.fame.aanv, 6);
  assert.equal(cb.fameOpbouw(u.fame, 'aanv', u.res), 'TP 5 · Balancing Modifier +1');
  assert.equal(cb.fameOpbouw(u.fame, 'verd', u.res), 'TP 1 · Balancing Modifier -1 · defender +1');
  assert.equal(cb.questFoutTekst(u.quests[0]), 'Quest not completed (Captured Colours): needs at least 2 (you reported 1).');
  assert.equal(u.quests[1].ok, true);
  assert.equal(u.quests[1].goud, 9);
});

test('C3: challenge-Fame (echt TEST-antwoord) en een oude server zonder velden', async () => {
  antwoord = { towc_battle_resultaat: { ok: true, res: 'CV', type: 'challenge', battle: 2068, verwerkt: true, quests: [],
    fame: { aanv: 1, verd: 0, aanvaller: 'c5', challenge: true, verdediger: 'c11' } } };
  const u = await cb.reportBattleResult('X', { winnaar: null, vp: {}, kills: [], notities: null });
  assert.equal(u.fame.challenge, true);
  assert.equal(cb.fameOpbouw(u.fame, 'aanv', u.res), 'Crushing Victory in a challenge');
  antwoord = { towc_battle_resultaat: { ok: true, battle: 1, verwerkt: true } };
  const oud = await cb.reportBattleResult('X', { winnaar: null, vp: {}, kills: [], notities: null });
  assert.equal(oud.fame, null);
  assert.deepEqual(oud.quests, []);
});
