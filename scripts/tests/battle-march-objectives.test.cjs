// Battle March-objectives op het pre-game-scherm (05-10-2026). Zie src/lib/battleMarchObjectives.ts.
// Twee dingen worden hier vastgezet:
//   1. `describePlacement` geeft EXACT de zinnen die je aan tafel kunt nameten.
//   2. Elke regeltekst in de briefings is LETTERLIJK de tekst van tow.whfb.app — geen parafrase. Dat
//      checken we tegen een canonieke kopie hieronder; wie later "even inkort", ziet deze test rood.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, f);
const bm = require(path.join(root, 'src/lib/battleMarchObjectives.ts'));

// CANONIEK: letterlijk van tow.whfb.app, "Battle March: General's Companion" (p. 24, 25, 27), met
// alleen krullende aanhalingstekens recht gemaakt. NIET aanpassen om een test groen te krijgen.
const CANON = [
  'Once terrain has been placed but before armies are deployed, one of the players rolls on the table below:',
  'Represented by a number of miniature dioramas, each occupying a 40mm round base, treasure troves are a type of battlefield decoration. They can represent many things that the armies are keen to obtain, such as piles of loot, supplies of vittles, or caches of weapons. They may even represent such things as wounded comrades, messengers or spies carrying vital information.',
  'Treasure troves are placed as shown on the maps opposite, but cannot be placed within 3" of a terrain feature or straddling a low linear obstacle. If necessary, move the terrain by the smallest possible amount to allow the treasure trove to be placed.',
  'A strategic landmark is a terrain feature occupying a 100mm round base. All strategic landmarks are impassable terrain over which no line of sight can be drawn.',
  'A strategic landmark must be placed in the centre of the battlefield, but cannot be placed within 3" of a terrain feature or straddling a low linear obstacle. If necessary, move the terrain by the smallest possible amount to allow the strategic landmark to be placed.',
  "Once a strategic landmark has been placed on the battlefield, before armies are deployed, one of the players rolls on the table below. If, at the end of either player's turn, a unit was determined to be in control of the strategic landmark, that unit benefits from the landmark's unusual property until the end of the next turn:",
  'D6 | Unusual Property',
  '1-2 | Magic in the Air: The Winds of Magic flow unusually around this particular strategic landmark. The controlling unit gains the Magic Resistance (-2) special rule.',
  '3-4 | Righteous Zeal: For unknown reasons, those that hold this strategic landmark feel compelled to drive away interlopers. The controlling unit gains the Frenzy special rule.',
  '5-6 | "We\'re Not Leaving": Having gained control of this strategic landmark, its defenders will stubbornly refuse to give it up. The controlling unit gains the Stubborn special rule.',
  "Games of Battle March represent small forces, often scouting ahead of a much larger army, as they attempt to secure resources and capture vital landmarks. To represent this, at the end of each player's turn, an objective, be it a treasure trove or a strategic landmark, can be controlled by a single unit. In order to control an objective, a unit must be within 3\" of it and have a Unit Strength of 5 or more. Units that are fleeing or that have succumbed to Stupidity cannot control an objective.",
  "If two or more eligible units are within 3\" of an objective, the closest unit controls it. If two or more eligible units are equally close to an objective, the unit with the higher Unit Strength controls it. However, should both have the same Unit Strength, the objective is 'contested' and neither unit controls it.",
  "Treasure Troves: At the end of each player's turn, a player wins a bonus of 10 Victory Points for each treasure trove they control.",
  "Strategic Landmarks: At the end of each player's turn, if one player controls a strategic landmark, they win a bonus of 25 Victory Points.",
  'All games of Battle March last for five rounds, until one side concedes, or until the agreed time limit is reached.',
  'Once deployment is complete, the winner of a roll-off chooses which player will take the first turn.',
].join('\n');

/** Een regeltekst is pas letterlijk als hij als geheel in ÉÉN canonieke regel voorkomt. */
const isVerbatim = (t) => typeof t === 'string' && t.length > 0 && CANON.split('\n').some((regel) => regel.includes(t));

const L = { quarters: false, baggage: [] };
const TROVES3 = { ...L, objectives: [{ n: 1, x: 13, y: 18 }, { n: 2, x: 24, y: 18 }, { n: 3, x: 35, y: 18 }] };
const TROVES2 = { ...L, objectives: [{ n: 1, x: 16.5, y: 18 }, { n: 2, x: 31.5, y: 18 }] };
const LANDMARK = { ...L, specialFeature: { x: 24, y: 18 }, objectives: [] };

test('describePlacement: de vier acceptatiezinnen', () => {
  assert.equal(bm.describePlacement([{ x: 13, y: 18 }, { x: 24, y: 18 }, { x: 35, y: 18 }], 48, 36),
    'On the centre line: one in the middle of the table, and one 11″ to either side of it (13″ in from each short edge).');
  assert.equal(bm.describePlacement([{ x: 16.5, y: 18 }, { x: 31.5, y: 18 }], 48, 36),
    'On the centre line, 16½″ in from each short edge (15″ apart).');
  assert.equal(bm.describePlacement([{ x: 24, y: 18 }], 48, 36), 'In the centre of the table.');
  assert.equal(bm.describePlacement([], 48, 36), null);
});

test('describePlacement: ongesorteerde punten vinden hetzelfde patroon', () => {
  assert.equal(bm.describePlacement([{ x: 35, y: 18 }, { x: 13, y: 18 }, { x: 24, y: 18 }], 48, 36),
    'On the centre line: one in the middle of the table, and one 11″ to either side of it (13″ in from each short edge).');
  assert.equal(bm.describePlacement([{ x: 31.5, y: 18 }, { x: 16.5, y: 18 }], 48, 36),
    'On the centre line, 16½″ in from each short edge (15″ apart).');
});

test('describePlacement: andere tafelmaat (44×30) rekent mee', () => {
  assert.equal(bm.describePlacement([{ x: 11, y: 15 }, { x: 22, y: 15 }, { x: 33, y: 15 }], 44, 30),
    'On the centre line: one in the middle of the table, and one 11″ to either side of it (11″ in from each short edge).');
});

test('describePlacement: asymmetrisch → precieze terugval per punt, in volgorde', () => {
  assert.equal(bm.describePlacement([{ x: 10, y: 9 }, { x: 30, y: 18 }], 48, 36),
    '1: 10″ from the left edge, 9″ from the top edge; 2: 30″ from the left edge, 18″ from the top edge (left and top as drawn on the map).');
  // Op de middellijn maar niet symmetrisch.
  assert.equal(bm.describePlacement([{ x: 12, y: 18 }, { x: 31.5, y: 18 }], 48, 36),
    '1: 12″ from the left edge, 18″ from the top edge; 2: 31½″ from the left edge, 18″ from the top edge (left and top as drawn on the map).');
  // Drie punten, midden klopt, buitenste niet even ver.
  assert.match(bm.describePlacement([{ x: 13, y: 18 }, { x: 24, y: 18 }, { x: 36, y: 18 }], 48, 36), /^1: 13″ from the left edge/);
});

test('describePlacement: één punt buiten het midden krijgt geen nummer', () => {
  assert.equal(bm.describePlacement([{ x: 24, y: 12 }], 48, 36),
    '24″ from the left edge, 12″ from the top edge (left and top as drawn on the map).');
});

test('describePlacement: breuken worden nooit stilletjes afgerond', () => {
  assert.equal(bm.describePlacement([{ x: 0.5, y: 13.25 }], 48, 36),
    '½″ from the left edge, 13.25″ from the top edge (left and top as drawn on the map).');
  assert.equal(bm.describePlacement([{ x: 12.3, y: 18 }], 48, 36),
    '12.3″ from the left edge, 18″ from the top edge (left and top as drawn on the map).');
  // Drijvende-komma-ruis binnen de tolerantie telt als het patroon.
  assert.equal(bm.describePlacement([{ x: 24.004, y: 17.996 }], 48, 36), 'In the centre of the table.');
});

test('describePlacement: onbruikbare tafel of punten → null', () => {
  assert.equal(bm.describePlacement([{ x: 24, y: 18 }], 0, 36), null);
  assert.equal(bm.describePlacement([{ x: 24, y: 18 }], 48, -1), null);
  assert.equal(bm.describePlacement([{ x: 24, y: 18 }], NaN, 36), null);
  assert.equal(bm.describePlacement([{ x: NaN, y: 18 }], 48, 36), null);
});

test('describePlacement: vierkante/staande tafel → geen "korte rand"-zin', () => {
  const s = bm.describePlacement([{ x: 16.5, y: 24 }, { x: 31.5, y: 24 }], 48, 48);
  assert.doesNotMatch(s, /short edge/);
  assert.match(s, /^1: 16½″ from the left edge/);
});

test('objectiveBriefings: bm-troves-3', () => {
  const [b] = bm.objectiveBriefings(['bm-troves-3'], TROVES3, 48, 36);
  assert.equal(b.id, 'bm-troves-3');
  assert.equal(b.title, 'Treasure troves (3)');
  assert.equal(b.what, '3 treasure troves, each on a 40mm round base.');
  assert.equal(b.placement, 'On the centre line: one in the middle of the table, and one 11″ to either side of it (13″ in from each short edge).');
  assert.deepEqual(b.short.map((r) => r.heading), ['Placement', 'Control', 'Victory points']);
  assert.ok(b.full.length >= 4);
  assert.equal(b.table, undefined);
  assert.match(b.source, /^Battle March: General's Companion, p\. 24–25, 27$/);
});

test('objectiveBriefings: bm-troves-2', () => {
  const [b] = bm.objectiveBriefings(['bm-troves-2'], TROVES2, 48, 36);
  assert.equal(b.title, 'Treasure troves (2)');
  assert.equal(b.what, '2 treasure troves, each on a 40mm round base.');
  assert.equal(b.placement, 'On the centre line, 16½″ in from each short edge (15″ apart).');
  assert.equal(b.short.length, 3);
});

test('objectiveBriefings: bm-landmark', () => {
  const [b] = bm.objectiveBriefings(['bm-landmark'], LANDMARK, 48, 36);
  assert.equal(b.title, 'Strategic landmark');
  assert.equal(b.what, '1 strategic landmark, on a 100mm round base.');
  assert.equal(b.placement, 'In the centre of the table.');
  // De tabel volgt op het laatste blok, want die zin verwijst naar "the table below".
  assert.deepEqual(b.short.map((r) => r.heading), ['Placement', 'Control', 'Victory points', 'Unusual property']);
  assert.match(b.short[b.short.length - 1].text, /rolls on the table below\./);
  assert.match(b.full[b.full.length - 1].text, /rolls on the table below\./);
  assert.equal(b.table.heading, 'Unusual Properties Table');
  assert.deepEqual(b.table.columns, ['D6', 'Unusual Property']);
  assert.deepEqual(b.table.rows.map((r) => r[0]), ['1-2', '3-4', '5-6']);
  assert.match(b.source, /p\. 25, 27$/);
});

test('objectiveBriefings: onbekend id → kale kaart zonder regeltekst', () => {
  const [a, c] = bm.objectiveBriefings(['strategic-2', 'domination'], null, 48, 36);
  assert.deepEqual(a, { id: 'strategic-2', title: 'Strategic 2', what: '', placement: null, short: [], full: [], source: '' });
  assert.equal(c.title, 'Domination');
});

test('objectiveBriefings: zonder coördinaten of tafelmaat → placement null, rest blijft', () => {
  const [a] = bm.objectiveBriefings(['bm-troves-3'], null, 48, 36);
  assert.equal(a.placement, null);
  assert.equal(a.title, 'Treasure troves (3)');
  const [b] = bm.objectiveBriefings(['bm-landmark'], LANDMARK, null, null);
  assert.equal(b.placement, null);
});

test('objectiveBriefings: id en aantal coördinaten wijken af → titel uit id, plaats uit coördinaten', () => {
  const [b] = bm.objectiveBriefings(['bm-troves-3'], TROVES2, 48, 36);
  assert.equal(b.title, 'Treasure troves (3)');
  assert.equal(b.placement, 'On the centre line, 16½″ in from each short edge (15″ apart).');
});

test('objectiveBriefings: troves volgen het kaartnummer, niet de array-volgorde', () => {
  const lay = { ...L, objectives: [{ n: 2, x: 30, y: 10 }, { n: 1, x: 10, y: 9 }] };
  const [b] = bm.objectiveBriefings(['bm-troves-2'], lay, 48, 36);
  assert.match(b.placement, /^1: 10″ from the left edge, 9″ from the top edge; 2: 30″/);
});

test('LETTERLIJK: elke regeltekst in de drie bekende briefings staat in de canonieke tekst', () => {
  const alle = bm.objectiveBriefings(['bm-troves-2', 'bm-troves-3', 'bm-landmark'], { ...TROVES3, specialFeature: { x: 24, y: 18 } }, 48, 36);
  const fouten = [];
  for (const b of alle) {
    for (const r of [...b.short, ...b.full]) if (!isVerbatim(r.text)) fouten.push(`${b.id} / ${r.heading}: ${r.text}`);
    if (b.table) {
      if (!isVerbatim(b.table.columns.join(' | '))) fouten.push(`${b.id} / table columns`);
      for (const row of b.table.rows) if (!isVerbatim(row.join(' | '))) fouten.push(`${b.id} / table row ${row[0]}`);
    }
  }
  assert.deepEqual(fouten, []);
});

test('LETTERLIJK: de losse Game Length- en First Turn-zinnen voor het scherm', () => {
  assert.ok(isVerbatim(bm.BM_GAME_LENGTH));
  assert.ok(isVerbatim(bm.BM_FIRST_TURN));
});

test('LETTERLIJK: de korte controle-eis is het staartstuk van de volledige alinea', () => {
  assert.ok(bm.BM_CONTROL_FULL_1.endsWith(bm.BM_CONTROL_SHORT));
});
