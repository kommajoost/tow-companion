// Naam-smid voor campagne-units (De Grensvorsten): stelt factie- en unit-type-bewuste namen voor
// bij het "Unit name"-veld. Client-side generator met gecureerde woordbanken — instant, offline,
// geen API. De gekozen naam wordt in de campagne de veteranen-identiteit van de unit.

interface Bank {
  adjectieven: string[]
  nomen: string[]      // meervoudige strijders-nomen ("Blades", "Ravens")
  plaatsen: string[]   // "of {plaats}"
  leiders: string[]    // "{leider}'s {nomen}"
}

const GENERIEK: Bank = {
  adjectieven: ['Grim', 'Iron', 'Black', 'Broken', 'Silent', 'Crimson', 'Last', 'Wandering', 'Sworn', 'Hollow'],
  nomen: ['Blades', 'Wolves', 'Ravens', 'Shields', 'Spears', 'Banners', 'Sons', 'Daughters', 'Wardens', 'Reavers'],
  plaatsen: ['the Marches', 'the Grey Road', 'Celedon', 'the Ashen Shore', 'the Old Bridge', 'the Border Realms'],
  leiders: ['Karsten', 'Aldric', 'Morwen', 'Osric', 'Helga', 'Dietmar'],
}

/** Per factie-familie een eigen smaak; onbekende slug valt terug op GENERIEK. */
const BANKEN: Record<string, Partial<Bank>> = {
  'dark-elves': {
    adjectieven: ['Blackspear', 'Midnight', 'Pale', 'Cruel', 'Thorned', 'Whispering', 'Cold-Iron', 'Venom'],
    nomen: ['Shades', 'Executioners', 'Serpents', 'Thorns', 'Widows', 'Corsairs', 'Knives', 'Harpies'],
    plaatsen: ['Naggarond', 'the Cold Coast', 'Clar Karond', 'the Black Ark', 'Ghrond'],
    leiders: ['Malvyra', 'Dreth', 'Kouran', 'Syllith', 'Vaelra'],
  },
  'high-elf-realms': {
    adjectieven: ['Silverhelm', 'Dawnlight', 'Ivory', 'Star-blessed', 'Gleaming', 'Phoenix', 'Moonlit'],
    nomen: ['Spears', 'Sentinels', 'Heralds', 'Lions', 'Guardians', 'Swords', 'Watchers'],
    plaatsen: ['Lothern', 'Ulthuan', 'the White Tower', 'Eataine', 'Caledor'],
    leiders: ['Aenarion', 'Ilthariel', 'Calmindor', 'Elenwe', 'Tyrion'],
  },
  'wood-elf-realms': {
    adjectieven: ['Thornwood', 'Mistwalking', 'Wild', 'Leafshadow', 'Moonshade', 'Rootbound', 'Autumn'],
    nomen: ['Arrows', 'Stalkers', 'Wardens', 'Riders', 'Shadows', 'Hawks', 'Kindred'],
    plaatsen: ['Athel Loren', 'the Deepwood', 'the Waystones', 'the Glade of Woe'],
    leiders: ['Naieth', 'Scarloc', 'Elyndra', 'Orion', 'Drycha'],
  },
  'dwarfen-mountain-holds': {
    adjectieven: ['Grudgebearer', 'Ironbrow', 'Stonebound', 'Oathbound', 'Runeforged', 'Anvil-born', 'Grey'],
    nomen: ['Hammers', 'Shields', 'Beards', 'Anvils', 'Miners', 'Rangers', 'Thunderers'],
    plaatsen: ['Karaz-a-Karak', 'the Deep Roads', 'Barak Varr', 'the Broken Peak'],
    leiders: ['Durgnir', 'Thrainna', 'Borri', 'Gotrek', 'Skaldi'],
  },
  'chaos-dwarfs': {
    adjectieven: ['Ashbound', 'Furnace-born', 'Obsidian', 'Bull-marked', 'Smoke-veiled', 'Brazen'],
    nomen: ['Overseers', 'Ironsworn', 'Firebrands', 'Taskmasters', 'Bulls', 'Forgeguard'],
    plaatsen: ['Zharr-Naggrund', 'the Ash Plain', 'the Tower of Gorgoth'],
    leiders: ['Ghorth', 'Zhargon', 'Astragoth', 'Rykarth'],
  },
  'empire-of-man': {
    adjectieven: ['Reikland', 'Sigmarite', 'Steadfast', 'Griffon', 'Loyal', 'Powder-black', 'Old Guard'],
    nomen: ['Halberds', 'Greatswords', 'Pistoliers', 'Companions', 'Swords', 'Standards', 'Handgunners'],
    plaatsen: ['Altdorf', 'the Reik', 'Nuln', 'Middenheim', 'the Grey Mountains'],
    leiders: ['Magnus', 'Elspeth', 'Kurt', 'Theodora', 'Ludwig'],
  },
  'kingdom-of-bretonnia': {
    adjectieven: ['Grail-sworn', 'Fleur', 'Errant', 'Chivalrous', 'Lake-blessed', 'Pennant'],
    nomen: ['Lances', 'Knights', 'Yeomen', 'Companions', 'Chargers', 'Squires'],
    plaatsen: ['Couronne', 'Bastonne', 'the Lady’s Lake', 'Quenelles'],
    leiders: ['Bohemond', 'Isolde', 'Reynard', 'Alberic', 'Repanse'],
  },
  'realms-of-men': {
    adjectieven: ['Sellsword', 'Freelance', 'Ragged', 'Gilded', 'Border', 'Vagabond'],
    nomen: ['Company', 'Free Lances', 'Dogs of War', 'Pikes', 'Marauders', 'Blades'],
    plaatsen: ['the Border Princes', 'Tilea', 'Estalia', 'Akendorf'],
    leiders: ['Lorenzo', 'Mercedes', 'Borgio', 'Lucrezzia'],
  },
  'grand-cathay': {
    adjectieven: ['Jade', 'Celestial', 'Dragon-blessed', 'Vermilion', 'Thunderous', 'Harmonious'],
    nomen: ['Guard', 'Lancers', 'Crane-Gunners', 'Sentinels', 'Warriors of the Bastion', 'Banners'],
    plaatsen: ['Wei-Jin', 'the Great Bastion', 'the Celestial River'],
    leiders: ['Miao Ying', 'Zhao Ming', 'Li Dao', 'Shen-Zoo'],
  },
  'orc-and-goblin-tribes': {
    adjectieven: ['Skullkrumpin’', 'Toofsnagga', 'Rusty', 'Squig-mad', 'Loud', 'Big'],
    nomen: ['Boyz', 'Choppas', 'Stikkas', 'Skulkers', 'Squigs', 'Wolfboyz'],
    plaatsen: ['da Badlands', 'Iron Rock', 'da Broken Toof'],
    leiders: ['Gorfang', 'Skarsnik', 'Wazzok', 'Grimgor'],
  },
  'ogre-kingdoms': {
    adjectieven: ['Maw-sworn', 'Gut-heavy', 'Mountain', 'Hungry', 'Iron-bellied'],
    nomen: ['Bulls', 'Ironguts', 'Maneaters', 'Gorgers', 'Tusks'],
    plaatsen: ['the Mountains of Mourn', 'the Great Maw', 'Skabrand'],
    leiders: ['Grolsh', 'Bragg', 'Golgfag', 'Urta'],
  },
  'warriors-of-chaos': {
    adjectieven: ['Northern', 'Skullbound', 'Frost-marked', 'Eightfold', 'Doom-sworn', 'Ragehorn'],
    nomen: ['Reavers', 'Chosen', 'Marauders', 'Wolves of the Waste', 'Hounds', 'Slayers'],
    plaatsen: ['the Wastes', 'Norsca', 'the Frozen Shore'],
    leiders: ['Ragnar', 'Valkia', 'Haakon', 'Sygvald'],
  },
  'beastmen-brayherds': {
    adjectieven: ['Horned', 'Feral', 'Blood-matted', 'Twisted', 'Moon-howling'],
    nomen: ['Gors', 'Brayherd', 'Hooves', 'Tusks', 'Stampede'],
    plaatsen: ['the Drakwald', 'the Herdstone', 'the Wild Heath'],
    leiders: ['Khazrak', 'Gorthor', 'Malagor'],
  },
  'daemons-of-chaos': {
    adjectieven: ['Warp-born', 'Shrieking', 'Unbound', 'Ruinous', 'Ninefold'],
    nomen: ['Host', 'Legion', 'Choir', 'Tide', 'Harbingers'],
    plaatsen: ['the Realm of Chaos', 'the Rift', 'the Burning Veil'],
    leiders: ['Sha’kresh', 'Vhorune', 'Az’mekh'],
  },
  'vampire-counts': {
    adjectieven: ['Deathless', 'Grave-cold', 'Moonpale', 'Barrow', 'Silent'],
    nomen: ['Legion', 'Wights', 'Ghouls', 'Court', 'Revenants'],
    plaatsen: ['Sylvania', 'Drakenhof', 'the Haunted Hills'],
    leiders: ['Isabella', 'Mannfred', 'Vorag', 'Carmilla'],
  },
  'tomb-kings-of-khemri': {
    adjectieven: ['Undying', 'Gilded', 'Sun-bleached', 'Eternal', 'Dune-born'],
    nomen: ['Legion', 'Guard of the Pyramid', 'Chariots', 'Archers of the Dawn', 'Host'],
    plaatsen: ['Khemri', 'Numas', 'the Great Necropolis'],
    leiders: ['Settra', 'Khalida', 'Amunet', 'Rakhash'],
  },
  skaven: {
    adjectieven: ['Sneaky-quick', 'Warp-touched', 'Gnawing', 'Verminous', 'Under-deep'],
    nomen: ['Clanrats', 'Gutter Runners', 'Stormvermin', 'Swarm', 'Tail-blades'],
    plaatsen: ['Skavenblight', 'the Under-Empire', 'Hell Pit'],
    leiders: ['Queek', 'Sniktch', 'Vermalanx', 'Skritch'],
  },
  lizardmen: {
    adjectieven: ['Sun-scaled', 'Primeval', 'Star-marked', 'Jungle-born', 'Sacred'],
    nomen: ['Saurus Host', 'Cohort', 'Guardians of the Temple', 'Skinks', 'Spawn'],
    plaatsen: ['Lustria', 'Hexoatl', 'the Temple-City'],
    leiders: ['Kroq-Gar', 'Tehenhauin', 'Mazdamundi', 'Oxyotl'],
  },
}

const kies = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)]

function bankVoor(armySlug: string): Bank {
  const b = BANKEN[armySlug] ?? {}
  return {
    adjectieven: b.adjectieven ?? GENERIEK.adjectieven,
    nomen: b.nomen ?? GENERIEK.nomen,
    plaatsen: b.plaatsen ?? GENERIEK.plaatsen,
    leiders: b.leiders ?? GENERIEK.leiders,
  }
}

/** Type-hint uit de catalogus-unitnaam. Bij een match is het type DOMINANT (zoals bij de
 *  kaart-sprites: type bepaalt de vorm, factie kleurt alleen) — de factie-bank mengt dan
 *  niet meer mee, zodat "Dwarf Cannon" echt kanon-namen krijgt en geen "Beards". */
function typeNomen(unitNaam: string, bank: Bank): string {
  const n = unitNaam.toLowerCase()
  if (/(cannon|catapult|bolt thrower|stone thrower|mortar|ballista|rock lobber|doom diver|organ gun|hellblaster|hellstorm|flame cannon|deathshrieker|magma|grudge thrower|war machine)/.test(n)) return kies(['Battery', 'Thunder', 'Roar', 'Crew', 'Engines'])
  if (/(chariot)/.test(n)) return kies(['Chariots', 'Wheels', 'Scythes', 'Charge'])
  if (/(hydra|dragon|giant|troll|manticore|griffon|terrorgheist|varghulf|stegadon|bastiladon|carnosaur|arachnarok|abomination|colossus|kharibdyss|mammoth|cygor|ghorgon)/.test(n)) return kies(['Terror', 'Beast', 'Horror', 'Maw', 'Wrath'])
  if (/(hound|wolves|wolf rat|dire|squig|swarm|bat(s| )|fell bat|spider(s)?(?! rider)|sabretusk)/.test(n)) return kies(['Pack', 'Fangs', 'Howl', 'Swarm'])
  if (/(harpy|harpies|hawk|eagle|gyrocopter|gyrobomber|furies|pegasus(?!.*knight))/.test(n)) return kies(['Wings', 'Talons', 'Shrieks'])
  if (/(archer|crossbow|gunner|handgun|thunderer|shade|scout|skirmisher|bowmen|longbow|sling|blowpipe|jezzail|quarreller|darkshard|glade guard|arrer)/.test(n)) return kies(['Arrows', 'Bolts', 'Marksmen', 'Sharpshooters', 'Eyes'])
  if (/(knight|cavalry|rider|horse|outrider|cold one|lancer|hussar|reaver|pistolier|marauder horsemen|boar boyz)/.test(n)) return kies(['Riders', 'Lances', 'Chargers', 'Hooves', 'Spurs'])
  if (/(spear|halberd|pike|glaive|billmen)/.test(n)) return kies(['Spears', 'Pikes', 'Points', 'Hedge of Steel'])
  if (/(greatsword|executioner|hammerer|ironbreaker|black guard|swordmaster|white lion|grave guard|temple guard|stormvermin|chosen|bestigor|longbeard)/.test(n)) return kies(['Guard', 'Sworn', 'Blades', 'Oathkeepers'])
  if (/(sword|blade|choppa|clanrat|warrior|militia|men-at-arms|zombie|skeleton|ghoul|gor(s)? |ungor|saurus|marauder)/.test(n)) return kies(['Blades', 'Shields', 'Sons', 'Ranks', ...bank.nomen])
  if (/(wizard|mage|sorcer|priest|necroman|shaman|slann|runesmith)/.test(n)) return kies(['Circle', 'Coven', 'Conclave'])
  return kies(bank.nomen)
}

/** Genereer n unieke naam-suggesties voor deze unit of dit character.
 *  `cat === 'characters'` → persoonsnamen ("Dreth the Cruel"), anders regimentsnamen. */
export function stelNamenVoor(armySlug: string, unitNaam: string, n = 4, cat?: string): string[] {
  const bank = bankVoor(armySlug)
  // Characters: leiders geschud rouleren, zodat de n suggesties zoveel mogelijk
  // verschillende voornamen krijgen (de pools zijn klein, 3-6 namen).
  const geschud = [...bank.leiders].sort(() => Math.random() - 0.5)
  const uit = new Set<string>()
  let poging = 0
  while (uit.size < n && poging < 40) {
    poging++
    const patroon = Math.floor(Math.random() * 4)
    const leider = geschud[uit.size % geschud.length]
    const naam = cat === 'characters'
      ? (patroon === 0 ? `${leider} the ${kies(bank.adjectieven)}` :
         patroon === 1 ? `${leider} of ${kies(bank.plaatsen)}` :
         patroon === 2 ? `${kies(bank.adjectieven)} ${leider}` :
         `${leider} the ${kies(bank.adjectieven)} of ${kies(bank.plaatsen)}`)
      : (patroon === 0 ? `The ${kies(bank.adjectieven)} ${typeNomen(unitNaam, bank)}` :
         patroon === 1 ? `${kies(bank.leiders)}’s ${typeNomen(unitNaam, bank)}` :
         patroon === 2 ? `${typeNomen(unitNaam, bank)} of ${kies(bank.plaatsen)}` :
         `The ${kies(bank.adjectieven)} ${typeNomen(unitNaam, bank)} of ${kies(bank.plaatsen)}`)
    if (naam.length <= 40) uit.add(naam)
  }
  return [...uit]
}
