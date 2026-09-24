// Reviewed corrections against Dark Elves Renegades DRAFT V1.5.2.2.docx, 24-09-2026.
// SHA256 ff2e218741017c793a7abee224f58bef870a77a39d2d152e2671a442e8f48bc6.
// Only this overlay changes; OWB/Legacy and the other Renegade packs remain source data.
// Reapplied after compilation so a future import cannot silently undo these decisions.
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const read = (name) => JSON.parse(readFileSync(new URL(`../public/${name}`, import.meta.url), 'utf8'));
const sameName = (a, b) => a.toLowerCase() === b.toLowerCase();

export function correctDarkElvesV2(overlay) {
  if (overlay.id !== 'de-renegade-v2') throw new Error('Dark Elves correction called for another pack');
  if (overlay.packVersion !== '1.5.2.2') throw new Error('Re-review the Dark Elves corrections against the new DOCX version');
  const base = read('owb/dark-elves.json');
  const unit = (id) => Object.values(base).flat().find((u) => u.id === id);
  const patchUnit = (id) => overlay.units[id] ??= {};
  // Patch existing slots in place: stored command/0 and mounts/4 keep their meaning.
  const option = (id, group, name, changes) => {
    if (!unit(id)?.[group]?.some((o) => sameName(o.name_en, name))) throw new Error(`Missing source option ${id}/${group}/${name}`);
    const patches = patchUnit(id).options ??= [];
    const existing = patches.find((p) => p.group === group && sameName(p.name_en, name));
    if (existing) Object.assign(existing, changes);
    else patches.push({ group, action: 'patch', name_en: name, ...changes });
  };

  // P0617, P0625–P0629: armour is free; the four upgrades share a UNIT allowance.
  option('dark-elf-shades', 'armor', 'Light armour', { points: 0, option: { active: true } });
  for (const name of ['Ambushers', 'Chariot Runners', 'Veteran', 'Feigned Flight']) {
    const p = patchUnit('dark-elf-shades').options.find((p) => p.group === 'options' && sameName(p.name_en, name));
    if (!p) throw new Error(`Missing imported Shades upgrade ${name}`);
    p.option = { ...p.option, notes: { name_en: '0-1 unit per 1,000 points may take these upgrades' },
      unitLimit: { group: 'de-v2-shades-upgrades', max: 1, perPoints: 1000 } };
  }
  overlay.composition.units['dark-elf-shades'].notes = '0-1 unit per 1,000 points may take Ambushers, Chariot Runners, Veteran and/or Feigned Flight (+1 point per model each).';

  // P0606, P0668/P0672: champions and their own item allowances.
  const magicTypes = ['weapon', 'armor', 'talisman', 'enchanted-item'];
  option('har-ganeth-executioners', 'command', 'Draich Master (champion)', {
    option: { magic: { types: magicTypes, maxPoints: 50, multipleItems: true } },
  });
  option('sisters-of-slaughter', 'command', 'Hag (champion)', {
    renameTo: 'Handmaiden of Shards (champion)', points: 7,
    option: { magic: { types: magicTypes, maxPoints: 25, multipleItems: true } },
  });
  overlay.profiles['sisters of slaughter'].replaceStats = true;

  // P0348, T0814/P0827: one missile choice; mount price equals the chariot price.
  for (const id of ['dark-elf-dreadlord', 'dark-elf-master']) {
    option(id, 'mounts', 'Cold One Chariot', { points: 110 });
    for (const name of ['Repeater crossbow', 'Repeater handbow', 'Brace of Repeater handbows']) {
      option(id, 'options', name, { option: { exclusiveGroup: 'noble-missile-weapon' } });
    }
  }

  // T0496/P0497: an untagged lookup is used by both builder and game conversion.
  overlay.profiles['cold one'] = {
    ...overlay.profiles['cold one'],
    stats: [{ Name: 'Cold One', M: '7', WS: '3', BS: '-', S: '4', T: '(+1)', W: '-', I: '2', A: '2', Ld: '-' }],
    troopType: 'Heavy cavalry', baseSize: '30 x 60 mm',
    equipment: ['Claws and teeth (counts as a hand weapon)'],
    notes: ['A character mounted on a Cold One has +1 Toughness.'],
  };

  // P0901/P0945, P0838/P0929: actual loadout, not just the reference text.
  for (const id of ['war-hydra', 'kharibdyss']) option(id, 'armor', '5+', { renameTo: '4+' });
  for (const [id, equipment] of [
    ['bloodwrack-medusas', 'Hand weapon, Halberd, Petrifying gaze'],
    ['bloodwrack-shrines', 'Cavalry spears, Halberd, Petrifying gaze'],
  ]) {
    option(id, 'equipment', unit(id).equipment[0].name_en, { renameTo: equipment });
  }
  // This pack is already scoped. Its own weapon must not look like a foreign faction on export.
  option('war-hydra', 'equipment', unit('war-hydra').equipment[0].name_en, {
    renameTo: unit('war-hydra').equipment[0].name_en.replace('Serrated maws {renegade}', 'Serrated maws'),
  });

  // P0678/P0685: replace the obsolete unit note as well as the rule page.
  const lashNotes = 'Notes: A Lash & Buckler counts as both a handweapon and shield and allows the use of the Parry special rule.';
  overlay.composition.units['sisters-of-slaughter'].notes =
    `Dance of Death: Models with this rule have a 6+ Ward save against any wounds suffered. In addition, enemy units engaged in combat with a model with this rule suffer a -1 modifier to its Maximum Rank Bonus. ${lashNotes}`;
  const baseRules = read('rules.json').rules;
  if (!baseRules['lash-and-buckler']) throw new Error('Check Lash & Buckler rule slug');
  overlay.rules['lash-and-buckler'] = { name_en: 'Lash & Buckler', overrides: 'lash-and-buckler', body: [lashNotes],
    weaponProfile: { range: 'Combat', strength: 'S', ap: '-1', specialRules: 'Armour Bane (1), Fight in Extra Rank, Requires Two Hands' } };

  // Existing tagged/faction aliases must open exactly the same DOCX wording.
  overlay.rules['murderous-renegade'] = { ...structuredClone(overlay.rules.murderous), overrides: 'murderous-renegade' };
  overlay.rules.hidden.overrides = null;
  overlay.rules['hidden-dark-elves'] = { ...structuredClone(overlay.rules.hidden), overrides: 'hidden-dark-elves' };

  // P0846/P0937 and T0809: display and calculator each consume their own rule record.
  overlay.rules['petrifying-gaze'].body = [
    'Notes: When making a roll To Wound for an attack made with this weapon, substitute the target’s Toughness with its Initiative. No armour save is permitted against wounds caused by this weapon (Ward and Regeneration saves can be attempted as normal).',
  ];
  for (const slug of ['petrifying-gaze', 'ravager-harpoon', 'lash-and-buckler']) {
    overlay.rules[`${slug}-profile`] = {
      ...structuredClone(overlay.rules[slug]), name_en: `${overlay.rules[slug].name_en} (Profile)`, overrides: `${slug}-profile`,
    };
  }

  // P0169/P0177: retain BOTH catalogue slots, with conditions on the promoted category only.
  overlay.composition.units['witch-elves'] = { category: 'special', notes: '', byCategory: {
    core: { category: 'core', requiresUnitIds: ['death-hag'], maxUnits: 1, limitGroup: 'de-v2-core-witches',
      notes: '0-1 unit of Witch Elves may be taken as Core if the army includes one or more Death Hags' },
  } };
  for (const id of ['war-hydra', 'kharibdyss']) overlay.composition.units[id] = { category: 'rare', notes: '', byCategory: {
    special: { category: 'special', requiresUnitIds: ['high-beastmaster'], maxUnits: 1, limitGroup: 'de-v2-special-monster',
      notes: '0-1 War Hydra or Kharibdyss may be taken as Special if the army includes a High Beastmaster' },
  } };

  // P0181 explicitly refers to AJ High Elves p45. Reuse that catalogue's exact datasheet,
  // not its High Elf composition restriction (Lothern Sea Guard is NOT required here).
  const merwyrm = read('owb/high-elf-realms.json').rare.find((u) => u.id === 'merwyrms');
  if (!merwyrm) throw new Error('Missing referenced Merwyrm datasheet');
  overlay.addedUnits ??= {};
  overlay.addedUnits.rare = [
    ...(overlay.addedUnits.rare ?? []).filter((u) => u.id !== merwyrm.id),
    { ...structuredClone(merwyrm), minimum: 1, maximum: 1, notes: {}, armyComposition: { [overlay.id]: { category: 'rare' } } },
  ];
  return overlay;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const url = new URL('../public/renegade/de-renegade-v2.json', import.meta.url);
  const overlay = correctDarkElvesV2(JSON.parse(readFileSync(url, 'utf8')));
  writeFileSync(url, `${JSON.stringify(overlay, null, 2)}\n`);
  console.log('Dark Elves v2 DOCX corrections applied (idempotent).');
}
