// Gerichte correcties op de OWB-catalogus in public/owb/, als stap ná de sync.
//
//   node scripts/patch-owb-army-fixes.mjs [--droog]
//
// `public/owb/` is sinds 15-09-2026 onze eigen snapshot (zie sync-owb.mjs). Een handmatige edit in een
// van die bestanden zou de eerstvolgende `npm run sync-owb` stil ongedaan maken; daarom staat elke
// correctie hier, als regel die NA de sync opnieuw wordt toegepast (`sync-owb` in package.json draait
// dit script mee).
//
// IDEMPOTENT: elke correctie zoekt de unit op id en de optie op NAAM, zet een waarde en doet niets als
// die er al staat. Vindt hij de unit of optie niet meer (OWB heeft iets hernoemd), dan is dat een harde
// fout: liever een rode sync dan een correctie die ongemerkt is weggevallen.
//
// Opties worden NOOIT verwijderd of verschoven: een bewaarde lijst verwijst naar `<groep>/<index>`.
import { readFileSync, writeFileSync } from 'node:fs';

const OWB = new URL('../public/owb/', import.meta.url);
const droog = process.argv.includes('--droog');

const CORRECTIES = [
  {
    // Ravening Hordes p. 139 (tow.whfb.app, Necropolis Knights): "Equipment: hand weapons, cavalry
    // spears, light armour and shields". OWB zet light armour als 0-punten-optie zonder `active`, dus
    // ontbrak het in de loadout en daarmee in het spel (armour save). 16-10-2026, opdracht Joost.
    army: 'tomb-kings-of-khemri', unit: 'necropolis-knights', group: 'armor', option: 'Light armour',
    set: { active: true },
  },
  {
    // Skeleton Skirmishers: shields OF warbows, niet allebei. Regel nog niet officieel bevestigd
    // (alleen spelersmelding Alexander 17-08), besluit Joost 16-10. Gelezen door `notWith` in
    // src/lib/owbBuilder.ts: de editor haalt de andere keuze weg, een oude lijst met beide krijgt een
    // melding.
    army: 'tomb-kings-of-khemri', unit: 'skeleton-skirmishers', group: 'options', option: 'Shields',
    set: { notWith: ['Hand weapons, Warbows'] },
  },
];

const gelijk = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const perLeger = new Map();
let gewijzigd = 0;

for (const c of CORRECTIES) {
  if (!perLeger.has(c.army)) perLeger.set(c.army, JSON.parse(readFileSync(new URL(`${c.army}.json`, OWB), 'utf8')));
  const army = perLeger.get(c.army);
  const units = Object.values(army).filter(Array.isArray).flat().filter((u) => u && u.id === c.unit);
  if (!units.length) throw new Error(`${c.army}: unit "${c.unit}" niet gevonden — is de catalogus veranderd?`);
  for (const unit of units) {
    const opt = (unit[c.group] ?? []).find((o) => o && o.name_en === c.option);
    if (!opt) throw new Error(`${c.army}/${c.unit}: optie "${c.option}" niet gevonden in ${c.group}`);
    for (const [k, v] of Object.entries(c.set)) {
      if (gelijk(opt[k], v)) continue;
      console.log(`  ${c.army}/${c.unit} ${c.group} "${c.option}": ${k} ${JSON.stringify(opt[k])} -> ${JSON.stringify(v)}`);
      opt[k] = v;
      gewijzigd += 1;
    }
  }
}

console.log(`${gewijzigd} correctie(s) ${droog ? 'zouden worden toegepast' : 'toegepast'}`);
if (!droog && gewijzigd) {
  // Zelfde vorm als sync-owb.mjs schrijft: compact, zonder slotregel.
  for (const [slug, army] of perLeger) writeFileSync(new URL(`${slug}.json`, OWB), JSON.stringify(army));
}
