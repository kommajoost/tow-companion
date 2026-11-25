// calculate_attack: the Companion's own damage calculator (src/lib/mathhammer.ts), fed with units built
// the way the list builder builds them. Shooting = berekenAanval; combat = berekenGevecht (the exchange,
// both sides, in Initiative order), exactly as the app's TargetCalc does.

import type { ArmyUnit } from '../src/types';
import {
  berekenAanval, berekenGevecht, breedteVoor, situatiesVoor, situatiesVoorGevecht, wapensVoor,
  type AanvalsGroep, type MathResultaat, type Situatie,
} from '../src/lib/mathhammer';
import { unitWeapons } from '../src/lib/weaponStats';
import { equipmentVoor, type UnitDetailsFile } from '../src/lib/unitDetails';
import { loadJson } from './data';
import { applyOptionNames, gameUnit, locateUnit, unitIsMulti, unitMinimum, type ArmyCtx, type Found } from './armies';
import { rulesWith } from './rules';
import { norm, num, tokens } from './text';

export interface CalcArgs {
  attacker?: string; army_attacker?: string; composition_attacker?: string;
  target?: string; army_target?: string; composition_target?: string;
  mode?: string;
  models?: number; target_models?: number;
  weapon?: string;
  attacker_options?: string[]; target_options?: string[];
  situations?: Record<string, boolean>;
  width?: number; target_width?: number;
  multiple_shots?: boolean;
  to_hit_modifier?: number;
}

/** 10th and 90th percentile of a wounds distribution (same as TargetCalc `bereik`). */
function range(v: number[] | null): string | null {
  if (!v?.length) return null;
  let c = 0;
  let lo = -1;
  let hi = v.length - 1;
  for (let k = 0; k < v.length; k++) {
    c += v[k];
    if (lo < 0 && c >= 0.1 - 1e-9) lo = k;
    if (c >= 0.9 - 1e-9) { hi = k; break; }
  }
  lo = Math.max(0, lo);
  return lo === hi ? `${lo}` : `${lo}–${hi}`;
}

const pct = (p: number) => `${num(p * 100, 1)}%`;
const VAN: Record<string, string> = { aanvaller: 'attacker', wapen: 'weapon', doelwit: 'target' };

function groupLines(g: AanvalsGroep): string[] {
  const out = [`  • ${g.naam} — attacks: ${g.aanvallen}${g.verloren ? ` (${num(g.verloren)} lost to casualties before striking)` : ''}`];
  for (const s of g.stappen) {
    const save = /save|regeneration/i.test(s.label);
    out.push(`      ${s.label} ${s.worp}: ${save ? `fails ${pct(s.kans)}` : `passes ${pct(s.kans)}`} → ${num(s.aantal)}${s.toelichting ? `  (${s.toelichting})` : ''}`);
  }
  out.push(`      = ${num(g.wounds)} wounds`);
  return out;
}

function resultLines(label: string, r: MathResultaat): string[] {
  const out: string[] = [];
  if (r.onmogelijk) out.push(`${label}: not possible — ${r.onmogelijk}`);
  const rg = range(r.verdeling);
  out.push(`${label}: ${num(r.wounds)} expected wounds${rg ? ` (usually ${rg}; 10th–90th percentile)` : ''}${r.modellenGedood != null ? ` · ≈ ${num(r.modellenGedood)} models removed` : ''}`);
  out.push('  Step chain:');
  for (const g of r.groepen) out.push(...groupLines(g));
  if (r.meegerekend.length) out.push(`  Counted: ${r.meegerekend.map((m) => `${m.regel} (${m.effect})`).join('; ')}`);
  out.push(`  Not counted (check by hand): ${r.nietMeegerekend.length ? r.nietMeegerekend.map((m) => `${m.regel} [${VAN[m.van] ?? m.van}] — ${m.reden}`).join('; ') : 'nothing'}`);
  return out;
}

async function side(name: string | undefined, army: string | undefined, composition: string | undefined, models: number | undefined, options: string[] | undefined, role: string) {
  if (!name) return { error: `Give the ${role} unit name.` };
  const loc = await locateUnit(name, army, composition);
  if ('error' in loc) return { error: `${role}: ${loc.error}` };
  const count = unitIsMulti(loc.found.unit) ? Math.max(1, Math.floor(models ?? unitMinimum(loc.found.unit))) : 1;
  const applied = applyOptionNames(loc.found.unit, options ?? []);
  return { ctx: loc.ctx, found: loc.found, count, applied, others: loc.others };
}

const describe = (role: string, ctx: ArmyCtx, f: Found, u: ArmyUnit, count: number) =>
  `${role}: ${count}× ${f.unit.name_en} — ${ctx.name}, ${ctx.compLabel} [${ctx.comp}] · loadout: ${u.options.join(', ') || '-'}`;

export async function calculateAttack(a: CalcArgs): Promise<string> {
  const mode = norm(a.mode ?? '');
  const soort = /^(shoot|shooting|ranged|missile|schiet|schieten)/.test(mode) ? 'schieten' : /^(combat|melee|close|cc|gevecht)/.test(mode) ? 'combat' : null;
  if (!soort) return 'mode must be "shooting" or "combat".';
  const att = await side(a.attacker, a.army_attacker, a.composition_attacker, a.models, a.attacker_options, 'attacker');
  if ('error' in att) return att.error!;
  const tgt = await side(a.target, a.army_target, a.composition_target, a.target_models, a.target_options, 'target');
  if ('error' in tgt) return tgt.error!;
  const rules = await rulesWith([att.ctx.overlay, tgt.ctx.overlay?.id !== att.ctx.overlay?.id ? tgt.ctx.overlay : null]);
  const details = await loadJson<UnitDetailsFile>('unit-details.json');
  const notes: string[] = [];
  for (const [role, s] of [['attacker', att], ['target', tgt]] as const) {
    if (s.applied.unknown.length) notes.push(`${role}: option(s) not found and ignored: ${s.applied.unknown.join(', ')} (see get_unit for the option names).`);
    if (s.others.length) notes.push(`${role}: also matched ${s.others.join('; ')} — pass the army to be sure.`);
  }

  let opts = att.applied.opts;
  let unit = gameUnit(att.ctx, att.found, opts, att.count);
  const target = gameUnit(tgt.ctx, tgt.found, tgt.applied.opts, tgt.count);
  if (!unit || !target) return 'Could not build the units from the catalogue.';
  let uitrusting = details ? equipmentVoor(unit, details.units, att.ctx.name) : null;
  let wapens = wapensVoor(unit, soort, rules, uitrusting);
  let wapenSlug: string | undefined;
  if (a.weapon) {
    const want = tokens(a.weapon).join(' ');
    const pick = (list: typeof wapens) => list.find((w) => tokens(w.naam).join(' ') === want || norm(w.slug).includes(norm(a.weapon!)))
      ?? list.find((w) => tokens(w.naam).join(' ').includes(want) || want.includes(tokens(w.naam).join(' ')));
    let w = pick(wapens);
    if (!w) {
      // The weapon may be an option the default loadout does not carry ("repeater crossbows"): take it.
      const extra = applyOptionNames(att.found.unit, [...(a.attacker_options ?? []), a.weapon]);
      if (extra.applied.length > att.applied.applied.length) {
        opts = extra.opts;
        unit = gameUnit(att.ctx, att.found, opts, att.count)!;
        uitrusting = details ? equipmentVoor(unit, details.units, att.ctx.name) : null;
        wapens = wapensVoor(unit, soort, rules, uitrusting);
        w = pick(wapens);
        if (w) notes.push(`Took the option "${extra.applied.at(-1)}" so the unit carries ${w.naam}.`);
      }
    }
    if (!w) return `${att.found.unit.name_en} has no ${soort === 'schieten' ? 'ranged' : 'combat'} weapon "${a.weapon}". Available: ${wapens.map((x) => x.naam).join(', ') || 'none'}.`;
    wapenSlug = w.slug;
  } else {
    wapenSlug = (wapens.find((w) => w.standaard) ?? wapens[0])?.slug;
  }
  const weaponName = wapens.find((w) => w.slug === wapenSlug)?.naam;

  const br = breedteVoor(unit, att.count);
  const breedte = br.vanToepassing ? Math.min(br.max, Math.max(1, Math.floor(a.width ?? br.standaard))) : undefined;
  const given = a.situations ?? {};
  const out: string[] = [
    'DAMAGE ONLY. Expected wounds from the Companion\'s own calculator (same engine as the app). It says nothing about whether a unit is good: points cost, speed, resilience, matchups and the game plan are not in it. Present it as damage maths, not as a verdict.',
    '',
    `${describe('Attacker', att.ctx, att.found, unit, att.count)}${weaponName ? ` · weapon: ${weaponName}` : ''}${breedte != null ? ` · files: ${breedte} wide` : ''}`,
  ];

  if (soort === 'schieten') {
    const rw = unitWeapons(unit, rules).ranged.find((w) => w.slug === wapenSlug);
    const multi = rw?.multiShots ? (a.multiple_shots ?? true) : undefined;
    if (rw?.multiShots) out[out.length - 1] += ` · Multiple Shots (${rw.multiShots}): ${multi ? 'on' : 'off'}`;
    out.push(describe('Target', tgt.ctx, tgt.found, target, tgt.count));
    const sits = situatiesVoor(unit, target, { soort, wapenSlug, multi, breedte, uitrusting }, rules);
    const situaties = valuesFor(sits, given, notes);
    const r = berekenAanval(unit, target, {
      soort, modellen: att.count, breedte, wapenSlug, multi,
      toHitMod: a.to_hit_modifier ? -a.to_hit_modifier : undefined,
      situaties, doelwitModellen: tgt.count, uitrusting,
    }, rules);
    if (a.to_hit_modifier) out.push(`Extra To Hit modifier: ${a.to_hit_modifier > 0 ? '+' : ''}${a.to_hit_modifier}`);
    out.push(...notes, '', ...resultLines('Result', r), '', situationLine(sits, situaties));
  } else {
    const tBr = breedteVoor(target, tgt.count);
    const tWidth = tBr.vanToepassing ? Math.min(tBr.max, Math.max(1, Math.floor(a.target_width ?? tBr.standaard))) : undefined;
    const tUitrusting = details ? equipmentVoor(target, details.units, tgt.ctx.name) : null;
    out.push(`${describe('Target', tgt.ctx, tgt.found, target, tgt.count)}${tWidth != null ? ` · files: ${tWidth} wide` : ''}`);
    const ik = { modellen: att.count, breedte, wapenSlug, uitrusting };
    const vijand = { modellen: tgt.count, breedte: tWidth, uitrusting: tUitrusting };
    const sits = situatiesVoorGevecht(unit, target, { ik, vijand }, rules);
    const situaties = valuesFor(sits, given, notes);
    const g = berekenGevecht(unit, target, { ik, vijand, situaties }, rules);
    out.push(...notes, '', `Strike order: ${g.volgorde.map((v) => `${v.initiatief} ${v.zijde === 'ik' ? 'attacker' : 'target'}: ${v.naam}${v.toelichting ? ` (${v.toelichting})` : ''}`).join(' → ')}`, '');
    out.push(...resultLines('Attacker inflicts', g.uit), '', ...resultLines('Target strikes back', g.terug), '', situationLine(sits, situaties));
    out.push('Combat result (ranks, standards, overkill …) is not part of this: wounds only.');
  }
  out.push('Reminder: damage only. Say so when you use these numbers.');
  return out.join('\n');
}

function valuesFor(sits: Situatie[], given: Record<string, boolean>, notes: string[]): Record<string, boolean> {
  const m: Record<string, boolean> = {};
  for (const s of sits) m[s.key] = s.key in given ? !!given[s.key] : s.standaard;
  const unknown = Object.keys(given).filter((k) => !sits.some((s) => s.key === k));
  if (unknown.length) notes.push(`Situation key(s) not offered for this pairing and ignored: ${unknown.join(', ')}.`);
  return m;
}

function situationLine(sits: Situatie[], vals: Record<string, boolean>): string {
  if (!sits.length) return 'Situations: none offered for this pairing.';
  return `Situations used (change with situations={"key": true|false}): ${sits.map((s) => `${s.key}=${vals[s.key] ? 'on' : 'off'} (${s.label})`).join('; ')}`;
}
