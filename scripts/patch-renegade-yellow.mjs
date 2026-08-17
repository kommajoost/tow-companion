// Apply the handful of pack changes the automatic pipeline cannot reach, and book them in the coverage
// ledger so nothing is silently missing.
//
//   node scripts/patch-renegade-yellow.mjs
//
// Run AFTER compile-renegade-v2 and compile-renegade-lores.
//
// WHY THESE CANNOT BE DERIVED. Two reasons, both properties of the source rather than of our parser:
//
//   1. YELLOW. The author highlights work-in-progress in yellow, and the pipeline refuses to publish a
//      yellow block — a half-finished rule read as final is worse than no change at all. But a few of
//      those blocks carry a plain, unambiguous number that has been live in the app for months
//      (Leadbelchers 39, Chaos Furies 11). Dropping them on a clean rebuild would quietly restore the
//      pre-Renegade price, so they are restored here, with the source text quoted.
//   2. UNCOLOURED. The author sometimes forgets to mark an edit. The Firebelly's rule list says "Ogre
//      Kingdoms Charge" — the V2 rename — but the line carries no colour at all, so a colour-driven
//      pipeline cannot see it by construction.
//
// Every entry quotes the source line it comes from. Verify against the draft, never against memory.
import { readFileSync, writeFileSync } from 'node:fs';

const REN = new URL('../public/renegade/', import.meta.url);

const PATCHES = [
  {
    pack: 'ok',
    why: 'statline + Special Rules staan geel (in ontwikkeling); de getallen zelf zijn ondubbelzinnig',
    bron: 'Leadbelcher | 6 | 3 | 3 | 4 | 4 | 3 | 2 | 3 | 7 | 39  ·  Special Rules: Open Order, Fear, Impact Hits (1), Ogre Kingdoms Charge, Ogre Club, Ravenous Hunger',
    unit: 'leadbelchers',
    patch: {
      points: 39,
      _was: 41,
      specialRules: 'Open Order, Fear, Impact Hits (1), Ogre Kingdoms Charge, Ogre Club, Ravenous Hunger',
    },
    zoek: /Ogre Kingdoms Charge, Ogre Club, Ravenous Hunger/,
    doelen: ['units.leadbelchers.points', 'units.leadbelchers.specialRules'],
  },
  {
    pack: 'ok',
    why: 'de bron heeft deze regel NIET gekleurd, dus een kleurgestuurde pijplijn kan hem niet zien',
    bron: 'Special Rules: Armour Bane (1), Blessings of the Volcano God, Fear, Flaming Attacks, Impact Hits (1), Ogre Kingdoms Charge',
    unit: 'firebelly',
    patch: {
      specialRules: 'Armour Bane (1), Blessings of the Volcano God, Fear, Flaming Attacks, Impact Hits (1), Ogre Kingdoms Charge',
    },
    // Geen coverage-boeking: het bronblok is ongekleurd en staat dus niet in het grootboek.
  },
  {
    pack: 'doc',
    why: 'Special Rules staat geel; Regeneration ging van (6+) naar (5+)',
    bron: 'Special Rules: Armour Bane (2, Rot Fly only), Daemonic, Daemons of Nurgle, Fly (9), Poisoned Attacks, Regeneration (5+), Skirmishers, Swiftstride',
    unit: 'plague-drones-of-nurgle',
    patch: {
      specialRules: 'Armour Bane (2, Rot Fly only), Daemonic, Daemons of Nurgle, Fly (9), Poisoned Attacks, Regeneration (5+), Skirmishers, Swiftstride',
    },
    zoek: /Armour Bane \(2, Rot Fly only\)/,
    doelen: ['units.plague-drones-of-nurgle.specialRules'],
  },
  {
    pack: 'doc',
    why: 'statline staat geel; het pack vouwt de vier mark-varianten tot deze ene unit met mark-opties',
    bron: 'Chaos Fury | 4 3 0 | 4 | 3 | 1 | 4 | 1 | 5 | 11',
    unit: 'chaos-furies',
    patch: { points: 11, _was: 12 },
    zoek: /Chaos Fury/,
    doelen: ['units.chaos-furies.points'],
  },
  {
    pack: 'cd',
    why: 'de bron hangt deze optie onder het crew-profiel "Indentured Ogres", en een crew-profiel is geen datasheet waar de compiler op kan resolven',
    bron: 'Indentured Ogres — Options: May take Naptha Bombs +8 points (hoort bij de Ogre Loader-upgrade van de Dreadquake Mortar)',
    unit: 'dreadquake-mortar',
    patch: {
      options: [{ group: 'options', action: 'upsert', name_en: 'Naptha bombs (Ogre Loader)', points: 8, perModel: false }],
    },
    zoek: /May take Naptha Bombs/,
    doelen: ['units.dreadquake-mortar.options'],
  },
  {
    pack: 'cd',
    why: 'het bronblok is ONGEKLEURD — de optie staat al in het basisspel, maar de OWB-catalogus draagt hem niet',
    bron: 'Iron Daemon — Options: May replace its Steam Cannonade with a Skullcracker (see page 11) +10 points',
    unit: 'iron-daemon',
    patch: {
      options: [{ group: 'options', action: 'upsert', name_en: 'Skullcracker (replaces Steam Cannonade)', points: 10, perModel: false }],
    },
  },
  {
    pack: 'de',
    why: 'notitie staat geel, maar hoort bij het wapen dat de speler kiest',
    bron: 'Notes: A Lash & Buckler counts as both a handweapon and shield and allows the use of the Parry special rule.',
    profiel: 'sisters of slaughter',
    notitie: 'Notes: A Lash & Buckler counts as both a handweapon and shield and allows the use of the Parry special rule.',
    zoek: /Lash & Buckler/,
    doelen: ['profiles.sisters of slaughter.notes'],
    status: 'captured',
  },
];

const perPack = new Map();
for (const p of PATCHES) {
  if (!perPack.has(p.pack)) perPack.set(p.pack, []);
  perPack.get(p.pack).push(p);
}

for (const [pack, lijst] of perPack) {
  const overlayUrl = new URL(`${pack}-renegade-v2.json`, REN);
  const coverageUrl = new URL(`${pack}-renegade-v2-coverage.json`, REN);
  const overlay = JSON.parse(readFileSync(overlayUrl, 'utf8'));
  const coverage = JSON.parse(readFileSync(coverageUrl, 'utf8'));
  const reference = JSON.parse(readFileSync(new URL(`${pack}-renegade-v2-reference.json`, REN), 'utf8'));
  const tekstVan = new Map(reference.blocks.map((b) => [b.id,
    (Array.isArray(b.text) ? b.text.join(' ') : String(b.text ?? '')).replace(/\s+/g, ' ')]));

  for (const p of lijst) {
    if (p.unit) {
      const bestaand = overlay.units[p.unit] ?? {};
      const velden = Object.keys(p.patch).filter((f) => !f.startsWith('_'));
      // Options MERGEN op naam, nooit de array vervangen: de compiler heeft er dan al in geschreven.
      const options = p.patch.options
        ? [...(bestaand.options ?? []).filter((o) =>
            !p.patch.options.some((n) => n.name_en === o.name_en && n.group === o.group)),
           ...p.patch.options]
        : bestaand.options;
      overlay.units[p.unit] = {
        ...bestaand,
        ...p.patch,
        ...(options ? { options } : {}),
        _changed: [...new Set([...(bestaand._changed ?? []),
          ...velden.map((f) => (f === 'specialRules' ? 'special-rules' : f))])],
      };
      console.log(`${pack}/${p.unit}: ${velden.join(', ')} — ${p.why}`);
    }
    if (p.profiel) {
      const profiel = overlay.profiles[p.profiel] ?? {};
      profiel.notes = [...new Set([...(profiel.notes ?? []), p.notitie])];
      overlay.profiles[p.profiel] = profiel;
      console.log(`${pack}/${p.profiel}: notitie — ${p.why}`);
    }
    // Boek het bronblok, zodat een 'todo' in het grootboek niet blijft staan voor iets dat wél is gedaan.
    if (!p.zoek) continue;
    // 'todo' (geel) of 'captured' (alleen als tekst bewaard) — beide betekenen: nog niet toegepast.
    const blok = coverage.blocks.find((b) => (b.status === 'todo' || b.status === 'captured')
      && p.zoek.test(tekstVan.get(b.blockId) ?? ''));
    if (!blok) { console.warn(`  (geen open coverage-blok gevonden voor ${p.unit ?? p.profiel})`); continue; }
    const status = p.status ?? 'applied';
    if (blok.status !== status) {
      coverage.counts[blok.status] -= 1;
      coverage.counts[status] = (coverage.counts[status] ?? 0) + 1;
    }
    blok.status = status;
    blok.targets = p.doelen;
    blok.reason = `met de hand toegepast: ${p.why}`;
  }
  writeFileSync(overlayUrl, `${JSON.stringify(overlay, null, 2)}\n`);
  writeFileSync(coverageUrl, `${JSON.stringify(coverage, null, 1)}\n`);
}
