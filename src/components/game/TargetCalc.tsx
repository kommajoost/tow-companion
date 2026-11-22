import { useLayoutEffect, useMemo, useState } from 'react';
import { useData } from '../../data';
import { TOW, towFont, engraved } from '../../design/tow';
import { useSwipeToDismiss, DragHandle } from '../../lib/useSwipeToDismiss';
import { berekenAanval, breedteVoor, situatiesVoor, wapensVoor, type AanvalSoort, type MathResultaat, type Situatie } from '../../lib/mathhammer';
import { unitWeapons } from '../../lib/weaponStats';
import { unitSize, woundsPerModel, unitTotalStrength } from '../../lib/armyRules';
import { profielenMetVeteraan } from '../../lib/veteraanStats';
import type { ArmyUnit } from '../../types';

const eb = engraved as React.CSSProperties;
const goldGrad = `linear-gradient(180deg, ${TOW.goldBright} 0%, ${TOW.gold} 55%, ${TOW.goldDeep} 100%)`;

// MATHHAMMER-DOELWIT (22-11-2026): op een eigen unit een vijandelijke unit kiezen en meteen zien hoeveel Wounds
// de aanval naar verwachting doet, schieten en close combat, en doelwitten vergelijken. Alle rekenwerk zit in
// lib/mathhammer.ts (puur, ~0,1 ms per doelwit); dit scherm kiest alleen de invoer en toont de uitkomst.

/** De stand van één vijandelijke unit in het spel, op de id zoals hij in `vijandUnits` staat (2v2: `stoel:id`). */
export interface VijandStand { lost: number; weg: boolean }

/** Modellen nog op tafel: dezelfde afleiding als WoundTracker (start − floor(lost / W)). */
export function modellenOver(u: ArmyUnit, lost: number): number {
  const start = unitSize(u);
  const wpm = Math.max(1, woundsPerModel(u));
  const totaal = unitTotalStrength(u);
  const l = Math.max(0, totaal > 0 ? Math.min(totaal, lost) : lost);
  return Math.max(0, start - Math.floor(l / wpm));
}

/** Weg of helemaal dood (zoals `dead` op de UnitCard). */
export function isUitgeschakeld(u: ArmyUnit, s: VijandStand | undefined): boolean {
  if (!s) return false;
  if (s.weg) return true;
  const totaal = unitTotalStrength(u);
  return totaal > 0 && s.lost >= totaal;
}

/** 10e en 90e percentiel van een verdeling (index = aantal Wounds). */
function bereik(v: number[]): [number, number] {
  let c = 0;
  let lo = -1;
  let hi = v.length - 1;
  for (let k = 0; k < v.length; k++) {
    c += v[k];
    if (lo < 0 && c >= 0.1 - 1e-9) lo = k;
    if (c >= 0.9 - 1e-9) { hi = k; break; }
  }
  return [Math.max(0, lo), hi];
}

// FILES (22-11-2026, Joost: "en aantal attacks van ranked units?"). Hoe breed een unit staat weet de app niet;
// de speler stelt het in en de engine rekent dan uit wie er slaat of schiet (fighting rank, Press of Battle,
// supporting attacks, Volley Fire). De gekozen breedte blijft per unit staan zolang de app open is, zodat je
// hem niet bij elke keer openen opnieuw zet.
const breedteGeheugen = new Map<string, number>();

/** De aanname die bij een ingestelde breedte hoort. Geen "regel die niet meetelt", dus niet in de teller op de rij. */
const isAanname = (m: { regel: string }) => m.regel === 'Files';

/** Engine-zinnen gebruiken hier en daar een gedachtestreepje; in de app tonen we een dubbele punt. */
const netjes = (s: string) => s.replace(/\s+—\s+/g, ': ');

const fmt1 = (n: number) => (Math.round(n * 10) / 10).toFixed(1);
const fmtAantal = (n: number) => (n >= 10 ? n.toFixed(1) : n.toFixed(2));

// 2v2: de vijand-id is `stoel:id` en de naam "Speler — Unit" (lib/teams.ts). Splits de eigenaar eraf, zodat de
// rij de unitnaam groot en de speler klein toont.
const TEAM_STOELEN = ['host', 'host2', 'guest', 'guest2'];
function naamDelen(u: ArmyUnit): { naam: string; eigenaar: string | null } {
  const i = u.id.indexOf(':');
  if (i > 0 && TEAM_STOELEN.includes(u.id.slice(0, i))) {
    const j = u.name.indexOf(' — ');
    if (j > 0) return { eigenaar: u.name.slice(0, j), naam: u.name.slice(j + 3) };
  }
  return { naam: u.name, eigenaar: null };
}

interface Rij {
  u: ArmyUnit;
  naam: string;
  eigenaar: string | null;
  modellen: number;
  start: number;
  r: MathResultaat;
}

export function TargetCalc({
  unit,
  naam,
  lost,
  vijandUnits,
  vijandStand,
  herstel,
  onClose,
}: {
  /** De aanvaller zoals de kaart hem toont (profiel aangevuld, veteraan-stats erin). */
  unit: ArmyUnit;
  /** De naam zoals de kaart hem toont (unitToon). */
  naam?: string;
  /** Wounds die de aanvaller kwijt is. */
  lost: number;
  vijandUnits: ArmyUnit[];
  vijandStand?: Record<string, VijandStand>;
  /** Vult een vijandelijke unit zonder profiel aan (metProfielen op de kaart). */
  herstel?: (u: ArmyUnit) => ArmyUnit;
  onClose: () => void;
}) {
  const { rules } = useData();
  // De Back-knop registreert de KAART (useBackClose(open) in UnitCard), niet dit scherm: een
  // useBackClose(true) bij het mounten wordt door StrictMode in dev direct weer opgeruimd, en dan sluit Back
  // de sheet niet.
  const { handleProps, sheetStyle } = useSwipeToDismiss(onClose);

  // Breed (Fold open): gecentreerd venster, lijst links en uitsplitsing rechts. De kolommen volgen de gemeten
  // breedte van het venster zelf, niet die van het scherm.
  const [venster, setVenster] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 400));
  const [vakEl, vakRef] = useState<HTMLDivElement | null>(null);
  const [vakW, setVakW] = useState(0);
  useLayoutEffect(() => {
    const on = () => setVenster(window.innerWidth);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  useLayoutEffect(() => {
    if (!vakEl) return;
    const ro = new ResizeObserver((es) => setVakW(es[0].contentRect.width));
    ro.observe(vakEl);
    setVakW(vakEl.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, [vakEl]);
  const dialoog = venster >= 760;
  const tweeKolom = vakW >= 700;

  // ── aanvaller ──
  const start = unitSize(unit);
  const wpm = Math.max(1, woundsPerModel(unit));
  const levend = Math.max(1, modellenOver(unit, lost));
  const aanvallerWounds = start === 1 && wpm > 1 ? Math.max(1, wpm - Math.max(0, lost)) : undefined;

  const schietWapens = useMemo(() => wapensVoor(unit, 'schieten', rules), [unit, rules]);
  const combatWapens = useMemo(() => wapensVoor(unit, 'combat', rules), [unit, rules]);
  const ranged = useMemo(() => unitWeapons(unit, rules).ranged, [unit, rules]);

  const [soort, setSoort] = useState<AanvalSoort>(() => (schietWapens.length > 0 ? 'schieten' : 'combat'));
  const kanSchieten = schietWapens.length > 0;
  const soortNu: AanvalSoort = soort === 'schieten' && !kanSchieten ? 'combat' : soort;
  const wapens = soortNu === 'schieten' ? schietWapens : combatWapens;
  const [wapenKeus, setWapenKeus] = useState<Record<AanvalSoort, string | undefined>>({ schieten: undefined, combat: undefined });
  const wapenSlug = (wapens.find((w) => w.slug === wapenKeus[soortNu]) ?? wapens.find((w) => w.standaard) ?? wapens[0])?.slug;
  const rw = soortNu === 'schieten' ? (ranged.find((w) => w.slug === wapenSlug) ?? ranged[0]) : undefined;
  const heeftMulti = !!rw?.multiShots;
  const [multi, setMulti] = useState(true);
  const [custom, setCustom] = useState(0); // + = makkelijker (zoals "Custom" in CombatStats); engine: toHitMod = −custom
  const [modelKeus, setModelKeus] = useState<number | null>(null);
  // Een unit in rijen krijgt de Files-teller: dan tellen ALLE levende modellen mee en bepaalt de breedte wie
  // er slaat of schiet. Een los model, monster of war machine houdt de gewone Models-teller.
  const br = useMemo(() => breedteVoor(unit, levend), [unit, levend]);
  const [breedteKeus, setBreedteKeus] = useState<number | null>(() => breedteGeheugen.get(unit.id) ?? null);
  const breedte = br.vanToepassing ? Math.min(br.max, Math.max(1, breedteKeus ?? br.standaard)) : undefined;
  const zetBreedte = (n: number) => { breedteGeheugen.set(unit.id, n); setBreedteKeus(n); };
  const modellen = breedte != null ? levend : Math.min(levend, Math.max(1, modelKeus ?? levend));

  // ── doelwitten (levend), met hun profiel aangevuld zoals de kaart dat doet ──
  const doelen = useMemo(() => vijandUnits
    .filter((u) => !isUitgeschakeld(u, vijandStand?.[u.id]))
    .map((u) => {
      const h = herstel ? herstel(u) : u;
      return h.veteraan?.abilities?.length ? { ...h, profiles: profielenMetVeteraan(h.profiles, h.veteraan.abilities) } : h;
    }), [vijandUnits, vijandStand, herstel]);

  // Situaties: de vereniging over alle doelwitten (eerste label wint), begin op `standaard`.
  const situaties = useMemo<Situatie[]>(() => {
    const uit: Situatie[] = [];
    for (const d of doelen) {
      for (const s of situatiesVoor(unit, d, { soort: soortNu, wapenSlug, multi: heeftMulti ? multi : undefined, breedte }, rules)) {
        if (!uit.some((x) => x.key === s.key)) uit.push(s);
      }
    }
    return uit;
  }, [doelen, unit, soortNu, wapenSlug, multi, heeftMulti, breedte, rules]);
  const [sitKeus, setSitKeus] = useState<Record<string, boolean>>({});
  const sitWaarden = useMemo(() => {
    const m: Record<string, boolean> = {};
    for (const s of situaties) m[s.key] = s.key in sitKeus ? sitKeus[s.key] : s.standaard;
    return m;
  }, [situaties, sitKeus]);

  const rijen = useMemo<Rij[]>(() => {
    const uit = doelen.map((d) => {
      const { naam, eigenaar } = naamDelen(d);
      const m = modellenOver(d, vijandStand?.[d.id]?.lost ?? 0);
      const r = berekenAanval(unit, d, {
        soort: soortNu,
        modellen,
        breedte,
        wapenSlug,
        multi: heeftMulti ? multi : undefined,
        toHitMod: soortNu === 'schieten' && custom !== 0 ? -custom : undefined,
        situaties: sitWaarden,
        aanvallerWounds,
        doelwitModellen: m,
      }, rules);
      return { u: d, naam, eigenaar, modellen: m, start: unitSize(d), r };
    });
    // Hoogste verwachting eerst; "kan niet" onderaan.
    return uit.sort((a, b) => (a.r.onmogelijk ? 1 : 0) - (b.r.onmogelijk ? 1 : 0) || b.r.wounds - a.r.wounds);
  }, [doelen, vijandStand, unit, soortNu, modellen, breedte, wapenSlug, heeftMulti, multi, custom, sitWaarden, aanvallerWounds, rules]);

  const [openId, setOpenId] = useState<string | null>(null);
  // Breed: altijd een gekozen doelwit rechts (valt terug op de bovenste rij).
  const gekozen = rijen.find((x) => x.u.id === openId) ?? (tweeKolom ? rijen[0] : undefined);

  // ── stijlen (dezelfde taal als CombatStats) ──
  const chip: React.CSSProperties = { fontFamily: towFont.serif, fontSize: 12, padding: '4px 10px', borderRadius: 999, cursor: 'pointer', lineHeight: 1.35, whiteSpace: 'nowrap' };
  const selChip = (sel: boolean): React.CSSProperties => ({ ...chip, border: `1px solid ${sel ? TOW.goldDeep : TOW.line}`, background: sel ? 'rgba(184,134,47,0.14)' : 'transparent', color: sel ? TOW.goldDeep : TOW.parchDim, fontWeight: sel ? 600 : 400 });
  const stepBtn = (uit: boolean): React.CSSProperties => ({ width: 28, height: 28, borderRadius: 7, cursor: uit ? 'default' : 'pointer', border: `1px solid ${TOW.lineStrong}`, background: TOW.cardLt, color: uit ? TOW.faint : TOW.parchDim, fontFamily: towFont.display, fontWeight: 700, fontSize: 15, lineHeight: 1, padding: 0 });
  const kopje: React.CSSProperties = { ...eb, fontSize: 8, color: TOW.muted };
  const stepper = (label: string, waarde: string, min: () => void, plus: () => void, minUit: boolean, plusUit: boolean, aria: [string, string]) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={kopje}>{label}</span>
      <button type="button" onClick={min} disabled={minUit} aria-label={aria[0]} style={stepBtn(minUit)}>−</button>
      <span style={{ minWidth: 22, textAlign: 'center', fontFamily: towFont.display, fontWeight: 700, fontSize: 14, color: TOW.ink, fontVariantNumeric: 'tabular-nums' }}>{waarde}</span>
      <button type="button" onClick={plus} disabled={plusUit} aria-label={aria[1]} style={stepBtn(plusUit)}>+</button>
    </span>
  );

  const bediening = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 10, borderBottom: `1px solid ${TOW.line}` }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 14px' }}>
        <div role="tablist" style={{ display: 'inline-flex', gap: 3, padding: 3, borderRadius: 9, background: 'rgba(74,55,22,0.07)', border: `1px solid ${TOW.line}` }}>
          {([['schieten', 'Shooting'], ['combat', 'Combat']] as const).filter(([k]) => k === 'combat' || kanSchieten).map(([k, label]) => {
            const sel = soortNu === k;
            return (
              <button key={k} type="button" role="tab" aria-selected={sel} onClick={() => setSoort(k)} style={{ padding: '5px 14px', borderRadius: 7, cursor: 'pointer', border: 'none', fontFamily: towFont.display, fontWeight: sel ? 700 : 600, fontSize: 12.5, background: sel ? goldGrad : 'transparent', color: sel ? TOW.onGrad : TOW.muted, whiteSpace: 'nowrap' }}>
                {label}
              </button>
            );
          })}
        </div>
        {breedte != null
          ? stepper('Files', String(breedte), () => zetBreedte(Math.max(1, breedte - 1)), () => zetBreedte(Math.min(br.max, breedte + 1)), breedte <= 1, breedte >= br.max, ['Narrower', 'Wider'])
          : levend > 1 && stepper('Models', String(modellen), () => setModelKeus(Math.max(1, modellen - 1)), () => setModelKeus(Math.min(levend, modellen + 1)), modellen <= 1, modellen >= levend, ['Fewer models', 'More models'])}
        {breedte != null && (
          <span style={{ fontFamily: towFont.serif, fontSize: 11.5, color: TOW.muted, whiteSpace: 'nowrap' }}>
            {levend} models, {Math.ceil(levend / breedte)} {Math.ceil(levend / breedte) === 1 ? 'rank' : 'ranks'}
          </span>
        )}
        {soortNu === 'schieten' && stepper('To Hit', custom === 0 ? '0' : custom > 0 ? `+${custom}` : String(custom), () => setCustom((c) => c - 1), () => setCustom((c) => c + 1), custom <= -5, custom >= 5, ['Harder to hit', 'Easier to hit'])}
      </div>
      {(wapens.length > 1 || heeftMulti) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
          {wapens.length > 1 && wapens.map((w) => (
            <button key={w.slug} type="button" onClick={() => setWapenKeus((k) => ({ ...k, [soortNu]: w.slug }))} style={selChip(w.slug === wapenSlug)}>{w.naam}</button>
          ))}
          {heeftMulti && rw && (
            <button type="button" aria-pressed={multi} onClick={() => setMulti((m) => !m)} style={selChip(multi)}>
              {multi ? '✓ ' : ''}{rw.multiProfile ? 'Rapid fire' : 'Multiple shots'} ({rw.multiShots})
            </button>
          )}
        </div>
      )}
      {situaties.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
          {situaties.map((s) => {
            const aan = !!sitWaarden[s.key];
            return (
              <button key={s.key} type="button" aria-pressed={aan} onClick={() => setSitKeus((k) => ({ ...k, [s.key]: !aan }))} style={selChip(aan)}>
                {aan ? '✓ ' : ''}{s.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );

  const rijKnop = (x: Rij) => {
    const r = x.r;
    const open = gekozen?.u.id === x.u.id;
    const range = r.verdeling && !r.onmogelijk ? bereik(r.verdeling) : null;
    const nNiet = r.nietMeegerekend.filter((m) => !isAanname(m)).length;
    return (
      <div key={x.u.id} style={{ borderBottom: `1px solid ${TOW.hairline}` }}>
        <button
          type="button"
          aria-expanded={tweeKolom ? undefined : open}
          aria-pressed={tweeKolom ? open : undefined}
          onClick={() => setOpenId(open && !tweeKolom ? '' : x.u.id)}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 8px', boxSizing: 'border-box',
            border: 'none', borderRadius: 8, cursor: 'pointer', textAlign: 'left',
            background: open ? TOW.cardLt : 'transparent', boxShadow: open ? `inset 3px 0 0 ${TOW.goldDeep}` : 'none',
          }}
        >
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontFamily: towFont.display, fontWeight: open ? 700 : 600, fontSize: 14, color: TOW.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.naam}</span>
            <span style={{ display: 'block', fontFamily: towFont.serif, fontSize: 11.5, color: TOW.muted, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {x.eigenaar ? `${x.eigenaar} · ` : ''}
              {x.start > 1 ? `${x.modellen}/${x.start} models` : '1 model'}
              {nNiet > 0 && <span style={{ color: TOW.goldDeep }}> · {nNiet} {nNiet === 1 ? 'rule' : 'rules'} not counted</span>}
            </span>
          </span>
          {r.onmogelijk ? (
            <span style={{ flexShrink: 1, maxWidth: '55%', fontFamily: towFont.serif, fontStyle: 'italic', fontSize: 11.5, color: TOW.muted, textAlign: 'right', lineHeight: 1.3 }}>{netjes(r.onmogelijk)}</span>
          ) : (
            <span style={{ flexShrink: 0, textAlign: 'right' }}>
              <span style={{ display: 'block', fontFamily: towFont.display, fontWeight: 700, fontSize: 20, lineHeight: 1.05, color: TOW.goldDeep, fontVariantNumeric: 'tabular-nums' }}>{fmt1(r.wounds)}</span>
              {range && (
                <span style={{ display: 'block', fontFamily: towFont.serif, fontSize: 10.5, color: TOW.muted, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                  usually {range[0] === range[1] ? range[0] : `${range[0]}–${range[1]}`}
                </span>
              )}
            </span>
          )}
        </button>
        {!tweeKolom && open && <div style={{ padding: '4px 8px 12px' }}>{uitsplitsing(x)}</div>}
      </div>
    );
  };

  const lijst = (
    <div>
      <div style={{ ...kopje, margin: '10px 0 4px', display: 'flex', justifyContent: 'space-between' }}>
        <span>Targets</span>
        <span>Wounds</span>
      </div>
      {rijen.length === 0 ? (
        <p style={{ fontFamily: towFont.serif, fontSize: 13, color: TOW.muted, margin: '8px 0' }}>No enemy units left on the table.</p>
      ) : rijen.map(rijKnop)}
    </div>
  );

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(30,20,8,0.45)', display: 'flex', alignItems: dialoog ? 'center' : 'flex-end', justifyContent: 'center', padding: dialoog ? 16 : 0 }}
    >
      <div
        ref={vakRef}
        role="dialog"
        aria-label={`Target: ${naam ?? unit.name}`}
        data-testid="target-calc"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: dialoog ? 1000 : '100%', boxSizing: 'border-box',
          height: tweeKolom ? '85vh' : undefined, maxHeight: dialoog ? '88vh' : '90vh',
          display: 'flex', flexDirection: 'column', overflow: tweeKolom ? 'hidden' : 'auto',
          background: TOW.panel2, border: `1px solid ${TOW.lineStrong}`, borderRadius: dialoog ? 16 : '18px 18px 0 0',
          padding: 16, paddingTop: dialoog ? 14 : 4, paddingBottom: dialoog ? 12 : 'max(14px, env(safe-area-inset-bottom))',
          boxShadow: '0 -10px 40px rgba(0,0,0,0.25)', ...sheetStyle,
        }}
      >
        {!dialoog && <DragHandle {...handleProps} />}
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
          <h3 style={{ margin: 0, flex: 1, minWidth: 0, fontFamily: towFont.display, fontWeight: 700, fontSize: 16, color: TOW.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            Target <span style={{ fontFamily: towFont.serif, fontWeight: 400, fontSize: 14, color: TOW.parchDim }}>· {naam ?? unit.name}</span>
          </h3>
          <button type="button" onClick={onClose} aria-label="Close" style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 22, lineHeight: 1, color: TOW.muted, padding: '0 4px' }}>×</button>
        </div>
        <div style={{ flexShrink: 0 }}>{bediening}</div>
        {tweeKolom ? (
          <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 16 }}>
            <div style={{ flex: '0 0 42%', minWidth: 0, overflowY: 'auto' }}>{lijst}</div>
            <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', borderLeft: `1px solid ${TOW.line}`, paddingLeft: 16, paddingTop: 10 }}>
              {gekozen ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
                    <span style={{ flex: 1, minWidth: 0, fontFamily: towFont.display, fontWeight: 700, fontSize: 15, color: TOW.ink }}>{gekozen.naam}</span>
                    {gekozen.eigenaar && <span style={{ fontFamily: towFont.serif, fontSize: 12, color: TOW.muted }}>{gekozen.eigenaar}</span>}
                  </div>
                  {uitsplitsing(gekozen)}
                </>
              ) : null}
            </div>
          </div>
        ) : lijst}
        <p style={{ flexShrink: 0, margin: '10px 0 0', fontFamily: towFont.serif, fontStyle: 'italic', fontSize: 10.5, color: TOW.faint, lineHeight: 1.4 }}>
          Expected values from the rules as written. Set the table situation (files, range, charge) with the switches above.
        </p>
      </div>
    </div>
  );
}

// ── De uitsplitsing van één doelwit: per aanvalsgroep de stappen, dan het totaal, de verdeling, en wat wel en
// niet is meegerekend. "Not counted" staat er altijd als hij niet leeg is: zo blijft het getal eerlijk. ──
function uitsplitsing(x: Rij) {
  const r = x.r;
  const kopje: React.CSSProperties = { ...eb, fontSize: 8, color: TOW.muted, margin: '12px 0 4px' };
  const th: React.CSSProperties = { ...eb, fontSize: 7.5, color: TOW.goldDeep, borderBottom: `1px solid ${TOW.line}`, padding: '3px 4px', textAlign: 'left', fontWeight: 600 };
  const td: React.CSSProperties = { fontFamily: towFont.serif, fontSize: 12.5, color: TOW.ink, padding: '4px 4px', borderBottom: `1px solid ${TOW.hairline}`, verticalAlign: 'top' };
  const num: React.CSSProperties = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' };
  const regel = (titel: string, tekst: string, i: number) => (
    <div key={i} style={{ margin: '0 0 5px', fontFamily: towFont.serif, fontSize: 12.5, lineHeight: 1.4, color: TOW.parchDim }}>
      <span style={{ color: TOW.ink, fontWeight: 600 }}>{titel}</span>: {netjes(tekst)}
    </div>
  );
  const nietGeteld = r.nietMeegerekend.filter((m) => !isAanname(m));
  const aannames = r.nietMeegerekend.filter(isAanname);
  return (
    <div>
      {r.onmogelijk && (
        <p style={{ margin: '0 0 6px', fontFamily: towFont.serif, fontStyle: 'italic', fontSize: 13, color: TOW.muted }}>{netjes(r.onmogelijk)}</p>
      )}
      {r.groepen.map((g, gi) => (
        <div key={gi} style={{ marginTop: gi === 0 ? 0 : 10 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 2 }}>
            <span style={{ flex: 1, minWidth: 0, fontFamily: towFont.display, fontWeight: 700, fontSize: 13, color: TOW.ink }}>{g.naam}</span>
            <span style={{ fontFamily: towFont.serif, fontSize: 12, color: TOW.parchDim, whiteSpace: 'nowrap' }}>{g.aanvallen} {soortWoord(g.aanvallen)}</span>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={th}>Step</th><th style={th}>Roll</th><th style={{ ...th, textAlign: 'right' }}>Left</th></tr></thead>
            <tbody>
              {g.stappen.map((s, si) => (
                <tr key={si}>
                  <td style={td}>
                    {s.label}
                    {s.toelichting && <div style={{ fontSize: 11, color: TOW.muted, lineHeight: 1.3, marginTop: 1 }}>{netjes(s.toelichting)}</div>}
                  </td>
                  <td style={{ ...td, whiteSpace: 'nowrap', fontFamily: towFont.display, fontWeight: 600 }}>{s.worp}</td>
                  <td style={num}>{fmtAantal(s.aantal)}</td>
                </tr>
              ))}
              <tr>
                <td style={{ ...td, borderBottom: 'none', fontWeight: 600 }} colSpan={2}>Wounds</td>
                <td style={{ ...num, borderBottom: 'none', fontWeight: 700, color: TOW.goldDeep }}>{fmtAantal(g.wounds)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      ))}

      {!r.onmogelijk && (
        <>
          <div style={kopje}>Total</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: towFont.display, fontWeight: 700, fontSize: 22, color: TOW.goldDeep, fontVariantNumeric: 'tabular-nums' }}>{fmt1(r.wounds)}</span>
            <span style={{ fontFamily: towFont.serif, fontSize: 13, color: TOW.parchDim }}>wounds</span>
            {r.modellenGedood != null && (
              <span style={{ fontFamily: towFont.serif, fontSize: 13, color: TOW.parchDim }}>≈ {fmt1(r.modellenGedood)} {r.modellenGedood === 1 ? 'model' : 'models'}</span>
            )}
          </div>
          {r.verdeling && r.verdeling.length > 1 && <Verdeling v={r.verdeling} />}
        </>
      )}

      {r.meegerekend.length > 0 && (
        <>
          <div style={kopje}>Counted</div>
          {r.meegerekend.map((m, i) => regel(m.regel, m.effect, i))}
        </>
      )}
      {nietGeteld.length > 0 && (
        <>
          <div style={{ ...kopje, color: TOW.goldDeep }}>Not counted</div>
          {nietGeteld.map((m, i) => regel(m.regel, m.reden, i))}
        </>
      )}
      {aannames.length > 0 && (
        <>
          <div style={kopje}>Assumed</div>
          {aannames.map((m, i) => regel(m.regel, m.reden, i))}
        </>
      )}
    </div>
  );
}

// "10 attacks" / "1 attack"; een dobbel-uitdrukking (D6, 2D6+1) krijgt het meervoud.
function soortWoord(aanvallen: string) {
  return aanvallen.trim() === '1' ? 'attack' : 'attacks';
}

/** Kleine staafgrafiek van P(totaal = k). De lange nul-staart valt weg: tot de laatste k met ≥ 0,5 %, en
 *  hooguit 30 staven (dan houdt hij op bij 99 % cumulatief). */
function Verdeling({ v }: { v: number[] }) {
  let eind = 0;
  for (let k = 0; k < v.length; k++) if (v[k] >= 0.005) eind = k;
  if (eind + 1 > 30) {
    let c = 0;
    for (let k = 0; k < v.length; k++) { c += v[k]; if (c >= 0.99) { eind = k; break; } }
  }
  let begin = 0;
  while (begin < eind && v[begin] < 0.005) begin++;
  const staven = v.slice(begin, eind + 1);
  const max = Math.max(...staven, 1e-9);
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 54 }}>
        {staven.map((p, i) => (
          <div key={i} title={`${begin + i}: ${(p * 100).toFixed(1)}%`} style={{ flex: 1, minWidth: 0, maxWidth: 28, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '100%' }}>
            <div style={{ height: `${Math.max(2, (p / max) * 100)}%`, background: TOW.goldDeep, opacity: 0.75, borderRadius: '2px 2px 0 0' }} />
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 2, marginTop: 2 }}>
        {staven.map((_, i) => (
          <div key={i} style={{ flex: 1, minWidth: 0, maxWidth: 28, textAlign: 'center', fontFamily: towFont.serif, fontSize: 10, color: TOW.muted, fontVariantNumeric: 'tabular-nums' }}>
            {staven.length > 16 && (begin + i) % 2 === 1 ? '' : begin + i}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 2 }}>
        {staven.map((p, i) => (
          <div key={i} style={{ flex: 1, minWidth: 0, maxWidth: 28, textAlign: 'center', fontFamily: towFont.serif, fontSize: 9, color: TOW.faint, fontVariantNumeric: 'tabular-nums' }}>
            {staven.length > 12 ? '' : `${Math.round(p * 100)}%`}
          </div>
        ))}
      </div>
    </div>
  );
}
