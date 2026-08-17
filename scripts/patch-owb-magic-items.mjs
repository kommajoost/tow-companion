// Items zonder regeltekst uit de ALGEMENE magic-itemlijst halen.
//
//   node scripts/patch-owb-magic-items.mjs [--droog]
//
// De laatste Arcane Journal (March of Chaos) komt via Old World Builder binnen met de namen en de
// punten, maar zonder beschrijving — bij OWB staan ze zelf ook leeg. Zeventien items die in de
// ALGEMENE lijst zitten, dus die elke faction aangeboden krijgt, en die niemand kan spelen omdat de
// regel ontbreekt. "Die kunnen wel uit de lijsten" (Joost, 17-08).
//
// WAAROM OP LIJST GEFILTERD EN NIET OP "GEEN TEKST":
// Er zijn 24 items zonder tekst, maar zeven daarvan zijn echte spelinhoud waarvan alleen de
// beschrijving mist: Black Lotus, Dark Venom en Manbane (forbidden-poisons), Cry of War, Rune of
// Khaine en Witchbrew (gifts-of-khaine) en de vampiric power Dark Acolyte. Een botte regel "geen
// tekst = eruit" zou die zeven meesleuren en Dark Elves-lijsten slopen. Alleen `general` dus.
//
// ZELFHERSTELLEND: vult OWB de tekst later in, dan komt het item automatisch weer terug — er staat
// geen namenlijst in dit bestand die kan verouderen.
//
// VEILIG VOOR BEWAARDE LIJSTEN: een keuze wordt opgeslagen als `magic/<categorie>/<naam-slug>`
// (magicItemId), niet op arraypositie. Rijen weghalen verschuift dus niets; een lijst die zo'n item
// tóch had, laat het alleen vallen. Dat kan ook niet anders — zonder regeltekst was het onspeelbaar.
import { readFileSync, writeFileSync } from 'node:fs';

const OWB = new URL('../public/owb/', import.meta.url);
const droog = process.argv.includes('--droog');

const itemsUrl = new URL('magic-items.json', OWB);
const items = JSON.parse(readFileSync(itemsUrl, 'utf8'));
const text = JSON.parse(readFileSync(new URL('magic-item-text.json', OWB), 'utf8'));

// Exact de sleutel die de app gebruikt (`magicItemId`): elk niet-alfanumeriek teken wordt een
// streepje, dus "Executioner's Axe" -> executioner-s-axe. Met een andere normalisatie zou dit
// script items als tekstloos aanmerken die gewoon een beschrijving hebben.
const slug = (s) => String(s).toLowerCase().replace(/\{[^}]*\}/g, '')
  .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim().replace(/ /g, '-');

const LIJST = 'general';
const voor = Array.isArray(items[LIJST]) ? items[LIJST] : [];
if (!voor.length) throw new Error(`magic-items.json heeft geen "${LIJST}"-lijst — is de sync veranderd?`);

const eruit = [];
const na = voor.filter((it) => {
  const beschrijving = text[slug(it.name || it.name_en)];
  if (beschrijving && String(beschrijving).trim()) return true;
  eruit.push(`${it.name_en || it.name} (${it.points ?? '?'} pt)`);
  return false;
});

for (const r of eruit) console.log(`  eruit: ${r}`);
console.log(`${eruit.length} van ${voor.length} items uit "${LIJST}" ${droog ? 'zouden vervallen' : 'vervallen'}`);

// Een leeglopende lijst betekent dat de tekstsleutels niet meer matchen, niet dat alles weg moet.
if (na.length < voor.length / 2) {
  throw new Error(`meer dan de helft van "${LIJST}" zou vervallen — dat is een sleutelprobleem, niet een dataprobleem`);
}

if (!droog && eruit.length) {
  items[LIJST] = na;
  writeFileSync(itemsUrl, `${JSON.stringify(items, null, 2)}\n`);
}
