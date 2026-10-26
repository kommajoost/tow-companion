/**
 * TERREIN PLAATSEN — de huisregel van Isle of Celedon (Joost, 29-09-2026, per direct in Act 2).
 *
 * Vervangt de rulebook-regel "roll-off, de winnaar zet alles neer, de verliezer scattert D3 stukken".
 * KOPIE van site/src/data/terreinPlaatsing.ts in de campagne-repo (andere repo, dus geen import):
 * wijzig je het daar, wijzig het hier ook. Tekst Engels, commentaar Nederlands.
 *
 * 18-10-2026 (Joost): in elke attacker/defender-setup (Act 3+, dus ook claim-duels en challenges)
 * plaatst de VERDEDIGER het eerste stuk (dat scattert gewoon); Battle March (Act 1-2) houdt de
 * roll-off.
 *
 * 20-10-2026 (Joost): het hex-gebouw en z'n muur vervallen. Vanaf Act 3 is de volgorde: (1) de
 * verdediger zet de stukken van het SCENARIO neer zoals de kaart ze tekent (schuren, de Forge, het
 * feature) — die scatteren niet; (2) in Breakthrough zet de verdediger z'n lage muur waar hij wil op
 * z'n eigen helft — scattert niet; (3) dan de terreinstukken om de beurt volgens de huisregel, de
 * verdediger zet het eerste. Oude sheets met een vooraf geplaatst gebouw (`building`) houden hun zin.
 * (22-10-2026: deze kopie bijgewerkt naar die drie stappen.)
 */

/** Voor welke battle de tekst is. Zonder opties: de algemene tekst, die beide gevallen noemt.
 *  `battleMarch` = Act 1-2 (sheet.fase <= 2), en ook de roll-off-tekst voor een potje buiten de
 *  campagne; `building` = er staan vooraf geplaatste stukken (oude sheets, 18-10 t/m 20-10). */
export interface PlacementOptions {
  battleMarch?: boolean;
  building?: boolean;
}

const SHORT_PLACING =
  'Place a piece at the centre of a table quarter; your opponent rolls scatter + 2D6, and you decide: ' +
  'move it that far, or leave it. First four pieces: four different quarters. Fifth: the table centre. ' +
  'From the sixth: any quarter centre that still fits. A moving piece stops 1" short of other terrain.';

/** De samenvatting: altijd zichtbaar. */
export function terrainPlacementShort(o?: PlacementOptions): string {
  const general = o?.battleMarch === undefined;
  // 26-10-2026 (Joost): "de huisregel van defender zet terrain is oud, klopt niet meer" -- in ELKE Act
  // weer een roll-off, de winnaar zet het eerste stuk. Spiegel van site/src/data/terreinPlaatsing.ts.
  const start = general
    ? 'Then roll off: the winner places the first terrain piece, and you take turns. '
    : 'Roll off; the winner places first, then take turns. ';
  // Alleen oude sheets (`building` = er staan vooraf geplaatste stukken, 18-10-2026) houden deze zin.
  const preplaced = !general && o.building
    ? 'The building and its low wall are already on the table and are not placed in turn. '
    : '';
  // 20-10-2026 (Joost): vanaf Act 3 eerst de scenario-stukken en de muur van de verdediger, dan pas het
  // terrein om de beurt. Battle March heeft geen verdediger-kant en houdt de oude zin.
  const first = general
    ? 'From Act 3 the scenario pieces go down first, exactly where the map shows them, and in Breakthrough the defender’s low wall anywhere in their own half; none of these scatter. '
    : o.battleMarch || o.building
      ? ''
      : 'First the scenario pieces go down, exactly where the map shows them, and in Breakthrough the defender’s low wall anywhere in their own half; none of these scatter. ';
  return 'The app sets the number and types of pieces. ' + preplaced + first + start + SHORT_PLACING;
}

/** De volledige regel, stap voor stap (uitklapbaar). */
export function terrainPlacementSteps(o?: PlacementOptions): { title: string; text: string }[] {
  const general = o?.battleMarch === undefined;
  const steps: { title: string; text: string }[] = [
    {
      title: 'The pieces',
      text: 'The app generates how many terrain pieces there are and of which types. You only place them.',
    },
  ];
  // 20-10-2026 (Joost): vanaf Act 3 eerst de scenario-stukken, dan de muur van de verdediger. Niet in
  // Battle March (geen verdediger-kant) en niet op oude sheets met een vooraf geplaatst gebouw.
  if (general || (!o.battleMarch && !o.building)) {
    steps.push(
      {
        title: 'Scenario pieces first',
        text:
          (general ? 'From Act 3: if' : 'If') +
          ' the map shows buildings or a special feature (the storage buildings, the Forge, the Command & Control feature), they ' +
          'go down first, exactly where the map shows them. They do not scatter and are not part of the terrain list.',
      },
      {
        title: "Breakthrough: the defender's low wall",
        text:
          'In Breakthrough the defender then places a low wall anywhere in their own half. It does not scatter, ' +
          'and it comes on top of the terrain pieces.',
      },
    );
  }
  if (!general && o.building) {
    // Oude sheets (tot 20-10-2026) met vooraf geplaatst gebouw en muur.
    steps.push({
      title: 'Already on the table',
      text:
        "The building of this hex stands on the defender's half with a low wall in front of it. Both count as terrain pieces, " +
        'but they are on the table before you start: they are not placed in turn and do not scatter.',
    });
  }
  steps.push({
    title: 'Who starts',
    text: general
      ? 'In every Act both players roll off. The winner places the first terrain piece, and it scatters like any other. ' +
        'Then you alternate: one piece each, until all pieces are down.'
      : 'Both players roll off. The winner places the first piece, and it scatters like any other. Then you alternate: one piece each, until all pieces are down.',
  });
  steps.push(
    {
      title: 'Placing a piece',
      text:
        'The active player picks one of the remaining pieces and a table quarter, and puts the centre of the piece on the centre ' +
        'of that quarter. The other player then rolls the scatter die and 2D6. A Hit! does not count: use the small arrow on the ' +
        'Hit! face for the direction. The active player now chooses: move the piece the rolled distance in that direction, or leave ' +
        'it where it is.',
    },
    {
      title: 'Bumping into terrain',
      text: 'A piece that moves towards another piece stops 1" before it.',
    },
    {
      title: 'The first four pieces',
      text: 'They must go in four different quarters, one each.',
    },
    {
      title: 'The fifth piece',
      text: 'It goes on the centre of the table, and may then be scattered in the same way.',
    },
    {
      title: 'The sixth and later pieces',
      text:
        'Back to the centre of a quarter, as long as the piece can be placed there without touching another piece. ' +
        'If no quarter has room, placement is over and the remaining pieces stay in the box.',
    },
  );
  // 24-10-2026 (Joost): officiële Strategic Locations-regel, kopie van site/src/data/terreinPlaatsing.ts.
  if (general || !o.battleMarch) {
    steps.push({
      title: 'Objective markers keep 3" clear',
      text:
        (general ? 'From Act 3, an' : 'An') +
        ' objective marker is never within 3" of a terrain piece or on a low wall. If a piece ends closer, move it the smallest distance needed to keep 3" clear.',
    });
  }
  return steps;
}

/** De algemene samenvatting, die beide gevallen noemt. */
export const TERRAIN_PLACEMENT_SHORT = terrainPlacementShort();

/** De algemene regel, stap voor stap. */
export const TERRAIN_PLACEMENT_STEPS: { title: string; text: string }[] = terrainPlacementSteps();
