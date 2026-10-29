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

  // SCEPTRE DE NOIROT (Joost 28-10-2026: "en die sceptre noirot dan?"). De DOCX hernoemt "Sceptre Of De
  // Noirot" (het "Of" is doorgestreept) en vervangt de oude regel (twee keer Invocation of Nehek, ook
  // doorgestreept) door de extra D3. De overlay had hem op de nieuwe naam als NIEUW item toegevoegd —
  // het basis-item matcht op `name` ("sceptre of de noirot") — dus stonden er twee in de lijst, en het
  // oude droeg nog de doorgestreepte regel. Nu herprijst/hernoemt de overlay het basis-item: het id
  // (`sceptre-of-de-noirot`) blijft, zodat een lijst die hem al koos de Renegade-versie krijgt.
  const vcItems = overlay.magicItems?.['vampire-counts'] ?? [];
  for (const it of vcItems) if (it.name === 'sceptre de noirot') it.name = 'sceptre of de noirot';
  const tekst = overlay.magicItemText ?? {};
  if (tekst['sceptre-de-noirot'] && !tekst['sceptre-of-de-noirot']) {
    tekst['sceptre-of-de-noirot'] = tekst['sceptre-de-noirot'];
    delete tekst['sceptre-de-noirot'];
  }

  // ── Audit 1.5.3.1 (29-10-2026, Joost: "ja ok verwerk") ─────────────────────────────────────────
  // Alles hieronder volgt de DOCX letterlijk; doorgestreepte tekst komt de app niet in. Teksten die
  // de DOCX als losse alinea's heeft, komen uit de referentie (`docParagraphs`), niet overgetypt.
  const ref = read('renegade/vc-renegade-v2-reference.json');
  const docParagraphs = (heading) => {
    const at = ref.blocks.findIndex((b) => b.type === 'heading' && String(b.text ?? '').trim() === heading);
    if (at < 0) throw new Error(`DOCX heading "${heading}" not found; re-review the Vampire Counts corrections`);
    const out = [];
    for (const b of ref.blocks.slice(at + 1)) {
      if (b.type === 'heading' || b.type === 'table') break;
      if (b.type === 'list') out.push(...(b.items ?? []).map((it) => it.text.trim()).filter(Boolean));
      else if (String(b.text ?? '').trim()) out.push(b.text.trim());
    }
    return out;
  };
  const baseOption = (id, group, name) => {
    const found = (unit(id)[group] ?? []).find((o) => o.name_en === name);
    if (!found) throw new Error(`Missing base option ${id}/${group}/${name}`);
    return found;
  };

  // MASTER OF THE BLACK ARTS / FLYING HORROR. In de DOCX mist de kop van Master of the Black Arts,
  // dus de importer plakte die power (titel + tekst) achter Flying Horror. Gevolg: Flying Horror had
  // de tekst van een andere power erachter, en Master of the Black Arts zelf viel terug op de oude
  // basistekst MET de doorgestreepte Thrall-zin ("or by a Vampire Thrall that is a Level 1 Wizard").
  // Hier weer uit elkaar; de tekst blijft letterlijk die van de DOCX (ook de komma vóór "This").
  const flying = tekst['flying-horror']?.body ?? '';
  const glued = /\s*Master Of The Black Arts\s+30 points\s*/i;
  if (glued.test(flying)) {
    const [fh, motba] = flying.split(glued);
    tekst['flying-horror'].body = fh.trim();
    tekst['master-of-the-black-arts'] = { body: motba.trim() };
  }
  if (!/^This Vampiric Power may only be taken by a Vampire Lord that is a Level 3 Wizard/.test(tekst['master-of-the-black-arts']?.body ?? '')) {
    throw new Error('Master of the Black Arts text missing; re-review the Vampire Counts corrections');
  }

  // CORPSE CART. "A Corpse Cart must take one of the following: Balefire Brazier +10 / Warped
  // Tintinnabulation +15" is een VERPLICHTE betaalde keuze: een nieuwe cart kost dus 70, niet 60. De
  // Balefire stond als default aangevinkt maar werd niet berekend (een radio-default telt pas mee als
  // hij opgeslagen is). `paidDefault` laat de engine die default wel rekenen, alleen hier.
  // "A Corpsemaster may take one of the following: Whip / Cavalry spear" is één-van.
  option('corpse-cart', 'equipment', 'Balefire Brazier', { action: 'patch', option: { paidDefault: true } });
  for (const name of ['Whip', 'Cavalry spear']) option('corpse-cart', 'options', name,
    { action: 'patch', option: { exclusiveGroup: 'vc-v2-corpsemaster-weapon' } });

  // MERCENARIES. "Up to 20% … Free Company Militia and Empire Archers". De huurlingen staan in
  // `the-old-world.json` alleen onder de Legacy-compositie `vc-renegade`; dat bestand wordt door
  // sync-owb overschreven, dus de V2-lijst draagt ze hier zelf, in dezelfde vorm.
  overlay.composition.mercenaries = [{ army: 'empire-of-man', units: ['free-company-militia', 'empire-archers'] }];

  // TERRORGHEIST ALS RIJDIER. De mount-tekst sleutelt op "terrorgheist", en dat profiel droeg alleen de
  // uitrusting: in het infoscherm en in het spel stond de regellijst leeg. Daaronder lag nog de oude
  // basistekst ("Regeneration (X+)", "Wailing Dirge" zonder waarde). Beide nu volgens de DOCX.
  const terrorRules = ['Close Order', 'Fly (9)', 'Indomitable (1)', 'Infested', 'Large Target', 'Necromantic Undead',
    'Regeneration (5+)', 'Stomp Attacks (D6)', 'Swiftstride', 'Terror', 'Wailing Dirge (-2)'];
  const terrorEquipment = ['Filth-encrusted talons (see below), rancid maw (see below) and scaly skin (counts as heavy armour)'];
  Object.assign(overlay.profiles.terrorgheist, { baseSize: '100 x 150 mm', equipment: terrorEquipment, specialRules: terrorRules });
  overlay.profiles['terrorgheist mount'] = { baseSize: '100 x 150 mm', equipment: terrorEquipment,
    specialRules: terrorRules, notes: ['Note: A character mounted on a Terrorgheist has +1 Toughness and +5 Wounds.'] };

  // ZOMBIE DRAGON / ABYSSAL TERROR / MORTIS ENGINE / BLACK COACH: base size, armour value en uitrusting
  // die de DOCX geeft. Een mount-profiel VERVANGT de basis mount-tekst, dus de regels gaan mee. Het
  // troepentype blijft de code uit de statindex (Be/MCr/HCh): die klopt al, en een vrije tekst ernaast
  // zou de Unit Strength-opzoeking (hoofdlettergevoelig) kunnen raken.
  overlay.profiles['zombie dragon'] = { baseSize: '100 x 150 mm',
    equipment: ['Wicked claws (see below), pestilential breath (see below) and draconic scales (counts as full plate armour)'],
    specialRules: ['Carrion Feeders', 'Close Order', 'Fly (9)', 'Large Target', 'Necromantic Undead', 'Stomp Attacks (D6)', 'Swiftstride', 'Terror'],
    notes: ['Note: A character mounted on a Zombie Dragon has +1 Toughness and +5 Wounds.'] };
  overlay.profiles['abyssal terror'] = { baseSize: '50 x 100 mm',
    equipment: ['Wicked claws (see below), poisonous tail (see below) and scaly skin (counts as heavy armour)'],
    specialRules: ['Close Order', 'Fly (9)', 'Large Target', 'Necromantic Undead', 'Stomp Attacks (D3)', 'Swiftstride', 'Terror'],
    notes: ['Note: A character mounted on an Abyssal Terror has +1 Toughness and +4 Wounds.'] };
  Object.assign(overlay.profiles['mortis engine'], { baseSize: '50 x 100 mm', armourValue: '4+' });
  const coach = overlay.profiles['black coach'];
  // De ruwe tabeltekst ("Black Coach | | M | WS …") was de enige plek waar troepentype en base stonden.
  coach.notes = (coach.notes ?? []).filter((n) => !/^Black Coach \| \|/.test(n));
  if (!coach.notes.length) delete coach.notes;
  Object.assign(coach, { baseSize: '50 x 100 mm min 100x150 mm max', armourValue: '3+',
    equipment: ['Wraith: Spectral scythe (see below)', 'Nightmares: Iron-shod hooves (counts as hand weapons)'],
    specialRules: ['Close Order', 'First Charge', 'Impact Hits (D6+2)', 'Indomitable (1)', 'Magical Attacks', 'Necromantic Undead',
      'Regeneration (6+)', 'Spectral Coach', 'Terror'] });

  // SPECTRAL LANCE (Coven Throne, Mortis Engine): een echt wapenprofiel, zoals de Wicked claws.
  overlay.rules['spectral-lance'] = { name_en: 'Spectral Lance', overrides: null,
    body: ['Notes: A Spectral lance can only be used during a turn in which the wielder charged, and its Strength and Armour Piercing modifiers apply only against enemy models the wielder charged that turn.'],
    weaponProfile: { range: 'Combat', strength: 'S+2', ap: '-2', specialRules: 'Armour Bane (1)' } };

  // "0-1 UNIT PER 1,000 POINTS MAY: …" werd nergens gecontroleerd. Eén gedeelde teller per unit-
  // soort (zoals bij de Dark Elf Shades): een unit die beide upgrades neemt telt één keer. De magic
  // standard van de Skeletons hangt aan de Standard bearer; daar telt alleen een GEKOCHTE standard.
  const skeletonLimit = { group: 'vc-v2-skeleton-upgrades', max: 1, perPoints: 1000 };
  option('skeleton-warriors', 'options', 'Implacable Defence', { option: {
    notes: { name_en: '0-1 unit per 1,000 points' }, unitLimit: skeletonLimit } });
  option('skeleton-warriors', 'command', 'Standard bearer', { action: 'patch', option: {
    magic: { ...structuredClone(baseOption('skeleton-warriors', 'command', 'Standard bearer').magic), unitLimit: skeletonLimit } } });
  for (const id of ['grave-guard', 'grave-guard-core']) for (const name of ['Drilled', 'Implacable Defence']) {
    option(id, 'options', name, { action: 'patch', option: { unitLimit: { group: 'vc-v2-grave-guard-upgrades', max: 1, perPoints: 1000 } } });
  }

  // GRAVE GUARD: "The entire unit may replace shields with great weapons". Het schild stond als losse,
  // altijd actieve toggle naast de wapenkeuze, dus great weapons hielden de shields. Nu een echte
  // keuze tussen twee loadouts; de oude toggle wordt verborgen (niet weggehaald: indexen blijven).
  for (const id of ['grave-guard', 'grave-guard-core']) {
    option(id, 'equipment', 'Hand weapons', { action: 'patch', renameTo: 'Hand weapons, Shields' });
    option(id, 'equipment', 'Great weapons (replace shields)', { action: 'patch', renameTo: 'Hand weapons, Great weapons (replace shields)' });
    option(id, 'options', 'Shields', { action: 'patch', option: { hidden: true } });
  }

  // VAMPIRE LORD: "Troop Type: Regular infantry (character)". De naamswijziging maakte een eigen
  // profiel zonder troepentype; dezelfde code als de andere VC-characters (Thrall, Necromancers).
  overlay.profiles['vampire lord'].troopType = 'RI';
  // De oude "Vampire Count"-rij (W3 A4 Ld8) blijft anders naast de Lord-rij staan voor alles wat de
  // oude naam nog opzoekt (geplakte of oude lijsten). Die lijsten krijgen nu alleen de Lord-rij.
  overlay.profiles['vampire count'].replaceStats = true;

  // GENERAL. "The Death of a General" is doorgestreept. Joost: "Ze moeten idd nog wel gewoon general
  // kunnen worden. Alleen de rule death of a general is niet meer." Dus dezelfde General-optie als de
  // andere characters. Achteraan in `command`: de Battle Standard Bearer van de Wight Lord blijft
  // `command/0`, zodat opgeslagen lijsten niet verschuiven.
  const general = structuredClone(baseOption('vampire-thrall', 'command', 'General'));
  for (const id of ['wight-king', 'wight-lord', 'cairn-wraith', 'tomb-banshee']) {
    option(id, 'command', 'General', { points: 0, option: general });
  }

  // KLEINE DATAFOUTEN.
  // Acolyte: "Level 1 (or 2) Wizard" is geen special rule in de DOCX (de Necromancers delen één regel).
  patch('necromantic-acolyte').specialRules = unit('necromantic-acolyte').specialRules.name_en
    .split(',').map((s) => s.trim()).filter((s) => s && !/^Level \d/i.test(s)).join(', ');
  // Hexwraiths: de basis noemt het paard "Spectral Steed", de DOCX "Skeletal Steed"; niet allebei.
  overlay.profiles.hexwraiths.replaceStats = true;
  // Zombies: de punt achter "Shambling Horde." is het einde van de zin in de DOCX, geen deel van de naam.
  const zonderPunt = (s) => s.replace(/Shambling Horde\.(?=\s*(,|$))/, 'Shambling Horde');
  patch('zombies').specialRules = zonderPunt(patch('zombies').specialRules);
  overlay.profiles.zombies.specialRules = overlay.profiles.zombies.specialRules.map(zonderPunt);
  // Skeletons: "Hand weapons[light armour ]and shields" -- de schrapping nam de spatie mee.
  overlay.profiles['skeleton warriors'].equipment = overlay.profiles['skeleton warriors'].equipment
    .map((s) => s.replace(/weaponsand/, 'weapons and'));
  // Optienamen zoals de DOCX ze schrijft. Alleen de naam: de index en dus opgeslagen lijsten blijven.
  for (const id of ['vampire-count', 'vampire-thrall', 'wight-king', 'wight-lord']) {
    option(id, 'equipment', 'Lance (when mounted)', { action: 'patch', renameTo: 'Lance (if appropriately mounted)' });
  }
  option('vampire-count', 'options', 'Level 2 Wizard', { renameTo: 'Be a Level 2 Wizard' });
  option('vampire-thrall', 'options', 'Level 1 Wizard', { renameTo: 'Be a Level 1 Wizard' });
  option('master-necromancer', 'options', 'Level 4 Wizard', { action: 'patch', renameTo: 'Be a Level 4 Wizard' });
  option('necromantic-acolyte', 'options', 'Level 2 Wizard', { action: 'patch', renameTo: 'Be a Level 2 Wizard' });

  // REGELTEKSTEN. "Resurrecting The Fallen" zegt "In a Vampire Counts army" (basis: "an undead army");
  // Banner of the Count en Wight Banner missen "(see page 27)". Letterlijk uit de DOCX.
  for (const [key, heading] of [['resurrecting-the-fallen', 'Resurrecting The Fallen'],
    ['banner-of-the-count', 'Banner Of The Count'], ['wight-banner', 'Wight Banner']]) {
    overlay.rules[key] = { name_en: heading, body: docParagraphs(heading), overrides: key };
  }
  // Het label "Lore of Undeath" (zonder tag, bij de Strigoi) opende de oude basispagina zonder de drie
  // spreuken; zelfde alias-aanpak als Dark Vitality hierboven.
  overlay.rules['lore-of-undeath-label'] = { ...structuredClone(overlay.rules['lore-of-undeath']), overrides: 'lore-of-undeath' };
  // De oude Legacy-pagina's "Accursed Reliquary (Renegade)" en "Blasphemous Tome (Renegade)" (met de
  // vervallen zin "not cumulative with additional Mortis Engines") zijn via zoeken nog te vinden; in
  // V2 tonen ze dezelfde DOCX-tekst als de echte regel.
  for (const slug of ['accursed-reliquary', 'blasphemous-tome']) {
    overlay.rules[`${slug}-renegade`] = { ...structuredClone(overlay.rules[slug]), overrides: `${slug}-renegade` };
  }
  // Lege tabel onder Hellish Vigour: het restant van de doorgestreepte Risen Zombie-tabel.
  for (const rule of Object.values(overlay.rules)) {
    rule.body = rule.body.filter((part) => typeof part !== 'string' || !/^[\s|]+$/.test(part));
  }
  return overlay;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const url = new URL('../public/renegade/vc-renegade-v2.json', import.meta.url);
  const overlay = correctVampireCountsV2(JSON.parse(readFileSync(url, 'utf8')));
  writeFileSync(url, `${JSON.stringify(overlay, null, 2)}\n`);
  console.log('Vampire Counts v2 DOCX corrections applied (idempotent).');
}
