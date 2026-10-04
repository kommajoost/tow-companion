// Welke sleutel in rules-index.json hoort bij een OWB-unitnaam? (04-10-2026)
//
// De statlines en troop types staan in public/owb/rules-index.json, gesleuteld op de naam van de
// tow.whfb.app-datasheet. OWB noemt sommige units anders, en dan vond het spel GEEN statline (Joost:
// "bij de mortar mis ik een hoop info"). Drie soorten verschil, alle drie gemeten over de 622 units in
// public/owb (scripts/tests/statlines.test.cjs bewaakt dat elke unit een statline heeft):
//   1. een gedeelde datasheet met een tag: "Mortar {empire}" staat als "mortar empire", terwijl de kale
//      "mortar" de algemene rulebook-pagina is (zonder statline);
//   2. een variant per ridderorde of god: "Empire Knights of Morr" → "empire knights",
//      "Chaos Furies of Khorne" → "chaos furies";
//   3. een andere naam of een titel erachter: "Steam Tank" → "empire steam tank", "Gors" → "gor herd",
//      "Orion" → "orion, the king in the woods".
// Er wordt hier niets verzonnen: elke alias wijst naar een bestaande datasheet van tow.whfb.app.

const plat = (s: string) =>
  String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const zonderTag = (s: string) =>
  String(s || '').toLowerCase().replace(/\{[^}]*\}/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

/** OWB-naam (plat, zonder tag) → datasheet-sleutel in rules-index.json. */
const ALIAS: Record<string, string> = {
  'steam tank': 'empire steam tank',
  gors: 'gor herd',
  ungors: 'ungor herd',
  ghorros: 'ghorros warhoof',
};

/** Varianten met een achtervoegsel (ridderorde, god) die één datasheet delen. */
const VARIANT_BASIS = ['inner circle knights', 'demigryph knights', 'empire knights', 'chaos furies'];

/**
 * Kandidaat-sleutels voor een unitnaam, in volgorde van voorkeur. De aanroeper neemt de eerste die in
 * de index bestaat EN heeft wat hij zoekt (stats of troopType).
 */
export function statSleutels(naam: string, index?: Record<string, unknown> | null, factie?: string): string[] {
  const gekwalificeerd = plat(naam);
  const kaal = zonderTag(naam);
  const uit: string[] = [];
  const voeg = (k: string | undefined) => { if (k && !uit.includes(k)) uit.push(k); };
  voeg(gekwalificeerd);
  voeg(kaal);
  const woorden = kaal.split(' ');
  const laatste = woorden[woorden.length - 1] ?? '';
  if (/s$/.test(laatste)) voeg([...woorden.slice(0, -1), laatste.replace(/s$/, '')].join(' '));
  voeg(ALIAS[kaal]);
  for (const basis of VARIANT_BASIS) if (kaal === basis || kaal.startsWith(`${basis} `)) voeg(basis);
  // Een benoemd personage met een titel erachter: "Orion" → "orion, the king in the woods".
  if (index) {
    const titel = Object.keys(index).find((k) => k.startsWith(`${kaal}, `));
    voeg(titel);
    // Een kale naam waarvan de tag al weg is ("Mortar" i.p.v. "Mortar {empire}", bv. uit een game die
    // vóór 05-10 startte): de getagde datasheet van DIT leger. De tag is (een deel van) de legernaam:
    // empire ⊂ empire of man, tomb kings ⊂ tomb kings of khemri; "dwarfs" ↔ "dwarfen mountain holds"
    // matcht op de eerste vier letters. Geen leger bekend en meer dan één kandidaat: niets raden.
    const kandidaten = Object.keys(index).filter((k) => k.startsWith(`${kaal} `) && !k.startsWith(`${kaal}, `));
    const leger = plat(factie || '');
    const past = (k: string) => {
      const tag = k.slice(kaal.length + 1);
      return !!leger && (leger.includes(tag) || leger.slice(0, 4) === tag.slice(0, 4));
    };
    voeg(kandidaten.find(past) ?? (kandidaten.length === 1 && !leger ? kandidaten[0] : undefined));
  }
  return uit;
}
