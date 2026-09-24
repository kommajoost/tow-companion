// Reviewed against Vampire Counts Renegades DRAFT 1.5.3.1.docx (24-09-2026).
// SHA256 cff4a0b6f2f72bfe552a45dc08ac3c282983129aa96cd20d102c3a91b2780d55.
// Keep source slots stable for saved lists; never modify the Legacy catalogue.
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const read = (name) => JSON.parse(readFileSync(new URL(`../public/${name}`, import.meta.url), 'utf8'));

export function correctVampireCountsV2(overlay) {
  if (overlay.id !== 'vc-renegade-v2') throw new Error('Vampire Counts correction called for another pack');
  if (overlay.packVersion !== '1.5.3.1') throw new Error('Re-review the Vampire Counts corrections against the new DOCX version');
  const base = read('owb/vampire-counts.json');
  const unit = (id) => Object.values(base).flat().find((u) => u.id === id);
  const patch = (id) => overlay.units[id] ??= {};
  const option = (id, group, name, changes) => {
    const patches = patch(id).options ??= [];
    const existing = patches.find((p) => p.group === group && p.name_en.toLowerCase() === name.toLowerCase());
    if (existing) Object.assign(existing, changes);
    else patches.push({ group, action: 'upsert', name_en: name, ...changes });
  };
  const armour = (id, name) => {
    patch(id).replace ??= {};
    patch(id).replace.armor = [{ name_en: name, points: 0, active: true, perModel: true }];
  };

  // P0405/P0422–P0434: base level 1 is included; upgrades cannot stack.
  option('vampire-count', 'options', 'Level 1 Wizard', { points: 0, option: { active: true, alwaysActive: true } });
  for (const name of ['Level 2 Wizard', 'Be a Level 3 Wizard']) option('vampire-count', 'options', name,
    { option: { exclusiveGroup: 'vampire-wizard-level' } });
  for (const name of ['Level 1 Wizard', 'Be a Level 2 Wizard']) option('vampire-thrall', 'options', name,
    { option: { exclusiveGroup: 'vampire-wizard-level' } });
  for (const name of ['Level 1 Wizard', 'Level 2 Wizard']) option('strigoi-ghoul-king', 'options', name,
    { option: { exclusiveGroup: 'vampire-wizard-level' } });
  for (const id of ['vampire-count', 'vampire-thrall']) {
    const rules = patch(id).specialRules ?? unit(id).specialRules.name_en;
    patch(id).specialRules = rules.includes('Accursed Weapons') ? rules : `Accursed Weapons, ${rules}`;
    option(id, 'mounts', 'Coven Throne', { points: 165 }); // T0787
  }

  // P0562/P0563/P0874: do not turn an old saved Mortis Engine into a different mount.
  option('necromantic-acolyte', 'mounts', 'Mortis Engine', { option: { hidden: true,
    unavailableReason: 'Mortis Engine is only available to a Master Necromancer; choose a legal mount.' } });
  option('necromantic-acolyte', 'mounts', 'Corpse Cart (Acolyte mount)', { points: 60, option: { options: [
    // Mandatory paid radio: no active/free child. The first is the implicit paid default.
    { name_en: 'Balefire Brazier', points: 10, exclusive: true },
    { name_en: 'Warped Tintinnabulation', points: 15, exclusive: true },
  ] } });
  const cart = structuredClone(overlay.profiles['corpse cart']);
  cart.stats = cart.stats.filter((r) => !/Corpsemaster/i.test(r.Name));
  cart.replaceStats = true;
  cart.equipment = ['The Restless Dead: Hand weapons'];
  overlay.profiles['corpse cart acolyte mount'] = cart;

  // P0480/T0498, T0581: actual equipment and narrowly scoped mount profile.
  option('strigoi-ghoul-king', 'equipment', 'Hand weapon', { renameTo: 'Hand weapon, Wicked claws' });
  armour('strigoi-ghoul-king', 'Scaly skin (heavy armour)');
  overlay.rules['wicked-claws'] = { name_en: 'Wicked claws', overrides: 'wicked-claws', body: [],
    weaponProfile: { range: 'Combat', strength: 'S', ap: '-2', specialRules: '-' } };
  overlay.rules['wicked-claws-profile'] = { ...structuredClone(overlay.rules['wicked-claws']), overrides: 'wicked-claws-profile' };
  overlay.profiles.nightmare.stats = overlay.profiles.nightmare.stats.map((r) => ({ ...r, M: '7' }));

  // P0616/P0621: retain armour/0 for existing paid light armour; free default is shields only.
  option('skeleton-warriors', 'armor', 'Light armour, Shields', { points: 1, option: { active: false } });
  option('skeleton-warriors', 'armor', 'Shields', { points: 0, perModel: true, option: { active: true } });
  patch('zombies').maximum = 0;
  overlay.profiles.zombies.stats = overlay.profiles.zombies.stats.filter((r) => r.Name === 'Zombie');
  overlay.profiles.zombies.replaceStats = true; // T0632: remove old plural WS2 row.
  for (const id of ['crypt-ghouls', 'vargheists']) armour(id, 'Calloused hide (light armour)');
  for (const id of ['crypt-horrors', 'terrorgheist', 'varghulf']) armour(id, 'Scaly skin (heavy armour)');
  for (const id of ['black-knights', 'black-knights-core']) option(id, 'options', 'Barding',
    { points: 0, option: { active: true, alwaysActive: true } });

  // P0733/P0734: independent 25-point allowances, including multiple legal items/powers.
  const command = structuredClone(unit('blood-knights').command);
  command[0].magic = { types: ['weapon', 'armor', 'talisman', 'arcane-item', 'enchanted-item'], maxPoints: 25, multipleItems: true };
  command[0].magicAllowances = [{ types: ['vampiric-power'], maxPoints: 25, multipleItems: true }];
  patch('blood-knights').replace ??= {};
  patch('blood-knights').replace.command = command;

  // Aliases used by actual tappable labels must resolve to the same v2 wording.
  overlay.rules['dark-vitality-renegade'] = { ...structuredClone(overlay.rules['dark-vitality']), overrides: 'dark-vitality-renegade' };
  for (const slug of ['wailing-dirge', 'wailing-dirge-renegade']) overlay.rules[slug] = {
    ...structuredClone(overlay.rules['wailing-dirge-x']), overrides: slug,
  };

  // P0063–P0093: source-category-specific restrictions; no inherited old caps/conditions.
  const placements = overlay.composition.units;
  const set = (ids, value) => { for (const id of ids) placements[id] = structuredClone(value); };
  set(['vampire-count', 'master-necromancer', 'strigoi-ghoul-king'], { category: 'characters', maxUnits: 1, perPoints: 1000,
    limitGroup: 'vc-v2-senior-character', notes: '0-1 Vampire Lord, Master Necromancer or Strigoi Ghoul King per 1,000 points' });
  set(['wight-king', 'tomb-banshee'], { category: 'characters', maxUnits: 1, perPoints: 1000,
    limitGroup: 'vc-v2-wight-banshee', notes: '0-1 Wight King or Banshee per 1,000 points' });
  set(['grave-guard-core', 'black-knights-core'], { category: 'core', maxUnits: 1,
    limitGroup: 'vc-v2-core-wights', notes: '0-1 unit of Grave Guard or Black Knights may be taken as a Core choice' });
  set(['grave-guard', 'black-knights', 'crypt-horrors', 'fell-bats'], { category: 'special', notes: '' });
  placements['corpse-cart'] = { category: 'core', maxUnits: 3, notes: '0-3 Corpse Carts' };
  placements.varghulf = { category: 'special', maxUnits: 1, perPoints: 1000, notes: '0-1 Varghulf per 1,000 points' };
  placements['black-coach'] = { category: 'rare', maxUnits: 1, perPoints: 1000, notes: '0-1 Black Coaches per 1,000 points' };
  for (const [id, category] of [['spirit-hosts', 'special'], ['hexwraiths', 'rare']]) placements[id] = {
    category, maxUnits: 1, perUnitIds: ['cairn-wraith', 'tomb-banshee'], notes: '0-1 unit per Cairn Wraith or Tomb Banshee taken',
  };
  set(['vargheists', 'terrorgheist'], { category: 'rare', notes: '', byCategory: {
    special: { category: 'special', maxUnits: 1, limitGroup: 'vc-v2-strigoi-special', requiresGeneralIds: ['strigoi-ghoul-king'],
      notes: 'If your General is a Strigoi Ghoul King, 0-1 unit of Vargheists or 0-1 Terrorgheist may be taken as a Special choice' },
  } });
  placements['blood-knights'] = { category: 'rare', notes: '' };
  const blood = { ...structuredClone(unit('blood-knights')), ...structuredClone(patch('blood-knights').replace),
    notes: {}, armyComposition: { [overlay.id]: { category: 'special', maxUnits: 1, requiresGeneralIds: ['vampire-count'],
      notes: { name_en: 'If your General is a Vampire Lord 0-1 Blood Knights may be taken as a Special choice.' } } } };
  if (patch('blood-knights').points != null) blood.points = patch('blood-knights').points;
  if (patch('blood-knights').minimum != null) blood.minimum = patch('blood-knights').minimum;
  if (patch('blood-knights').specialRules) blood.specialRules = { name_en: patch('blood-knights').specialRules };
  overlay.addedUnits ??= {};
  overlay.addedUnits.special = [...(overlay.addedUnits.special ?? []).filter((u) => u.id !== blood.id), blood];
  return overlay;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const url = new URL('../public/renegade/vc-renegade-v2.json', import.meta.url);
  const overlay = correctVampireCountsV2(JSON.parse(readFileSync(url, 'utf8')));
  writeFileSync(url, `${JSON.stringify(overlay, null, 2)}\n`);
  console.log('Vampire Counts v2 DOCX corrections applied (idempotent).');
}
