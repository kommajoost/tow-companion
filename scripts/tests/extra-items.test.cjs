// 24-11-2026: New Recruit-items die OWB niet heeft (public/extra-items.json + extra-item-text.json,
// gemaakt door scripts/sync-new-recruit-items.mjs). Dezelfde TS-modules als de app; geen nabouw.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, f);
const B = require(path.join(root, 'src/lib/owbBuilder.ts'));
const O = require(path.join(root, 'src/lib/overlays.ts'));
const BT = require(path.join(root, 'src/lib/builderToArmy.ts'));

const json = (p) => JSON.parse(fs.readFileSync(path.join(root, 'public', p), 'utf8'));
const ITEMS = json('owb/magic-items.json');
const TEXT = json('owb/magic-item-text.json');
const EXTRA = json('extra-items.json');
const EXTRA_TEXT = json('extra-item-text.json');
const META = json('owb/the-old-world.json');
const lists = (army) => META.armies.find((a) => a.id === army).items;
const entry = (unit, cat, extra = {}) => ({ uid: `${cat}:${unit.id}`, cat, unitId: unit.id, count: 10, opts: [], ...extra });

test('extra items: same shape as magic-items.json, provenance on every item, nothing already in OWB', () => {
  const owbIds = new Set(Object.values(ITEMS).flat().map(B.magicItemId));
  for (const [listId, arr] of Object.entries(EXTRA)) {
    assert.ok(listId in ITEMS, `${listId} is an existing OWB item list`);
    for (const it of arr) {
      assert.equal(typeof it.name_en, 'string');
      assert.equal(typeof it.points, 'number');
      assert.equal(typeof it.type, 'string');
      assert.equal(it.bron, 'New Recruit');
      assert.ok('publicatie' in it);
      assert.equal(it.toegevoegd, '2026-11-24');
      assert.ok(!owbIds.has(B.magicItemId(it)), `${it.name_en} is not in OWB`);
    }
  }
  for (const v of Object.values(EXTRA_TEXT)) assert.equal(v.bron, 'New Recruit');
});

test('mergeExtraItems is additive and tolerant', () => {
  const merged = O.mergeExtraItems(ITEMS, EXTRA);
  for (const [k, arr] of Object.entries(ITEMS)) assert.deepEqual(merged[k].slice(0, arr.length), arr);
  assert.equal(O.mergeExtraItems(ITEMS, null), ITEMS);
  assert.equal(O.mergeExtraItems(ITEMS, {}), ITEMS);
  // An item OWB already has is never added a second time (a later OWB sync wins).
  const dubbel = { general: [{ ...ITEMS.general[0], points: 999 }] };
  assert.deepEqual(O.mergeExtraItems(ITEMS, dubbel).general, ITEMS.general);
  const text = O.mergeExtraMagicText(TEXT, EXTRA_TEXT);
  for (const k of Object.keys(TEXT)) assert.equal(text[k], TEXT[k]);
  assert.equal(O.mergeExtraMagicText(TEXT, null), TEXT);
});

test('a Renegade overlay still wins over an extra item with the same name', () => {
  const [listId, arr] = Object.entries(EXTRA)[0];
  const it = arr[0];
  const overlay = { magicItems: { [listId]: [{ ...it, points: it.points + 5 }] } };
  const out = O.itemsFor(O.mergeExtraItems(ITEMS, EXTRA), 'x', overlay);
  const found = out[listId].filter((x) => x.name === it.name);
  assert.equal(found.length, 1);
  assert.equal(found[0].points, it.points + 5);
});

test('The Briar-bow: on a Glade Guard champion (Lord\'s Bowmen), 25 points, with its NR text', () => {
  const briar = Object.values(EXTRA).flat().find((it) => it.name_en === 'The Briar-bow');
  assert.ok(briar, 'The Briar-bow is in extra-items.json');
  assert.equal(briar.points, 25);
  assert.equal(briar.type, 'weapon');
  const cat = O.catalogueFor(json('owb/wood-elf-realms.json'), 'wood-elf-realms', null);
  const gg = cat.core.find((u) => u.id === 'glade-guard');
  const champ = gg.command.findIndex((o) => /Lord's Bowmen/.test(o.name_en));
  const items = O.itemsFor(O.mergeExtraItems(ITEMS, EXTRA), 'wood-elf-realms', null);
  const e = entry(gg, 'core', { opts: [`command/${champ}`] });
  const cats = B.magicCategories(gg, lists('wood-elf-realms'), items, e);
  const wapens = cats.find((c) => c.types.includes('weapon'));
  assert.ok(wapens.items.some((it) => it.name_en === 'The Briar-bow'), 'offered in the champion\'s weapons');
  const met = { ...e, opts: [...e.opts, `magic/${wapens.id}/${B.magicItemId(briar)}`] };
  assert.equal(B.magicItemsPoints(gg, met, items), 25);
  assert.equal(B.entryPoints(gg, met, items) - B.entryPoints(gg, e, items), 25);
  const tx = O.mergeExtraMagicText(TEXT, EXTRA_TEXT)[B.magicItemIdFromName(briar.name_en)];
  assert.ok(tx, 'text found under the slug the game uses');
  assert.equal(tx.profiel[0].range, '30"');
  assert.equal(tx.profiel[0].strength, '3');
  assert.equal(tx.profiel[0].ap, '-1');
  assert.deepEqual(BT.magicItemRules(tx.body).length, 1);
});
