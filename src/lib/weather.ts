// DISRUPTIVE WEATHER — de D6-tabel uit de General's Companion.
//
// Buiten de campagne is weer OPTIONEEL (Joost, 13-09): je zet het aan bij het opzetten van een potje
// en dan wordt er één keer gerold voor de hele battle.
//
// WAAROM DEZE TEKST HIER LETTERLIJK STAAT. De campagne (Isle of Celedon) toont hetzelfde weer al in
// OWC: de server rolt per Act en stuurt naam + effect mee (`towc_weer_def` → `weerVanBattle`). Buiten
// de campagne is er geen server die dat doet, dus moet de tabel in de app zitten. De tekst hieronder
// is WOORD VOOR WOORD dezelfde als die de campagne stuurt — geen samenvatting, geen eigen
// formulering. Dat is de regel voor alle spelregels in deze app: wat er staat is wat er in het boek
// staat, of het staat er niet.
import type { GameWeer } from '../types';

export interface WeerDef {
  /** Het nummer op de D6-tabel. */
  worp: number;
  naam: string;
  effect: string;
}

export const DISRUPTIVE_WEATHER: WeerDef[] = [
  {
    worp: 1,
    naam: 'Heavy Downpour',
    effect: 'Heavy rain has turned the dry earth into an almost inescapable quagmire. All units suffer a -1 modifier to their Movement characteristic (to a minimum of 1), and units with the Swiftstride special rule are unable to use it. Even units with the Fly (X) special rule are affected, struggling to free themselves from the mud.',
  },
  {
    worp: 2,
    naam: 'Fierce Gale',
    effect: 'Wind roars across the battlefield, hampering the effectiveness of even the most potent ranged weapons. Reduce the range of all missile weapons with a Strength of 5 or less by 6" (to a minimum of 3").',
  },
  {
    worp: 3,
    naam: 'Scorching Heat',
    effect: "From clear skies the sun's rays beat relentlessly down upon the land. At the beginning of each Start of Turn sub-phase, the active player rolls a D6 for each unit in their army. On the roll of a 1, that unit has succumbed to the heat. D3 models must pass a Toughness test or lose a single Wound. Units wearing heavy armour, full plate armour or barding succumb on a roll of 1 or 2.",
  },
  {
    worp: 4,
    naam: 'Lightning Strikes',
    effect: 'Thunder rumbles and bolts of lightning strike from darkened storm clouds. At the beginning of each Start of Turn sub-phase, the active player rolls a D6. On a roll of 1-2, lightning strikes a single randomly determined unit belonging to that player. A unit struck by lightning suffers D6 strength 4 hits, each with an AP of -1.',
  },
  {
    worp: 5,
    naam: 'Dust Devil',
    effect: 'A swirling wind storm rages across the battlefield, throwing dust and debris into the air. Place a 3" blast template, representing the dust devil, in the centre of the battlefield and scatter it 2D6". The dust devil scatters D6" during every Start of Turn sub-phase. Should the dust devil scatter onto a unit, move it by the smallest amount possible, in any direction, so that it can be placed on the battlefield, not touching the bases of any models. Any unit that moves through the dust devil, or that the dust devil moves over, suffers a -1 modifier to its Weapon Skill and Ballistic Skill characteristics (to a minimum of 1) until the next Start of Turn sub-phase.',
  },
  {
    worp: 6,
    naam: 'Freezing Winds',
    effect: 'Cold winds batter the battlefield, slowing warriors and making them reluctant to advance. At the beginning of each Start of Turn sub-phase, the active player rolls a D6 for each unit in their army. On a roll of 2+, the unit may act as normal. However, on a roll of a 1, the unit must make a Leadership test before moving, shooting, casting spells or declaring a charge. If this test is failed, the unit huddles against the cold and refuses to act. Compulsory moves, such as fleeing or Giving Ground, are unaffected.',
  },
];

export const weerVoorWorp = (worp: number): WeerDef | undefined =>
  DISRUPTIVE_WEATHER.find((w) => w.worp === worp);

/** Eén weer-entry als het `GameWeer`-object dat de tracker en de BattleBar al kennen. */
export const alsGameWeer = (def: WeerDef): GameWeer => ({ worp: def.worp, naam: def.naam, effect: def.effect });
