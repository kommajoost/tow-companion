// Structural and high-risk regression checks for the compiled Renegade V2 overlays.
// This deliberately validates the generated public contract rather than importer internals.
import { readFileSync } from 'node:fs';

const REN = new URL('../public/renegade/', import.meta.url);
const OWB = new URL('../public/owb/', import.meta.url);
const PUBLIC = new URL('../public/', import.meta.url);
const PACKS = ['de', 'sk', 'ok', 'cd', 'doc', 'lm', 'vc'];
const fail = (message) => { throw new Error(message); };
const read = (name) => JSON.parse(readFileSync(new URL(name, REN), 'utf8'));
const assert = (condition, message) => { if (!condition) fail(message); };
const norm = (value) => String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

for (const key of PACKS) {
  const overlay = read(`${key}-renegade-v2.json`);
  const reference = read(`${key}-renegade-v2-reference.json`);
  const coverage = read(`${key}-renegade-v2-coverage.json`);

  assert(reference.schemaVersion === 3, `${key}: reference must use schema v3`);
  assert(overlay.id === `${key}-renegade-v2`, `${key}: wrong overlay id`);
  assert(overlay.scope === 'points-and-rules', `${key}: incomplete overlay scope`);
  assert(overlay.inheritsComposition || overlay.composition, `${key}: composition mapping missing`);

  // Een OPTIE kan in de catalogus getagd zijn voor een Renegade-compositie ('vc-renegade'). Erft het
  // pack die niet, dan verbergt applyOverlay hem — en een verborgen optie ziet eruit als een optie die
  // niet bestaat. Zo verdween Full plate armour bij de vampires (Joost 11-08). Deze toets vindt elke
  // compositie waar de catalogus opties aan hangt en eist dat het pack er precies één van erft.
  const baseVoorOpties = (() => {
    try { return JSON.parse(readFileSync(new URL(`${overlay.baseArmy}.json`, OWB), 'utf8')); } catch { return null; }
  })();
  if (baseVoorOpties) {
    const comps = new Set();
    for (const units of Object.values(baseVoorOpties)) {
      if (!Array.isArray(units)) continue;
      for (const unit of units) {
        for (const group of ['command', 'equipment', 'armor', 'options', 'mounts']) {
          const loop = (items) => {
            for (const option of items ?? []) {
              if (typeof option.armyComposition === 'string') comps.add(option.armyComposition);
              loop(option.options);
            }
          };
          loop(unit[group]);
        }
      }
    }
    for (const comp of comps) {
      if (!/-renegade$/.test(comp)) continue;
      assert(overlay.inheritsComposition === comp,
        `${key}: catalogus tagt opties voor '${comp}' maar het pack erft '${overlay.inheritsComposition}' — die opties worden verborgen`);
    }
  }

  const changed = reference.blocks.filter((block) =>
    block.scope === 'army-list' && Array.isArray(block.changeKinds) && block.changeKinds.length);
  assert(coverage.blocks.length === changed.length, `${key}: coverage does not contain every changed block`);
  assert(new Set(coverage.blocks.map((block) => block.blockId)).size === changed.length,
    `${key}: duplicate or missing coverage block ids`);
  assert((coverage.counts.unresolved ?? 0) === 0, `${key}: unresolved non-todo source blocks remain`);
  assert((coverage.counts.unsupported ?? 0) === 0, `${key}: unsupported non-todo source blocks remain`);

  // De basiscatalogus van dit pack — nodig om te toetsen of een MOUNT die de overlay toevoegt
  // überhaupt bij die unit hoort. Ontbreekt het bestand, dan slaan we die toets over in plaats van
  // de hele validatie te laten vallen.
  let basis = null;
  try { basis = JSON.parse(readFileSync(new URL(`${overlay.baseArmy}.json`, OWB), 'utf8')); } catch { basis = null; }
  const basisUnit = (id) => {
    if (!basis) return null;
    for (const arr of Object.values(basis)) {
      if (!Array.isArray(arr)) continue;
      const hit = arr.find((u) => u && u.id === id);
      if (hit) return hit;
    }
    return null;
  };

  for (const [unitId, patch] of Object.entries(overlay.units)) {
    if (patch.points != null) assert(Number.isFinite(patch.points) && patch.points >= 0, `${key}/${unitId}: invalid points`);
    if (patch.minimum != null) assert(Number.isInteger(patch.minimum) && patch.minimum > 0, `${key}/${unitId}: invalid minimum`);
    if (patch.maximum != null) assert(Number.isInteger(patch.maximum) && patch.maximum >= patch.minimum, `${key}/${unitId}: invalid maximum`);
    assert(!/[,;]\s*$/.test(patch.specialRules ?? ''), `${key}/${unitId}: truncated special-rules line`);
    for (const option of patch.options ?? []) {
      assert(['command', 'equipment', 'armor', 'options', 'mounts'].includes(option.group),
        `${key}/${unitId}: invalid option group ${option.group}`);
      assert(option.name_en && typeof option.name_en === 'string', `${key}/${unitId}: option without name`);
      if (option.points != null) assert(Number.isFinite(option.points) && option.points >= 0,
        `${key}/${unitId}/${option.name_en}: invalid option points`);
      // MOUNTS: een unit mag alleen een rijdier krijgen dat de basiscatalogus al voor die unit kent.
      //
      // Dit is een tripwire, geen smaakkwestie. Op 02-08 gaf de overlay de Khainite Assassin drie
      // mounts, de Firebelly een Stonehorn en de Hunter "Ambushers" en "Scouts" als rijdier. Oorzaak:
      // de zin "A Tyrant, Bruiser or Hunter may be mounted on a:" werd door de extractie op de komma
      // als KOP gelezen, waardoor het unit-anker verschoof en een gedeelde "Character Mounts"-sectie
      // aan de verkeerde unit hing. Dat is stil fout gegaan tot een speler het zag.
      //
      // Een nieuwe mount is bijna nooit wat Renegade doet — het herprijst er hooguit een. Dus: staat
      // hij niet in de basis, dan is het vrijwel zeker drift en moet de compilatie klappen in plaats
      // van het in de app te zetten. Is het tóch bedoeld, dan hoort de mount eerst in de catalogus.
      //
      // GENEST MEEREKENEN: OWB hangt "Unless mounted, may have one of the following" op als
      // SUB-opties onder de mount "On foot" (Hunter: Ambushers, Scouts, Vanguard). Die zijn dus
      // gewone mounts-groep-opties en mogen niet als drift gelden — deze check keek eerst alleen naar
      // de bovenste laag en liet daardoor een terechte herprijzing (Ambushers 10 -> 6) klappen.
      if (option.group === 'mounts' && option.action !== 'remove') {
        const bu = basisUnit(unitId);
        if (bu) {
          const namen = new Set();
          const loop = (items) => {
            for (const m of items ?? []) { if (m?.name_en) namen.add(norm(m.name_en)); loop(m.options); }
          };
          loop(bu.mounts);
          assert(namen.has(norm(option.name_en)),
            `${key}/${unitId}: overlay voegt mount "${option.name_en}" toe die de catalogus niet voor deze unit kent — waarschijnlijk anker-drift in de extractie`);
        }
      }
    }
  }

  // LORES: een pack dat een lore aanpast moet die lore ook als REGELPAGINA overschrijven.
  //
  // De wiki heeft per lore één pagina met de spreukteksten eringebakken, plus losse spreukpagina's.
  // De compiler overschreef alleen die losse pagina's, dus de speler kreeg de lore-pagina van het
  // v1-pack te zien: Cursing Word op 7+ in plaats van 9+, en Power of Darkness ontbrak helemaal
  // (Joost 10-08). De losse spreuk klopte wel — maar niemand opent die; je tikt op de special rule.
  for (const [loreSlug, patch] of Object.entries(overlay.lores ?? {})) {
    const rule = Object.values(overlay.rules ?? {})
      .find((r) => typeof r.overrides === 'string' && r.overrides.startsWith(loreSlug));
    assert(rule, `${key}/${loreSlug}: pack past de lore aan maar overschrijft de lore-PAGINA niet — dan leest de speler de oude versie`);
    // Apostrof-ongevoelig: de pagina houdt de typografische apostrof uit de brontekst
    // ("Vanhal’s"), de spreukenlijst krijgt via de compiler een rechte. Beide horen zo, en de
    // pagina verbatim laten weegt zwaarder dan een vergelijking die daarover struikelt.
    const plat = (value) => String(value).toLowerCase().replace(/[‘’ʼ]/g, "'");
    const body = plat((rule.body ?? []).join(' '));
    for (const spell of patch.spells ?? []) {
      assert(body.includes(plat(spell.name)),
        `${key}/${loreSlug}: "${spell.name}" staat niet op de lore-pagina van het pack`);
    }
  }

  for (const [name, profile] of Object.entries(overlay.profiles ?? {})) {
    for (const row of profile.stats ?? []) {
      for (const field of ['Name', 'M', 'WS', 'BS', 'S', 'T', 'W', 'I', 'A', 'Ld']) {
        assert(typeof row[field] === 'string' && row[field].length > 0, `${key}/${name}: incomplete stat row (${field})`);
      }
    }
  }

  for (const [slug, rule] of Object.entries(overlay.rules ?? {})) {
    assert(rule.name_en && Array.isArray(rule.body), `${key}/${slug}: malformed rule`);
    if (rule.weaponProfile) {
      for (const field of ['range', 'strength', 'ap', 'specialRules']) {
        assert(typeof rule.weaponProfile[field] === 'string', `${key}/${slug}: malformed weapon profile (${field})`);
      }
    }
  }

  for (const [listId, items] of Object.entries(overlay.magicItems ?? {})) {
    const names = items.map((item) => norm(item.name_en));
    assert(new Set(names).size === names.length, `${key}/${listId}: duplicate magic-item names`);
    for (const item of items) assert(item.name_en && Number.isFinite(item.points) && item.type,
      `${key}/${listId}: malformed magic item`);
  }

  const serialised = JSON.stringify(overlay);
  assert(!/ï¿½|â€”|â€™|Â·/.test(serialised), `${key}: mojibake in overlay output`);
}

const de = read('de-renegade-v2.json');
const baseRules = JSON.parse(readFileSync(new URL('rules.json', PUBLIC), 'utf8'));
assert(de.composition?.includeOnly === true, 'de: explicit V2 composition allow-list missing');
assert(de.units['repeater-crossbowmen']?.minimum === 5, 'de: Repeater Crossbowmen minimum');
assert(de.rules['har-ganeth-greatsword-profile']?.weaponProfile?.ap === '-2'
  || de.rules['har-ganeth']?.weaponProfile?.ap === '-2', 'de: Har Ganeth greatsword AP');
assert(de.profiles.manticore?.stats?.[0]?.T === '(+2)', 'de: Manticore rider Toughness modifier');
assert(de.profiles.manticore?.stats?.[0]?.W === '(+4)', 'de: Manticore rider Wounds modifier');
assert(de.profiles.manticore?.specialRules?.includes('Wilful Beast'), 'de: Manticore popup rules missing');
assert(de.profiles.manticore?.troopType === 'Monstrous creature', 'de: Manticore troop type missing');
assert(de.profiles.manticore?.baseSize === '60 x 100 mm', 'de: Manticore base size missing');
assert(de.profiles.manticore?.equipment?.length, 'de: Manticore equipment missing');
// Genormaliseerd vergelijken, niet letterlijk: de bron is hier zelf inconsistent — de KOP schrijft
// "Severed…Another" zonder spatie, de regellijst van de unit "Severed… Another" met. De app
// normaliseert leestekens en witruimte weg bij het opzoeken, dus de koppeling werkt; een letterlijke
// toets hier zou alleen die bron-inconsistentie tot bouwfout verheffen.
const hydraRuleName = 'If One Head is Severed… Another Takes Its Place';
const hydraRule = de.rules['if-one-head-is-severed-another-takes-its-place'];
assert(de.units['war-hydra']?.specialRules?.split(',').map((rule) => norm(rule)).includes(norm(hydraRuleName)),
  'de: War Hydra does not reference its V2 regeneration rule');
assert(norm(hydraRule?.name_en) === norm(hydraRuleName), 'de: War Hydra V2 regeneration rule name missing');
assert(hydraRule?.body?.join(' ').includes('roll a D6 for each wound that the War Hydra has lost')
  && hydraRule.body.join(' ').includes('On each roll of a 4+ the War Hydra immediately recovers a wound.'),
  'de: War Hydra V2 regeneration rule explanation missing or incomplete');
assert(!(de.magicItems['dark-elves'] ?? []).some((item) =>
  /upgrade one model|may purchase magic items/i.test(item.name_en)),
  'de: unit upgrades leaked into the global magic-item catalogue');
assert(!Object.values(de.magicItemText ?? {}).some((item) =>
  /(?:^|\n\n)(?:Magic Weapons|Magic Armour|Talismans|Enchanted Items|Arcane Items|Magic Standards)$/i.test(item.body ?? '')),
  'de: a magic-item popup contains the next category heading');
const naggarothBase = baseRules.lores?.['lore-of-naggaroth']?.spells ?? [];
const naggarothPatch = de.lores?.['lore-of-naggaroth']?.spells ?? [];
const naggarothMerged = [...naggarothBase];
for (const spell of naggarothPatch) {
  const at = naggarothMerged.findIndex((candidate) =>
    candidate.slug === spell.slug || norm(candidate.name) === norm(spell.name));
  if (at >= 0) naggarothMerged[at] = spell;
  else naggarothMerged.push(spell);
}
assert(['Black Horror', 'Cursing Word', 'Power of Darkness'].every((name) =>
  naggarothMerged.some((spell) => spell.name === name)),
  'de: Lore of Naggaroth popup does not contain the complete V2 spell list');
assert(de.rules['spell-cursing-word']?.body?.some((line) => /Casting Value: 9\+/.test(line))
  && de.rules['spell-power-of-darkness']?.body?.some((line) => /Casting Value: 7\+/.test(line)),
  'de: Lore of Naggaroth V2 spell text missing');

const sk = read('sk-renegade-v2.json');
assert(sk.addedUnits?.core?.some((unit) => unit.id === 'skaven-dregs' && unit.points === 2), 'sk: Skaven Dregs missing');

const ok = read('ok-renegade-v2.json');
assert(ok.units.yhetees?.options?.some((option) => norm(option.name_en) === 'ambushers' && option.points === 3),
  'ok: Yhetee Ambushers option');

const cd = read('cd-renegade-v2.json');
assert(cd.addedUnits?.core?.some((unit) => unit.id === 'chaos-dwarf-warriors'), 'cd: Chaos Dwarf Warriors missing');

// De Despot/Castellan-scheiding (speler-melding 16-08). Het draft hernoemt OWB's lord-tier Infernal
// Castellan (125, Taurus-mounts) naar "Despot" en introduceert een NIEUWE, lichtere "Castellan"
// (75) als Infernal Guard Commander. Vóór deze toets verkocht de app de lord voor 75 punten.
assert(cd.units['infernal-castellan']?.replace?.name_en === 'Despot', 'cd: lord-tier moet Despot heten');
assert(cd.units['infernal-castellan']?.points === undefined, 'cd: Despot blijft 125 — een puntpatch hier is de oude verwisseling');
assert(cd.addedUnits?.characters?.some((u) => u.id === 'castellan' && u.points === 75),
  'cd: de nieuwe Castellan (75, Infernal Guard Commander) ontbreekt');
assert(cd.units['sorcerer-prophet']?.points === 175, 'cd: Sorcerer-Prophet moet 175 zijn');
assert((cd.units['sorcerer-prophet']?.replace?.lores ?? []).includes('battle-magic'),
  'cd: Sorcerers of Hashut moeten Battle Magic als lore-keuze hebben');
assert(cd.units['infernal-seneschal']?.points === 65, 'cd: Seneschal moet 65 zijn');
assert((cd.units['infernal-seneschal']?.options ?? []).some((o) => /darkforged/i.test(o.name_en)),
  'cd: de gedeelde Lords-opties horen ook op de Seneschal');
assert(cd.profiles?.despot?.stats?.[0]?.WS === '7', 'cd: Despot-statline (WS7) ontbreekt');

// De doelwit-machine zelf, op het geval dat hem afdwong: de Lord-prijs voor Level 2 is 30, de
// Thrall-prijs 60, en de Thrall mag geen Level 3.
const vcDoel = read('vc-renegade-v2.json');
const lordOpts = vcDoel.units['vampire-count']?.options ?? [];
const thrallOpts = vcDoel.units['vampire-thrall']?.options ?? [];
assert(lordOpts.some((o) => /level 2/i.test(o.name_en) && o.points === 30),
  'vc: Vampire Lord Level 2 moet +30 zijn (niet de Thrall-prijs)');
assert(!thrallOpts.some((o) => /level 3/i.test(o.name_en)),
  'vc: een Vampire Thrall mag geen Level 3 Wizard worden');
assert(cd.addedUnits?.core?.some((unit) => unit.id === 'blunderbuss-decimators'), 'cd: Blunderbuss Decimators missing');

const doc = read('doc-renegade-v2.json');
assert(doc.units['bloodletters-of-khorne']?.points === 13, 'doc: Bloodletters must stay 13 points per model');

const lm = read('lm-renegade-v2.json');
assert(lm.addedUnits?.core?.some((unit) => unit.id === 'skink-cohorts' && unit.points === 5), 'lm: Skink Cohorts missing');
// Het draft STREEPT Furious Charge door bij de Ripperdactyl Riders. Zolang de importer doorgestreepte
// tekst negeerde, plakte "Furious Charge" tegen "Predatory Fighter" en leek dat een ontbrekende komma —
// daar stond een reparatie voor in de compiler. De oorzaak is weg, dus deze toets bewaakt nu wat er
// werkelijk hoort te staan: de regel is vervallen, Predatory Fighter staat er los.
const ripper = lm.units['ripperdactyl-riders']?.specialRules ?? '';
assert(!/Furious Charge/.test(ripper), 'lm: Ripperdactyl houdt Furious Charge, maar het draft streept die door');
assert(/Predatory Fighter \(Ripperdactyl only\)/.test(ripper), 'lm: Ripperdactyl mist Predatory Fighter');

console.log(`Renegade V2 overlays validated: ${PACKS.length} packs`);
