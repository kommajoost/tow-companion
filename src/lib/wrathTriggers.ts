/**
 * WRATH TRIGGERS (Act 3+, 22-10-2026; door de campagne gegooid sinds 23-10-2026).
 *
 * Vanaf Act 3 drukt Ash'Moduhr op de battles: per battle zijn er Wrath Triggers actief, en hoeveel groeit per
 * Act (23-11-2026: Act 3 twee, Act 4 drie, Act 5 vier, Act 6 vijf, Act 7 alle zes; zie `wrathRegelVoorAct`).
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
  { d6: 1, naam: 'Rain of Blood', wanneer: 'First Blood: the first unit is destroyed', effect: 'All shooting −1 to hit until the start of the active player’s next turn.' },
  { d6: 2, naam: 'The Wrath Watches', wanneer: 'A challenge is fought and won', effect: 'The winner gains Hatred for the rest of the battle.' },
  { d6: 3, naam: 'Echo of Fury', wanneer: 'Run Down: a fleeing unit is caught', effect: 'All units in combat +1 S until the start of the active player’s next turn.' },
  { d6: 4, naam: 'The Weeping Rift', wanneer: 'A spell is dispelled', effect: 'Roll a D6: on a 1-3 the rift opens at the dispelling Wizard, on a 4-6 at the casting Wizard (no dispelling Wizard: at the caster). Place a small template there and scatter it D6″ (never onto a unit): dangerous terrain for the rest of the battle.' },
  { d6: 5, naam: 'The Slayer Marked', wanneer: 'A character is slain', effect: 'The unit that slew him gains Impetuous for the rest of the battle.' },
  { d6: 6, naam: 'The Wrath Offers', wanneer: 'A Panic test is failed', effect: 'The unit may hold as if the test was passed, but then gains Stupidity for the rest of the battle. Once per player per battle.' },
];

/** HOEVEEL TRIGGERS ER ACTIEF ZIJN, PER ACT (Joost 23-11-2026, overdracht §5.1, vast). De Wrath groeit:
 *   Act 3: 2D6, die 2 actief.          Act 4: 3D6, die 3 actief.
 *   Act 5: 2D6, die 2 NIET actief (de andere 4 wel).
 *   Act 6: 1D6, die 1 niet actief (de andere 5 wel).
 *   Act 7: alle zes, er wordt niet gegooid.
 * Een dubbel wordt herrold tot alle dobbelstenen verschillen. De server (`towc_wrath_worp`) bewaart in
 * `wrath.d6` ALTIJD de lijst van ACTIEVE triggers (1 tot 6 waarden), plus `worp` (de dobbelstenen) en
 * `modus`. Een oude worp met twee waarden (Act 3) blijft dus gewoon geldig. */
export type WrathModus = 'actief' | 'niet-actief' | 'alles';
export interface WrathActRegel { dobbelstenen: number; modus: WrathModus; actief: number }

export function wrathRegelVoorAct(fase: number | null | undefined): WrathActRegel {
  const f = typeof fase === 'number' ? fase : 3;
  if (f >= 7) return { dobbelstenen: 0, modus: 'alles', actief: 6 };
  if (f === 6) return { dobbelstenen: 1, modus: 'niet-actief', actief: 5 };
  if (f === 5) return { dobbelstenen: 2, modus: 'niet-actief', actief: 4 };
  if (f === 4) return { dobbelstenen: 3, modus: 'actief', actief: 3 };
  return { dobbelstenen: 2, modus: 'actief', actief: 2 };
}

/** Hoogstens zoveel triggers bestaan er. */
export const WRATH_MAX = 6;

const TELWOORD = ['no', 'one', 'two', 'three', 'four', 'five', 'six'];

/** De regel per Act, als ondertitel bij de sectie. Act 3 is letterlijk de tekst van de Act 3-briefing. */
export function wrathRegel(fase: number | null | undefined): string {
  const r = wrathRegelVoorAct(fase);
  if (r.modus === 'alles') return 'All six Wrath Triggers are active in every battle. Nothing is rolled.';
  if (r.modus === 'niet-actief') {
    return r.dobbelstenen === 1
      ? 'When the War phase begins, the app rolls 1D6 for each battle: that Wrath Trigger is NOT active, the other five are.'
      : `When the War phase begins, the app rolls ${r.dobbelstenen}D6 for each battle: those ${TELWOORD[r.dobbelstenen]} Wrath Triggers are NOT active, the other ${TELWOORD[6 - r.dobbelstenen]} are. A double is rolled again until the dice differ.`;
  }
  if (r.dobbelstenen === 2) return WRATH_REGEL;
  return `When the War phase begins, the app rolls ${r.dobbelstenen}D6 for each battle: the ${TELWOORD[r.dobbelstenen]} dice show which ${r.dobbelstenen} Wrath Triggers are active. A double is rolled again until the dice differ.`;
}

/** De regel van Act 3 (gelijk aan de briefing van 23-10-2026). Zie `wrathRegel` voor de andere Acts. */
export const WRATH_REGEL = 'When the War phase begins, the campaign rolls 2D6 for each battle: the two dice show which 2 Wrath Triggers are active. A double is rolled again until the dice differ.';

/** Wat er staat als een Act 3+-battle nog geen worp heeft. */
export const WRATH_NOG_NIET = 'Wrath Triggers are rolled when the War phase begins';

/** Geldt de Wrath in deze battle? Vanaf Act 3, en niet bij Battle March (Act 1-2). Een battle zonder
 *  bekende Act telt niet mee: liever geen herinnering dan een die er niet hoort. */
export const wrathGeldt = (fase: number | null | undefined, battleMarch?: boolean | null): boolean =>
  typeof fase === 'number' && fase >= 3 && battleMarch !== true;

/** De localStorage-sleutel voor de LOKALE worp van één battle (lab, scenario-test, tafeltest). */
export const wrathSleutel = (code: string): string => `tow:wrath:${(code || '').trim().toUpperCase()}`;

/** Alleen geldige, unieke D6-waarden (hoogstens zes), in de volgorde waarin ze staan. */
export function normWrath(v: unknown): number[] {
  const uit: number[] = [];
  for (const x of Array.isArray(v) ? v : []) {
    if (typeof x === 'number' && Number.isInteger(x) && x >= 1 && x <= 6 && !uit.includes(x)) uit.push(x);
  }
  return uit.slice(0, WRATH_MAX);
}

/** Een bruikbare lijst ACTIEVE triggers: 1 tot 6 verschillende geldige D6-waarden, anders null. Een lijst
 *  met een dubbele of een ongeldige waarde is kapot en telt niet (liever geen worp dan een verkeerde). */
export function volledigeWorp(v: unknown): number[] | null {
  if (!Array.isArray(v) || v.length < 1 || v.length > WRATH_MAX) return null;
  const n = normWrath(v);
  return n.length === v.length ? n : null;
}

/**
 * Lees `wrath` uit `towc_battle_by_code`. undefined = het veld ontbreekt (oudere server); null = er is
 * (nog) geen worp, of hij is onbruikbaar. Anders de lijst ACTIEVE triggers (1-6 waarden; sinds 23-11-2026
 * staat daar ook bij Act 5-6, waar de dobbelstenen de NIET-actieve kiezen, de actieve lijst in).
 */
export function parseWrath(raw: unknown): number[] | null {
  if (!raw || typeof raw !== 'object') return null;
  return volledigeWorp((raw as Record<string, unknown>).d6);
}

/**
 * LOKALE WORP (lab, scenario-test, tafeltest) met dezelfde regel als de server: per Act het aantal D6 uit
 * `wrathRegelVoorAct`, een dubbel opnieuw tot alle dobbelstenen verschillen. Geeft de lijst ACTIEVE
 * triggers terug, net als `wrath.d6` van de server: bij 'actief' de gegooide, bij 'niet-actief' de
 * andere, bij 'alles' 1-6. `rng` geeft [0,1); vast te zetten in de tests. Het vangnet na 200 dubbels kan
 * met een echte rng niet afgaan, maar een kapotte rng (altijd 0) mag geen lus maken.
 */
export function gooiWrath(fase: number | null | undefined = 3, rng: () => number = Math.random): number[] {
  const regel = wrathRegelVoorAct(fase);
  if (regel.modus === 'alles') return [1, 2, 3, 4, 5, 6];
  const d6 = () => 1 + Math.min(5, Math.floor(rng() * 6));
  const worp: number[] = [];
  while (worp.length < regel.dobbelstenen) {
    let w = d6();
    for (let n = 0; worp.includes(w); n++) {
      if (n >= 200) { w = [1, 2, 3, 4, 5, 6].find((x) => !worp.includes(x)) ?? 1; break; }
      w = d6();
    }
    worp.push(w);
  }
  return regel.modus === 'actief' ? worp : [1, 2, 3, 4, 5, 6].filter((x) => !worp.includes(x));
}

export const wrathTrigger = (d6: number): WrathTrigger | undefined => WRATH_TRIGGERS.find((t) => t.d6 === d6);

/** De triggers bij een worp, in worp-volgorde. */
export const wrathActief = (d6s: number[]): WrathTrigger[] => d6s.map(wrathTrigger).filter((t): t is WrathTrigger => !!t);
