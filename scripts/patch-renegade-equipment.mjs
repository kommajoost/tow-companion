// Apply the ARMOUR changes the drafts make by striking through part of an Equipment line.
//
//   node scripts/patch-renegade-equipment.mjs
//
// Run AFTER compile-renegade-v2.
//
// WHY BY HAND. The overlay covers points, unit size, special rules and option prices. An Equipment line
// is prose, and OWB models armour as a separate "choose 1" group whose entries name both the game term
// and the creature's own hide ("Heavy armour (Scaly skin)"). Mapping "…and plated carapace (counts as
// full plate)" onto that group is a judgement about which catalogue entry is meant, so it is written out
// here per unit with the source line quoted, instead of guessed by a parser.
//
// TWO SHAPES, both taken straight from the surviving text:
//   rename — the draft still gives the unit armour, but of a different class. The Chaos Dwarf war
//            machines dropped from heavy to light; the Bloodthirster's daemonic flesh went up to full
//            plate.
//   erbij  — de draft ZET armour op de Equipment-regel die de catalogus helemaal niet heeft. OWB
//            schrijft basisbewapening als een `armor`-entry die aanstaat en niets kost (zie Infernal
//            Ironsworn: "Full plate armour [aan]"); zonder die entry is er geen enkele plek waar de
//            speler het ziet staan. Daarom hier een upsert i.p.v. een patch.
//   hide   — the draft removed the armour from the Equipment line altogether and gave the unit an
//            Armoured Hide (N) special rule instead (all the Lizardmen scaly-skin entries).
//
// WHY HIDE AND NOT REMOVE. A saved list stores its option choices by ARRAY INDEX, so deleting an entry
// shifts every later option of that unit and silently rewrites people's lists. `hidden` keeps the array
// intact; the builder filters hidden entries out of the picker and re-points a stored selection that
// lands on one (see `owbBuilder.ts`).
import { readFileSync, writeFileSync } from 'node:fs';

const REN = new URL('../public/renegade/', import.meta.url);

const PATCHES = [
  {
    pack: 'cd', "unit": "k'daai-fireborn", erbij: 'Heavy armour',
    bron: "K'daai Fireborn — Equipment: Rage and hellfire (counts as hand weapons), heavy armour (magenta = nieuw)",
  },
  // ── Chaos Dwarfs: war machine crews went from heavy to light armour ───────────────────────────
  {
    pack: 'cd', unit: 'deathshrieker-rocket-launcher', van: 'Heavy armour', naar: 'Light armour',
    bron: 'Equipment: Demolition Rockets (see below), Infernal Incendiaries (see below), hand weapons and light armour  (✂ heavy)',
  },
  {
    pack: 'cd', unit: 'dreadquake-mortar', van: 'Heavy armour', naar: 'Light armour',
    bron: 'Equipment: Dreadquake Mortar (see below), hand weapons and light armour.  (✂ heavy)',
  },
  {
    pack: 'cd', unit: 'magma-cannon', van: 'Heavy armour', naar: 'Light armour',
    bron: 'Equipment: Fire thrower, hand weapons and light armour  (✂ heavy)',
  },
  // ── Daemons: daemonic flesh counts as full plate ──────────────────────────────────────────────
  {
    pack: 'doc', unit: 'bloodthirster', van: 'Heavy armour', naar: 'Full plate armour (Daemonic flesh)',
    bron: 'Equipment: Hand weapon, Lash of Khorne, and daemonic flesh (counts as full plate)  (✂ heavy armour)',
  },
  {
    pack: 'doc', unit: 'soul-grinder', van: 'Heavy armour (Daemonic flesh)', naar: 'Full plate armour (Daemonic flesh)',
    bron: 'Equipment: Hand weapon, iron claw…, and daemonic flesh (counts as full plate)  (✂ heavy armour)',
  },
  // ── Lizardmen: scaly skin is replaced by the Armoured Hide special rule ───────────────────────
  {
    pack: 'lm', unit: 'kroxigors', van: 'Heavy armour (Scaly skin)', naar: 'Full plate armour (Plated carapace)',
    bron: 'Equipment: Great weapons and plated carapace (counts as full plate)  (✂ scaly skin (counts as heavy armour))',
  },
  {
    pack: 'lm', unit: 'temple-guard', van: 'Heavy armour (Scaly skin)', naar: 'Light armour',
    bron: 'Equipment: Hand weapons, halberds, light armour and shields  (✂ scaly skin (counts as heavy armour))',
  },
  {
    pack: 'lm', unit: 'saurus-warrior', verberg: 'Heavy armour (Scaly skin)',
    bron: 'Equipment: Hand weapons, and shields  (✂ scaly skin (counts as heavy armour)) — de unit krijgt Armoured Hide (2)',
  },
  {
    pack: 'lm', unit: 'saurus-oldblood', verberg: 'Heavy armour (Scaly skin)',
    bron: 'Saurus Heroes — Equipment: Hand weapon  (✂ and scaly skin (counts as heavy armour)) — Oldblood krijgt Armoured Hide (2)',
  },
  {
    pack: 'lm', unit: 'saurus-scar-veteran', verberg: 'Heavy armour (Scaly skin)',
    bron: 'Saurus Heroes — Equipment: Hand weapon  (✂ and scaly skin (counts as heavy armour)) — Scar-Veteran krijgt Armoured Hide (1)',
  },
  {
    pack: 'lm', unit: 'skink-chief', verberg: 'Light armour (Calloused hide)',
    bron: 'Skink Heroes — Equipment: Hand weapon  (✂ and calloused hide (counts as light armour)) — krijgt Armoured Hide (1)',
  },
  {
    pack: 'lm', unit: 'skink-priest', verberg: 'Light armour (Calloused hide)*',
    bron: 'Skink Heroes — Equipment: Hand weapon  (✂ and calloused hide (counts as light armour)) — krijgt Armoured Hide (1)',
  },
];

const normOpt = (s) => String(s).toLowerCase().replace(/\{[^}]*\}/g, '')
  .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

const perPack = new Map();
for (const p of PATCHES) {
  if (!perPack.has(p.pack)) perPack.set(p.pack, []);
  perPack.get(p.pack).push(p);
}

let n = 0;
for (const [pack, lijst] of perPack) {
  const overlayUrl = new URL(`${pack}-renegade-v2.json`, REN);
  const overlay = JSON.parse(readFileSync(overlayUrl, 'utf8'));
  const catalogus = JSON.parse(readFileSync(new URL(`${overlay.baseArmy}.json`, new URL('../public/owb/', import.meta.url)), 'utf8'));
  const units = [];
  for (const v of Object.values(catalogus)) if (Array.isArray(v)) units.push(...v);

  for (const p of lijst) {
    // De naam die we patchen moet in de catalogus bestaan, anders patchen we niets en weten we dat niet.
    // Een naamswijziging bovenstrooms (npm run sync-owb) moet hier hoorbaar klappen.
    const doel = p.van ?? p.verberg ?? p.erbij;
    const unit = units.find((u) => u.id === p.unit);
    if (!unit) throw new Error(`${pack}/${p.unit}: unit staat niet in de catalogus`);
    if (p.erbij && (unit.armor ?? []).some((o) => normOpt(o.name_en) === normOpt(doel))) {
      throw new Error(`${pack}/${p.unit}: "${doel}" staat er al — deze patch is overbodig geworden`);
    }
    if (!p.erbij && !(unit.armor ?? []).some((o) => normOpt(o.name_en) === normOpt(doel))) {
      throw new Error(`${pack}/${p.unit}: armour-optie "${doel}" bestaat niet meer in de catalogus — controleer de bron voor je dit aanpast`);
    }
    const patch = overlay.units[p.unit] ?? {};
    patch.options = patch.options ?? [];
    const bestaand = patch.options.findIndex((o) => o.group === 'armor' && normOpt(o.name_en) === normOpt(doel));
    const entry = p.erbij
      ? { group: 'armor', action: 'upsert', name_en: doel, option: { name_en: doel, active: true } }
      : p.naar
        ? { group: 'armor', action: 'patch', name_en: doel, renameTo: p.naar }
        : { group: 'armor', action: 'patch', name_en: doel, option: { hidden: true } };
    if (bestaand >= 0) patch.options[bestaand] = { ...patch.options[bestaand], ...entry };
    else patch.options.push(entry);
    patch._changed = [...new Set([...(patch._changed ?? []), 'equipment'])];
    overlay.units[p.unit] = patch;
    const wat = p.erbij ? `"${doel}" toegevoegd` : p.naar ? `"${doel}" -> "${p.naar}"` : `"${doel}" verborgen`;
    console.log(`${pack}/${p.unit}: ${wat}`);
    n++;
  }
  writeFileSync(overlayUrl, `${JSON.stringify(overlay, null, 2)}\n`);
}
console.log(`${n} armour-wijzigingen toegepast`);
