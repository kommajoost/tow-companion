// UNIT-ID'S REPAREREN DIE ÉÉN WEEK LANG UIT EEN ANDERE CATALOGUS KWAMEN.
//
// WAT ER GEBEURD IS (7 en 14 september 2026). De wekelijkse sync met Old World Builder haalde een
// HERSTRUCTURERING binnen: waar een unit eerst één regel was met een lijstje composities waarin hij
// mag spelen, leverde OWB er ineens twee — een basisregel en een aparte `…-renegade`-regel met een
// eigen id en een eigen prijs. Daardoor stond elke unit dubbel in de kiezer, en vielen de units waar
// onze Renegade V2-packs op leunen buiten hun eigen compositie ("not allowed in this army
// composition").
//
// Die sync is teruggedraaid en de koppeling met OWB is opgeheven: onze eigen packs zijn voor deze
// legers nauwkeuriger dan de bron (ze worden uit de Renegade-documenten zelf gecompileerd, inclusief
// units die OWB helemaal niet kende). Wat blijft staan is dit: wie in dat ene weekje een unit uit de
// nieuwe catalogus in zijn lijst zette, heeft een id dat nergens meer bestaat — en zo'n regel zou
// stilletjes uit zijn lijst vallen, inclusief de puntentelling en de campagne-XP die eraan hangt.
//
// Vandaar deze omzetting. Ze is BEWUST TERUGHOUDEND: ze verandert alleen een id dat NIET meer
// bestaat, en alleen als de vervanger wél bestaat. Vindt ze niets, dan blijft de regel onaangeroerd —
// een unit vervangen door een andere unit omdat de naam een beetje lijkt, is precies het soort
// verzonnen data dat deze app nergens doet.

/** De id's die de regel hieronder niet kan afleiden, maar die we met zekerheid kennen.
 *
 *  Vier daarvan zijn units die ONZE packs zelf toevoegen (OWB kende ze niet, wij compileren ze uit
 *  het Renegade-document); OWB gaf ze vorige week een eigen, net andere naam. De laatste twee zijn
 *  detachments die OWB als losse regel ging voeren.
 *
 *  Drie ervan zijn units die OWB een naam gaf die WIJ al gaven: onze packs hernoemen Infernal
 *  Castellan naar "Despot", Infernal Seneschal naar "Seneschal" en Vampire Count naar "Vampire
 *  Lord". Dat staat zo in de overlay (`units[id].replace.name_en`) en in scripts/patch-renegade-
 *  added-units.mjs, dus dit is geen gok maar dezelfde bron.
 *
 *  Wat hier met opzet NIET in staat: Merwyrm (Dark Elves) en Soul Grinder of Khorne (Daemons). Die
 *  bestonden alleen in de nieuwe catalogus. Voor de Merwyrm is er domweg geen tegenhanger, en de
 *  Khorne-variant van de Soul Grinder is niet aantoonbaar dezelfde unit als de gewone — er een
 *  aanwijzen die er "het meest op lijkt" zou een andere unit in iemands lijst zetten dan hij
 *  gekozen heeft. Zo'n regel blijft dus staan zoals hij is. */
const ALIAS: Record<string, string> = {
  'chaos-dwarf-warrior-renegade': 'chaos-dwarf-warriors',
  'blunderbuss-decimator-renegade': 'blunderbuss-decimators',
  'skink-cohort-renegade': 'skink-cohorts',
  'weapon-team-detachment-renegade': 'weapon-team',
  'plague-censer-bearers-detachment-renegade': 'plague-censer-bearers',
  'kroxigors-detachment': 'kroxigors',
  'despot-renegades': 'infernal-castellan',
  'seneschal-renegade': 'infernal-seneschal',
  'vampire-lord-renegade': 'vampire-count',
};

/** De categorie-achtervoegsels die OWB in die week aan id's plakte om aan te geven dat een unit in
 *  een andere categorie terechtkwam (`witch-elves-core`, `vargheists-special`). Voor ons zegt dat
 *  niets: onze catalogus bepaalt de categorie zelf. */
const CAT_SUFFIX = /-(core|special|rare|characters)$/;

/**
 * Het id waar deze entry naartoe hoort, of `null` als er niets te repareren valt.
 *
 * `bestaat` beantwoordt "kent de catalogus dit id?" — de aanroeper levert dat, want alleen die weet
 * welke catalogus (welk leger, welke compositie) voor deze lijst geldt.
 */
export function herstelUnitId(id: string, bestaat: (kandidaat: string) => boolean): string | null {
  if (!id || bestaat(id)) return null;           // niets aan de hand
  const alias = ALIAS[id];
  if (alias && bestaat(alias)) return alias;
  // De regel: het `-renegade`-achtervoegsel eraf, en zo nodig ook het categorie-achtervoegsel.
  // Dit dekt 122 van de 133 id's die in die week konden ontstaan.
  const kaal = id.replace(/-renegade$/, '');
  if (kaal !== id && bestaat(kaal)) return kaal;
  const zonderCat = kaal.replace(CAT_SUFFIX, '');
  if (zonderCat !== kaal && bestaat(zonderCat)) return zonderCat;
  return null;
}
