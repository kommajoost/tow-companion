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

/**
 * BOUND SPELL IN EEN ITEMTEKST (Joost 28-10-2026: "soms zitten er nog van die gekke onopgemaakte teksten
 * tussen" — Hand of Dust). Een item met een Bound spell heeft in de bron een blokje Type / Casting Value /
 * Range: in magic-item-text.json als regels "Type | Assailment", in een Renegade-overlay als
 * "Type: Assailment Casting Value:8+ Range: Combat Effect: …". Bij het tonen wordt de witruimte
 * platgeslagen en stond het als één doorlopende zin. Dit knipt de (al platgeslagen) tekst in drie
 * stukken zodat de sheet er een tabelletje van kan maken: de tekst ervoor, de drie velden, en het
 * effect erna. Woorden blijven letterlijk; alleen het label "Effect:" vervalt (de basistekst heeft het niet).
 */
export function splitsBoundSpell(tekst: string): { voor: string; type: string; cv: string; range: string; na: string } | null {
  const t = tekst.replace(/\s+/g, ' ').trim();
  const m = t.match(/^(.*?)\s*Type\s*[:|]\s*(.+?)\s+Casting Value\s*[:|]\s*(\S+)\s+Range\s*[:|]\s*(\S+)\s*(?:Effect\s*:\s*)?(.*)$/i);
  if (!m) return null;
  return { voor: m[1].trim(), type: m[2].trim(), cv: m[3].trim(), range: m[4].trim(), na: m[5].trim() };
}
