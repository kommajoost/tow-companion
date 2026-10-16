// 16-10-2026: zeven builder-correcties (Tomb Kings-melding + detachments). Per taak een blok:
//  1. Army of Infamy lekt niet meer de Grand Army in (sub-opties, magic items, item-secties)
//  2. meerdere gratis default-wapens blijven samen (Skeleton Archers: warbows)
//  3. betaalde light armour staat in de roster-regel
//  4. vaste 0-punten-uitrusting staat aangevinkt (Necropolis Knights: shields, light armour)
//  5. Skeleton Skirmishers: shields OF warbows
//  6. Khemrian Warsphinx: tot twee extra crew
//  7. detachments: minimum 5, geen command, koppeling aan een regiment (meldingen blokkeren niet)
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
const D = require(path.join(root, 'src/lib/builderDerived.ts'));

const json = (p) => JSON.parse(fs.readFileSync(path.join(root, 'public', p), 'utf8'));
const META = json('owb/the-old-world.json');
const ITEMS = json('owb/magic-items.json');
const lists = (army) => META.armies.find((a) => a.id === army).items;
const overlay = (comp) => (O.OVERLAY_FILES[comp] ? json(`renegade/${O.OVERLAY_FILES[comp]}`) : null);
function ctx(army, comp) {
  const ov = overlay(comp);
  const cat = O.catalogueFor(json(`owb/${army}.json`), comp, ov);
  const items = O.itemsFor(ITEMS, comp, ov);
  const unit = (id) => B.CATEGORIES.flatMap((c) => cat[c] ?? []).find((u) => u.id === id);
  const getUnit = (c, id) => B.findUnit(cat, c, id);
  return { cat, items, unit, getUnit, itemLists: lists(army) };
}
let n = 0;
const entry = (unit, cat, extra = {}) => ({ uid: `e${++n}`, cat, unitId: unit.id, count: Math.max(1, unit.minimum ?? 1), opts: [], ...extra });
const keyOf = (unit, group, name) => `${group}/${B.groupItems(unit, group).findIndex((o) => o.name_en === name)}`;
const lijst = (comp, entries, points = 2000, rule = 'open-war') => ({ composition: comp, rule, points, entries });

const TK = 'tomb-kings-of-khemri';

// ── 1a. sub-opties van een andere compositie ────────────────────────────────────────────────────
test('1a: Arise! hoort bij de Royal Hosts, niet bij een Grand Army Tomb King', () => {
  for (const [comp, verwacht] of [[TK, false], ['nehekharan-royal-hosts', true]]) {
    const { unit } = ctx(TK, comp);
    const tk = unit('tomb-king');
    const e = entry(tk, 'characters', { opts: [keyOf(tk, 'command', 'General')] });
    const namen = B.subOptionGroups(tk, e).flatMap((g) => g.items.map((i) => i.opt.name_en));
    assert.equal(namen.includes('Arise!, Level 1 Wizard'), verwacht, comp);
    if (verwacht) {
      // De opgeslagen sleutel blijft dezelfde index: subopt/command/<General>/0.
      const g = B.subOptionGroups(tk, e).find((x) => x.items.some((i) => /Arise/.test(i.opt.name_en)));
      assert.equal(g.items[0].key, `subopt/${keyOf(tk, 'command', 'General')}/0`);
    }
  }
});

test('1a: een oude Grand Army-lijst met Arise! laadt; de verborgen keuze telt niet (35 pt minder)', () => {
  const { unit, items } = ctx(TK, TK);
  const tk = unit('tomb-king');
  const gen = keyOf(tk, 'command', 'General');
  const e = entry(tk, 'characters', { opts: [gen, `subopt/${gen}/0`] });
  assert.equal(B.entryPoints(tk, e, items), tk.points);
  assert.ok(!B.loadoutLabels(tk, e).some((l) => /Arise/.test(l)));
  // Zonder overlay-filter (ruwe data) telde hij wel: dat is het verschil van deze fix.
  const raw = json(`owb/${TK}.json`).characters.find((u) => u.id === 'tomb-king');
  assert.equal(B.entryPoints(raw, e, ITEMS), tk.points + 35);
});

// ── 1b. magic items met een compositie-tag ──────────────────────────────────────────────────────
test('1b: Royal Mantle en Blade of Antarhak zitten niet in de Grand Army-kiezer, wel bij de Royal Hosts', () => {
  for (const [comp, zichtbaar] of [[TK, false], ['nehekharan-royal-hosts', true]]) {
    const { unit, items, itemLists } = ctx(TK, comp);
    const tk = unit('tomb-king');
    const e = entry(tk, 'characters');
    const cats = B.magicCategoriesForPicker(B.magicCategories(tk, itemLists, items, e), e, 'open-war');
    const namen = cats.flatMap((c) => c.items.map((i) => i.name_en));
    assert.equal(namen.includes('Royal Mantle'), zichtbaar, comp);
    assert.equal(namen.includes('Blade of Antarhak'), zichtbaar, comp);
    assert.ok(!namen.includes('Staff of Aeons'), `${comp}: Staff of Aeons is Mortuary Cults`);
  }
});

test('1b: een oude Grand Army-lijst met Royal Mantle houdt zijn punten en krijgt een melding', () => {
  const { unit, items, getUnit, itemLists } = ctx(TK, TK);
  const tk = unit('tomb-king');
  const e = entry(tk, 'characters', { opts: ['magic/armor/royal-mantle'] });
  assert.equal(B.entryPoints(tk, e, items), tk.points + 40);
  const v = B.validate(lijst(TK, [e]), getUnit, items);
  assert.ok(v.entryWarnings.some((w) => w.uid === e.uid && /Royal Mantle: not available in this army composition/.test(w.message)));
  // De kiezer toont hem nog, zodat hij weg te halen is.
  const cats = B.magicCategoriesForPicker(B.magicCategories(tk, itemLists, items, e), e, 'open-war');
  assert.ok(cats.some((c) => c.items.some((i) => i.name_en === 'Royal Mantle')));
});

test('1b: dubbele varianten -- de prijs van de EIGEN compositie telt (bewuste puntwijziging)', () => {
  const og = ctx('ogre-kingdoms', 'ogre-kingdoms');
  const tyrant = og.unit('tyrant');
  const bk = entry(tyrant, 'characters', { opts: ['magic/big-name/beastkiller'] });
  assert.equal(B.entryPoints(tyrant, bk, og.items) - B.entryPoints(tyrant, entry(tyrant, 'characters'), og.items), 5);
  const lm = ctx('lizardmen', 'lm-renegade-v2');
  const sv = lm.unit('saurus-scar-veteran');
  const cats = B.magicCategories(sv, lm.itemLists, lm.items, entry(sv, 'characters'));
  const chotec = cats.flatMap((c) => c.items).filter((i) => /chotec/i.test(i.name_en));
  assert.deepEqual(chotec.map((i) => i.points), [65]);
});

test('1b: zonder compositie-match blijft alles staan (geen stille prijswijziging)', () => {
  const out = O.itemsForComposition(ITEMS, 'bestaat-niet');
  for (const [k, arr] of Object.entries(ITEMS)) assert.equal(out[k].length, arr.length, k);
});

// ── 1c. item-secties van een andere compositie ──────────────────────────────────────────────────
test('1c: een Grand Army Tomb King heeft EEN Magic Items-budget, zonder arcane items', () => {
  const { unit, items, itemLists } = ctx(TK, TK);
  const tk = unit('tomb-king');
  const e = entry(tk, 'characters');
  const cats = B.magicCategories(tk, itemLists, items, e);
  const zichtbaar = cats.filter((c) => !c.hidden);
  assert.deepEqual([...new Set(zichtbaar.map((c) => c.budgetGroup))], ['sec:0']);
  assert.ok(!zichtbaar.some((c) => c.id === 'arcane-item'));
  // De verborgen sectie bestaat nog (achteraan) met haar oude sleutel.
  assert.ok(cats.filter((c) => c.hidden).every((c) => c.budgetGroup === 'sec:1'));
  assert.equal(B.magicCategoriesForPicker(cats, e, 'open-war').filter((c) => c.budgetGroup === 'sec:1').length, 0);
});

test('1c: bij de Royal Hosts telt de Royal Hosts-sectie, ook voor het budget', () => {
  const { unit, items, itemLists } = ctx(TK, 'nehekharan-royal-hosts');
  const tk = unit('tomb-king');
  const zichtbaar = B.magicCategories(tk, itemLists, items, entry(tk, 'characters')).filter((c) => !c.hidden);
  assert.deepEqual([...new Set(zichtbaar.map((c) => c.budgetGroup))], ['sec:1']);
  assert.ok(zichtbaar.some((c) => c.id === 'arcane-item'));
});

test('1c: arcane item op een Grand Army Tomb King: punten blijven, melding, en hij is weg te halen', () => {
  const { unit, items, getUnit, itemLists } = ctx(TK, TK);
  const tk = unit('tomb-king');
  const e = entry(tk, 'characters', { opts: ['magic/arcane-item/lore-familiar'] });
  assert.equal(B.entryPoints(tk, e, items), tk.points + 30);
  assert.ok(B.validate(lijst(TK, [e]), getUnit, items).warnings.some((w) => /Lore Familiar: not available/.test(w)));
  const picker = B.magicCategoriesForPicker(B.magicCategories(tk, itemLists, items, e), e, 'open-war');
  const verborgen = picker.filter((c) => c.hidden);
  assert.deepEqual(verborgen.flatMap((c) => c.items.map((i) => i.name_en)), ['Lore Familiar']);
});

test('1c: Beastmen Wild Herd krijgt 125 (zijn eigen sectie) in plaats van de Grand Army-100', () => {
  const { unit, items, itemLists } = ctx('beastmen-brayherds', 'wild-herd');
  const bl = unit('beastlord');
  const cats = B.magicCategories(bl, itemLists, items, entry(bl, 'characters')).filter((c) => !c.hidden);
  const weapon = cats.find((c) => c.id === 'weapon');
  assert.equal(weapon.maxPoints, 125);
  assert.equal(new Set(cats.filter((c) => c.groupLabel === 'Magic Items').map((c) => c.budgetGroup)).size, 1);
});

test('1c: de Dwarf-rune-secties (object-tag) blijven zichtbaar', () => {
  const { unit, items, itemLists } = ctx('dwarfen-mountain-holds', 'dwarfen-mountain-holds');
  const king = unit('king');
  assert.ok(B.magicCategories(king, itemLists, items, entry(king, 'characters')).some((c) => !c.hidden && c.budgetGroup === 'sec:0'));
});

// ── 2. meerdere gratis defaults ─────────────────────────────────────────────────────────────────
test('2: Skeleton Archers dragen hand weapons EN warbows; High Elf Spearmen hand weapons EN spears', () => {
  const { unit } = ctx(TK, TK);
  const sa = unit('skeleton-archers');
  assert.equal(B.isRadioGroup(sa, 'equipment'), false);
  assert.deepEqual(B.loadoutLabels(sa, entry(sa, 'core')), ['Hand weapons', 'Warbows']);
  const he = ctx('high-elf-realms', 'high-elf-realms').unit('elven-spearmen');
  assert.ok(B.loadoutLabels(he, entry(he, 'core')).includes('Thrusting spears'));
});

test('2: een opgeslagen radio-keuze van vroeger laadt met dezelfde punten', () => {
  const { unit, items } = ctx(TK, TK);
  const sa = unit('skeleton-archers');
  const e = entry(sa, 'core', { opts: ['equipment/1'] });
  assert.equal(B.entryPoints(sa, e, items), 10 * sa.points);
  assert.deepEqual(B.loadoutLabels(sa, e), ['Hand weapons', 'Warbows']);
});

test('2: Salamander Packs (één default per compositie) blijven een radio', () => {
  const { unit } = ctx('lizardmen', 'lizardmen');
  assert.equal(B.isRadioGroup(unit('salamander-packs'), 'equipment'), true);
});

// ── 3. betaalde light armour in de roster-regel ─────────────────────────────────────────────────
test('3: betaalde light armour staat in de whisper, gratis light armour niet', () => {
  const { unit, items } = ctx(TK, TK);
  const sa = unit('skeleton-archers');
  assert.match(D.optionSummary(sa, entry(sa, 'core', { opts: [keyOf(sa, 'armor', 'Light armour')] }), items), /Light armour/);
  assert.doesNotMatch(D.optionSummary(sa, entry(sa, 'core'), items), /Light armour/);
  const nk = unit('necropolis-knights');
  assert.doesNotMatch(D.optionSummary(nk, entry(nk, 'special'), items), /Light armour/);
  // "Hand weapons" in een betaalde bundel blijft de vloer.
  const sk = unit('skeleton-skirmishers');
  const w = D.optionSummary(sk, entry(sk, 'core', { opts: [keyOf(sk, 'equipment', 'Hand weapons, Warbows')] }), items);
  assert.equal(w, 'Warbows');
});

// ── 4. vaste 0-punten-uitrusting ────────────────────────────────────────────────────────────────
test('4: Necropolis Knights: shields vast aangevinkt, light armour standaard (Ravening Hordes p. 139)', () => {
  const { unit } = ctx(TK, TK);
  const nk = unit('necropolis-knights');
  const opts = B.unitBlocks(nk).find((b) => b.key === 'options');
  assert.equal(opts.items.find((x) => x.opt.name_en === 'Shields').opt.alwaysActive, true);
  assert.equal(opts.items.find((x) => /Great weapon/.test(x.opt.name_en)).opt.alwaysActive, undefined);
  assert.deepEqual(B.loadoutLabels(nk, entry(nk, 'special')).slice(-2), ['Light armour', 'Shields']);
});

test('4: defaults van een één-van-set, marks en vervangbare schilden blijven kiesbaar', () => {
  const vast = (army, id, group, name) => {
    const u = ctx(army, army).unit(id);
    return B.isStandardOption(u, group, B.groupItems(u, group).find((o) => o.name_en === name));
  };
  assert.equal(vast('empire-of-man', 'witch-hunter', 'options', 'The Witch'), false);
  assert.equal(vast('grand-cathay', 'shugengan', 'options', 'Lore of Yang'), false);
  assert.equal(vast('warriors-of-chaos', 'chaos-chariot', 'options', 'Mark of Chaos Undivided'), false);
  assert.equal(vast('vampire-counts', 'grave-guard', 'options', 'Shields'), false);
  assert.equal(vast('tomb-kings-of-khemri', 'skeleton-warriors', 'options', 'Shields'), true);
});

// ── 5. Skeleton Skirmishers: shields OF warbows ─────────────────────────────────────────────────
test('5: schild aanzetten haalt de warbows weg, warbows kiezen haalt het schild weg', () => {
  const { unit } = ctx(TK, TK);
  const sk = unit('skeleton-skirmishers');
  const bows = keyOf(sk, 'equipment', 'Hand weapons, Warbows');
  const shields = keyOf(sk, 'options', 'Shields');
  assert.deepEqual(B.dropNotWith(sk, [bows, shields], shields), [shields]);
  assert.deepEqual(B.dropNotWith(sk, [shields, bows], bows), [bows]);
  // Het gratis default-wapen (alleen hand weapons) mag gewoon met een schild.
  assert.deepEqual(B.dropNotWith(sk, [shields], shields), [shields]);
});

test('5: een oude lijst met allebei laadt, houdt zijn punten en krijgt een melding', () => {
  const { unit, items, getUnit } = ctx(TK, TK);
  const sk = unit('skeleton-skirmishers');
  const e = entry(sk, 'core', { count: 10, opts: [keyOf(sk, 'equipment', 'Hand weapons, Warbows'), keyOf(sk, 'options', 'Shields')] });
  assert.equal(B.entryPoints(sk, e, items), 10 * (4 + 1 + 1));
  const v = B.validate(lijst(TK, [e]), getUnit, items);
  assert.ok(v.entryWarnings.some((w) => w.uid === e.uid && /cannot be combined/.test(w.message)));
  const los = entry(sk, 'core', { count: 10, opts: [keyOf(sk, 'options', 'Shields')] });
  assert.ok(!B.validate(lijst(TK, [los]), getUnit, items).warnings.some((w) => /cannot be combined/.test(w)));
});

// ── 6. Warsphinx-crew ───────────────────────────────────────────────────────────────────────────
test('6: Khemrian Warsphinx mag twee extra crew; een oud vinkje zonder aantal blijft één', () => {
  const { unit, items } = ctx(TK, TK);
  const ws = unit('khemrian-warsphinx');
  const opt = B.groupItems(ws, 'options')[0];
  const e = entry(ws, 'special');
  assert.equal(B.stackMax(ws, e, opt), 2);
  const twee = B.setStackCount(ws, e, 'options/0', opt, 5);
  assert.equal(twee.optCounts['options/0'], 2);
  assert.equal(B.entryPoints(ws, twee, items), ws.points + 20);
  assert.equal(B.entryPoints(ws, { ...e, opts: ['options/0'] }, items), ws.points + 10);
});

test('6: in een regiment blijft het maximum het aantal modellen', () => {
  const ogres = ctx('warriors-of-chaos', 'warriors-of-chaos');
  const u = B.CATEGORIES.flatMap((c) => ogres.cat[c]).find((x) => B.groupItems(x, 'options').some((o) => o.stackable && (o.maximum ?? 0) > 0) && (x.minimum ?? 1) > 1);
  if (!u) return; // geen zo'n unit in de data: niets te toetsen
  const opt = B.groupItems(u, 'options').find((o) => o.stackable && (o.maximum ?? 0) > 0);
  assert.equal(B.stackMax(u, { ...entry(u, 'core'), count: 1 }, opt), 1);
});

// ── 7. detachments ──────────────────────────────────────────────────────────────────────────────
function tkDetachment() {
  const c = ctx(TK, TK);
  const sw = c.unit('skeleton-warriors');
  const sa = c.unit('skeleton-archers');
  const det = B.detachmentOptionKey(sa);
  return { ...c, sw, sa, det };
}

test('7: Detachment-optie: minimum 5, command eraf, uitzetten herstelt het minimum', () => {
  const { sa, det } = tkDetachment();
  const cmd = keyOf(sa, 'command', 'Musician');
  const e = B.setDetachment(sa, entry(sa, 'core', { opts: [cmd] }), true);
  assert.ok(B.isDetachmentEntry(sa, e));
  assert.equal(B.entryMinimum(sa, e), 5);
  assert.deepEqual(e.opts, [det]);
  const terug = B.setDetachment(sa, { ...e, count: 6, parentUid: 'x' }, false);
  assert.equal(terug.count, 10);
  assert.equal(terug.parentUid, undefined);
  assert.equal(B.isDetachmentEntry(sa, terug), false);
});

test('7: geldige detachment: geen fouten, geen meldingen, label "Detachment of <regiment>"', () => {
  const { sw, sa, det, getUnit, items } = tkDetachment();
  const reg = entry(sw, 'core', { count: 20, customName: 'The Sand Guard' });
  const d = entry(sa, 'core', { count: 10, opts: [det], parentUid: reg.uid });
  const v = B.validate(lijst(TK, [reg, d]), getUnit, items);
  assert.deepEqual(v.entryWarnings.filter((w) => w.uid === d.uid), []);
  assert.deepEqual(v.advisories, []);
  assert.equal(B.detachmentLabel([reg, d], d, getUnit), 'Detachment of The Sand Guard');
  assert.equal(D.rosterWhisper(sa, d, items, [reg, d], getUnit), "Warbows · Detachment of The Sand Guard");
  assert.deepEqual(JSON.parse(JSON.stringify(d)).parentUid, reg.uid); // round trip
});

test('7: zonder regiment of te groot = melding, NIET in warnings (de campagne blokkeert niet)', () => {
  const { sw, sa, det, getUnit, items } = tkDetachment();
  const reg = entry(sw, 'core', { count: 10 });
  const los = entry(sa, 'core', { count: 5, opts: [det] });
  const groot = entry(sa, 'core', { count: 6, opts: [det], parentUid: reg.uid });
  const v = B.validate(lijst(TK, [reg, los, groot]), getUnit, items);
  assert.ok(v.advisories.some((a) => a.uid === los.uid && /no regiment assigned/.test(a.message)));
  assert.ok(v.advisories.some((a) => a.uid === groot.uid && /too large .*max 5/.test(a.message)));
  assert.ok(!v.warnings.some((w) => /regiment|too large/.test(w)));
  const dl = D.deriveList(lijst(TK, [reg, los, groot]), ctx(TK, TK).cat, items);
  assert.equal(dl.advisories.length, 2);
  assert.ok(!dl.violations.some((x) => x.kind === 'unit-size'));
});

test('7: onder de 5 en command models zijn wel fouten', () => {
  const { sw, sa, det, getUnit, items } = tkDetachment();
  const reg = entry(sw, 'core', { count: 20 });
  const klein = entry(sa, 'core', { count: 4, opts: [det], parentUid: reg.uid });
  const cmd = entry(sa, 'core', { count: 5, opts: [det, keyOf(sa, 'command', 'Musician')], parentUid: reg.uid });
  const v = B.validate(lijst(TK, [reg, klein, cmd]), getUnit, items);
  assert.ok(v.entryWarnings.some((w) => w.uid === klein.uid && /below minimum size \(5\)/.test(w.message)));
  assert.ok(v.entryWarnings.some((w) => w.uid === cmd.uid && /cannot include command models \(Musician\)/.test(w.message)));
});

test('7: maximaal twee per regiment; de derde krijgt de melding', () => {
  const { sw, sa, det, getUnit, items } = tkDetachment();
  const reg = entry(sw, 'core', { count: 30 });
  const ds = [1, 2, 3].map(() => entry(sa, 'core', { count: 5, opts: [det], parentUid: reg.uid }));
  const v = B.validate(lijst(TK, [reg, ...ds]), getUnit, items);
  assert.deepEqual(v.advisories.map((a) => a.uid), [ds[2].uid]);
  assert.match(v.advisories[0].message, /already has two detachments/);
});

test('7: regiment weg, of regiment krimpt onder de 10 -- melding, lijst laadt gewoon', () => {
  const { sw, sa, det, getUnit, items } = tkDetachment();
  const reg = entry(sw, 'core', { count: 9 });
  const d = entry(sa, 'core', { count: 5, opts: [det], parentUid: reg.uid });
  assert.ok(B.validate(lijst(TK, [reg, d]), getUnit, items).advisories.some((a) => /too large .*max 4/.test(a.message)));
  const wees = B.validate(lijst(TK, [d]), getUnit, items);
  assert.ok(wees.advisories.some((a) => /no longer in this list/.test(a.message)));
  assert.equal(B.detachmentLabel([d], d, getUnit), 'Detachment — its regiment is no longer in this list');
});

test('7: een unit met BEIDE regels is het een of het ander', () => {
  const { unit, getUnit, items } = ctx('empire-of-man', 'empire-of-man');
  const st = unit('state-troops');
  const det = B.detachmentOptionKey(st);
  const reg = entry(st, 'core', { count: 20 });
  const d1 = entry(st, 'core', { count: 5, opts: [det], parentUid: reg.uid });
  const d2 = entry(st, 'core', { count: 5, opts: [det], parentUid: d1.uid }); // aan een detachment: mag niet
  const entries = [reg, d1, d2];
  assert.deepEqual(B.detachmentParents(entries, d2, getUnit).map((e) => e.uid), [reg.uid]);
  const v = B.validate(lijst('empire-of-man', entries), getUnit, items);
  assert.ok(v.advisories.some((a) => a.uid === d2.uid && /cannot take detachments/.test(a.message)));
  assert.ok(!v.advisories.some((a) => a.uid === d1.uid));
});

test('7: Combined Arms telt detachments niet mee', () => {
  const { unit, getUnit, items } = ctx('empire-of-man', 'empire-of-man');
  const st = unit('state-troops');
  const det = B.detachmentOptionKey(st);
  const regs = [1, 2, 3, 4].map(() => entry(st, 'core', { count: 10 }));
  const d = entry(st, 'core', { count: 5, opts: [det], parentUid: regs[0].uid });
  const v = B.validate(lijst('empire-of-man', [...regs, d], 2000, 'combined-arms'), getUnit, items);
  assert.ok(!v.warnings.some((w) => /Combined Arms allows/.test(w)));
});

test('7: Nuln-detachments (losse detachment-entries) blijven zoals ze waren', () => {
  const { unit } = ctx('empire-of-man', 'city-state-of-nuln');
  const u = unit('state-troops-detachment');
  assert.equal(B.detachmentOptionKey(u), null);
  assert.equal(B.entryMinimum(u, entry(u, 'core')), u.minimum);
});
