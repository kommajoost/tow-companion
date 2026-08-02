// Hoe een unit op het scherm heet.
//
// In een campagne krijgt elke unit een eigen naam ("Dreth's Thunder") — daar hangt de veteranen-
// identiteit aan. Maar een leger dat alleen uit eigennamen bestaat is aan tafel onleesbaar: je ziet
// nergens meer WAT er staat. Dus overal dezelfde regel: het datasheet is primair, de eigen naam is
// secundair. Eén plek, zodat de uitslag, de unit-kaart en het roster het niet elk anders doen.

export interface UnitToon {
  /** De regel die groot mag: de catalogusnaam, of de eigen naam als we de catalogus niet kennen. */
  primair: string;
  /** De eigen naam van de speler, of null als die er niet is (of gelijk is aan het datasheet). */
  secundair: string | null;
}

/** Splits een unit in wat je groot toont en wat eronder. Werkt ook voor een geplakte OWB-lijst, die
 *  geen `datasheet` heeft — dan is er simpelweg niets secundairs. */
export function unitToon(u: { name?: string | null; datasheet?: string | null } | null | undefined): UnitToon {
  const ds = (u?.datasheet ?? '').trim();
  const naam = (u?.name ?? '').trim();
  if (!ds || ds === naam) return { primair: naam || ds, secundair: null };
  return { primair: ds, secundair: naam || null };
}

/** Eén regel: "Dark Elf Warriors · Dreth's Thunder" — voor plekken met maar één tekstregel. */
export function unitToonRegel(u: { name?: string | null; datasheet?: string | null } | null | undefined): string {
  const { primair, secundair } = unitToon(u);
  return secundair ? `${primair} · ${secundair}` : primair;
}
