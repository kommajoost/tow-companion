/**
 * WRATH TRIGGERS (Act 3+, 22-10-2026; door de campagne gegooid sinds 23-10-2026).
 *
 * Vanaf Act 3 drukt Ash'Moduhr op de battles: per battle zijn er twee Wrath Triggers actief.
 *
 * WIE GOOIT (besluit Joost 23-10-2026, vervangt "de spelers gooien zelf" van 21-10): DE CAMPAGNE. Bij het
 * begin van de War phase gooit de server voor elke battle van de Act 2D6, en bij een dubbel de tweede
 * opnieuw tot hij anders is; een battle die pas tijdens de War phase ontstaat krijgt hem bij het
 * aanmaken. `towc_battle_by_code` stuurt het mee als `wrath: { d6: [a, b], herrold, gerold_at }`
 * (migratie 20261023k_wrath_server.sql in de campagne-repo). De Companion TOONT alleen: geen
 * aanvinkstap meer. Ontbreekt de worp in een Act 3+-battle, dan is de War phase nog niet begonnen.
 *
 * Alleen het Scenario lab en de scenario-test hebben geen server-battle: die gooien LOKAAL met dezelfde
 * regel (twee verschillende), onthouden per code in localStorage, en in het lab staat er een Reroll-knop.
 *
 * BRON van de teksten: de Act 3-briefing van de campagne (site/src/pages/devBriefingAct3.json, kaart
 * "Ash'Moduhr's presence grows"). Namen, wanneer en effect zijn LETTERLIJK overgenomen (alleen de
 * **vet**-opmaak eraf), gelijk aan site/src/data/wrathTriggers.ts. Wijzigt de briefing, wijzig dit mee.
 */

export interface WrathTrigger {
  /** De D6-uitkomst die hem kiest. */
  d6: number;
  naam: string;
  /** Wanneer hij afgaat. */
  wanneer: string;
  effect: string;
}

export const WRATH_TRIGGERS: WrathTrigger[] = [
  { d6: 1, naam: 'Rain of Blood', wanneer: 'First Blood: the first unit is destroyed', effect: 'All shooting −1 to hit until the end of the next round.' },
  { d6: 2, naam: 'The Wrath Watches', wanneer: 'A challenge is fought', effect: 'The winner gains Hatred for the rest of the battle.' },
  { d6: 3, naam: 'Echo of Fury', wanneer: 'Run Down: a fleeing unit is caught', effect: 'All units in combat +1 S until the end of the next round.' },
  { d6: 4, naam: 'The Weeping Rift', wanneer: 'A spell is dispelled', effect: 'Roll a D6: on a 1-3 the rift opens at the dispelling Wizard, on a 4-6 at the casting Wizard (no dispelling Wizard: at the caster). Place a small template there and scatter it D6″ (never onto a unit): dangerous terrain for the rest of the battle.' },
  { d6: 5, naam: 'The Slayer Marked', wanneer: 'A character is slain', effect: 'The unit that slew him gains Impetuous for the rest of the battle.' },
  { d6: 6, naam: 'The Wrath Offers', wanneer: 'A Panic test is failed', effect: 'The unit may hold as if the test was passed, but then gains Stupidity for the rest of the battle. Once per player per battle.' },
];

/** Hoeveel triggers er per battle actief zijn (Act 3-briefing: "those 2 Wrath Triggers are active"). */
export const WRATH_ACTIEF = 2;

/** De regel, als ondertitel bij de sectie (gelijk aan de briefing van 23-10-2026). */
export const WRATH_REGEL = 'When the War phase begins, the campaign rolls 2D6 for each battle: the two dice show which 2 Wrath Triggers are active. A double is rolled again until the dice differ.';

/** Wat er staat als een Act 3+-battle nog geen worp heeft. */
export const WRATH_NOG_NIET = 'Wrath Triggers are rolled when the War phase begins';

/** Geldt de Wrath in deze battle? Vanaf Act 3, en niet bij Battle March (Act 1-2). Een battle zonder
 *  bekende Act telt niet mee: liever geen herinnering dan een die er niet hoort. */
export const wrathGeldt = (fase: number | null | undefined, battleMarch?: boolean | null): boolean =>
  typeof fase === 'number' && fase >= 3 && battleMarch !== true;

/** De localStorage-sleutel voor de LOKALE worp van één battle (alleen lab en scenario-test). */
export const wrathSleutel = (code: string): string => `tow:wrath:${(code || '').trim().toUpperCase()}`;

/** Alleen geldige, unieke D6-waarden, hoogstens WRATH_ACTIEF, in de volgorde waarin ze staan. */
export function normWrath(v: unknown): number[] {
  const uit: number[] = [];
  for (const x of Array.isArray(v) ? v : []) {
    if (typeof x === 'number' && Number.isInteger(x) && x >= 1 && x <= 6 && !uit.includes(x)) uit.push(x);
  }
  return uit.slice(0, WRATH_ACTIEF);
}

/** Een volledige worp: precies WRATH_ACTIEF verschillende geldige D6-waarden, anders null. */
export function volledigeWorp(v: unknown): number[] | null {
  const n = normWrath(v);
  return n.length === WRATH_ACTIEF ? n : null;
}

/**
 * Lees `wrath` uit `towc_battle_by_code`. undefined = het veld ontbreekt (oudere server); null = er is
 * (nog) geen worp, of hij is onbruikbaar. Anders de twee D6-waarden in worp-volgorde.
 */
export function parseWrath(raw: unknown): number[] | null {
  if (!raw || typeof raw !== 'object') return null;
  return volledigeWorp((raw as Record<string, unknown>).d6);
}

/**
 * LOKALE WORP (lab, scenario-test): 2D6 met dezelfde regel als de server -- bij een dubbel de tweede
 * dobbelsteen opnieuw tot hij anders is. `rng` geeft [0,1); vast te zetten in de tests. Het vangnet na
 * 200 dubbels kan met een echte rng niet afgaan, maar een kapotte rng (altijd 0) mag geen lus maken.
 */
export function gooiWrath(rng: () => number = Math.random): number[] {
  const d6 = () => 1 + Math.min(5, Math.floor(rng() * 6));
  const a = d6();
  let b = d6();
  for (let n = 0; b === a; n++) {
    if (n >= 200) { b = (a % 6) + 1; break; }
    b = d6();
  }
  return [a, b];
}

export const wrathTrigger = (d6: number): WrathTrigger | undefined => WRATH_TRIGGERS.find((t) => t.d6 === d6);

/** De triggers bij een worp, in worp-volgorde. */
export const wrathActief = (d6s: number[]): WrathTrigger[] => d6s.map(wrathTrigger).filter((t): t is WrathTrigger => !!t);
