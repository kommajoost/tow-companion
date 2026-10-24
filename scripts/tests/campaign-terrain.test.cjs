// Campagne-terrein en -bord in de Companion (18-10-2026, herzien 22-10-2026 voor de Act 3+-setups).
// Zie src/lib/campaignTerrain.ts, src/lib/terrainPlacement.ts, src/lib/campaignScenario.ts en
// src/components/game/CampaignBoard.tsx. Vastgezet:
//   1. De parser leest de velden van nu (byDefender) en van vroeger (preplaced, side) zonder te breken.
//   2. Namen, kenmerken en effectregels van de soorten (ook rocky-ground, outcrop, bog, scree).
//   3. De plaatsingstekst in drie stappen: scenario-stukken, de muur van Breakthrough, dan om de beurt.
//      Battle March houdt de roll-off; oude sheets met een vooraf geplaatst gebouw hun eigen zin.
//      Geen gedachtestreepjes in de spelerstekst.
//   4. Wie de eerste beurt heeft, gelezen uit de TEKST van de sheet (niet uit het id).
//   5. Het bord tekent de nieuwe opstellingen (storage buildings, de Forge, maatlijnen, labelAt, Baggage Train) en
//      oude sheets nog steeds. De sheets in scripts/fixtures/campaign-sheets-act3.json zijn gemaakt
//      met de echte generator van de campagne (site/src/data/battlefieldDriver.ts, 22-10-2026).
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

const terrain = require(path.join(root, 'src/lib/campaignTerrain.ts'));
const placement = require(path.join(root, 'src/lib/terrainPlacement.ts'));
const scen = require(path.join(root, 'src/lib/campaignScenario.ts'));
const SHEETS = require(path.join(root, 'scripts/fixtures/campaign-sheets-act3.json'));

// Een sheet van nu: Breakthrough op de vlakte, met de muur van de verdediger (byDefender).
const NU = SHEETS['ad-breakthrough@3'].terrain;
// Een sheet van 18-10 t/m 20-10: gebouw en muur vooraf op tafel.
const GEBOUW = [
  { id: 'a', type: 'building', x: 33, y: 10, w: 6, h: 4, side: 'defender', preplaced: true, impassable: true },
  { id: 'b', type: 'obstacle', x: 32, y: 15, w: 8, h: 1, side: 'defender', preplaced: true, obstacle: true },
  { id: 'c', type: 'hill', x: 9, y: 10, w: 12, h: 9 },
];
// Een oude sheet: rivier-strook (marsh over de hele diepte) en een strongpunt-heuvel met `side`.
const OUD = [
  { id: 'r', type: 'marsh', x: 22, y: 0, w: 4, h: 48, dangerous: true },
  { id: 's', type: 'hill', x: 20, y: 10, w: 8, h: 5, side: 'defender' },
  { id: 't', type: 'field', x: 3, y: 30, w: 6, h: 6, difficult: true },
  { type: 'forest', x: 1, y: 1, w: 4, h: 4 },
  { x: 1, y: 1, w: 4, h: 4 },
  'rommel',
];

test('parser: byDefender van nu, preplaced en side van vroeger', () => {
  const n = terrain.parseSheetTerrain(NU);
  assert.equal(n.filter((t) => t.byDefender).length, 1, 'Breakthrough: één muur van de verdediger');
  assert.equal(n.find((t) => t.byDefender).type, 'obstacle');
  assert.equal(n.filter((t) => t.preplaced).length, 0);
  const g = terrain.parseSheetTerrain(GEBOUW);
  assert.equal(g.filter((t) => t.preplaced).length, 2);
  assert.equal(g[0].impassable, true);
  const o = terrain.parseSheetTerrain(OUD);
  assert.equal(o.length, 4, 'stuk zonder type en rommel vallen weg');
  assert.equal(o[1].side, 'defender');
  assert.deepEqual(terrain.parseSheetTerrain(undefined), []);
  assert.deepEqual(terrain.parseSheetTerrain({}), []);
});

test('legenda en effect: de soorten van de campagne', () => {
  const L = (t) => terrain.terrainLegend(t);
  assert.equal(L({ type: 'outcrop', impassable: true }), 'Rocky outcrop · impassable');
  assert.equal(L({ type: 'outcrop' }), 'Rocky outcrop · impassable', 'zonder vlag: de default van het type');
  assert.equal(L({ type: 'rocky-ground', difficult: true }), 'Rocky ground · difficult');
  assert.equal(L({ type: 'bog', dangerous: true }), 'Bog · dangerous');
  assert.equal(L({ type: 'scree', dangerous: true }), 'Scree slope · dangerous');
  assert.equal(L({ type: 'building', impassable: true }), 'Building · impassable');
  assert.equal(L({ type: 'obstacle', obstacle: true }), 'Low wall · obstacle');
  assert.equal(L({ type: 'marsh', difficult: true }), 'Marsh · difficult');
  assert.equal(L({ type: 'wood', difficult: true }), 'Woods · difficult');
  assert.equal(L({ type: 'hill' }), 'Hill');
  assert.equal(L({ type: 'onbekend_stuk' }), 'Onbekend stuk');

  const E = terrain.TERRAIN_EFFECT;
  assert.equal(terrain.terrainEffect({ type: 'wood', difficult: true }), E.wood, 'een bos heeft z\'n eigen regel');
  assert.equal(terrain.terrainEffect({ type: 'hill' }), E.hill);
  assert.equal(terrain.terrainEffect({ type: 'bog', dangerous: true }), E.dangerous);
  assert.equal(terrain.terrainEffect({ type: 'outcrop' }), E.impassable);
  assert.equal(terrain.terrainEffect({ type: 'obstacle', obstacle: true }), E.obstacle);
  assert.equal(terrain.terrainEffect({ type: 'field', difficult: true }), E.difficult);
  assert.equal(terrain.terrainEffect({ type: 'onbekend' }), null);
  // Elke soort van de generator heeft een eigen kleur (geen neutrale terugval).
  const neutraal = terrain.terrainStyle('iets-onbekends');
  for (const t of ['rocky-ground', 'outcrop', 'bog', 'scree', 'hill', 'wood', 'field', 'marsh', 'obstacle']) {
    assert.notDeepEqual(terrain.terrainStyle(t), neutraal, `kleur voor ${t}`);
  }
  // Alle soorten die de echte generator in de fixtures maakt, hebben een naam (geen pretty-terugval).
  const BEKEND = ['Hill', 'Woods', 'Field', 'Low wall', 'Rocky ground', 'Rocky outcrop', 'Bog', 'Scree slope', 'Marsh'];
  const soorten = new Set(Object.values(SHEETS).flatMap((s) => s.terrain.map((t) => t.type)));
  for (const t of soorten) assert.ok(BEKEND.includes(terrain.terrainName(t)), `naam voor ${t}: ${terrain.terrainName(t)}`);
});

test('plaatsingstekst: drie stappen vanaf Act 3, roll-off in Battle March', () => {
  const ad = placement.terrainPlacementShort({ battleMarch: false, building: false });
  const adB = placement.terrainPlacementShort({ battleMarch: false, building: true });
  const bm = placement.terrainPlacementShort({ battleMarch: true });
  assert.match(ad, /First the defender sets up the scenario pieces where the map shows them/);
  assert.match(ad, /in Breakthrough their low wall anywhere in their own half/);
  assert.match(ad, /Then the defender places the first terrain piece/);
  assert.doesNotMatch(ad, /Roll off/i);
  assert.doesNotMatch(ad, /building and its low wall/);
  assert.match(adB, /building and its low wall are already on the table/);
  assert.match(bm, /Roll off; the winner places first/);
  assert.doesNotMatch(bm, /defender/);
  const gen = placement.TERRAIN_PLACEMENT_SHORT;
  assert.match(gen, /From Act 3 the defender first sets up the scenario pieces/);
  assert.match(gen, /Battle March/);

  const stappen = placement.terrainPlacementSteps({ battleMarch: false, building: false });
  const titels = stappen.map((s) => s.title);
  assert.ok(titels.indexOf('Scenario pieces first') > 0);
  assert.ok(titels.indexOf("Breakthrough: the defender's low wall") > titels.indexOf('Scenario pieces first'));
  assert.ok(titels.indexOf('Who starts') > titels.indexOf("Breakthrough: the defender's low wall"), 'eerst scenario-stukken en muur, dan om de beurt');
  assert.match(stappen.find((s) => s.title === 'Who starts').text, /^The defender places the first terrain piece/);
  const stappenB = placement.terrainPlacementSteps({ battleMarch: false, building: true });
  assert.ok(stappenB.some((s) => s.title === 'Already on the table'));
  assert.ok(!stappenB.some((s) => s.title === 'Scenario pieces first'));
  const stappenBm = placement.terrainPlacementSteps({ battleMarch: true, building: false });
  assert.ok(!stappenBm.some((s) => s.title === 'Scenario pieces first'));
  assert.match(stappenBm.find((s) => s.title === 'Who starts').text, /roll off/);

  const alles = [gen, ad, adB, bm, ...placement.TERRAIN_PLACEMENT_STEPS.map((s) => s.text), ...stappen.map((s) => s.text), ...stappenB.map((s) => s.text), ...stappenBm.map((s) => s.text)];
  for (const t of alles) assert.doesNotMatch(t, /[–—]/, `gedachtestreepje in: ${t}`);
});

test('eerste beurt: uit de tekst van de sheet, niet uit het id', () => {
  assert.equal(scen.eersteBeurtVast(SHEETS['ad-breakthrough@3']), 'verdediger');
  assert.equal(scen.eersteBeurtVast(SHEETS['ad-loot-cart@3']), 'verdediger', 'Plunder: de verdediger begint');
  assert.equal(scen.eersteBeurtVast(SHEETS['ad-special-feature@4']), 'aanvaller', 'The Forge: de aanvaller begint');
  assert.equal(scen.eersteBeurtVast(SHEETS['ad-flank-attack@3']), null);
  assert.equal(scen.eersteBeurtVast(SHEETS['ad-command-control@3']), null);
  assert.equal(scen.eersteBeurtVast(SHEETS['ad-strategic@3']), null);
  // Een OUDE sheet met hetzelfde id (Loot Cart van vóór 20-10) houdt de roll-off.
  assert.equal(scen.eersteBeurtVast({ scenario: 'ad-loot-cart', deployNote: 'Standard 12″ zones. The Loot Cart stands just outside the defender\'s zone.' }), null);
  assert.equal(scen.eersteBeurtVast(null), null);
});

test('bord: storage buildings, de Forge, maatlijnen, labelAt, Baggage Train en oude sheets', () => {
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const { CampaignBoard, parseSheetLayout, parseSheetSecLayout } = require(path.join(root, 'src/components/game/CampaignBoard.tsx'));
  const teken = (s, extra = {}) => renderToStaticMarkup(React.createElement(CampaignBoard, {
    layout: parseSheetLayout(s.layout), secLayout: parseSheetSecLayout(s.secLayout), tableW: s.tableW, tableH: s.tableH, ...extra,
  }));

  const lootRaid = SHEETS['ad-loot-cart@3'];
  const lr = parseSheetLayout(lootRaid.layout);
  assert.equal(lr.buildings.length, 2);
  assert.equal(lr.dims.length, 1);
  const r = teken(lootRaid);
  assert.equal((r.match(/>Storage</g) || []).length, 2, 'twee storage buildings met naam');
  assert.match(r, />11″</, 'de inzet van de verdediger');

  const forge = SHEETS['ad-special-feature@3'];
  const lf = parseSheetLayout(forge.layout);
  assert.ok(lf.zones.every((z) => Array.isArray(z.labelAt)), 'labelAt gelezen');
  const f = teken(forge);
  assert.match(f, />The Forge</);
  assert.equal((f.match(/>24″</g) || []).length, 2, 'twee stralen');
  // Het label "Defender" staat op labelAt, niet op het zwaartepunt van de polygon (waar de Forge staat).
  const [lx, ly] = lf.zones.find((z) => z.label === 'Defender').labelAt;
  assert.ok(f.includes(`x="${lx}"`), 'zonelabel op labelAt');
  const forgeB = lf.buildings[0];
  assert.ok(lx < forgeB.x || lx > forgeB.x + forgeB.w || ly < forgeB.y || ly > forgeB.y + forgeB.h, 'label niet op de Forge');

  const flank = SHEETS['ad-flank-attack@3'];
  assert.match(teken(flank), />Baggage Train</);

  const sl = SHEETS['ad-strategic@3'];
  const sls = parseSheetSecLayout(sl.secLayout);
  assert.equal(sls.objectives.length, 3);
  assert.equal(sls.dims.length, 3);
  const s = teken(sl);
  assert.equal((s.match(/>12″</g) || []).length >= 2, true, 'afstand tussen de markers');
  assert.match(s, />4″</, '4″ voorbij de zone');

  // Breakthrough: de muur van de verdediger is GEEN vaste plek, dus niet op het bord.
  const bt = SHEETS['ad-breakthrough@3'];
  const b = renderToStaticMarkup(React.createElement(CampaignBoard, {
    layout: parseSheetLayout(bt.layout), secLayout: parseSheetSecLayout(bt.secLayout), tableW: bt.tableW, tableH: bt.tableH,
    terrain: terrain.parseSheetTerrain(bt.terrain).filter((t) => t.preplaced),
  }));
  assert.doesNotMatch(b, /Low wall/);

  // Oude sheets: gebouw vooraf, en een kaal oud bord.
  const layout = { zones: [{ x: 0, y: 0, w: 72, h: 12, label: 'Defender', kind: 'main' }, { x: 0, y: 36, w: 72, h: 12, label: 'Attacker', kind: 'main' }] };
  const kaal = renderToStaticMarkup(React.createElement(CampaignBoard, { layout, tableW: 72, tableH: 48 }));
  assert.doesNotMatch(kaal, /Building/);
  const metGebouw = renderToStaticMarkup(React.createElement(CampaignBoard, { layout, tableW: 72, tableH: 48, terrain: terrain.parseSheetTerrain(GEBOUW).filter((t) => t.preplaced) }));
  assert.match(metGebouw, /Building · impassable/);
  assert.match(metGebouw, /Low wall · obstacle/);
  const oud = renderToStaticMarkup(React.createElement(CampaignBoard, { layout, tableW: 48, tableH: 48, terrain: terrain.parseSheetTerrain(OUD) }));
  assert.match(oud, /Marsh · dangerous/);
});

test('objectives van de campagne: naam en uitleg, niet "Strategic 3 Def"', () => {
  const bm = require(path.join(root, 'src/lib/battleMarchObjectives.ts'));
  const [sl, lc] = bm.objectiveBriefings(['strategic-3-def', 'loot-cart'], null, 48, 48);
  assert.equal(sl.title, 'Strategic Locations');
  assert.match(sl.what, /4″ beyond the defender's deployment zone/);
  assert.equal(lc.title, 'Baggage Train');
  assert.match(lc.what, /wholly inside the defender's deployment zone/);
});
