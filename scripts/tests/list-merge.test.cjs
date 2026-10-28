// Lijsten-sync als driewegmerge (Joost 28-10-2026: "gewoon altijd dezelfde lijsten", op PC én
// telefoon, zonder "which copy?"-dialoog). Zie src/lib/listMerge.ts. Vastgezet:
//   1. Hier bewerkt / daar bewerkt → die bewerking komt door; allebei → de nieuwste updatedAt.
//   2. Verwijderd hier / daar → blijft weg aan beide kanten; maar een lijst die de ene kant weggooit
//      en de andere sindsdien bewerkt, komt terug (een bewerking verliezen is erger).
//   3. Nieuw aan beide kanten → beide blijven; eerste sync (geen basis) = alles samen, niets weg.
//   4. Herschikken (slepen) op één apparaat komt door; nieuwe lijsten landen naast hun buur.
//   5. Groepen gaan los van de lijsten door dezelfde regels; items zonder id blijven, ontdubbeld.
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

const { mergeSync, mergeArray, stabielJson, zelfdeDoc } = require(path.join(root, 'src/lib/listMerge.ts'));

const L = (id, updatedAt, extra = {}) => ({ id, name: `List ${id}`, army: 'empire', createdAt: 1, updatedAt, entries: [], ...extra });
const G = (id, name) => ({ id, name });
const doc = (lists, groups = []) => ({ lists, groups });
const ids = (arr) => arr.map((x) => x.id);

// Een vaste basis: drie lijsten, één groep.
const A = L('a', 100), B = L('b', 100), C = L('c', 100);
const basis = doc([A, B, C], [G('g1', 'Tournament')]);

test('stabielJson negeert de volgorde van sleutels (jsonb herschikt ze)', () => {
  assert.equal(stabielJson({ b: 1, a: { d: 2, c: [1, { y: 1, x: 2 }] } }), stabielJson({ a: { c: [1, { x: 2, y: 1 }], d: 2 }, b: 1 }));
  assert.equal(stabielJson({ a: undefined, b: 1 }), '{"b":1}');
  assert.equal(stabielJson([undefined, 1]), '[null,1]');
  // Een ongewijzigde lijst die met andere sleutelvolgorde uit de cloud komt, is GEEN bewerking.
  const cloudA = JSON.parse('{"updatedAt":100,"entries":[],"createdAt":1,"army":"empire","name":"List a","id":"a"}');
  const r = mergeSync(basis, basis, doc([cloudA, B, C], basis.groups));
  assert.ok(zelfdeDoc(r, basis));
  assert.equal(r.lists[0], A, 'bij gelijke inhoud blijft het lokale object');
});

test('niets veranderd → niets verandert', () => {
  const r = mergeSync(basis, basis, basis);
  assert.deepEqual(r, basis);
});

test('hier bewerkt → de lokale bewerking blijft, ook al is de cloud ouder', () => {
  const B2 = L('b', 200, { name: 'Renamed here' });
  const r = mergeSync(basis, doc([A, B2, C], basis.groups), basis);
  assert.deepEqual(r.lists, [A, B2, C]);
});

test('daar bewerkt → de cloud-bewerking komt binnen', () => {
  const B2 = L('b', 200, { name: 'Renamed there' });
  const r = mergeSync(basis, basis, doc([A, B2, C], basis.groups));
  assert.deepEqual(r.lists, [A, B2, C]);
});

test('daar bewerkt met een OUDERE klok → toch de cloud, want hier is niets veranderd', () => {
  // Klokken van apparaten lopen niet gelijk; alleen bij een echte botsing telt updatedAt.
  const B2 = L('b', 50, { name: 'Edited on a phone with a slow clock' });
  const r = mergeSync(basis, basis, doc([A, B2, C], basis.groups));
  assert.equal(r.lists[1], B2);
});

test('allebei bewerkt → de nieuwste updatedAt wint, in beide richtingen', () => {
  const hier = L('b', 300, { name: 'Here, newer' });
  const daar = L('b', 200, { name: 'There, older' });
  assert.equal(mergeSync(basis, doc([A, hier, C]), doc([A, daar, C])).lists[1], hier);
  const hier2 = L('b', 200, { name: 'Here, older' });
  const daar2 = L('b', 300, { name: 'There, newer' });
  assert.equal(mergeSync(basis, doc([A, hier2, C]), doc([A, daar2, C])).lists[1], daar2);
});

test('allebei bewerkt, gelijke of ontbrekende updatedAt → dit apparaat', () => {
  const hier = L('b', 300, { name: 'Here' });
  const daar = L('b', 300, { name: 'There' });
  assert.equal(mergeSync(basis, doc([A, hier, C]), doc([A, daar, C])).lists[1], hier);
  const hierZonder = { id: 'b', name: 'Here, no stamp' };
  const daarZonder = { id: 'b', name: 'There, no stamp' };
  assert.equal(mergeSync(basis, doc([A, hierZonder, C]), doc([A, daarZonder, C])).lists[1], hierZonder);
});

test('hier verwijderd → blijft weg (en de cloud krijgt dat)', () => {
  const r = mergeSync(basis, doc([A, C], basis.groups), basis);
  assert.deepEqual(ids(r.lists), ['a', 'c']);
});

test('daar verwijderd → verdwijnt hier ook, zonder vraag', () => {
  // Precies het oude probleem: telefoon heeft B nog, PC gooide hem weg → vroeger een dialoog.
  const r = mergeSync(basis, basis, doc([A, C], basis.groups));
  assert.deepEqual(ids(r.lists), ['a', 'c']);
});

test('daar verwijderd, hier sindsdien bewerkt → de bewerkte lijst blijft', () => {
  const B2 = L('b', 200, { name: 'Edited here after the other device deleted it' });
  const r = mergeSync(basis, doc([A, B2, C]), doc([A, C]));
  assert.deepEqual(ids(r.lists), ['a', 'b', 'c']);
  assert.equal(r.lists[1], B2);
});

test('hier verwijderd, daar sindsdien bewerkt → de bewerkte lijst komt terug', () => {
  const B2 = L('b', 200, { name: 'Edited there' });
  const r = mergeSync(basis, doc([A, C]), doc([A, B2, C]));
  assert.deepEqual(ids(r.lists), ['a', 'b', 'c']);
  assert.equal(r.lists[1], B2);
});

test('aan beide kanten verwijderd → weg', () => {
  const r = mergeSync(basis, doc([A, C]), doc([A, C]));
  assert.deepEqual(ids(r.lists), ['a', 'c']);
});

test('nieuw aan beide kanten → beide blijven, elk naast zijn buur', () => {
  // De builder zet een nieuwe lijst VOORAAN ([nieuw, ...ls]).
  const N = L('n-here', 400), M = L('m-there', 400);
  const r = mergeSync(basis, doc([N, A, B, C]), doc([M, A, B, C]));
  assert.deepEqual(ids(r.lists), ['n-here', 'm-there', 'a', 'b', 'c']);
  // Midden in de lijst: komt direct na zijn voorganger van die kant.
  const r2 = mergeSync(basis, doc([A, B, N, C]), doc([A, M, B, C]));
  assert.deepEqual(ids(r2.lists), ['a', 'm-there', 'b', 'n-here', 'c']);
});

test('meerdere nieuwe achter elkaar houden hun eigen volgorde', () => {
  const N1 = L('n1', 400), N2 = L('n2', 401);
  const r = mergeSync(basis, doc([A, N1, N2, B, C]), basis);
  assert.deepEqual(ids(r.lists), ['a', 'n1', 'n2', 'b', 'c']);
  const r2 = mergeSync(basis, basis, doc([N1, N2, A, B, C]));
  assert.deepEqual(ids(r2.lists), ['n1', 'n2', 'a', 'b', 'c']);
});

test('eerste sync (geen basis) → alles samen, er verdwijnt niets', () => {
  const N = L('n', 400);
  const r = mergeSync(null, doc([N, A]), doc([B, C]));
  assert.deepEqual(new Set(ids(r.lists)), new Set(['n', 'a', 'b', 'c']));
  // Ruggengraat = cloud, de lokale lijsten ervoor (geen voorganger aan die kant die al geplaatst is).
  assert.deepEqual(ids(r.lists), ['n', 'a', 'b', 'c']);
  // Lege kant verliest niets van de andere.
  assert.deepEqual(ids(mergeSync(null, doc([]), doc([A, B])).lists), ['a', 'b']);
  assert.deepEqual(ids(mergeSync(null, doc([A, B]), doc([])).lists), ['a', 'b']);
});

test('eerste sync, zelfde id verschillend → nieuwste wint, gelijk → de cloud', () => {
  const hier = L('a', 500, { name: 'Here newer' });
  const daar = L('a', 400, { name: 'There older' });
  assert.equal(mergeSync(null, doc([hier]), doc([daar])).lists[0], hier);
  assert.equal(mergeSync(null, doc([daar]), doc([hier])).lists[0], hier);
  const gelijkHier = L('a', 400, { name: 'Here' });
  assert.equal(mergeSync(null, doc([gelijkHier]), doc([daar])).lists[0], daar);
});

test('basis zonder dit id (sync van vóór de basis) → nieuwste wint, gelijk → cloud', () => {
  const hier = L('x', 500, { name: 'Here' });
  const daar = L('x', 600, { name: 'There' });
  assert.equal(mergeSync(basis, doc([A, B, C, hier]), doc([A, B, C, daar])).lists[3], daar);
});

test('hier herschikt → de lokale volgorde gaat naar de cloud', () => {
  const r = mergeSync(basis, doc([C, A, B]), basis);
  assert.deepEqual(ids(r.lists), ['c', 'a', 'b']);
});

test('daar herschikt → de cloudvolgorde komt hier binnen', () => {
  const r = mergeSync(basis, basis, doc([B, C, A]));
  assert.deepEqual(ids(r.lists), ['b', 'c', 'a']);
});

test('allebei herschikt → de cloud wint de volgorde, inhoud wordt per lijst samengevoegd', () => {
  const A2 = L('a', 200, { name: 'A edited here' });
  const r = mergeSync(basis, doc([C, B, A2]), doc([B, A, C]));
  assert.deepEqual(ids(r.lists), ['b', 'a', 'c']);
  assert.equal(r.lists[1], A2);
});

test('hier herschikt plus daar een nieuwe lijst → lokale volgorde, nieuwe naast zijn buur', () => {
  const M = L('m', 400);
  const r = mergeSync(basis, doc([C, A, B]), doc([A, M, B, C]));
  assert.deepEqual(ids(r.lists), ['c', 'a', 'm', 'b']);
});

test('een verwijdering telt niet als herschikking', () => {
  // Cloud verwijderde A; volgorde van de rest is ongewijzigd → hier geen herschikking, cloud blijft.
  const N = L('n', 400);
  const r = mergeSync(basis, doc([A, B, C, N]), doc([B, C]));
  assert.deepEqual(ids(r.lists), ['b', 'c', 'n']);
});

test('groepen: nieuw, hernoemd en verwijderd lopen door dezelfde regels', () => {
  const b = doc([A], [G('g1', 'Tournament'), G('g2', 'Casual')]);
  // Hier: g1 hernoemd, g3 nieuw. Daar: g2 verwijderd, g4 nieuw.
  const hier = doc([A], [G('g1', 'Tournaments 2026'), G('g2', 'Casual'), G('g3', 'Here')]);
  const daar = doc([A], [G('g1', 'Tournament'), G('g4', 'There')]);
  const r = mergeSync(b, hier, daar);
  // g3 volgde lokaal op g2 (weg) en daarvóór g1 → direct na g1.
  assert.deepEqual(r.groups, [G('g1', 'Tournaments 2026'), G('g3', 'Here'), G('g4', 'There')]);
});

test('groepen: allebei hernoemd → dit apparaat (groepen hebben geen updatedAt)', () => {
  const b = doc([], [G('g1', 'Old')]);
  const r = mergeSync(b, doc([], [G('g1', 'Here')]), doc([], [G('g1', 'There')]));
  assert.deepEqual(r.groups, [G('g1', 'Here')]);
  // Zonder basis: de cloud.
  const r2 = mergeSync(null, doc([], [G('g1', 'Here')]), doc([], [G('g1', 'There')]));
  assert.deepEqual(r2.groups, [G('g1', 'There')]);
});

test('lijsten en groepen gaan los: een groepswijziging raakt de lijsten niet', () => {
  const r = mergeSync(basis, doc([A, B, C], []), doc([A, C], basis.groups));
  assert.deepEqual(ids(r.lists), ['a', 'c']);   // B daar verwijderd
  assert.deepEqual(r.groups, []);               // g1 hier verwijderd
});

test('items zonder id blijven en worden ontdubbeld op inhoud', () => {
  const los1 = { name: 'No id', entries: [] };
  const los1Cloud = { entries: [], name: 'No id' }; // zelfde inhoud, andere sleutelvolgorde
  const los2 = { name: 'Another loose one' };
  const r = mergeSync(basis, doc([A, B, C, los1]), doc([A, B, C, los1Cloud, los2]));
  assert.equal(r.lists.length, 5);
  assert.equal(r.lists.filter((x) => x && x.name === 'No id').length, 1);
  assert.ok(r.lists.includes(los2));
  // Ook als ze in de basis stonden en één kant ze kwijt is: zonder id is er geen verwijdering te zien.
  const b2 = doc([A, los1]);
  const r2 = mergeSync(b2, doc([A]), doc([A, los1]));
  assert.equal(r2.lists.length, 2);
  // Rare waarden (null, getal) gaan ook niet verloren.
  const r3 = mergeArray('lists', null, [null, 3], [3]);
  assert.deepEqual(r3, [null, 3]);
});

test('dubbel id binnen één kant → niets verdwijnt stil', () => {
  const A2 = L('a', 100, { name: 'Same id, other list' });
  const r = mergeSync(null, doc([A, A2]), doc([A]));
  assert.equal(r.lists.length, 2);
});

test('ontbrekende of rare arrays breken de merge niet', () => {
  const r = mergeSync({ lists: undefined, groups: null }, { lists: [A] }, { lists: [B], groups: 'x' });
  assert.deepEqual(ids(r.lists), ['a', 'b']);
  assert.deepEqual(r.groups, []);
});

test('convergentie: na merge + push zien beide apparaten hetzelfde', () => {
  // PC en telefoon divergeren vanaf dezelfde basis; PC synct eerst, daarna de telefoon.
  const pc = doc([L('a', 200, { name: 'PC edit' }), C, L('p', 300)], basis.groups);           // B weg, A bewerkt, P nieuw
  const tel = doc([L('t', 250), A, B, L('c', 220, { name: 'Phone edit' })], [...basis.groups, G('gt', 'Phone')]);
  const cloud1 = mergeSync(basis, pc, basis);         // PC pusht
  const pcBasis = cloud1;
  const cloud2 = mergeSync(basis, tel, cloud1);       // telefoon merget en pusht
  const pcNa = mergeSync(pcBasis, cloud1, cloud2);    // PC haalt op
  assert.ok(zelfdeDoc(pcNa, cloud2));
  assert.deepEqual(ids(cloud2.lists), ['t', 'a', 'c', 'p']);
  assert.equal(cloud2.lists[1].name, 'PC edit');
  assert.equal(cloud2.lists[2].name, 'Phone edit');
  assert.deepEqual(cloud2.groups.map((g) => g.id), ['g1', 'gt']);
});
