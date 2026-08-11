// Write each pack's LORE PAGE from its reference, verbatim.
//
//   node scripts/compile-renegade-lores.mjs           # every pack that patches a lore
//   node scripts/compile-renegade-lores.mjs vc        # one pack
//   node scripts/compile-renegade-lores.mjs --toon     # preview, write nothing
//
// WHY THIS IS A SEPARATE STEP. The wiki keeps one page per lore with the spell texts baked in, plus
// separate pages per spell. compile-renegade-v2 rewrites the separate spell pages, so the player still
// read the v1 pack's lore page — Cursing Word at 7+ instead of 9+, Power of Darkness missing entirely.
// Nobody opens the single-spell page; you tap the special rule on the unit, which opens the lore.
//
// WHY THE BOUNDS ARE WHAT THEY ARE. Two traps, both hit in practice:
//   - The lore heading doubles as the section heading for the whole army list, so "every block under
//     Lore of Naggaroth" swallowed every Dark Elf datasheet (38 "spells", 305 lines). The lore ends at
//     the first block the reference attributes to a unit — `unitContext` — which is a fact from the
//     source, not a judgement.
//   - Inside that range a sub-heading can still run on past its spell ("Raise Dead" continues over the
//     Vampires datasheet). A spell is a block group that states a Casting Value; nothing else is.
//
// Everything is copied across as it stands. No field parsing, no reflowing: the packs disagree about
// layout (one puts Type/Casting Value/Range on a single line, another on three) and every attempt to
// normalise that is an opportunity to invent a rule the author did not write.
import { readFileSync, writeFileSync } from 'node:fs';

const REN = new URL('../public/renegade/', import.meta.url);
const PACKS = ['de', 'sk', 'ok', 'cd', 'doc', 'lm', 'vc'];
const args = process.argv.slice(2);
const toon = args.includes('--toon');
const only = args.filter((a) => !a.startsWith('--'));

const norm = (v) => String(v ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const tekst = (block) => (Array.isArray(block.text) ? block.text.join(' ') : String(block.text ?? ''))
  .replace(/\s+/g, ' ').trim();
/** A table becomes one line per row; a paragraph stays one line. */
const regels = (block) => (block.type === 'table'
  ? (block.rows ?? []).map((row) => row.map((cell) => String(cell.text ?? '').replace(/\s+/g, ' ').trim())
    .filter(Boolean).join(' | ')).filter(Boolean)
  : (tekst(block) ? [tekst(block)] : []));

let gewijzigd = 0;
for (const key of PACKS) {
  if (only.length && !only.includes(key)) continue;
  const overlayUrl = new URL(`${key}-renegade-v2.json`, REN);
  const overlay = JSON.parse(readFileSync(overlayUrl, 'utf8'));
  const lores = Object.keys(overlay.lores ?? {});
  if (!lores.length) continue;
  const blocks = JSON.parse(readFileSync(new URL(`${key}-renegade-v2-reference.json`, REN), 'utf8')).blocks;

  let schreef = false;
  for (const loreSlug of lores) {
    const naam = overlay.lores[loreSlug].name ?? loreSlug;
    // Sommige packs zetten de lore-kop als echte <h1>, andere als vetgedrukte alinea die de importer
    // als visuele kop herkent (Dark Elves). Beide gelden; de inhoudsopgave-regel ("Lore of Naggaroth
     // 26") niet, want die matcht de naam niet exact.
    const start = blocks.findIndex((b) => (b.type === 'heading' || b.visualHeadingLevel)
      && norm(tekst(b)) === norm(naam));
    if (start < 0) {
      console.warn(`${key}/${loreSlug}: geen kop "${naam}" in de referentie — overgeslagen`);
      continue;
    }
    let eind = start + 1;
    while (eind < blocks.length && blocks[eind].unitContext == null) eind++;

    // Groepeer op sub-kop en houd alleen de groepen die een Casting Value noemen.
    const groepen = new Map();
    const intro = [];
    let sub = null;
    for (let i = start + 1; i < eind; i++) {
      const block = blocks[i];
      const isSub = block.type === 'heading' || block.visualHeadingLevel;
      if (isSub) { sub = tekst(block); if (!groepen.has(sub)) groepen.set(sub, []); continue; }
      if (sub === null) intro.push(...regels(block));
      else groepen.get(sub).push(...regels(block));
    }
    const body = [...intro];
    const spreuken = [];
    for (const [spreuk, lijnen] of groepen) {
      if (!/Casting Value/i.test(lijnen.join(' '))) continue;
      spreuken.push(spreuk);
      body.push(spreuk, ...lijnen);
    }
    if (!spreuken.length) {
      console.warn(`${key}/${loreSlug}: geen spreuk met een Casting Value gevonden — overgeslagen`);
      continue;
    }

    // `overrides` wijst naar de basis-regelpagina die we vervangen: de Renegade-variant als die er is.
    const bestaand = overlay.rules?.[loreSlug]?.overrides;
    const overrides = bestaand ?? `${loreSlug}-renegade`;
    console.log(`${key}/${loreSlug}: ${spreuken.length} spreuken (${spreuken.join(', ')}), ${body.length} regels`);
    if (toon) continue;
    overlay.rules = overlay.rules ?? {};
    overlay.rules[loreSlug] = { name_en: naam, body, overrides };
    schreef = true;
  }
  if (schreef) { writeFileSync(overlayUrl, `${JSON.stringify(overlay, null, 2)}\n`); gewijzigd++; }
}
if (!toon) console.log(`lore-pagina's geschreven voor ${gewijzigd} packs`);
