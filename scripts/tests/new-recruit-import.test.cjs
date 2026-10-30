// NEW RECRUIT-IMPORT (30-10-2026). Joost krijgt op een toernooi vlak voor elke 2v2-battle de lijsten
// van zijn tegenstanders uit New Recruit (newrecruit.eu). Die tekst moet in OWC net zo speelbaar zijn als
// een eigen lijst. Vastgezet:
//   1. herkenning (New Recruit vs Old World Builder) en de kop (factie, compositie, regel, punten);
//   2. de units: aantallen over de `•`-regels, command, komma's binnen haakjes, sub-items apart;
//   3. de kop → OWC-leger + compositie + regel (Dark Elves · Renegades v2.0 → dark-elves · de-renegade-v2);
//   4. de volledige omzetting tegen de echte Dark Elves-catalogus + Renegade V2-overlay: elke unit,
//      General / Level 2 Wizard / Battle Magic / Manticore / magic items / command, en 1000 punten;
//   5. een Old World Builder-export leest nog precies zoals voorheen.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, f);
const nrp = require(path.join(root, 'src/lib/newRecruitParser.ts'));
const ap = require(path.join(root, 'src/lib/armyParser.ts'));
const imp = require(path.join(root, 'src/lib/owbImport.ts'));
const ov = require(path.join(root, 'src/lib/overlays.ts'));
const ow = require(path.join(root, 'src/lib/owbBuilder.ts'));
const bt = require(path.join(root, 'src/lib/builderToArmy.ts'));
const read = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));

// Letterlijk zoals New Recruit hem exporteert (Joost, 30-10-2026).
const NR_SAMPLE = `Dark Elves - Renegades v2.0 - Unnamed list - [1000 pts]

# ++ Combined Arms + Grand Melee ++ [1000 pts]
## Characters [385 pts]
High Beastmaster [246 pts]: Hand Weapon, Whip, Heavy Armour [3 pts], Cavalry Spear [2 pts], Shield [2 pts], Talisman Of Protection [30 pts], General, Sea Dragon Cloak [4 pts], Manticore [130 pts] (Wicked claws, Heavy Armour)
Sorceress [139 pts]: Hand Weapon, Wizard Level 2 [30 pts], Battle Magic, Tome Of Furion [15 pts], Dark Steed [14 pts] (Hand Weapon)

## Core [268 pts]
Dark Elf Crossbowmen [110 pts]:
• 10x Repeater Crossbowman [11 pts]: Hand Weapon, Repeater Crossbow, Light Armour, Shield [1 pts]
Dark Riders [158 pts]:
• 4x Dark Rider [20 pts]: Hand Weapon, Cavalry Spear, Light Armour, Repeater Crossbow [2 pts], Shield [1 pts], Scouts [1 pts], Dark Steed (Hand Weapon)
• 1x Dark Rider [20 pts]: Hand Weapon, Cavalry Spear, Light Armour, Repeater Crossbow [2 pts], Shield [1 pts], Scouts [1 pts], Musician [6 pts], Dark Steed (Hand Weapon)
• 1x Dark Rider [20 pts]: Hand Weapon, Cavalry Spear, Light Armour, Repeater Crossbow [2 pts], Shield [1 pts], Scouts [1 pts], Standard Bearer [6 pts], Dark Steed (Hand Weapon)
• 1x Dark Rider [20 pts]: Hand Weapon, Cavalry Spear, Light Armour, Repeater Crossbow [2 pts], Shield [1 pts], Scouts [1 pts], Herald [6 pts], Dark Steed (Hand Weapon)

## Special [182 pts]
Cold One Knights [182 pts]:
• 4x Cold One Knight [35 pts]: Hand Weapon, Lance, Shield, Full Plate Armour [4 pts], Cold One (Hand Weapon)
• 1x Cold One Knight [35 pts]: Hand Weapon, Lance, Shield, Full Plate Armour [4 pts], Dread Knight [7 pts], Cold One (Hand Weapon)

## Rare [165 pts]
War Hydra [165 pts]: Wicked claws, Serrated Maw, Fiery breath, 2x Beastmaster Handlers (Hand Weapon, Whip)

Created with newrecruit.eu v37.6
`;

// Een Old World Builder-export in het formaat uit armyParser.ts.
const OWB_SAMPLE = `===
Dark Elves allround [295 pts]
Warhammer: The Old World, Dark Elves, Open War
===

++ Characters [185 pts] ++

Supreme Sorceress [185 pts]
- Hand weapon
- Wizard [Level 3 Wizard]
Special Rules: Elven Reflexes, Eternal Hatred, Lore of Naggaroth

[Supreme Sorceress] M(5) WS(4) BS(4) S(3) T(3) W(3) I(5) A(2) Ld(8)
[Dark Pegasus] M(8) WS(3) BS(-) S(4) T(-) W((+1)) I(4) A(3) Ld(-)

++ Core [110 pts] ++

10 Repeater Crossbowmen [110 pts]
- Hand weapons, Repeater crossbows
- Light armour
- Shields
Special Rules: Close Order, Elven Reflexes

---
Created with "Old World Builder"
`;

const NR_OWC_POINTS = { 'High Beastmaster': 246, Sorceress: 139, 'Dark Elf Crossbowmen': 110, 'Dark Riders': 158, 'Cold One Knights': 182, 'War Hydra': 165 };

test('herkenning: New Recruit wel, Old World Builder en leeg niet', () => {
  assert.equal(nrp.isNewRecruitText(NR_SAMPLE), true);
  // Ook zonder de voettekst (iemand knipt hem weg).
  assert.equal(nrp.isNewRecruitText(NR_SAMPLE.replace(/Created with.*$/m, '')), true);
  assert.equal(nrp.isNewRecruitText(OWB_SAMPLE), false);
  assert.equal(nrp.isNewRecruitText(''), false);
});

test('kop: factie, compositie, naam, punten en compositie-regel', () => {
  const { header } = nrp.parseNewRecruit(NR_SAMPLE);
  assert.deepEqual(header, { faction: 'Dark Elves', composition: 'Renegades v2.0', name: 'Unnamed list', points: 1000, ruleText: 'Combined Arms + Grand Melee' });
  assert.equal(nrp.resolveCompositionRule(header.ruleText), 'combined-arms-grand-melee');
  assert.equal(nrp.resolveCompositionRule('Open War'), 'open-war');
  assert.equal(nrp.resolveCompositionRule('Grand Melee'), 'grand-melee');
  assert.equal(nrp.resolveCompositionRule(''), undefined);
});

test('units: 6 stuks, aantallen opgeteld over de modelregels, command op hun eigen regel', () => {
  const { units } = nrp.parseNewRecruit(NR_SAMPLE);
  assert.deepEqual(units.map((u) => [u.name, u.count, u.points, u.category]), [
    ['High Beastmaster', 1, 246, 'Characters'],
    ['Sorceress', 1, 139, 'Characters'],
    ['Dark Elf Crossbowmen', 10, 110, 'Core'],
    ['Dark Riders', 7, 158, 'Core'],
    ['Cold One Knights', 5, 182, 'Special'],
    ['War Hydra', 1, 165, 'Rare'],
  ]);
  const by = Object.fromEntries(units.map((u) => [u.name, u]));
  for (const c of ['Musician', 'Standard Bearer', 'Herald']) assert(by['Dark Riders'].options.includes(c), c);
  assert.equal(by['Dark Riders'].itemCounts.musician, 1);
  assert.equal(by['Dark Riders'].itemCounts.scouts, 7);
  assert(by['Cold One Knights'].options.includes('Dread Knight'));
  assert.equal(by['Dark Elf Crossbowmen'].modelName, 'Repeater Crossbowman');
  // "[n pts]" is eraf, en een komma binnen haakjes splitst niet: de Manticore is één item, zijn
  // "(Wicked claws, Heavy Armour)" zijn sub-items en geen opties van de berijder.
  const hb = by['High Beastmaster'];
  assert.deepEqual(hb.options, ['Hand Weapon', 'Whip', 'Heavy Armour', 'Cavalry Spear', 'Shield', 'Talisman Of Protection', 'General', 'Sea Dragon Cloak', 'Manticore']);
  assert.deepEqual(hb.subOptions, ['Wicked claws', 'Heavy Armour']);
  assert.deepEqual(by['War Hydra'].options, ['Wicked claws', 'Serrated Maw', 'Fiery breath', '2x Beastmaster Handlers']);
});

test('parseArmyList accepteert New Recruit (elk bestaand plakpad)', () => {
  const army = ap.parseArmyList(NR_SAMPLE);
  assert.equal(army.faction, 'Dark Elves');
  assert.equal(army.composition, 'Renegades v2.0');
  assert.equal(army.points, 1000);
  assert.equal(army.name, 'Dark Elves', '"Unnamed list" wordt de factienaam');
  assert.deepEqual(army.units.map((u) => [u.name, u.count]), [
    ['High Beastmaster', null], ['Sorceress', null], ['Dark Elf Crossbowmen', 10], ['Dark Riders', 7], ['Cold One Knights', 5], ['War Hydra', null],
  ]);
  // De sub-items staan in de opties, achter de items.
  assert(army.units[0].options.includes('Wicked claws'));
});

const armies = read('public/owb/index.json').armies;
const meta = read('public/owb/the-old-world.json');
const compsByArmy = Object.fromEntries(meta.armies.map((a) => [a.id, [...a.armyComposition, ...ov.overlayCompsFor(a.id).filter((c) => !a.armyComposition.includes(c))]]));

test('kop → OWC-leger, compositie en regel; bij twijfel null', () => {
  const kop = nrp.parseNewRecruit(NR_SAMPLE).header;
  assert.deepEqual(nrp.resolveNewRecruitHeader(kop, armies, compsByArmy), { army: 'dark-elves', composition: 'de-renegade-v2', rule: 'combined-arms-grand-melee' });
  const h = (faction, composition, name = 'x') => nrp.resolveNewRecruitHeader({ faction, composition, name, points: 1000, ruleText: '' }, armies, compsByArmy);
  assert.deepEqual(h('Dark Elves', 'Grand Army'), { army: 'dark-elves', composition: 'dark-elves', rule: undefined });
  assert.equal(h('Dark Elves', 'Renegade Crowns').composition, 'de-renegade', 'zonder v2 is het de oude Renegade-lijst, niet het V2-pack');
  assert.equal(h('Orc & Goblin Tribes', 'Grand Army').army, 'orc-and-goblin-tribes');
  assert.deepEqual(h('Empire of Man', 'City-State of Nuln'), { army: 'empire-of-man', composition: 'city-state-of-nuln', rule: undefined });
  assert.equal(h('Space Marines', 'Grand Army').army, null);
  assert.equal(h('Dark Elves', 'Totally Unknown Host').composition, null);
  // Geen compositie in de kop → de Grand Army van het leger.
  assert.deepEqual(nrp.resolveNewRecruitHeader(nrp.parseNewRecruitHeader('Skaven - My list - [2000 pts]'), armies, compsByArmy), { army: 'skaven', composition: 'skaven', rule: undefined });
});

// ── De volledige omzetting tegen de echte catalogus ────────────────────────────────────────────
const overlay = read('public/renegade/de-renegade-v2.json');
const cat = ov.catalogueFor(read('public/owb/dark-elves.json'), overlay.id, overlay);
const items = ov.itemsFor(read('public/owb/magic-items.json'), overlay.id, overlay);
const armyItems = meta.armies.find((a) => a.id === 'dark-elves').items;
const rulesJson = read('public/rules.json');
const loreKeys = Object.keys(rulesJson.lores);
const result = imp.importOwbText(NR_SAMPLE, cat, items, armyItems, { loreKeys });
const entry = (unitId) => { const e = result.entries.find((x) => x.unitId === unitId); assert(e, unitId); return e; };
const labels = (e) => ow.loadoutLabels(ow.findUnit(cat, e.cat, e.unitId), e, items);
const pts = (e) => ow.entryPoints(ow.findUnit(cat, e.cat, e.unitId), e, items);

test('import: elke unit gevonden, op de juiste catalogus-unit en categorie', () => {
  assert.equal(result.source, 'newrecruit');
  assert.equal(result.matched, 6);
  assert.equal(result.total, 6);
  assert.deepEqual(result.unmatched, []);
  assert.deepEqual(result.entries.map((e) => [e.cat, e.unitId, e.count]), [
    ['characters', 'high-beastmaster', 1],
    ['characters', 'sorceress', 1],
    ['core', 'repeater-crossbowmen', 10],
    ['core', 'dark-riders', 7],
    ['special', 'cold-one-knights', 5],
    ['rare', 'war-hydra', 1], // staat ook in Special; de export zegt Rare
  ]);
  assert.deepEqual(result.header, { points: 1000, rule: 'combined-arms-grand-melee', faction: 'Dark Elves', composition: 'Renegades v2.0' });
  assert.equal(result.header.name, undefined, '"Unnamed list" → de aanroeper houdt zijn eigen naam');
});

test('import: High Beastmaster — General, Manticore (Renegade), uitrusting, Talisman, Sea Dragon Cloak', () => {
  const l = labels(entry('high-beastmaster'));
  for (const n of ['General', 'Cavalry spear', 'Heavy armour', 'Shield', 'Sea Dragon Cloak', 'Talisman of Protection']) assert(l.includes(n), n);
  assert(l.some((n) => /^Manticore/.test(n)), 'Manticore');
  const u = ow.findUnit(cat, 'characters', 'high-beastmaster');
  const mount = u.mounts[ow.selectedMountIndex(u, entry('high-beastmaster'))];
  assert(!mount.hidden, 'de zichtbare (Renegade) Manticore, niet de verborgen variant');
  // De "(Heavy Armour)" van de Manticore is niet als extra optie op de berijder beland.
  assert.equal(entry('high-beastmaster').opts.filter((k) => k.startsWith('armor/')).length, 1);
});

test('import: Sorceress — Level 2 Wizard, Battle Magic als lore, Tome of Furion, Dark Steed', () => {
  const e = entry('sorceress');
  const l = labels(e);
  assert(l.includes('Level 2 Wizard'));
  assert(l.includes('Dark Steed'));
  assert(l.some((n) => /tome of furion/i.test(n)));
  assert.equal(ow.wizardLevelOf(ow.findUnit(cat, 'characters', 'sorceress'), e), 2);
  assert.deepEqual(e.lores, ['battle-magic']);
  assert(rulesJson.lores['battle-magic'], 'de lore-sleutel bestaat in de lore-data');
});

test('import: Dark Riders en Cold One Knights — command, Scouts, repeater crossbows, full plate', () => {
  const dr = labels(entry('dark-riders'));
  for (const n of ['Musician', 'Standard bearer', 'Herald (champion)', 'Scouts', 'Repeater crossbows', 'Shields']) assert(dr.includes(n), n);
  const ck = labels(entry('cold-one-knights'));
  assert(ck.includes('Dread Knight (champion)'));
  assert(ck.includes('Full plate armour'));
  assert(!ck.includes('Heavy armour'));
});

test('import: de punten kloppen per unit en in totaal met New Recruit (1000)', () => {
  const nrNames = nrp.parseNewRecruit(NR_SAMPLE).units.map((u) => u.name);
  result.entries.forEach((e, i) => assert.equal(pts(e), NR_OWC_POINTS[nrNames[i]], nrNames[i]));
  const list = { name: 'NR', composition: overlay.id, rule: result.header.rule, points: 1000, entries: result.entries };
  assert.equal(bt.listTotal(list, cat, items), 1000);
});

test('omzetting naar een speel-leger: profielen, rijdier-tab, magic items en lore komen mee', () => {
  const stats = read('public/owb/rules-index.json');
  const list = { name: 'NR', army: 'dark-elves', composition: overlay.id, rule: result.header.rule, points: 1000, entries: result.entries };
  const army = bt.builderListToArmy(list, cat, (n) => ov.overlayStatsFor(stats, n, overlay), {
    faction: 'Dark Elves', composition: 'Renegade V2', overlayId: overlay.id, itemsData: items, armyItemLists: armyItems,
    mountText: ov.applyOverlayMountText(read('public/owb/mount-text.json'), overlay), factionNames: armies.map((a) => a.name),
  });
  assert.equal(army.points, 1000);
  assert.equal(army.units.length, 6);
  const hb = army.units.find((u) => u.datasheet === 'High Beastmaster');
  assert(hb.profiles.length > 0, 'statline');
  assert(hb.mounts && hb.mounts.some((m) => /Manticore/.test(m.name)), 'Manticore-tab');
  assert(hb.magicItems && hb.magicItems.some((m) => m.name === 'Talisman of Protection'));
  assert(hb.options.some((o) => /^Manticore/.test(o)), 'mount in de loadout (Renegade-tag niet weggefilterd)');
  const so = army.units.find((u) => u.datasheet === 'Sorceress');
  assert.deepEqual(so.lores, ['battle-magic']);
  assert(so.magicItems && so.magicItems.some((m) => /Tome of Furion/i.test(m.name)));
});

test('Old World Builder-export leest nog precies zoals voorheen', () => {
  const army = ap.parseArmyList(OWB_SAMPLE);
  assert.deepEqual({ ...army, units: undefined, raw: undefined }, {
    name: 'Dark Elves allround', points: 295, system: 'Warhammer: The Old World', faction: 'Dark Elves', composition: 'Open War', units: undefined, raw: undefined,
  });
  assert.deepEqual(army.units, [
    {
      id: '0', name: 'Supreme Sorceress', count: null, points: 185, category: 'Characters',
      options: ['Hand weapon', 'Wizard [Level 3 Wizard]'],
      specialRules: ['Elven Reflexes', 'Eternal Hatred', 'Lore of Naggaroth'],
      profiles: [
        { label: 'Supreme Sorceress', stats: [['M', '5'], ['WS', '4'], ['BS', '4'], ['S', '3'], ['T', '3'], ['W', '3'], ['I', '5'], ['A', '2'], ['Ld', '8']].map(([k, v]) => ({ k, v })) },
        { label: 'Dark Pegasus', stats: [['M', '8'], ['WS', '3'], ['BS', '-'], ['S', '4'], ['T', '-'], ['W', '(+1)'], ['I', '4'], ['A', '3'], ['Ld', '-']].map(([k, v]) => ({ k, v })) },
      ],
    },
    {
      id: '1', name: 'Repeater Crossbowmen', count: 10, points: 110, category: 'Core',
      options: ['Hand weapons, Repeater crossbows', 'Light armour', 'Shields'],
      specialRules: ['Close Order', 'Elven Reflexes'],
      profiles: [],
    },
  ]);
  // En de import tegen de Grand Army: zelfde vorm als altijd, nu met `source: 'owb'`.
  const grand = ov.catalogueFor(read('public/owb/dark-elves.json'), 'dark-elves', null);
  const r = imp.importOwbText(OWB_SAMPLE, grand, read('public/owb/magic-items.json'), armyItems);
  assert.equal(r.source, 'owb');
  assert.equal(r.matched, 2);
  assert.deepEqual(r.header, { name: 'Dark Elves allround', points: 295, rule: 'open-war' });
  assert.deepEqual(r.entries.map((e) => [e.unitId, e.count, e.lores]), [['supreme-sorceress', 1, undefined], ['repeater-crossbowmen', 10, undefined]]);
});
