// Contract and regression checks for the machine-readable Renegade V2 source layer.
import { readFileSync } from 'node:fs';

const DIR = new URL('../public/renegade/', import.meta.url);
const FILES = [
  'de-renegade-v2-reference.json',
  'sk-renegade-v2-reference.json',
  'ok-renegade-v2-reference.json',
  'cd-renegade-v2-reference.json',
  'doc-renegade-v2-reference.json',
  'lm-renegade-v2-reference.json',
];
const TABLE_TYPES = new Set(['statline', 'weapon-profile', 'other']);
const ROW_ROLES = new Set(['rank-and-file', 'champion', 'base-model', 'alternate-profile', 'mount', 'crew-or-mount']);
const POINTS_BASES = new Set(['per-model', 'per-unit', 'included', 'fixed']);
const errors = [];
const assert = (condition, message) => { if (!condition) errors.push(message); };

const documents = new Map();
for (const file of FILES) {
  const reference = JSON.parse(readFileSync(new URL(file, DIR), 'utf8'));
  documents.set(file, reference);
  assert(reference.schemaVersion === 2, `${file}: expected schemaVersion 2`);

  const ids = new Set();
  for (const block of reference.blocks) {
    assert(!ids.has(block.id), `${file}: duplicate block id ${block.id}`);
    ids.add(block.id);
    assert(Array.isArray(block.headingPath), `${file}/${block.id}: headingPath is missing`);
    assert(block.headingPath.length > 0 || block.scope === 'front-matter', `${file}/${block.id}: army-list block has no headingPath`);
    assert(block.context?.profile !== 'M WS BS S T W I A Ld Points', `${file}/${block.id}: table header leaked into context.profile`);

    if (block.type === 'table') {
      assert(TABLE_TYPES.has(block.tableType), `${file}/${block.id}: unknown tableType ${block.tableType}`);
      if (block.tableType === 'statline') {
        assert(Number.isInteger(block.headerRowIndex), `${file}/${block.id}: statline has no headerRowIndex`);
        assert(block.statlineRows?.length > 0, `${file}/${block.id}: statline has no classified rows`);
        assert(['per-model', 'per-unit'].includes(block.pointsBasis), `${file}/${block.id}: statline has no pointsBasis`);
        for (const row of block.statlineRows ?? []) {
          assert(ROW_ROLES.has(row.role), `${file}/${block.id}/row${row.rowIndex}: unknown role ${row.role}`);
          assert(POINTS_BASES.has(row.points?.basis), `${file}/${block.id}/row${row.rowIndex}: unknown points basis ${row.points?.basis}`);
          if (row.points?.raw === '-') {
            assert(row.points.value === null && row.points.basis === 'included', `${file}/${block.id}/row${row.rowIndex}: "-" must mean included, not zero`);
          }
        }
      }
    }

    for (const mention of block.pointsMentions ?? []) {
      assert(POINTS_BASES.has(mention.basis), `${file}/${block.id}: unknown points mention basis ${mention.basis}`);
    }
  }
  for (const id of reference.changedBlockIds) assert(ids.has(id), `${file}: changed block ${id} does not exist`);
}

// The collision that exposed the old context bug: the same component name belongs to two units.
const daemons = documents.get('doc-renegade-v2-reference.json');
const bloodletters = daemons.blocks.find((block) => block.id === 'b0237');
const bloodcrushers = daemons.blocks.find((block) => block.id === 'b0254');
assert(
  JSON.stringify(bloodletters?.headingPath) === JSON.stringify(['The Daemonic Armoury', 'Bloodletters Of Khorne']),
  'Daemons/b0237: Bloodletters unit headingPath regression',
);
assert(
  bloodletters?.statlineRows?.[0]?.points?.value === 13 &&
  bloodletters?.statlineRows?.[0]?.points?.basis === 'per-model',
  'Daemons/b0237: Bloodletter must cost 13 per model',
);
assert(
  JSON.stringify(bloodcrushers?.headingPath) === JSON.stringify(['The Daemonic Armoury', 'Bloodcrushers Of Khorne']),
  'Daemons/b0254: Bloodcrushers unit headingPath regression',
);
assert(
  bloodcrushers?.statlineRows?.[0]?.points?.value === 65 &&
  bloodcrushers?.statlineRows?.[0]?.points?.basis === 'per-model',
  'Daemons/b0254: Bloodcrusher Bloodletter component must cost 65 per model',
);
assert(
  bloodcrushers?.statlineRows?.some((row) =>
    row.name === 'Juggernaut of Khorne' && row.role === 'crew-or-mount' &&
    row.points.raw === '-' && row.points.value === null && row.points.basis === 'included'),
  'Daemons/b0254: Juggernaut "-" row must be an included crew-or-mount profile',
);

// Loose option paragraphs/lists must inherit the unit and preserve explicit per-unit pricing.
const chaosDwarfs = documents.get('cd-renegade-v2-reference.json');
const deathmaskOption = chaosDwarfs.blocks.find((block) => block.text.includes('Deathmask (champion) +6 points per unit'));
assert(deathmaskOption?.headingPath.includes('Infernal Guard'), 'Chaos Dwarfs: Deathmask option lost its Infernal Guard context');
assert(
  deathmaskOption?.pointsMentions.some((mention) => mention.value === 6 && mention.basis === 'per-unit'),
  'Chaos Dwarfs: Deathmask +6 points per unit was not classified',
);

if (errors.length) {
  console.error(`Renegade reference validation FAILED (${errors.length})`);
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

const totalBlocks = [...documents.values()].reduce((sum, reference) => sum + reference.blocks.length, 0);
const statlines = [...documents.values()].reduce(
  (sum, reference) => sum + reference.blocks.filter((block) => block.tableType === 'statline').length,
  0,
);
console.log(`Renegade reference validation OK: ${FILES.length} documents, ${totalBlocks} blocks, ${statlines} statline tables`);
