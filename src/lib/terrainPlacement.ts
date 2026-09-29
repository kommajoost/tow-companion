/**
 * TERREIN PLAATSEN — de huisregel van Isle of Celedon (Joost, 29-09-2026, per direct in Act 2).
 *
 * Vervangt de rulebook-regel "roll-off, de winnaar zet alles neer, de verliezer scattert D3 stukken".
 * KOPIE van site/src/data/terreinPlaatsing.ts in de campagne-repo (andere repo, dus geen import):
 * wijzig je het daar, wijzig het hier ook. Tekst Engels, commentaar Nederlands.
 */

/** De samenvatting: altijd zichtbaar. */
export const TERRAIN_PLACEMENT_SHORT =
  'The app sets the number and types of pieces. Roll off; the winner places first, then take turns. ' +
  'Place a piece at the centre of a table quarter; your opponent rolls scatter + 2D6, and you decide: ' +
  'move it that far, or leave it. First four pieces: four different quarters. Fifth: the table centre. ' +
  'From the sixth: any quarter centre that still fits. A moving piece stops 1" short of other terrain.';

/** De volledige regel, stap voor stap (uitklapbaar). */
export const TERRAIN_PLACEMENT_STEPS: { title: string; text: string }[] = [
  {
    title: 'The pieces',
    text: 'The app generates how many terrain pieces there are and of which types. You only place them.',
  },
  {
    title: 'Who starts',
    text: 'Both players roll off. The winner places the first piece, then you alternate: one piece each, until all pieces are down.',
  },
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
];
