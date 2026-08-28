// Datasheets a draft INTRODUCES that upstream OWB does not carry at all. Injected BEFORE
// compile-renegade-v2, because the compiler's unit index must contain them: the draft's own option
// and statline blocks resolve against that index, and a unit that is absent there ends up as
// captured text instead of applied data.
//
//   node scripts/patch-renegade-added-units.mjs
//
// Idempotent: an addedUnit is replaced by id, never duplicated. The handful of OLDER addedUnits
// (Chaos Dwarf Warriors, Blunderbuss Decimators, Skink Cohorts, Skaven Dregs) predate this script and
// live in the committed overlay JSON via the reseed flow; they are left untouched.
//
// Every unit quotes the draft blocks it is built from. Verify against the draft, never against memory.
import { readFileSync, writeFileSync } from 'node:fs';

const REN = new URL('../public/renegade/', import.meta.url);

const ADDED = [
  {
    pack: 'cd',
    category: 'characters',
    // Bron: cd-referentie blokken 240-254 — "Infernal Guard Commanders", statline
    // "Castellan | 3 | 6 | 4 | 5 | 5 | 3 | 2 | 3 | 9 | 75".
    //
    // NIET dezelfde unit als OWB's "Infernal Castellan": die is de lord-tier (125 pt, Taurus-mounts,
    // magic items 100) en heet in dit draft "Despot". Deze Castellan is de nieuwe hero-tier van de
    // Infernal Guard, zonder mounts, met magic items 75. De naamsverwarring zette eerder 75 punten
    // op de lord — vandaar ook de null-alias in de compiler.
    unit: {
      id: 'castellan',
      name_en: 'Castellan',
      points: 75,
      minimum: 1,
      maximum: 1,
      command: [],
      equipment: [
        { name_en: 'Hand weapon', points: 0, active: true },
        // "May take one of the following: Darkforged weapon (see page 22) +15 • Great weapon +4 •
        //  Fireglaive (see page 22) +3" (blok 248) — one-of, dus de equipment-radiogroep.
        { name_en: 'Darkforged weapon', points: 15 },
        { name_en: 'Great weapon', points: 4 },
        { name_en: 'Fireglaive', points: 3 },
      ],
      armor: [
        { name_en: 'Heavy armour', points: 0, active: true },
      ],
      options: [
        // "May take one of the following: Pistol +5 • Naptha bombs (see page 22) +10" (blok 250).
        // Zelfde vorm als de basis-Castellan in OWB: twee opties met een wederzijdse notitie.
        { name_en: 'Pistol', points: 5, notes: { name_en: 'if not using Naptha bombs' } },
        { name_en: 'Naptha bombs', points: 10, notes: { name_en: 'if not using Pistol' } },
        { name_en: 'Shield', points: 2 },
      ],
      mounts: [],
      // "A Castellan may purchase magic items up to a total of 75 points" (blok 251).
      items: [{
        name_en: 'Magic Items',
        types: ['weapon', 'armor', 'talisman', 'enchanted-item'],
        selected: [],
        maxPoints: 75,
      }],
      lores: [],
      // Blok 252, letterlijk.
      specialRules: {
        name_en: 'Blackshard Armour, Ensorcelled Weapons, Rallying Cry, Resolute, Stubborn, Infernal Taskmaster, Quell Panic',
      },
    },
    // Statline uit blok 241, zodat het infopaneel en de export een profiel hebben.
    profile: {
      key: 'castellan',
      stats: [{ Name: 'Castellan', M: '3', WS: '6', BS: '4', S: '5', T: '5', W: '3', I: '2', A: '3', Ld: '9' }],
      troopType: 'Heavy infantry (character)',
      baseSize: '25 x 25 mm',
    },
  },
  {
    pack: 'cd',
    category: 'core',
    // Bron: het Renegade V2-document, Chaos Dwarfs Grand Army Composition List. De Core-clausule
    // luidt letterlijk: "Chaos Dwarf Warriors, Blunderbus Decimators, Infernal Guard, Hobgoblin
    // Cutthroats | 0-1 Hobgoblin Wolf Riders | 0-1 Black Orc Mob | 0-1 Infernal Ironsworn (...)".
    // De Rare-clausule noemt ze OOK: "Hobgoblin Wolf Riders per Hobgoblin Khan taken, Dreadquake
    // Mortars". Beide gelden dus, en de bron laat je ze naast elkaar nemen (Joost 28-08-2026).
    //
    // WAAROM EEN DUPLICAAT-ID. Een unit staat in de catalogus in precies EEN categorie-array, dus
    // een id kan niet tegelijk core en rare zijn. Dezelfde catalogus lost dat al zo op voor de
    // Infernal Ironsworn: `infernal-ironsworn` (special) naast `infernal-ironsworn-core` (core).
    // Dit is hetzelfde patroon. De compiler kon het niet zelf: hij ziet de unit in twee secties
    // onder een id staan en laat hem dan bewust staan waar hij stond ("named plainly in Core and
    // Rare -- left in rare") in plaats van te gokken. Vandaar hier, met de hand en met de bron erbij.
    //
    // Het profiel is een letterlijke kopie van `hobgoblin-wolf-raiders` uit chaos-dwarfs.json
    // (12 pt, min 5, Feigned Flight/Reserve Move met hun eigen 0-1-per-1000-noten). Alleen het id
    // verschilt, plus de 0-1-noot op de unit zelf.
    //
    // DE 0-1 IS EEN NOOT, GEEN SLOT. De harde 0-X-grenzen staan in composition-rules.json, en die
    // wordt opgezocht op `list.composition` -- daar bestaat geen `cd-renegade-v2`-sleutel. Voor de
    // hele V2-pack worden die caps vandaag dus nergens afgedwongen; ze staan als tekst bij de unit.
    // Deze regel gedraagt zich daarmee precies als elke andere 0-X in dit pack.
    unit: {
      id: 'hobgoblin-wolf-riders-core',
      name_en: 'Hobgoblin Wolf Riders',
      points: 12,
      minimum: 5,
      maximum: 0,
      command: [
        { name_en: 'Boss (champion)', points: 8 },
        { name_en: 'Standard bearer', points: 6 },
        { name_en: 'Musician', points: 6 },
      ],
      equipment: [
        { name_en: 'Hand weapons', points: 0, perModel: true, active: true, equippedDefault: true },
      ],
      armor: [
        { name_en: 'Light armour, Shields', points: 0, perModel: true, active: true },
      ],
      options: [
        { name_en: 'Cavalry spears', points: 0, perModel: true },
        { name_en: 'Shortbow', points: 1, perModel: true, minimum: 0, maximum: 0 },
        { name_en: 'Feigned Flight', points: 2, perModel: true, notes: { name_en: '0-1 per 1000 points' } },
        { name_en: 'Reserve Move', points: 1, perModel: true, notes: { name_en: '0-1 per 1000 points' } },
      ],
      mounts: [],
      items: [],
      lores: [],
      specialRules: {
        name_en: 'Backstab, Evasive, Fast Cavalry, Fire & Flee, Levies, Open Order, Skirmishers, Swiftstride',
      },
      notes: { name_en: '0-1' },
    },
  },
];

for (const spec of ADDED) {
  const url = new URL(`${spec.pack}-renegade-v2.json`, REN);
  const overlay = JSON.parse(readFileSync(url, 'utf8'));
  overlay.addedUnits = overlay.addedUnits ?? {};
  const list = overlay.addedUnits[spec.category] ?? [];
  const at = list.findIndex((u) => u.id === spec.unit.id);
  if (at >= 0) list[at] = spec.unit;
  else list.push(spec.unit);
  overlay.addedUnits[spec.category] = list;
  if (spec.profile) {
    overlay.profiles = overlay.profiles ?? {};
    overlay.profiles[spec.profile.key] = {
      ...(overlay.profiles[spec.profile.key] ?? {}),
      stats: spec.profile.stats,
      troopType: spec.profile.troopType,
      baseSize: spec.profile.baseSize,
    };
  }
  writeFileSync(url, `${JSON.stringify(overlay, null, 2)}\n`);
  console.log(`${spec.pack}: addedUnit ${spec.unit.id} (${spec.unit.points} pt) in ${spec.category}`);
}
