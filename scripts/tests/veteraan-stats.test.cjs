// 08-10-2026: veteran abilities in de statline. Grizzled +1 Ld en Weapon Master +1 WS/BS (keuze) komen
// als goud gemarkeerde cel in de profielrij, met de basiswaarde en de bron erbij; max 10; een mount
// zonder eigen Ld en een niet-numerieke waarde blijven ongemoeid; zonder keuze raadt Weapon Master niets.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, f);
const { pasVeteraanToe, profielenMetVeteraan } = require(path.join(root, 'src/lib/veteraanStats.ts'));

const rij = (o) => Object.entries(o).map(([k, v]) => ({ k, v }));
const cel = (stats, k) => stats.find((s) => s.k === k);

test('Grizzled: Ld +1, gemarkeerd met basis en bron', () => {
  const uit = pasVeteraanToe(rij({ WS: '4', BS: '4', Ld: '8' }), [{ t: 'grizzled', keuze: null }]);
  assert.deepEqual(cel(uit, 'Ld'), { k: 'Ld', v: '9', modified: true, base: '8', source: 'Grizzled Veteran' });
  assert.equal(cel(uit, 'WS').modified, undefined);
});

test('twee keer Grizzled telt op, maar nooit boven 10', () => {
  assert.equal(cel(pasVeteraanToe(rij({ Ld: '8' }), [{ t: 'grizzled' }, { t: 'grizzled' }]), 'Ld').v, '10');
  const tien = pasVeteraanToe(rij({ Ld: '10' }), [{ t: 'grizzled' }]);
  assert.equal(cel(tien, 'Ld').v, '10');
  assert.equal(cel(tien, 'Ld').modified, undefined);
});

test('Weapon Master volgt de keuze; zonder keuze niets', () => {
  assert.equal(cel(pasVeteraanToe(rij({ WS: '4', BS: '3', Ld: '8' }), [{ t: 'weapon_master', keuze: 'bs' }]), 'BS').v, '4');
  assert.equal(cel(pasVeteraanToe(rij({ WS: '4', BS: '3', Ld: '8' }), [{ t: 'weapon_master', keuze: 'WS' }]), 'WS').v, '5');
  const geen = pasVeteraanToe(rij({ WS: '4', BS: '3', Ld: '8' }), [{ t: 'weapon_master', keuze: null }]);
  assert.ok(geen.every((s) => !s.modified));
});

test('mount zonder Ld en niet-numerieke waarden blijven staan', () => {
  const [ruiter, paard] = profielenMetVeteraan(
    [{ label: 'Knight', stats: rij({ WS: '4', Ld: '8' }) }, { label: 'Warhorse', stats: rij({ WS: '3', Ld: '-' }) }],
    [{ t: 'grizzled' }, { t: 'weapon_master', keuze: 'ws' }],
  );
  assert.equal(cel(ruiter.stats, 'Ld').v, '9');
  assert.equal(cel(ruiter.stats, 'WS').v, '5');
  assert.ok(paard.stats.every((s) => !s.modified));
  assert.equal(cel(pasVeteraanToe(rij({ WS: '(+1)', Ld: '7' }), [{ t: 'weapon_master', keuze: 'ws' }]), 'WS').v, '(+1)');
});

test('een mount-bonus die er al stond blijft de basis, de bronnen tellen op', () => {
  const uit = pasVeteraanToe([{ k: 'Ld', v: '9', modified: true, base: '8', source: 'Banner' }], [{ t: 'grizzled' }]);
  assert.deepEqual(cel(uit, 'Ld'), { k: 'Ld', v: '10', modified: true, base: '8', source: 'Banner + Grizzled Veteran' });
});

test('abilities zonder statline-effect veranderen niets', () => {
  const stats = rij({ WS: '4', Ld: '8' });
  assert.equal(pasVeteraanToe(stats, [{ t: 'experienced' }, { t: 'spoils', keuze: 'Hand weapon' }, { t: 'fighting_formation' }]), stats);
});
