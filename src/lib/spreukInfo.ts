import type { Rule, RichNode } from '../types';
import { SPREUK_UITLEG, type SpreukDuur } from './spreukUitleg';

/**
 * SPREUKEN IN ÉÉN OOGOPSLAG (Joost 28-10-2026): "per spell gewoon die drie onder elkaar … daarnaast een
 * korte uitleg van wat je casting value is, wanneer je hem kan casten, of het een hex is, enchantment …
 * of een magic missile". Type, Casting Value en Range komen LETTERLIJK uit de tabel boven de regeltekst
 * (rules.json); de effect-samenvatting uit spreukUitleg.ts; de volledige regel blijft één tik verder.
 */
export interface SpreukInfo {
  type: string | null;
  cv: string | null;
  range: string | null;
  kort: string | null;
  duur: SpreukDuur | null;
}

const tekst = (n: RichNode | null | undefined): string => {
  if (!n) return '';
  const v = (n as { value?: string }).value;
  if (typeof v === 'string') return v;
  return ((n as { content?: RichNode[] }).content ?? []).map(tekst).join('');
};

export function spreukInfo(slug: string, rule: Rule | undefined): SpreukInfo {
  const velden: Record<string, string> = {};
  for (const n of ((rule?.body as { content?: RichNode[] } | null)?.content ?? [])) {
    if ((n as { nodeType?: string }).nodeType !== 'table') continue;
    for (const rij of ((n as { content?: RichNode[] }).content ?? [])) {
      const cellen = ((rij as { content?: RichNode[] }).content ?? []).map((c) => tekst(c).trim());
      if (cellen.length >= 2) velden[cellen[0]] = cellen.slice(1).join(' ').trim();
    }
  }
  const u = SPREUK_UITLEG[slug];
  return {
    type: velden['Type'] || null,
    cv: velden['Casting Value'] || null,
    range: velden['Range'] || null,
    kort: u?.kort ?? null,
    duur: u?.duur ?? null,
  };
}

/** Wanneer een spreuktype gecast wordt en op wie — uit de rulebook-pagina's van de typen
 *  (Conjuration, Conveyance spells, Magic Missile and Magical Vortex spells, Assailment spells). */
export const SPREUK_MOMENT: Record<string, string> = {
  'Enchantment': 'Conjuration · friendly unit',
  'Hex': 'Conjuration · enemy unit',
  'Conveyance': 'Remaining Moves · friendly unit',
  'Magic Missile': 'Shooting · enemy in line of sight, auto-hits',
  'Magical Vortex': 'Shooting · template',
  'Assailment': 'Combat · enemy you fight, auto-hits',
};

export const DUUR_LABEL: Record<SpreukDuur, string | null> = {
  remains: 'Remains in Play',
  turn: 'Until end of turn',
  'next-turn': 'Until your next turn',
  instant: null,
};
