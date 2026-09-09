// Een army list als VOLWAARDIG printblad — met alle regels erbij.
//
// WAAROM NAAST `listToPrintHtml`. Die drukt de lijst af zoals de builder hem op het scherm zet:
// namen, punten, loadout, statlines en de NAMEN van de special rules. Prima om te delen, maar aan
// tafel heb je juist de TEKST nodig — wat doet "Armour Bane (1)", wat staat er precies in "Impact
// Hits (D6+1)", welke spreuken zitten er in de lore van je wizard. Dat kan `listToPrintHtml` niet
// weten: hij krijgt roster-rijen, geen spelmodel. Deze module werkt daarom op `Army` — hetzelfde
// model dat het spel gebruikt — en kan dus dezelfde bronnen aanspreken als de unit-kaart in-game:
// `rules`, `lores`, de wapenprofielen uit `unitWeapons` en de magic-item-teksten.
//
// De oude functie blijft bestaan en blijft de terugval: is er geen spelmodel beschikbaar (een
// geplakte lijst, of een builder-scherm dat de catalogusdata nog niet binnen heeft), dan drukt de
// Share-sheet gewoon het oude blad af. Twee printpaden naast elkaar is minder erg dan een knop die
// soms niets doet.
//
// PRINTKEUZES, en waarom — grotendeels overgenomen van `listToPrintHtml` omdat ze daar al bewezen
// zijn:
//  • Systeem-serif, geen ingesloten webfont: de app-fonts bestaan niet in een leeg printvenster.
//  • Zwart op wit met één grijstint: een donker thema print als een blad vol toner.
//  • `break-inside: avoid` per unit-blok: een unit die over de paginarand valt kost je op de
//    speelavond precies de regel die je zoekt.
//  • Geen externe assets, geen scripts: het document moet ook offline en in een iframe (de
//    live-preview) exact hetzelfde zijn als op papier.
//
// DE APPENDIX IS DE DEFAULT, en dat is een papierbesparing van formaat: "Close Order" hoort bij acht
// units, "Fear" bij vijf. Inline zou elke tekst acht keer op je blad staan. In appendix-modus staat
// onder de unit alleen de naam, en achterin één alfabetische "Rules reference". Wie liever alles bij
// de unit heeft (je bladert dan nooit) zet hem op `inline`.

import type { Army, ArmyUnit, Lore, Rule, UnitProfile } from '../types';
import type { ExportMeta } from './listExport';
import type { MagicText, MountText } from './builderToArmy';
import { allowedLores, getRuleIndex, resolveOptionSlug, resolveRuleSlug, splitCompoundLabel } from './armyRules';
import { unitWeapons, type WeaponProfile } from './weaponStats';
import { magicItemIdFromName } from './owbBuilder';
import { richToHtml } from './richHtml';

// ══════════════════════════════════════════════════════════════════════════════════════════════
// Instellingen
// ══════════════════════════════════════════════════════════════════════════════════════════════

export interface PrintOptions {
  /** Punten per unit + subtotalen. Uit = de "show list" die je je tegenstander geeft. */
  points: boolean;
  /** De eigen naam die de speler een unit gaf tonen (alleen als die afwijkt van het datasheet). */
  unitNames: boolean;
  /** De loadout-regels onder de unit. */
  loadout: boolean;
  /** De statline-tabellen (M WS BS S T W I A Ld). */
  statlines: boolean;
  /** De special rules van de unit (en van profielen met eigen `info.specialRules`). */
  unitRules: boolean;
  /** De wapenprofieltabel per unit. */
  weapons: boolean;
  /** De TEKST van de wapenregels. Zonder `weapons` is er niets om tekst bij te zetten. */
  weaponRules: boolean;
  /** Mount-profielen + mount special rules. */
  mounts: boolean;
  /** Magic items: flavour + effecttekst (+ het wapenprofiel als het item er een heeft). */
  magicItems: boolean;
  /** Per wizard: de gekozen lores met hun spreuken. */
  lores: boolean;
  /** Alleen de gerolde/gekozen spreuken. Valt terug op de hele lore als er niets gekozen is. */
  spellsOnlyChosen: boolean;
  /** `appendix` = regelnamen onder de unit, alle teksten één keer achterin. `inline` = alles direct
   *  onder de unit. Zie de kop van dit bestand. */
  rulesMode: 'inline' | 'appendix';
  /** Kleinere letter en krappere marges. */
  compact: boolean;
}

export const DEFAULT_PRINT_OPTIONS: PrintOptions = {
  points: true,
  unitNames: true,
  loadout: true,
  statlines: true,
  unitRules: true,
  weapons: true,
  weaponRules: true,
  mounts: true,
  magicItems: true,
  lores: true,
  spellsOnlyChosen: true,
  rulesMode: 'appendix',
  compact: false,
};

export interface PrintInput {
  army: Army;
  meta: ExportMeta;
  rules: Record<string, Rule>;
  lores: Record<string, Lore>;
  magicText?: MagicText;
  mountText?: MountText;
  /** Dezelfde string als `army.faction` — nodig om factie-varianten van een regel ("Fiery Breath
   *  (Dark Elves)") uit een kaal label terug te vinden. */
  faction: string;
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// Kleine helpers
// ══════════════════════════════════════════════════════════════════════════════════════════════

const esc = (s: string): string =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

/** De catalogus zet bookkeeping-tekens in namen ("{renegade}", "*"); die horen niet op papier.
 *  Zelfde opruiming als in `listExport`, inclusief de spatie die overblijft waar een tag vóór een
 *  komma stond — anders leest een regelrij als "Murderous , Strike First". */
const clean = (s: string): string =>
  (s || '')
    .replace(/\{[^}]*\}/g, ' ')
    .replace(/\*/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,;.])/g, '$1')
    .trim();

/** Twee labels die alleen in ONZE catalogus bestaan en niets betekenen op papier: "On foot" is bij
 *  ons een echte mount-optie (index 0), en "Wizard" is de kale kop boven de Level-keuze. */
const PLAATSHOUDERS = [/^on foot$/i, /^wizard$/i];

/** OWB's boekhoudmarkering voor een meermaals-neembaar item ("*Extremely Common", "*Common"). Staat
 *  als laatste regel in de effecttekst en lekt via `magicItemRules` de regel-labels in. Het is geen
 *  regel en geen effect — op papier hoort hij nergens. */
const MARKERING = /^\*?\s*(extremely\s+)?common\s*$/i;
const isMarkering = (s: string): boolean => MARKERING.test((s || '').trim());

/** De effecttekst van een magic item zonder de markering-regel(s). Blijft er niets over, dan was de
 *  body ALLEEN de markering (Sword of Might) en zit het echte effect in het profiel. */
const schoonEffect = (body?: string): string =>
  (body || '')
    .split(/\r?\n/)
    .filter((r) => r.trim() && !isMarkering(r))
    .join('\n')
    .trim();

const CAT_ORDER = ['Characters', 'Core', 'Special', 'Rare', 'Mercenaries', 'Allies'];

/** Units gegroepeerd in de vaste categorie-volgorde. Een onbekend label (een geplakte lijst schrijft
 *  "Core Units") valt op zijn eerste woord terug; blijft het onbekend, dan krijgt het achteraan een
 *  eigen kopje in plaats van stilletjes te verdwijnen. */
function groepeer(units: ArmyUnit[]): { label: string; units: ArmyUnit[] }[] {
  const groepen = new Map<string, ArmyUnit[]>();
  for (const u of units) {
    const rauw = (u.category || '').trim();
    const bekend = CAT_ORDER.find((c) => new RegExp(`^${c}\\b`, 'i').test(rauw));
    const key = bekend ?? (rauw || 'Units');
    const lijst = groepen.get(key);
    if (lijst) lijst.push(u);
    else groepen.set(key, [u]);
  }
  const uit = [...groepen.entries()].map(([label, us]) => ({ label, units: us }));
  const rang = (l: string) => {
    const i = CAT_ORDER.indexOf(l);
    return i < 0 ? CAT_ORDER.length : i;
  };
  return uit.sort((a, b) => rang(a.label) - rang(b.label));
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// Regelresolutie
// ══════════════════════════════════════════════════════════════════════════════════════════════

/** Eén regelverwijzing: het LABEL zoals de lijst het schrijft ("Impact Hits (D6+1)") plus de
 *  gevonden regelpagina ("Impact Hits (X)"). Een parametrisch label toont zijn eigen tekst als kop
 *  en de tekst van de basisregel eronder — dat is precies wat je aan tafel wilt lezen. */
interface RegelRef { label: string; rule?: Rule }

interface Ctx {
  rules: Record<string, Rule>;
  idx: Map<string, string>;
  faction: string;
  /** Alles wat de appendix moet bevatten, ontdubbeld op slug. */
  appendix: Map<string, Rule>;
  opts: PrintOptions;
}

/** Labels → regelverwijzingen. Samengestelde labels ("Light armour, Shields") worden eerst
 *  gesplitst: geen enkele regelpagina heet naar de combinatie, elk DEEL wel. */
function resolveer(labels: (string | undefined)[], ctx: Ctx): RegelRef[] {
  const uit: RegelRef[] = [];
  const gezien = new Set<string>();
  for (const rauw of labels) {
    const heel = clean(rauw ?? '');
    if (!heel) continue;
    for (const deel of splitCompoundLabel(heel)) {
      const label = deel.trim();
      if (!label || PLAATSHOUDERS.some((re) => re.test(label)) || isMarkering(label)) continue;
      const k = label.toLowerCase();
      if (gezien.has(k)) continue;
      gezien.add(k);
      // Eerst als regelNAAM (dat is wat een special rule is), dan pas als wargear-label: die tweede
      // route kent aliassen ("Additional hand weapon" → de gedeelde pagina) en mag nooit een goed
      // antwoord van de eerste overrulen.
      const slug = resolveRuleSlug(label, ctx.idx, ctx.faction) ?? resolveOptionSlug(label, ctx.idx, ctx.faction);
      const rule = slug ? ctx.rules[slug] : undefined;
      uit.push({ label, rule });
    }
  }
  return uit;
}

/** Onthoud een regel voor de appendix. Wapenprofiel-pagina's slaan we over: de profieltabel die we
 *  al bij de unit afdrukken IS die regel, en de pagina zelf bevat niets anders. */
function onthoud(ref: RegelRef, ctx: Ctx): void {
  const r = ref.rule;
  if (!r || r.slug.endsWith('-profile')) return;
  if (!ctx.appendix.has(r.slug)) ctx.appendix.set(r.slug, r);
}

/** Eén regelbody als HTML. `body` is de rich-text; `bodyIndex` is de platte terugval voor een
 *  data-bundel die de body kwijt is. */
function regelBody(rule: Rule): string {
  const html = richToHtml(rule.body);
  if (html.trim()) return html;
  return rule.bodyIndex ? `<p>${esc(rule.bodyIndex)}</p>` : '';
}

/** Een groepje regels onder een unit: altijd de namen, en in `inline`-modus ook de teksten. In
 *  `appendix`-modus worden de gevonden regels onthouden voor achterin. */
function regelBlok(titel: string, refs: RegelRef[], ctx: Ctx): string {
  if (!refs.length) return '';
  const namen = refs.map((r) => esc(r.label)).join(' · ');
  const kop = `<div class="rij"><span class="rl">${esc(titel)}</span><span class="rv">${namen}</span></div>`;
  if (ctx.opts.rulesMode === 'appendix') {
    refs.forEach((r) => onthoud(r, ctx));
    return kop;
  }
  const teksten = refs
    .filter((r) => r.rule)
    .map((r) => {
      const rule = r.rule as Rule;
      const pag = rule.pageReference ? `<span class="pg">p. ${rule.pageReference}</span>` : '';
      return `<div class="regel"><div class="rk">${esc(r.label)}${pag}</div><div class="rt">${regelBody(rule)}</div></div>`;
    })
    .join('');
  return kop + teksten;
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// Tabellen
// ══════════════════════════════════════════════════════════════════════════════════════════════

function statTabel(profiel: UnitProfile, caption?: string): string {
  if (!profiel.stats?.length) return '';
  const kop = profiel.stats.map((s) => `<th>${esc(s.k)}</th>`).join('');
  const cel = profiel.stats.map((s) => `<td>${esc(s.v || '-')}</td>`).join('');
  const cap = caption ? `<caption>${esc(caption)}</caption>` : '';
  return `<table class="stat">${cap}<thead><tr>${kop}</tr></thead><tbody><tr>${cel}</tr></tbody></table>`;
}

/** De Strength-kolom van een wapen: een absoluut getal (schietwapens) of een modifier op de S van
 *  het model (nabijgevecht) — "S", "S+1". */
const wapenS = (w: WeaponProfile): string =>
  w.sAbs != null ? String(w.sAbs) : (w.sMod ? `S${w.sMod > 0 ? '+' : ''}${w.sMod}` : 'S');

/** De special-rules-kolom van een wapen. Het aantal schoten en de extra aanval staan niet in de
 *  regels van het profiel maar zijn wel precies wat je aan tafel opzoekt, dus die worden erbij
 *  gezet — en alleen als de regels ze niet zelf al noemen. */
function wapenExtras(w: WeaponProfile): string[] {
  const uit = w.specialRules.filter((r) => !isMarkering(r));
  if (w.aMod > 0) uit.push(`+${w.aMod} A`);
  if (w.multiShots && !w.specialRules.some((r) => /multiple shots/i.test(r))) {
    uit.push(`Multiple Shots (${w.multiShots})`);
  }
  if (w.shots > 1) uit.push(`${w.shots} shots`);
  return uit;
}

function wapenRij(w: WeaponProfile, naam: string): string {
  return `<tr><td class="wn">${esc(naam)}</td><td>${esc(w.range || '-')}</td><td>${esc(wapenS(w))}</td>`
    + `<td>${esc(w.ap ? String(w.ap) : '-')}</td><td class="wr">${esc(wapenExtras(w).join(', ') || '-')}</td></tr>`;
}

const WAPEN_KOP = '<thead><tr><th>Weapon</th><th>Range</th><th>S</th><th>AP</th><th>Special rules</th></tr></thead>';

/** Het wapenprofiel van een magic item (magic-item-text.json), als het er een heeft. Zonder deze
 *  tabel mist een Sword of Sorrow z'n Range/Strength/AP volledig. */
function itemProfielTabel(profiel: NonNullable<MagicText[string]['profiel']>): string {
  const rijen = profiel.map((p) => `<tr><td class="wn">${esc(p.naam || '')}</td><td>${esc(p.range || '-')}</td>`
    + `<td>${esc(p.strength || '-')}</td><td>${esc(p.ap || '-')}</td><td class="wr">${esc(p.specialRules || '-')}</td></tr>`).join('');
  if (!rijen) return '';
  return `<table class="wpn">${WAPEN_KOP}<tbody>${rijen}</tbody></table>`;
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// De unit
// ══════════════════════════════════════════════════════════════════════════════════════════════

function unitBlok(unit: ArmyUnit, input: PrintInput, ctx: Ctx): string {
  const o = ctx.opts;
  const datasheet = clean(unit.datasheet || unit.name);
  const eigen = clean(unit.name);
  const stukken: string[] = [];

  // ── Kop ─────────────────────────────────────────────────────────────────────────────────────
  const aantal = unit.count && unit.count > 1 ? `<span class="n">${unit.count}×</span> ` : '';
  const bijnaam = o.unitNames && eigen && eigen !== datasheet ? ` <em class="bij">“${esc(eigen)}”</em>` : '';
  const prijs = o.points && unit.points != null ? `<div class="pts">${unit.points}</div>` : '';
  stukken.push(`<div class="uk"><div class="un">${aantal}${esc(datasheet)}${bijnaam}</div>${prijs}</div>`);
  if (unit.troopType) stukken.push(`<div class="tt">${esc(unit.troopType)}</div>`);

  // ── Loadout ─────────────────────────────────────────────────────────────────────────────────
  if (o.loadout) {
    const opties = (unit.options ?? [])
      .map(clean)
      .filter((x) => x && !PLAATSHOUDERS.some((re) => re.test(x)));
    if (opties.length) stukken.push(`<div class="load">${esc(opties.join(' · '))}</div>`);
  }

  // ── Statlines ───────────────────────────────────────────────────────────────────────────────
  if (o.statlines) {
    const profielen = unit.profiles ?? [];
    const meerdere = profielen.length > 1;
    for (const p of profielen) {
      const caption = meerdere || (p.label && clean(p.label) !== datasheet) ? p.label : undefined;
      stukken.push(statTabel(p, caption));
    }
  }

  // ── Special rules van de unit (+ van losse profielrijen die eigen regels dragen) ─────────────
  if (o.unitRules) {
    stukken.push(regelBlok('Special rules', resolveer(unit.specialRules ?? [], ctx), ctx));
    for (const p of unit.profiles ?? []) {
      const eigenRegels = p.info?.specialRules ?? [];
      if (!eigenRegels.length) continue;
      stukken.push(regelBlok(clean(p.label || 'Profile'), resolveer(eigenRegels, ctx), ctx));
    }
  }

  // ── Wapens ──────────────────────────────────────────────────────────────────────────────────
  if (o.weapons) {
    const { melee, ranged } = unitWeapons(unit, input.rules);
    const alle = [...melee, ...ranged];
    if (alle.length) {
      const rijen: string[] = [];
      const regelLabels: string[] = [];
      for (const w of alle) {
        // Een MAGIC WEAPON komt uit `unitWeapons` als kaal basisprofiel (S, AP 0) met de item-body als
        // "regels" — voor de in-game loadout-kiezer is dat genoeg, op papier is het fout: een Sword of
        // Might is S+1, AP −1, Magical Attacks. Dat echte profiel staat in magic-item-text.json; als
        // het er is, drukken we DAT af in plaats van de kale rij.
        const magisch = w.slug.startsWith('magic-weapon:')
          ? input.magicText?.[magicItemIdFromName(clean(w.name))]?.profiel
          : undefined;
        if (magisch?.length) {
          for (const p of magisch) {
            const naam = clean(p.naam || w.name).replace(/\s*\(profile\)\s*$/i, '') || clean(w.name);
            rijen.push(`<tr><td class="wn">${esc(naam)}</td><td>${esc(p.range || w.range || '-')}</td>`
              + `<td>${esc(p.strength || '-')}</td><td>${esc(p.ap || '-')}</td><td class="wr">${esc(p.specialRules || '-')}</td></tr>`);
            if (p.specialRules) regelLabels.push(...p.specialRules.split(',').map((s) => s.trim()));
          }
          continue;
        }
        rijen.push(wapenRij(w, clean(w.name)));
        regelLabels.push(...w.specialRules);
        // Een Rapid Fire-wapen schiet in zijn meervoudige stand een ANDER, zwakker profiel — dat is
        // een eigen rij waard, want de getallen verschillen.
        if (w.multiProfile) {
          rijen.push(wapenRij(w.multiProfile, `${clean(w.name)} (rapid fire)`));
          regelLabels.push(...w.multiProfile.specialRules);
        }
      }
      stukken.push(`<table class="wpn">${WAPEN_KOP}<tbody>${rijen.join('')}</tbody></table>`);
      if (o.weaponRules) stukken.push(regelBlok('Weapon rules', resolveer(regelLabels, ctx), ctx));
    }
  }

  // ── Mounts ──────────────────────────────────────────────────────────────────────────────────
  if (o.mounts) {
    for (const m of unit.mounts ?? []) {
      stukken.push(`<div class="mk">Mount: ${esc(clean(m.name))}${m.troopType ? ` <span class="tt">${esc(m.troopType)}</span>` : ''}</div>`);
      if (o.statlines) for (const p of m.profiles ?? []) stukken.push(statTabel(p));
      if ((m.details ?? []).length) stukken.push(`<div class="load">${esc((m.details ?? []).join(' · '))}</div>`);
      stukken.push(regelBlok('Mount rules', resolveer(m.specialRules ?? [], ctx), ctx));
    }
  }

  // ── Magic items ─────────────────────────────────────────────────────────────────────────────
  if (o.magicItems && (unit.magicItems ?? []).length) {
    const blokken = (unit.magicItems ?? []).map((item) => {
      const tekst = input.magicText?.[magicItemIdFromName(clean(item.name))];
      const flavour = tekst?.description ?? item.flavour;
      // Zonder de OWB-markering; is de body alleen die markering, dan is er geen effecttekst en
      // zegt het profiel alles. Terugval: de special rules die het spelmodel bewaart.
      const effect = schoonEffect(tekst?.body) || (item.specialRules ?? []).filter((r) => !isMarkering(r)).join(', ');
      // Het wapenprofiel van een item staat al in de wapentabel als die aan staat — niet twee keer.
      const profiel = tekst?.profiel?.length && !o.weapons ? itemProfielTabel(tekst.profiel) : '';
      return `<div class="item"><div class="in">${esc(clean(item.name))}</div>`
        + (flavour ? `<div class="if">${esc(flavour)}</div>` : '')
        + (effect ? `<div class="ie">${esc(effect)}</div>` : '')
        + profiel
        + '</div>';
    });
    stukken.push(`<div class="items"><div class="rl">Magic items</div>${blokken.join('')}</div>`);
    // De special rules die een item verleent hebben elk hun eigen pagina — die horen in de appendix.
    if (o.rulesMode === 'appendix') {
      const labels = (unit.magicItems ?? []).flatMap((i) => i.specialRules ?? []);
      resolveer(labels, ctx).forEach((r) => onthoud(r, ctx));
    }
  }

  // ── Lores & spreuken ────────────────────────────────────────────────────────────────────────
  if (o.lores) stukken.push(loreBlok(unit, input, ctx));

  return `<div class="unit">${stukken.filter(Boolean).join('')}</div>`;
}

/** De lores van een wizard, met de VOLLEDIGE tekst van elke spreuk. Dit is het stuk waarvoor je
 *  anders je telefoon aan tafel nodig had. */
function loreBlok(unit: ArmyUnit, input: PrintInput, ctx: Ctx): string {
  const slugs = allowedLores(unit, input.lores);
  if (!slugs.length) return '';
  const gekozen = new Set(unit.spells ?? []);
  const filteren = ctx.opts.spellsOnlyChosen && gekozen.size > 0;
  const delen: string[] = [];
  for (const slug of slugs) {
    const lore = input.lores[slug];
    if (!lore?.spells?.length) continue;
    // Signature eerst, daarna op nummer — de volgorde waarin het rulebook ze zet.
    const spreuken = [...lore.spells]
      .sort((a, b) => (a.signature === b.signature ? (a.number ?? 0) - (b.number ?? 0) : a.signature ? -1 : 1))
      .filter((s) => !filteren || gekozen.has(s.slug));
    // Filteren en niets over? Dan speelt deze lore niet mee; een leeg kopje zegt niets.
    if (!spreuken.length) continue;
    const rijen = spreuken.map((s) => {
      const rule = input.rules[s.slug];
      const merk = s.signature ? 'Signature' : String(s.number ?? '');
      const body = rule ? regelBody(rule) : '';
      const pag = rule?.pageReference ? `<span class="pg">p. ${rule.pageReference}</span>` : '';
      return `<div class="spell"><div class="sk"><span class="sn">${esc(merk)}</span>${esc(s.name)}${pag}</div>`
        + (body ? `<div class="rt">${body}</div>` : '') + '</div>';
    }).join('');
    delen.push(`<div class="lore"><div class="lk">${esc(lore.name)}${filteren ? ' <span class="pg">chosen spells</span>' : ''}</div>${rijen}</div>`);
  }
  return delen.length ? `<div class="lores">${delen.join('')}</div>` : '';
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// Het document
// ══════════════════════════════════════════════════════════════════════════════════════════════

export function armyToPrintHtml(input: PrintInput, opts: PrintOptions): string {
  const ctx: Ctx = {
    rules: input.rules,
    idx: getRuleIndex(input.rules),
    faction: input.faction,
    appendix: new Map(),
    opts,
  };

  const secties = groepeer(input.army.units).map(({ label, units }) => {
    const subtotaal = units.reduce((n, u) => n + (u.points ?? 0), 0);
    const kop = opts.points
      ? `<h2>${esc(label)}<span class="sub">${subtotaal} pts</span></h2>`
      : `<h2>${esc(label)}</h2>`;
    return `<section>${kop}${units.map((u) => unitBlok(u, input, ctx)).join('')}</section>`;
  }).join('');

  // De appendix wordt PAS hier opgebouwd: hij is gevuld door het renderen van de units hierboven.
  const appendix = opts.rulesMode === 'appendix' && ctx.appendix.size
    ? `<section class="app"><h2>Rules reference</h2>${[...ctx.appendix.values()]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((r) => {
          const pag = r.pageReference ? `<span class="pg">p. ${r.pageReference}</span>` : '';
          return `<div class="regel"><div class="rk">${esc(r.name)}${pag}</div><div class="rt">${regelBody(r)}</div></div>`;
        }).join('')}</section>`
    : '';

  const totaal = opts.points
    ? `<div class="totaal">${input.meta.total}<small>of ${input.meta.cap} pts</small></div>`
    : '';
  const gedrukt = new Date().toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' });

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(input.meta.listName)}</title>
<style>
  @page { size: A4; margin: ${opts.compact ? '11mm 10mm' : '15mm 14mm'}; }
  * { box-sizing: border-box; }
  body { margin: 0; color: #14100a; background: #fff;
         font: ${opts.compact ? '8.6pt/1.32' : '10pt/1.42'} Georgia, "Iowan Old Style", "Palatino Linotype", serif;
         -webkit-print-color-adjust: exact; print-color-adjust: exact; }

  header { border-bottom: 1.5pt solid #14100a; padding-bottom: 3mm; margin-bottom: 5mm; }
  h1 { margin: 0; font-size: ${opts.compact ? '16pt' : '20pt'}; line-height: 1.15; letter-spacing: .01em; }
  .meta { margin-top: 1.5mm; font-size: 8.5pt; color: #5c5342; }
  .totaal { float: right; text-align: right; font-size: ${opts.compact ? '13pt' : '15pt'}; font-variant-numeric: tabular-nums; }
  .totaal small { display: block; font-size: 7.5pt; color: #5c5342; letter-spacing: .12em; text-transform: uppercase; }

  section { margin-bottom: 4mm; break-inside: auto; }
  h2 { font-size: 8.5pt; letter-spacing: .18em; text-transform: uppercase; color: #6b5c3a;
       margin: 0 0 1.5mm; padding-bottom: 1mm; border-bottom: .5pt solid #cfc6b0;
       display: flex; justify-content: space-between; break-after: avoid; }
  h2 .sub { font-variant-numeric: tabular-nums; letter-spacing: 0; }

  /* Een unit blijft bij elkaar — een afgesneden regeltekst is precies wat je op de avond zoekt. */
  .unit { break-inside: avoid; padding: ${opts.compact ? '1mm 0 1.6mm' : '1.6mm 0 2.4mm'};
          border-bottom: .25pt dotted #ddd6c4; }
  .unit:last-child { border-bottom: 0; }
  .uk { display: flex; align-items: baseline; gap: 3mm; }
  .un { flex: 1; font-weight: 700; font-size: ${opts.compact ? '9.6pt' : '11pt'}; }
  .un .n { font-weight: 400; color: #5c5342; }
  .un .bij { font-weight: 400; color: #5c5342; }
  .pts { font-variant-numeric: tabular-nums; white-space: nowrap; }
  .tt { font-size: 7.8pt; letter-spacing: .1em; text-transform: uppercase; color: #6b5c3a; }
  .load { color: #3d372c; font-size: 8.8pt; margin-top: .6mm; }
  .mk { margin-top: 1.2mm; font-weight: 700; font-size: 8.8pt; }
  .mk .tt { display: inline; margin-left: 2mm; font-weight: 400; }

  .rij { margin-top: .8mm; font-size: 8.8pt; }
  .rl { display: inline-block; min-width: 21mm; font-size: 7.6pt; letter-spacing: .1em;
        text-transform: uppercase; color: #6b5c3a; }
  .rv { color: #3d372c; }

  /* Regeltekst: inline onder de unit, of één keer in de appendix. */
  .regel { break-inside: avoid; margin: 1mm 0 0 21mm; }
  .app .regel { margin-left: 0; padding-bottom: 1mm; }
  .rk { font-weight: 700; font-size: 8.8pt; }
  .pg { margin-left: 2mm; font-weight: 400; font-size: 7.4pt; color: #6b5c3a; }
  .rt { font-size: 8.6pt; color: #241f16; }
  .rt p { margin: .4mm 0; }
  .rt ul, .rt ol { margin: .4mm 0; padding-left: 5mm; }
  .rt blockquote { margin: .6mm 0 .6mm 3mm; font-style: italic; color: #5c5342; }
  .rt hr { border: 0; border-top: .25pt solid #cfc6b0; margin: 1mm 0; }
  .rt .rh-kop { margin: .8mm 0 .2mm; font-size: 8.4pt; text-transform: uppercase; letter-spacing: .08em; color: #6b5c3a; }
  .rt .rh-verwijzing { color: #5c5342; }
  .rt table.rh-tab { border-collapse: collapse; margin: .8mm 0; font-size: 7.8pt; width: 100%; }
  .rt table.rh-tab th, .rt table.rh-tab td { border: .25pt solid #cfc6b0; padding: .3mm 1.4mm; text-align: left; }

  table.stat { border-collapse: collapse; margin: 1mm 0 .5mm; font-size: 7.8pt;
               font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace; }
  table.stat caption { caption-side: top; text-align: left; font-family: Georgia, serif;
                       font-size: 8.2pt; font-style: italic; color: #5c5342; padding-bottom: .4mm; }
  table.stat th, table.stat td { border: .25pt solid #cfc6b0; padding: .3mm 1.5mm; text-align: center; min-width: 5.6mm; }
  table.stat th { color: #6b5c3a; font-weight: 400; letter-spacing: .06em; }

  table.wpn { border-collapse: collapse; margin: 1mm 0 .5mm; font-size: 7.9pt; width: 100%; }
  table.wpn th, table.wpn td { border: .25pt solid #cfc6b0; padding: .3mm 1.5mm; text-align: center; }
  table.wpn th { color: #6b5c3a; font-weight: 400; letter-spacing: .06em; font-size: 7.4pt;
                 text-transform: uppercase; }
  table.wpn .wn, table.wpn .wr { text-align: left; }
  table.wpn .wr { color: #3d372c; }

  .items { margin-top: 1mm; }
  .item { break-inside: avoid; margin: .6mm 0 0 21mm; }
  .in { font-weight: 700; font-size: 8.8pt; }
  .if { font-style: italic; color: #5c5342; font-size: 8.2pt; }
  .ie { font-size: 8.6pt; color: #241f16; }

  .lores { margin-top: 1.2mm; }
  .lore { break-inside: auto; margin-top: 1mm; }
  .lk { font-size: 7.8pt; letter-spacing: .12em; text-transform: uppercase; color: #6b5c3a;
        border-bottom: .25pt solid #e3dcc9; padding-bottom: .4mm; }
  .spell { break-inside: avoid; margin: .8mm 0 0 4mm; }
  .sk { font-weight: 700; font-size: 8.8pt; }
  .sn { display: inline-block; min-width: 12mm; font-weight: 400; font-size: 7.4pt;
        letter-spacing: .08em; text-transform: uppercase; color: #6b5c3a; }

  footer { margin-top: 6mm; padding-top: 2mm; border-top: .5pt solid #cfc6b0;
           font-size: 7.2pt; color: #6b5c3a; display: flex; justify-content: space-between; gap: 4mm; }
</style></head><body>
<header>
  ${totaal}
  <h1>${esc(input.meta.listName)}</h1>
  <div class="meta">${esc(`${input.meta.faction} · ${input.meta.composition} · ${input.meta.rule}`)}</div>
</header>
${secties}
${appendix}
<footer>
  <span>Old World Companion · Printed ${esc(gedrukt)}</span>
  <span>Catalogue from Old World Builder (CC BY 4.0) · Warhammer: The Old World © Games Workshop</span>
</footer>
</body></html>`;
}
