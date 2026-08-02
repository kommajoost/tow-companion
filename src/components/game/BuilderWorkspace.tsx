import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useData } from '../../data';
import { useUI } from '../../state';
import { TOW, towFont, engraved } from '../../design/tow';
import { getRuleIndex, resolveRuleSlug, resolveOptionSlug } from '../../lib/armyRules';
import { useBackClose } from '../../lib/backStack';
import { stelNamenVoor } from '../../lib/naamForge';
import {
  CATEGORIES, COMPOSITION_RULES, validate, entryPoints, unitBlocks, radioSelected, summaryLabels,
  unitCategoryFor, unitAllowedIn, unitCompNote,
  subOptionGroups, toggleSubOption, setExclusiveSubOption,
  magicCategories, selectedMagicKeys, selectedMagicItems, toggleMagicItem, magicGroupSpent, magicWouldExceed, magicItemId,
  loadoutLabels, magicTypeLabel, selectedMountIndex, DEFAULT_MAGIC_BUDGET,
  type Category, type OwbArmy, type OwbUnit, type BuilderList, type ListEntry, type Validation,
  type MagicItemsData, type MagicCategory, type MagicItem,
} from '../../lib/owbBuilder';
import { applyMountStatModifiers, mountStatModifiers } from '../../lib/mountModifiers';
import { CompositionInfo } from './CompositionInfo';
import { CompositionRulePicker } from './CompositionRulePicker';
import { useSwipeToDismiss } from '../../lib/useSwipeToDismiss';
import { useCampagnes, groeiPlafonds, type CampaignContext, type CampaignUnit } from '../../lib/campaign';

// Responsive Army Builder workspace (Claude Design "Army Builder" PC + mobile, ported onto our
// real OWB data). Wide screens get a three-column builder (catalogue · muster · unit detail);
// phones get the header + roster + add-bar + bottom-sheet flow. Option rows carry an "eye" that
// opens the rule in our pop-up. Magic-items / layered character sections are a later step.

const eb = engraved as React.CSSProperties;
const goldGrad = `linear-gradient(180deg, ${TOW.goldBright} 0%, ${TOW.gold} 55%, ${TOW.goldDeep} 100%)`;
const fmt = (n: number) => n.toLocaleString('en-US');
const cleanLabel = (s: string) => (s || '').replace(/\{[^}]*\}/g, ' ').replace(/\*/g, '').replace(/\s+/g, ' ').trim();

// Dwarf runes have no per-rune rule page; their text lives on a per-TYPE page. Map a rune's `type`
// to the matching slug in rules.json (note British "armour"/"standard" spellings on the rule pages).
const BASE = import.meta.env.BASE_URL;
// Magic-item flavour + rules text (slug → {description, body}), snapshotted from the rules site by
// scripts/sync-magic-text.mjs — the OWB catalogue itself carries no item descriptions.
type MagicText = Record<string, { description?: string; body?: string }>;
// Mount special rules (normalised mount name → rule names), from scripts/sync-mount-text.mjs — so a
// mount's eye shows its full info (profile + special rules), not just the stat line.
type MountText = Record<string, {
  specialRules?: string[]; troopType?: string; baseSize?: string; armourValue?: string;
  equipment?: string[]; notes?: string[];
}>;
const normMount = (s: string) => (s || '').toLowerCase().replace(/ *\([^)]*\) */g, '').replace(/[{}[\]*]/g, '').replace(/^[0-9]x /g, '').replace(/[“”]/g, '"').trim();
const RUNE_TYPE_RULE: Record<string, string> = {
  'weapon-runes': 'weapon-runes',
  'armor-runes': 'armour-runes',
  'talismanic-runes': 'talismanic-runes',
  'banner-runes': 'standard-runes',
  'engineering-runes': 'engineering-runes',
  'runic-tattoos': 'runic-tattoos',
  'ranged-weapon-runes': 'weapon-runes',
};

const CAT_LABEL: Record<Category, string> = { characters: 'Characters', core: 'Core', special: 'Special', rare: 'Rare', mercenaries: 'Mercenaries', allies: 'Allies' };
const POINT_PRESETS = [500, 750, 1000, 1500, 2000, 2500];
const STAT_COLS = ['M', 'WS', 'BS', 'S', 'T', 'W', 'I', 'A', 'Ld'] as const;
type StatRow = { Name: string } & Record<(typeof STAT_COLS)[number], string>;

const newUid = () => 'e' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);

// ─────────────────────────── shared atoms ───────────────────────────
function Stepper({ value, min, max, onChange, sm }: { value: number; min: number; max: number; onChange: (v: number) => void; sm?: boolean }) {
  const d = sm ? 26 : 30;
  const btn = (off: boolean): React.CSSProperties => ({ width: d, height: d, flexShrink: 0, borderRadius: 8, cursor: off ? 'default' : 'pointer', border: `1px solid ${TOW.lineStrong}`, background: off ? 'transparent' : TOW.cardLt, color: off ? TOW.faint : TOW.parchDim, fontFamily: towFont.display, fontWeight: 700, fontSize: sm ? 15 : 17, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 });
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
      <button disabled={value <= min} onClick={() => onChange(value - 1)} aria-label="Fewer" style={btn(value <= min)}>–</button>
      <span style={{ fontFamily: towFont.display, fontWeight: 700, fontSize: sm ? 14 : 16, color: TOW.ink, minWidth: 22, textAlign: 'center' }}>{value}</span>
      <button disabled={value >= max} onClick={() => onChange(value + 1)} aria-label="More" style={btn(value >= max)}>+</button>
    </div>
  );
}

function MiniProfile({ rows, modifiers = {} }: { rows: StatRow[]; modifiers?: Record<string, number> }) {
  if (!rows.length) return null;
  const multi = rows.length > 1;
  const th: React.CSSProperties = { ...eb, fontSize: 7.5, color: TOW.gold, padding: '3px 0 2px', background: 'rgba(138,108,48,0.09)', borderBottom: `1px solid ${TOW.line}`, textAlign: 'center' };
  const td = (k: string, v: string): React.CSSProperties => ({
    fontFamily: towFont.display, fontWeight: modifiers[k] ? 700 : 600, fontSize: 12,
    color: modifiers[k] ? TOW.goldDeep : v === '0' || v === '-' ? TOW.faint : TOW.ink,
    background: modifiers[k] ? 'rgba(184,134,47,0.10)' : 'transparent',
    padding: '4px 0', textAlign: 'center',
  });
  return (
    <div className="no-scrollbar" style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: multi ? 300 : 0, border: `1px solid ${TOW.line}`, borderRadius: 7, background: TOW.cardLt, tableLayout: 'fixed' }}>
        <thead><tr>
          {multi && <th style={{ ...th, width: 78, textAlign: 'left', paddingLeft: 6 }}>Model</th>}
          {STAT_COLS.map((k) => <th key={k} style={th}>{k}</th>)}
        </tr></thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri} style={{ borderTop: ri ? `1px solid ${TOW.line}` : 'none' }}>
              {multi && <td style={{ fontFamily: towFont.serif, fontSize: 11, color: TOW.parchDim, padding: '4px 6px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.Name}</td>}
              {STAT_COLS.map((k) => (
                <td
                  key={k}
                  title={modifiers[k] ? `${modifiers[k] > 0 ? '+' : ''}${modifiers[k]} from selected mount` : undefined}
                  style={td(k, r[k] ?? '-')}
                >
                  {(r[k] ?? '-') === '0' ? '–' : r[k] ?? '–'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CompBar({ c, compact }: { c: ComplianceRow; compact?: boolean }) {
  const denom = c.kind === 'min' ? Math.max(c.limit, c.value, 1) : Math.max(c.limit, 1);
  const pct = Math.min(100, (c.value / denom) * 100);
  return (
    <div style={{ marginBottom: compact ? 7 : 9 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontFamily: towFont.serif, fontSize: compact ? 11.5 : 12.5, color: c.ok ? TOW.parchDim : TOW.blood }}>{c.label}</span>
        <span style={{ fontFamily: towFont.display, fontWeight: 600, fontSize: compact ? 10 : 11, color: c.ok ? TOW.muted : TOW.blood }}>
          {fmt(c.value)} <span style={{ color: TOW.faint }}>{c.kind === 'min' ? '≥' : '≤'} {fmt(c.limit)}</span>
        </span>
      </div>
      <div style={{ height: 6, borderRadius: 99, background: 'rgba(74,55,22,0.12)', overflow: 'hidden' }}>
        <div style={{ width: pct + '%', height: '100%', borderRadius: 99, background: c.ok ? goldGrad : TOW.blood, transition: 'width .25s ease' }} />
      </div>
    </div>
  );
}

const Eye = ({ onClick, title = 'Show rule' }: { onClick: () => void; title?: string }) => (
  <button onClick={(e) => { e.stopPropagation(); onClick(); }} aria-label={title} title={title} style={{ flexShrink: 0, width: 24, height: 24, borderRadius: 7, border: `1px solid ${TOW.line}`, background: 'transparent', cursor: 'pointer', color: TOW.muted, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="2.6" /></svg>
  </button>
);

// A thin decorative rule with a centred diamond + two flanking dots — used above empty states.
const Ornament = ({ width = 110 }: { width?: number }) => (
  <svg width={width} height="12" viewBox="0 0 110 12" fill="none" stroke={TOW.goldDeep} strokeWidth="1" style={{ opacity: 0.5 }} aria-hidden="true">
    <line x1="4" y1="6" x2="40" y2="6" strokeLinecap="round" />
    <line x1="70" y1="6" x2="106" y2="6" strokeLinecap="round" />
    <circle cx="48" cy="6" r="1.4" fill={TOW.goldDeep} stroke="none" />
    <circle cx="62" cy="6" r="1.4" fill={TOW.goldDeep} stroke="none" />
    <path d="M55 2.5 L58.5 6 L55 9.5 L51.5 6 Z" fill="none" />
  </svg>
);

interface ComplianceRow { cat: Category; label: string; kind: 'min' | 'max'; value: number; limit: number; ok: boolean }
function complianceRows(v: Validation): ComplianceRow[] {
  const out: ComplianceRow[] = [];
  for (const c of CATEGORIES) {
    const t = v.byCategory[c];
    const hasLimit = t.limit.minPercent != null || t.limit.maxPercent != null;
    if (!hasLimit) continue;
    const primary = c === 'characters' || c === 'core' || c === 'special' || c === 'rare';
    if (!primary && t.points === 0) continue;
    out.push({ cat: c, label: CAT_LABEL[c], kind: t.limit.minPercent != null ? 'min' : 'max', value: t.points, limit: t.floor ?? t.cap ?? 0, ok: !(t.over || t.under) });
  }
  return out;
}

export function BuilderWorkspace({ list, name, onUpdate, onSetName, onBack, army, armySlug, statsFor, comps, armyName, compName, itemsData, armyItemLists, magicTextPatch, mountTextPatch }: {
  // `list` is een SavedList; we lezen hier alleen de campagne-velden extra (BuilderList blijft ongemoeid).
  list: BuilderList & { points: number; campaign?: boolean; campaignSpeler?: string; campaignNaam?: string; campaignFase?: number }; name: string;
  onUpdate: (fn: (l: BuilderList) => Partial<BuilderList>) => void;
  onSetName: (n: string) => void;
  onBack: () => void;
  army: OwbArmy;
  armySlug: string;
  statsFor: (name: string) => StatRow[];
  comps: string[];
  armyName: string;
  compName: (comp: string) => string;
  itemsData?: MagicItemsData;
  armyItemLists?: string[];
  magicTextPatch?: MagicText;
  mountTextPatch?: MountText;
}) {
  const { rules, lores } = useData();
  const { openRule } = useUI();
  const ruleIdx = useMemo(() => getRuleIndex(rules), [rules]);
  const getUnit = (cat: Category, id: string): OwbUnit | undefined => army[cat]?.find((u) => u.id === id);

  // ── Campagne-context (Isle of Celedon), alleen voor een campagne-lijst ──────────────────────────
  // Sinds de account-koppeling leeft de context in een module-store die zichzelf bij elke auth-
  // wijziging verst; dit scherm leest hem alleen. Een niet-campagne-lijst houdt `campaignCtx` op null.
  const { actief: campagneActief } = useCampagnes();
  const campaignCtx: CampaignContext | null = list.campaign ? campagneActief : null;
  const [capBumped, setCapBumped] = useState(false); // fase schoof op ⇒ we hebben de cap net bijgewerkt
  const [unlocksOpen, setUnlocksOpen] = useState(false); // "Campaign unlocks"-paneel open/dicht

  // Mechanisch afgedwongen campagne-modifiers: de fase-cap als puntenbasis, en het groeiplafond per
  // unit die al eerder is ingediend. De roster-unlocks bestaan niet meer (perks = tafel-regels).
  // De categorie komt uit de HUIDIGE lijst-entry — die bepaalt de staffel (characters 50, rest 25).
  const groei = useMemo(
    () => (campaignCtx
      ? groeiPlafonds(campaignCtx, (uid) => list.entries.find((e) => e.uid === uid)?.cat)
      : undefined),
    [campaignCtx, list.entries],
  );
  const campaignMods = campaignCtx ? { pointsCap: campaignCtx.puntenCap, namedUnits: true, groei } : undefined;

  // Cap-sync: als de fase is opgeschoven staat list.points nog op de oude cap → werk 'm bij (één keer
  // per verschil; de gelijkheids-guard voorkomt een oneindige lus) en meld het in de campagne-balk.
  useEffect(() => {
    if (!campaignCtx) return;
    if (campaignCtx.puntenCap !== list.points) { onUpdate(() => ({ points: campaignCtx.puntenCap })); setCapBumped(true); }
  }, [campaignCtx, list.points]); // eslint-disable-line react-hooks/exhaustive-deps

  const v = useMemo(() => validate(list, getUnit, itemsData, campaignMods), [list, army, itemsData, campaignCtx, groei]); // eslint-disable-line react-hooks/exhaustive-deps
  const comp = useMemo(() => complianceRows(v), [v]);
  const compByCat: Partial<Record<Category, ComplianceRow>> = {};
  comp.forEach((c) => { compByCat[c.cat] = c; });
  const overBudget = v.total > list.points;

  const rootRef = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(1024);
  useLayoutEffect(() => {
    const el = rootRef.current; if (!el) return;
    const ro = new ResizeObserver((es) => setW(es[0].contentRect.width));
    ro.observe(el); setW(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);
  // The 3-column desktop layout needs room for the fixed 296px catalogue + 452px detail columns
  // plus a usable middle (~290px) ≈ 1040px. Below that, fall back to the single-column flow so
  // nothing overflows or clips on tablets / narrow windows.
  const wide = w >= 1040;

  const [selUid, setSelUid] = useState<string | null>(null);
  const [sheet, setSheet] = useState<'pick' | { edit: string } | null>(null);
  // 'register' = het "My regiments"-tabblad: je gesavede/benoemde campagne-units (uit het register).
  // Campagne-lijst mét register → daar openen, zodat veteranen vóór de catalogus staan.
  const [tab, setTab] = useState<Category | 'register'>(() => (list.campaign && (campaignCtx?.units ?? []).some((u) => u.naam) ? 'register' : 'characters'));
  const [q, setQ] = useState('');
  const [settings, setSettings] = useState(false);
  const [info, setInfo] = useState<{ title: string; rows: StatRow[]; note?: string; ruleSlug?: string; flavour?: string; body?: string; ruleChips?: { name: string; slug: string | null }[]; chipsLabel?: string } | null>(null); // mount/unit profile / magic-item / lore popup
  const [compInfo, setCompInfo] = useState<string | null>(null); // composition-rule explanation popup
  const [baseMagicText, setBaseMagicText] = useState<MagicText>({});
  const magicText = useMemo(() => ({ ...baseMagicText, ...(magicTextPatch ?? {}) }), [baseMagicText, magicTextPatch]);
  const [baseMountText, setBaseMountText] = useState<MountText>({});
  const mountText = useMemo(() => ({ ...baseMountText, ...(mountTextPatch ?? {}) }), [baseMountText, mountTextPatch]);
  useEffect(() => { fetch(`${BASE}owb/magic-item-text.json`).then((r) => r.json()).then(setBaseMagicText).catch(() => {}); }, []);
  useEffect(() => { fetch(`${BASE}owb/mount-text.json`).then((r) => r.json()).then(setBaseMountText).catch(() => {}); }, []);
  // One-time migration of older lists: magic picks once stored under the section's FIRST type (e.g. a
  // talisman as `magic/weapon/…`) show unchecked under the per-type UI while still costing points.
  // Canonicalise stale keys to `magic/<type>/<id>`. We DETECT via the closure (read-only) and only
  // then APPLY through a FUNCTIONAL onUpdate that rewrites the CURRENT entries — never a captured
  // snapshot — so it can't clobber a concurrent edit, and it doesn't touch lists that are already fine.
  useEffect(() => {
    if (!itemsData) return;
    const canon = (e: ListEntry, u: OwbUnit) => new Map(selectedMagicItems(u, e, itemsData, armyItemLists).map((r) => [r.key, `magic/${r.category.id}/${magicItemId(r.item)}`] as const));
    const hasStale = list.entries.some((e) => { const u = getUnit(e.cat, e.unitId); return !!u && [...canon(e, u)].some(([k, c]) => k !== c); });
    if (!hasStale) return;
    onUpdate((l) => ({ entries: l.entries.map((e) => { const u = getUnit(e.cat, e.unitId); if (!u) return e; const m = canon(e, u); return { ...e, opts: e.opts.map((k) => m.get(k) ?? k) }; }) }));
  }, [itemsData]); // eslint-disable-line react-hooks/exhaustive-deps
  const [openMagicCats, setOpenMagicCats] = useState<Set<string>>(new Set()); // expanded magic-item categories
  const [showIssues, setShowIssues] = useState(false); // expand the list of composition problems
  const [dragOverEntry, setDragOverEntry] = useState<{ uid: string; before: boolean } | null>(null); // roster row hovered during a reorder drag (+ which edge)

  // In-app Back: close the open overlay instead of leaving the app (deepest layers register last).
  useBackClose(settings, () => setSettings(false)); // list settings panel/sheet
  useBackClose(showIssues, () => setShowIssues(false)); // "issues to fix" dropdown
  useBackClose(sheet !== null, () => setSheet(null)); // mobile pick/edit bottom sheet
  useBackClose(info !== null, () => setInfo(null)); // profile / magic-item info popup

  // ── entry operations ──
  const add = (cat: Category, u: OwbUnit) => {
    const uid = newUid();
    onUpdate((l) => ({ entries: [...l.entries, { uid, cat, unitId: u.id, count: Math.max(1, u.minimum ?? 1), opts: [] }] }));
    return uid;
  };
  const removeE = (uid: string) => { onUpdate((l) => ({ entries: l.entries.filter((e) => e.uid !== uid) })); if (selUid === uid) setSelUid(null); };
  // Campagne — named unit: de eigen naam van deze unit ("The Blackspears"). Wordt in De Grensvorsten
  // de veteranen-identiteit (XP/abilities/scars volgen deze naam over lijsten en battles heen).
  const setCustomName = (uid: string, naam: string) => onUpdate((l) => ({ entries: l.entries.map((e) => (e.uid === uid ? { ...e, customName: naam || undefined } : e)) }));
  // Naam-smid: factie/type-bewuste suggesties (naamForge). Per geselecteerde unit gegenereerd.
  const [naamSuggesties, setNaamSuggesties] = useState<string[]>([]);
  const rolNamen = (unitNaam: string, cat?: string) => setNaamSuggesties(stelNamenVoor(armySlug, unitNaam, 4, cat));
  // Naam-dialoog: draft + expliciete Save (niet live) — geopend via de Name-knop in de unit-detail-kop.
  const [naamUid, setNaamUid] = useState<string | null>(null);
  const [naamConcept, setNaamConcept] = useState('');
  const openNaamDialoog = (uid: string, unitNaam: string, huidig: string, cat?: string) => { setNaamConcept(huidig); rolNamen(unitNaam, cat); setNaamUid(uid); };
  const setCount = (uid: string, c: number) => onUpdate((l) => ({ entries: l.entries.map((e) => {
    if (e.uid !== uid) return e; const u = getUnit(e.cat, e.unitId); const min = u?.minimum ?? 1; const max = (u?.maximum ?? 0) === 0 ? 9999 : (u?.maximum ?? 1);
    return { ...e, count: Math.max(min, Math.min(max, c)) };
  }) }));
  const toggleOpt = (uid: string, key: string) => onUpdate((l) => ({ entries: l.entries.map((e) => (e.uid !== uid ? e : { ...e, opts: e.opts.includes(key) ? e.opts.filter((k) => k !== key) : [...e.opts, key] })) }));
  const setRadio = (uid: string, group: string, i: number) => onUpdate((l) => ({ entries: l.entries.map((e) => {
    if (e.uid !== uid) return e; const kept = e.opts.filter((k) => !k.startsWith(group + '/')); return { ...e, opts: [...kept, `${group}/${i}`] };
  }) }));
  const dup = (uid: string) => {
    const id = newUid();
    onUpdate((l) => { const src = l.entries.find((e) => e.uid === uid); if (!src) return {}; const i = l.entries.findIndex((e) => e.uid === uid); const copy: ListEntry = { ...src, uid: id, opts: [...src.opts] }; return { entries: [...l.entries.slice(0, i + 1), copy, ...l.entries.slice(i + 1)] }; });
    return id;
  };
  // Drag-reorder a roster entry. Reorders WITHIN a category only — ignore drops across categories.
  const reorderEntry = (draggedUid: string, targetUid: string, before: boolean) =>
    onUpdate((l) => {
      const arr = [...l.entries];
      const di = arr.findIndex((x) => x.uid === draggedUid);
      const tEntry = arr.find((x) => x.uid === targetUid);
      const dEntry = arr[di];
      if (di < 0 || !tEntry || !dEntry || tEntry.cat !== dEntry.cat) return {};
      arr.splice(di, 1);
      const ti = arr.findIndex((x) => x.uid === targetUid);
      arr.splice(before ? ti : ti + 1, 0, dEntry);
      return { entries: arr };
    });

  const openOptionRule = (label: string) => { const s = resolveOptionSlug(cleanLabel(label), ruleIdx); if (s) openRule(s); };
  const openRuleByName = (label: string) => { const s = resolveRuleSlug(cleanLabel(label), ruleIdx); if (s) openRule(s); };
  // The army-of-infamy rule PROSE isn't in our dataset (the eye opens the army's reference page), but
  // the structured part — which category a unit sits in, and whether it's available at all — IS, per
  // unit in `armyComposition`. These read it for the chosen composition so the picker, grouping and
  // labels reflect it (e.g. State Troops move from Core to Special for a knightly order).
  const openCompositionRules = () => window.open(`https://tow.whfb.app/army/${armySlug}`, '_blank', 'noopener,noreferrer');
  const baseCatOf = (u: OwbUnit): Category => CATEGORIES.find((c) => (army[c] ?? []).includes(u)) ?? 'core';
  const effCatOf = (u: OwbUnit): Category => unitCategoryFor(u, list.composition, baseCatOf(u));
  const availableHere = (u: OwbUnit): boolean => unitAllowedIn(u, list.composition);
  const riderProfileFor = (u: OwbUnit, entry: ListEntry) => {
    const mount = u.mounts?.[selectedMountIndex(u, entry)];
    const modifiers = mount?.name_en && !/^on foot$/i.test(mount.name_en)
      ? mountStatModifiers(statsFor(mount.name_en))
      : {};
    return { rows: applyMountStatModifiers(statsFor(u.name_en), modifiers), modifiers };
  };

  const needle = q.trim().toLowerCase();
  const allUnits = CATEGORIES.flatMap((c) => (army[c] ?? []));
  const catalogUnits = (needle
    ? allUnits.filter((u) => u.name_en.toLowerCase().includes(needle))
    : allUnits.filter((u) => effCatOf(u) === tab)
  ).filter(availableHere);
  const countInList = (id: string) => list.entries.filter((e) => e.unitId === id).length;
  const grouped = CATEGORIES.map((c) => ({ c, items: list.entries.filter((e) => { const u = getUnit(e.cat, e.unitId); return u ? effCatOf(u) === c : e.cat === c; }) })).filter((g) => g.items.length);

  // ── shared sub-renders ──
  const rules_ = (rs: string[]) => rs.length === 0 ? null : (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
      {rs.map((r, i) => {
        const slug = resolveRuleSlug(cleanLabel(r), ruleIdx);
        return slug
          ? <button key={i} onClick={() => openRuleByName(r)} style={{ fontFamily: towFont.serif, fontSize: 11.5, padding: '2px 9px', borderRadius: 99, border: `1px solid ${TOW.goldDeep}`, background: 'rgba(138,108,48,0.10)', color: TOW.goldDeep, cursor: 'pointer' }}>{r}</button>
          : <span key={i} style={{ fontFamily: towFont.serif, fontSize: 11.5, padding: '2px 9px', borderRadius: 99, border: `1px solid ${TOW.line}`, background: 'rgba(138,108,48,0.06)', color: TOW.muted }}>{r}</span>;
      })}
    </div>
  );

  // A single option/toggle/radio row in the unit's standard option groups (shared shape, reused
  // by the mount sub-option block below — `circle` chooses radio vs. checkbox indicator).
  const optionRow = (key: string, opt: { name_en: string; points?: number; perModel?: boolean }, on: boolean, circle: boolean, onToggle: () => void, disabled = false) => {
    const cost = opt.points ? `+${opt.points}${opt.perModel ? '/model' : ''}` : 'free';
    const hasRule = !!resolveOptionSlug(cleanLabel(opt.name_en), ruleIdx);
    const profileRows = hasRule ? [] : statsFor(opt.name_en); // mounts/units → show their profile
    return (
      <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, opacity: disabled ? 0.5 : 1 }}>
        <button disabled={disabled} onClick={onToggle}
          style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, padding: '8px 11px', borderRadius: 9, cursor: disabled ? 'default' : 'pointer', textAlign: 'left', border: `1px solid ${on ? TOW.goldDeep : TOW.line}`, background: on ? 'rgba(138,108,48,0.10)' : TOW.cardLt }}>
          <span style={{ width: 18, height: 18, flexShrink: 0, borderRadius: circle ? 99 : 5, border: `1.5px solid ${on ? TOW.goldDeep : TOW.lineStrong}`, background: on ? TOW.goldDeep : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {on && <svg width="11" height="11" viewBox="0 0 12 12"><path d="M2.5 6.4l2.2 2.2 4.8-5" stroke="#f4eedb" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>}
          </span>
          <span style={{ flex: 1, fontFamily: towFont.serif, fontSize: 13.5, color: TOW.ink }}>{opt.name_en}</span>
          <span style={{ fontFamily: towFont.display, fontWeight: 600, fontSize: 11, color: opt.points ? TOW.gold : TOW.faint }}>{cost}</span>
        </button>
        {(hasRule || profileRows.length > 0) && <Eye onClick={() => {
          if (hasRule) { openOptionRule(opt.name_en); return; }
          // A mount (or any profile-bearing option): show its stat profile PLUS its special rules as
          // tappable chips (each opens the rule), not just the bare profile.
          const tx = mountText[normMount(cleanLabel(opt.name_en))] ?? mountText[normMount(opt.name_en)] ?? {};
          const sr = tx.specialRules ?? [];
          const ruleChips = sr.map((name) => ({ name, slug: resolveRuleSlug(cleanLabel(name), ruleIdx) }));
          const details = [
            tx.troopType ? `Troop type: ${tx.troopType}` : null,
            tx.baseSize ? `Base size: ${tx.baseSize}` : null,
            tx.armourValue ? `Armour value: ${tx.armourValue}` : null,
            ...(tx.equipment ?? []).map((value) => `Equipment: ${value}`),
            ...(tx.notes ?? []),
          ].filter((value): value is string => !!value);
          setInfo({ title: cleanLabel(opt.name_en), rows: profileRows, body: details.join('\n'), ruleChips });
        }} />}
      </div>
    );
  };

  // An indented nested sub-option group under an active parent (mount sub-options, wizard levels, …).
  // Radio rows when `exclusive`, toggle rows otherwise — reusing optionRow (Eye + profile/rule).
  const subGroupBlock = (u: OwbUnit, entry: ListEntry, g: ReturnType<typeof subOptionGroups>[number]) => (
    <div key={`${String(g.group)}/${g.parentIndex}/${g.exclusive ? 'x' : 't'}`} style={{ marginLeft: 14, paddingLeft: 12, borderLeft: `2px solid ${TOW.line}` }}>
      {g.items.map(({ i, opt, key, selected }) =>
        optionRow(key, opt, selected, g.exclusive, () =>
          onUpdate((l) => ({ entries: l.entries.map((e) => (e.uid !== entry.uid ? e : {
            ...e, opts: g.exclusive ? setExclusiveSubOption(u, e, g.group, g.parentIndex, i) : toggleSubOption(e, g.group, g.parentIndex, i),
          })) }))))}
    </div>
  );

  const optionEditor = (entry: ListEntry, u: OwbUnit) => {
    const blocks = unitBlocks(u);
    const subGroups = subOptionGroups(u, entry);
    const cats = itemsData ? magicCategories(u, armyItemLists ?? [], itemsData, entry) : [];
    const magicCats = cats.filter((c) => c.items.length > 0);
    const loadout = loadoutLabels(u, entry, itemsData); // base weapons/armour + chosen kit
    const noUpgrades = !blocks.length && subGroups.length === 0 && magicCats.length === 0;
    // Nested groups keyed by their parent slot, so each renders INDENTED directly under its parent.
    const subsByParent = new Map<string, typeof subGroups>();
    for (const g of subGroups) {
      const k = `${String(g.group)}/${g.parentIndex}`;
      subsByParent.set(k, [...(subsByParent.get(k) ?? []), g]);
    }

    // One magic-item row: a select button (radio dot for single-pick categories, checkbox for the
    // multi-pick Rune section) + an eye opening the item's (or its rune-type's) rule page.
    const magicItemRow = (cat: MagicCategory, item: MagicItem) => {
      const key = `magic/${cat.id}/${magicItemId(item)}`;
      const on = entry.opts.includes(key);
      const disabled = !on && magicWouldExceed(u, entry, cat.id, item, itemsData!, { armyItemLists });
      const cost = item.points ? `+${item.points}` : 'free';
      return (
        <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, opacity: disabled ? 0.5 : 1 }}>
          <button disabled={disabled} onClick={() => onUpdate((l) => ({ entries: l.entries.map((e) => (e.uid === entry.uid ? { ...e, opts: toggleMagicItem(e, cat.id, item, cat.maxItems) } : e)) }))}
            style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, padding: '8px 11px', borderRadius: 9, cursor: disabled ? 'default' : 'pointer', textAlign: 'left', border: `1px solid ${on ? TOW.goldDeep : TOW.line}`, background: on ? 'rgba(138,108,48,0.10)' : TOW.panel }}>
            <span style={{ width: 18, height: 18, flexShrink: 0, borderRadius: cat.maxItems > 1 ? 5 : 99, border: `1.5px solid ${on ? TOW.goldDeep : TOW.lineStrong}`, background: on ? TOW.goldDeep : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {on && <svg width="11" height="11" viewBox="0 0 12 12"><path d="M2.5 6.4l2.2 2.2 4.8-5" stroke="#f4eedb" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>}
            </span>
            <span style={{ flex: 1, fontFamily: towFont.serif, fontSize: 13.5, color: TOW.ink }}>
              {item.name_en}
              {item.common && <span style={{ ...eb, fontSize: 7.5, color: TOW.muted, border: `1px solid ${TOW.line}`, borderRadius: 4, padding: '1px 4px', marginLeft: 6, verticalAlign: 'middle' }}>Common</span>}
            </span>
            <span style={{ fontFamily: towFont.display, fontWeight: 600, fontSize: 11, color: item.points ? TOW.gold : TOW.faint }}>{cost}</span>
          </button>
          <Eye onClick={() => {
            // Show THIS item's own flavour + rules text (snapshotted per item) — what the rune/item
            // actually does. Falls back to the item's rule page, then a rune-type link, then meta.
            const tx = magicText[magicItemId(item)];
            const typeSlug = RUNE_TYPE_RULE[item.type];
            const note = `${magicTypeLabel(item.type)} · ${item.points ?? 0} pts${item.onePerArmy ? ' · one per army' : ''}`;
            if (tx && (tx.body || tx.description)) {
              setInfo({ title: cleanLabel(item.name_en), rows: [], note, flavour: tx.description, body: tx.body, ruleSlug: typeSlug && rules[typeSlug] ? typeSlug : undefined });
              return;
            }
            const slug = resolveRuleSlug(cleanLabel(item.name_en), ruleIdx);
            if (slug) { openRuleByName(item.name_en); return; }
            setInfo({ title: cleanLabel(item.name_en), rows: [], note, ruleSlug: typeSlug && rules[typeSlug] ? typeSlug : undefined });
          }} />
        </div>
      );
    };

    // One collapsible magic category (Magic Weapons / Talismans / Runes / …). Default COLLAPSED; the
    // header shows the chosen item(s) so picks stay visible after collapsing. `meter` draws the shared
    // budget bar (used when the category is its own budget group; multi-type groups carry it once above).
    const magicCategoryBlock = (cat: MagicCategory, meter: boolean) => {
      const catKey = `${entry.uid}/${cat.id}`;
      const selKeys = selectedMagicKeys(entry, cat.id);
      const chosen = cat.items.filter((it) => selKeys.includes(`magic/${cat.id}/${magicItemId(it)}`)).map((it) => it.name_en);
      // Option-unlocked categories (a Battle Standard Bearer's magic standard) just appeared from the
      // player's action, so show their choices straight away while empty; once something is picked they
      // collapse (pick shown in the header). Section categories stay collapsed by default. Chevron flips either.
      const toggled = openMagicCats.has(catKey);
      const open = cat.budgetGroup.startsWith('opt:') && selKeys.length === 0 ? !toggled : toggled;
      const budget = cat.maxPoints ?? DEFAULT_MAGIC_BUDGET;
      const unlimited = !isFinite(budget); // e.g. a Battle Standard Bearer's magic standard (any value)
      const spent = meter ? magicGroupSpent(u, entry, cat.budgetGroup, itemsData!, armyItemLists) : 0;
      const over = !unlimited && spent > budget;
      const pct = unlimited ? (spent > 0 ? 100 : 0) : Math.min(100, (spent / Math.max(budget, 1)) * 100);
      return (
        <div key={`magic/${cat.id}`} style={{ marginBottom: meter ? 12 : 7, border: `1px solid ${TOW.line}`, borderRadius: 10, background: TOW.cardLt, overflow: 'hidden' }}>
          <button onClick={() => setOpenMagicCats((s) => { const n = new Set(s); n.has(catKey) ? n.delete(catKey) : n.add(catKey); return n; })}
            aria-expanded={open} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '9px 11px', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={TOW.muted} strokeWidth="2.4" style={{ flexShrink: 0, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .18s ease' }} aria-hidden="true"><path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" /></svg>
            <span style={{ ...eb, fontSize: 8.5, color: TOW.muted, flexShrink: 0 }}>{cat.label}</span>
            {!open && chosen.length > 0
              ? <span style={{ flex: 1, fontFamily: towFont.serif, fontSize: 12, color: TOW.gold, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{chosen.join(', ')}</span>
              : <span style={{ flex: 1 }} />}
            <span style={{ display: 'flex', alignItems: 'baseline', gap: 7, flexShrink: 0 }}>
              {isFinite(cat.maxItems) && cat.maxItems > 1 && <span style={{ ...eb, fontSize: 8, color: TOW.muted }}>{selKeys.length}/{cat.maxItems}</span>}
              {!isFinite(cat.maxItems) && selKeys.length > 0 && <span style={{ ...eb, fontSize: 8, color: TOW.muted }}>{selKeys.length}</span>}
              {meter && <span style={{ fontFamily: towFont.display, fontWeight: 600, fontSize: 10.5, color: over ? TOW.blood : TOW.muted }}>{fmt(spent)} <span style={{ color: TOW.faint }}>{unlimited ? 'pts · no limit' : `/ ${fmt(budget)}`}</span></span>}
            </span>
          </button>
          {meter && !unlimited && (
            <div style={{ height: 5, borderRadius: 99, background: 'rgba(74,55,22,0.12)', overflow: 'hidden', margin: '0 11px 9px' }}>
              <div style={{ width: pct + '%', height: '100%', borderRadius: 99, background: over ? TOW.blood : goldGrad, transition: 'width .25s ease' }} />
            </div>
          )}
          {open && <div style={{ padding: meter ? '0 11px 5px' : '4px 11px 5px' }}>{cat.items.map((item) => magicItemRow(cat, item))}</div>}
        </div>
      );
    };

    // Group the per-type categories by their shared budget (one section = one budget group).
    const magicGroups: { budgetGroup: string; groupLabel: string; cats: MagicCategory[] }[] = [];
    for (const c of magicCats) {
      let grp = magicGroups.find((x) => x.budgetGroup === c.budgetGroup);
      if (!grp) { grp = { budgetGroup: c.budgetGroup, groupLabel: c.groupLabel, cats: [] }; magicGroups.push(grp); }
      grp.cats.push(c);
    }

    return (
      <>
        {/* Loadout — base weapons & armour (and any chosen kit), always shown so even units with no
            upgrades still display what they carry. Each chip opens its wargear rule when one exists. */}
        {loadout.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ ...eb, fontSize: 8.5, color: TOW.muted, marginBottom: 7 }}>Loadout</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {loadout.map((w, i) => {
                const slug = resolveOptionSlug(cleanLabel(w), ruleIdx);
                return slug
                  ? <button key={i} onClick={() => openOptionRule(w)} style={{ fontFamily: towFont.serif, fontSize: 11.5, padding: '3px 9px', borderRadius: 99, border: `1px solid ${TOW.goldDeep}`, background: 'rgba(138,108,48,0.10)', color: TOW.goldDeep, cursor: 'pointer' }}>{w}</button>
                  : <span key={i} style={{ fontFamily: towFont.serif, fontSize: 11.5, padding: '3px 9px', borderRadius: 99, border: `1px solid ${TOW.line}`, background: 'rgba(138,108,48,0.05)', color: TOW.muted }}>{w}</span>;
              })}
            </div>
          </div>
        )}

        {noUpgrades && <div style={{ fontFamily: towFont.serif, fontStyle: 'italic', fontSize: 13, color: TOW.muted }}>No further upgrades — this unit's wargear is fixed.</div>}

        {blocks.map((b) => {
          const radioKey = b.radio ? radioSelected(u, entry, b.key) : '';
          return (
            <div key={String(b.key)} style={{ marginBottom: 12 }}>
              <div style={{ ...eb, fontSize: 8.5, color: TOW.muted, marginBottom: 7 }}>{b.label}</div>
              {b.items.map(({ i, opt }) => {
                const key = `${String(b.key)}/${i}`;
                const on = b.radio ? radioKey === key : entry.opts.includes(key);
                const nested = subsByParent.get(`${String(b.key)}/${i}`) ?? [];
                // An `alwaysActive` parent is a free base that can't be toggled off → render it as a
                // small engraved sub-group HEADER, then its nested options (e.g. "Wizard" + the Level
                // radio). Otherwise render the normal toggle/radio row, with any nested group beneath.
                if (opt.alwaysActive) {
                  return (
                    <div key={key}>
                      <div style={{ ...eb, fontSize: 8, color: TOW.muted, margin: '2px 0 6px' }}>{cleanLabel(opt.name_en)}</div>
                      {nested.map((g) => subGroupBlock(u, entry, g))}
                    </div>
                  );
                }
                return (
                  <div key={key}>
                    {optionRow(key, opt, on, !!b.radio, () => (b.radio ? setRadio(entry.uid, String(b.key), i) : toggleOpt(entry.uid, key)))}
                    {nested.map((g) => subGroupBlock(u, entry, g))}
                  </div>
                );
              })}
            </div>
          );
        })}

        {/* Magic items — one collapsible category per kind (Magic Weapons / Armour / Talismans / …),
            sharing each section's points budget; a chosen Standard bearer adds a Magic Standards
            category. Collapsible after choosing, with the picks shown in each collapsed header. */}
        {magicGroups.map((group) => {
          if (group.cats.length === 1) return magicCategoryBlock(group.cats[0], true);
          const budget = group.cats[0].maxPoints ?? DEFAULT_MAGIC_BUDGET;
          const spent = magicGroupSpent(u, entry, group.budgetGroup, itemsData!, armyItemLists);
          const over = spent > budget;
          const pct = Math.min(100, (spent / Math.max(budget, 1)) * 100);
          return (
            <div key={group.budgetGroup} style={{ marginBottom: 12, border: `1px solid ${TOW.line}`, borderRadius: 10, background: 'rgba(74,55,22,0.04)', padding: '9px 9px 5px' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, padding: '0 2px 7px' }}>
                <span style={{ ...eb, fontSize: 8.5, color: TOW.gold, flex: 1 }}>{group.groupLabel}</span>
                <span style={{ fontFamily: towFont.display, fontWeight: 600, fontSize: 10.5, color: over ? TOW.blood : TOW.muted }}>{fmt(spent)} <span style={{ color: TOW.faint }}>/ {fmt(budget)}</span></span>
              </div>
              <div style={{ height: 5, borderRadius: 99, background: 'rgba(74,55,22,0.12)', overflow: 'hidden', margin: '0 2px 9px' }}>
                <div style={{ width: pct + '%', height: '100%', borderRadius: 99, background: over ? TOW.blood : goldGrad, transition: 'width .25s ease' }} />
              </div>
              {group.cats.map((cat) => magicCategoryBlock(cat, false))}
            </div>
          );
        })}

        {/* Wizards — CHOOSE A LORE OF MAGIC (not spells). The allowed lores per wizard come straight
            from the catalogue (`u.lores`, rules-driven & army-specific); a wizard knows one lore. The
            pick is stored on entry.lores and carried into the game by builderToArmy (where spells are
            then rolled/ticked). Each lore has an eye that previews its spells. */}
        {(() => {
          const allowed = (u.lores ?? []).filter((s) => lores[s]);
          if (allowed.length === 0) return null;
          const chosen = entry.lores ?? [];
          const setLore = (slug: string, on: boolean) =>
            onUpdate((l) => ({ entries: l.entries.map((e) => (e.uid === entry.uid ? { ...e, lores: on ? [] : [slug], spells: [] } : e)) }));
          return (
            <div style={{ marginBottom: 12 }}>
              <div style={{ ...eb, fontSize: 8.5, color: TOW.muted, marginBottom: 7 }}>Lore of Magic</div>
              {allowed.map((slug) => {
                const lore = lores[slug];
                const on = chosen.includes(slug);
                const spells = (lore.spells ?? []) as { slug: string; name: string; number?: number | null; signature?: boolean }[];
                return (
                  <div key={slug} style={{ marginBottom: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button onClick={() => setLore(slug, on)} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, padding: '8px 11px', borderRadius: 9, cursor: 'pointer', textAlign: 'left', border: `1px solid ${on ? TOW.goldDeep : TOW.line}`, background: on ? 'rgba(138,108,48,0.10)' : TOW.cardLt }}>
                        <span style={{ width: 18, height: 18, flexShrink: 0, borderRadius: 99, border: `1.5px solid ${on ? TOW.goldDeep : TOW.lineStrong}`, background: on ? TOW.goldDeep : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {on && <svg width="11" height="11" viewBox="0 0 12 12"><path d="M2.5 6.4l2.2 2.2 4.8-5" stroke="#f4eedb" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                        </span>
                        <span style={{ flex: 1, fontFamily: towFont.serif, fontSize: 13.5, color: TOW.ink }}>{lore.name}</span>
                      </button>
                      <Eye onClick={() => setInfo({ title: lore.name, rows: [], note: `${spells.length} spell${spells.length === 1 ? '' : 's'}`, chipsLabel: 'Spells', ruleChips: spells.map((sp) => ({ name: sp.signature ? `✦ ${sp.name}` : sp.name, slug: sp.slug })) })} />
                    </div>
                    {/* Selected lore → its spells listed beneath, by number (✦ = the signature spell);
                        each opens its rule. */}
                    {on && spells.length > 0 && (
                      <div style={{ marginLeft: 27, marginTop: 5, paddingLeft: 11, borderLeft: `2px solid ${TOW.line}`, display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {spells.map((sp) => (
                          <button key={sp.slug} onClick={() => openRule(sp.slug)} style={{ display: 'flex', alignItems: 'baseline', gap: 9, padding: '3px 6px', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left', borderRadius: 6 }}>
                            <span style={{ ...eb, fontSize: 9, color: TOW.gold, minWidth: 12, flexShrink: 0, textAlign: 'center' }}>{sp.signature ? '✦' : sp.number}</span>
                            <span style={{ fontFamily: towFont.serif, fontSize: 12.5, color: TOW.goldDeep }}>{sp.name}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })()}
      </>
    );
  };

  const rosterRow = (e: ListEntry, u: OwbUnit, selected: boolean, onClick: () => void) => {
    const sum = summaryLabels(u, e, itemsData);
    const multi = (u.maximum ?? 1) !== 1 || (u.minimum ?? 1) > 1;
    const dropLine = dragOverEntry?.uid === e.uid ? dragOverEntry.before : null; // true=top, false=bottom, null=none
    return (
      <div
        key={e.uid}
        onClick={onClick}
        draggable
        onDragStart={(ev) => { ev.dataTransfer.setData('text/plain', e.uid); ev.dataTransfer.effectAllowed = 'move'; }}
        onDragOver={(ev) => { ev.preventDefault(); const r = ev.currentTarget.getBoundingClientRect(); setDragOverEntry({ uid: e.uid, before: ev.clientY < r.top + r.height / 2 }); }}
        onDragLeave={() => setDragOverEntry((d) => (d?.uid === e.uid ? null : d))}
        onDrop={(ev) => { ev.preventDefault(); const dragged = ev.dataTransfer.getData('text/plain'); const r = ev.currentTarget.getBoundingClientRect(); const before = ev.clientY < r.top + r.height / 2; if (dragged && dragged !== e.uid) reorderEntry(dragged, e.uid, before); setDragOverEntry(null); }}
        style={{ position: 'relative', cursor: 'pointer', padding: '11px 13px', borderRadius: 11, marginBottom: 7, border: `1px solid ${selected ? TOW.goldDeep : TOW.line}`, background: selected ? TOW.cardLt : TOW.cardLt, boxShadow: selected ? '0 2px 12px rgba(122,93,36,0.14)' : 'none' }}
      >
        {dropLine != null && <div style={{ position: 'absolute', left: 0, right: 0, [dropLine ? 'top' : 'bottom']: -1, height: 2, background: TOW.goldDeep, borderRadius: 2, pointerEvents: 'none' }} />}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ flex: 1, fontFamily: towFont.display, fontWeight: 600, fontSize: 15, color: TOW.ink }}>
            {multi ? <span style={{ color: TOW.gold }}>{e.count}× </span> : null}{e.customName || u.name_en}
            {e.customName ? <span style={{ fontFamily: towFont.serif, fontWeight: 400, fontSize: 11.5, color: TOW.muted }}> · {u.name_en}</span> : null}
            {/* Campagne: naam is verplicht (veteranen-identiteit) — rood merkteken zolang 'ie ontbreekt. */}
            {list.campaign && !e.customName ? <span style={{ ...eb, fontSize: 7, color: '#fff', background: TOW.blood, borderRadius: 99, padding: '2px 6px', marginLeft: 6, verticalAlign: 'middle' }}>NAME</span> : null}
          </span>
          <span style={{ fontFamily: towFont.display, fontWeight: 700, fontSize: 13, color: TOW.parchDim }}>{fmt(entryPoints(u, e, itemsData))}</span>
        </div>
        {(() => {
          // Chosen upgrades if any; otherwise the unit's base weapons/armour, so even an un-upgraded
          // unit shows what it carries rather than a bare "Tap to equip".
          const line = sum.length > 0 ? sum : loadoutLabels(u, e, itemsData);
          return line.length > 0
            ? <div style={{ fontFamily: towFont.serif, fontSize: 12.5, color: sum.length ? TOW.muted : TOW.faint, marginTop: 3, lineHeight: 1.4 }}>{line.join(' · ')}</div>
            : <div style={{ fontFamily: towFont.serif, fontStyle: 'italic', fontSize: 12, color: TOW.faint, marginTop: 3 }}>Tap to equip</div>;
        })()}
      </div>
    );
  };

  // Register: je benoemde campagne-units (veteranen), opgelost naar hun catalogus-unit in dít leger.
  // Voedt het "My regiments"-tabblad in de picker; kiezen = unit toevoegen mét de naam er al op.
  const registerUnits = (list.campaign ? (campaignCtx?.units ?? []) : [])
    .filter((r) => r.naam && r.catalogusId)
    .map((r) => {
      const u = (r.cat ? getUnit(r.cat as Category, r.catalogusId!) : undefined)
        ?? CATEGORIES.map((c) => getUnit(c, r.catalogusId!)).find(Boolean);
      return u ? { reg: r, unit: u } : null;
    })
    .filter((x): x is { reg: CampaignUnit; unit: OwbUnit } => x !== null);

  const picker = (onPick: (u: OwbUnit, cat: Category, naam?: string) => void, withSearch: boolean) => (
    <div>
      <div style={{ position: 'sticky', top: 0, background: TOW.panel, paddingBottom: 10, zIndex: 1 }}>
        {withSearch && (
          <div style={{ position: 'relative', marginBottom: 10 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={TOW.muted} strokeWidth="1.8" style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} aria-hidden="true">
              <circle cx="11" cy="11" r="7" /><line x1="16.5" y1="16.5" x2="21" y2="21" strokeLinecap="round" />
            </svg>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search units…" style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px 10px 32px', borderRadius: 10, border: `1px solid ${TOW.lineStrong}`, background: TOW.cardLt, fontFamily: towFont.serif, fontSize: 14, color: TOW.ink, outline: 'none' }} />
          </div>
        )}
        {!needle && (
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {registerUnits.length > 0 && (() => {
              const on = tab === 'register';
              return <button key="register" onClick={() => setTab('register')} style={{ flex: 1, minWidth: 72, padding: '8px 10px', borderRadius: 9, cursor: 'pointer', fontFamily: towFont.display, fontWeight: on ? 700 : 600, fontSize: 11, letterSpacing: '0.02em', whiteSpace: 'nowrap', border: on ? '1px solid transparent' : `1px solid ${TOW.goldDeep}`, background: on ? goldGrad : 'rgba(138,108,48,0.10)', color: on ? TOW.onGrad : TOW.gold }}>My regiments</button>;
            })()}
            {CATEGORIES.filter((c) => allUnits.some((u) => availableHere(u) && effCatOf(u) === c)).map((c) => {
              const on = tab === c;
              return <button key={c} onClick={() => setTab(c)} style={{ flex: 1, minWidth: 72, padding: '8px 10px', borderRadius: 9, cursor: 'pointer', fontFamily: towFont.display, fontWeight: on ? 700 : 600, fontSize: 11, letterSpacing: '0.02em', whiteSpace: 'nowrap', border: on ? '1px solid transparent' : `1px solid ${TOW.line}`, background: on ? goldGrad : TOW.cardLt, color: on ? TOW.onGrad : TOW.muted }}>{CAT_LABEL[c]}</button>;
            })}
          </div>
        )}
      </div>
      {needle && <div style={{ ...eb, fontSize: 8, color: TOW.muted, margin: '0 2px 8px' }}>{catalogUnits.length} result{catalogUnits.length === 1 ? '' : 's'}</div>}
      {!needle && tab === 'register' && registerUnits.length > 0 && (
        <div>
          <div style={{ fontFamily: towFont.serif, fontStyle: 'italic', fontSize: 11.5, color: TOW.faint, margin: '0 2px 8px' }}>
            Your saved regiments — pick one to field the same veteran again (name included).
          </div>
          {registerUnits.map(({ reg, unit }) => {
            const cat = baseCatOf(unit);
            const inList = list.entries.some((e) => (e.customName ?? '').trim().toLowerCase() === reg.naam.toLowerCase());
            const meta = [`${reg.xp} XP`];
            if (reg.abilities) meta.push(`${reg.abilities} abilit${reg.abilities === 1 ? 'y' : 'ies'}`);
            if (reg.littekens) meta.push(`${reg.littekens} scar${reg.littekens === 1 ? '' : 's'}`);
            return (
              <button key={reg.naam} disabled={inList} onClick={() => onPick(unit, cat, reg.naam)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '12px', borderRadius: 11, marginBottom: 7, border: `1px solid ${TOW.line}`, background: TOW.cardLt, cursor: inList ? 'default' : 'pointer', textAlign: 'left', opacity: inList ? 0.55 : reg.status === 'actief' ? 1 : 0.8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontFamily: towFont.display, fontWeight: 600, fontSize: 14.5, color: TOW.ink }}>{reg.naam}</span>
                    {reg.status !== 'actief' && <span style={{ ...eb, fontSize: 7, color: TOW.muted, border: `1px solid ${TOW.line}`, borderRadius: 99, padding: '2px 6px' }}>RESERVE</span>}
                  </div>
                  <div style={{ fontFamily: towFont.serif, fontSize: 11.5, color: TOW.muted, marginTop: 1 }}>{unit.name_en} · {meta.join(' · ')}</div>
                </div>
                <span style={{ flexShrink: 0, padding: '6px 12px', borderRadius: 8, background: inList ? TOW.cardLt : goldGrad, color: inList ? TOW.muted : TOW.onGrad, border: inList ? `1px solid ${TOW.line}` : 'none', fontFamily: towFont.display, fontWeight: 700, fontSize: 11, letterSpacing: '0.06em' }}>{inList ? 'IN LIST' : 'ADD'}</span>
              </button>
            );
          })}
        </div>
      )}
      {(needle || tab !== 'register') && catalogUnits.map((u) => {
        const cat = baseCatOf(u);
        const n = countInList(u.id);
        const note = unitCompNote(u, list.composition);
        return (
          <button key={u.id} onClick={() => onPick(u, cat)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '12px', borderRadius: 11, marginBottom: 7, border: `1px solid ${TOW.line}`, background: TOW.cardLt, cursor: 'pointer', textAlign: 'left' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontFamily: towFont.display, fontWeight: 600, fontSize: 14.5, color: TOW.ink }}>{u.name_en}</span>
                {n > 0 && <span style={{ ...eb, fontSize: 7, color: TOW.gold, background: 'rgba(138,108,48,0.16)', borderRadius: 99, padding: '2px 6px' }}>{n}</span>}
              </div>
              <div style={{ fontFamily: towFont.serif, fontSize: 11.5, color: TOW.muted, marginTop: 1 }}>{(u.maximum ?? 1) !== 1 ? `${u.points} pts/model` : `${u.points} pts`}</div>
              {note && <div style={{ fontFamily: towFont.serif, fontStyle: 'italic', fontSize: 11, color: TOW.gold, marginTop: 2, whiteSpace: 'normal' }}>{note}</div>}
            </div>
            <span style={{ flexShrink: 0, padding: '6px 12px', borderRadius: 8, background: goldGrad, color: TOW.onGrad, fontFamily: towFont.display, fontWeight: 700, fontSize: 11, letterSpacing: '0.06em' }}>ADD</span>
          </button>
        );
      })}
    </div>
  );

  const ruleName = COMPOSITION_RULES.find((r) => r.id === list.rule)?.name ?? list.rule;
  const headerMeta = `${compName(list.composition)} · ${ruleName} · ${armyName}`;

  // The actual list of composition problems (category caps/minimums, illegal unit sizes, over budget),
  // shown when the player taps the "N to fix" badge — so it points at WHERE the list breaks the rules,
  // not just how many issues there are. The matching compliance bar(s) also turn red.
  const issuesList = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      {v.warnings.map((wn, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontFamily: towFont.serif, fontSize: 12.5, color: TOW.ink, lineHeight: 1.35 }}>
          <span style={{ color: TOW.blood, flexShrink: 0, fontSize: 11, marginTop: 1 }} aria-hidden>▲</span>
          <span>{wn}</span>
        </div>
      ))}
    </div>
  );

  // ── Campagne-balk + "Campaign unlocks"-paneel (De Grensvorsten) ─────────────────────────────────
  // Compacte balk (kleur-dot + speler/fase/cap) met een chevron die een inklapbaar paneel opent: alle
  // roster-opties + tafeltactiek + fase-events. Alleen de puntencap en de wizard-level-bonus worden
  // mechanisch afgedwongen; al het overige draagt het label "table rules — apply at the table".
  const prettyEvent = (id: string) => id.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  const tableRuleTag = <div style={{ ...eb, fontSize: 7.5, color: TOW.faint, marginTop: 3 }}>table rules — apply at the table</div>;
  const unlockRow = (naam: string, level: number, effect: string) => (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
        <span style={{ fontFamily: towFont.serif, fontSize: 12.5, color: TOW.ink, flex: 1 }}>{naam}</span>
        <span style={{ ...eb, fontSize: 7.5, color: TOW.gold, background: 'rgba(138,108,48,0.14)', borderRadius: 99, padding: '2px 6px', flexShrink: 0 }}>Lvl {level}</span>
      </div>
      {effect && <div style={{ fontFamily: towFont.serif, fontSize: 11.5, color: TOW.muted, marginTop: 2, lineHeight: 1.4 }}>{effect}</div>}
    </div>
  );
  // Compositie-pakket van deze fase (uit ctx.compositie → leesbare rule-namen), plus de check of de
  // huidige lijst-rule daar nog binnen valt. Namen via COMPOSITION_RULES; onbekende ids vallen terug.
  const ruleNameOf = (id: string) => COMPOSITION_RULES.find((r) => r.id === id)?.name ?? id;
  const compRules = campaignCtx ? campaignCtx.compositie.filter((id) => COMPOSITION_RULES.some((r) => r.id === id)) : [];
  const compLabel = compRules.map(ruleNameOf).join(' / '); // bv. "Battle March" of "Combined Arms / Grand Melee"
  // Waarschuw alleen als er een compositie-set IS en de lijst-rule er niet in zit (niet auto-wisselen).
  const compMismatch = compRules.length > 0 && !compRules.includes(list.rule);

  const campaignBar = campaignCtx && (
    <div style={{ flexShrink: 0, borderBottom: `1px solid ${TOW.line}`, background: TOW.panel2 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 16px' }}>
        <span style={{ width: 10, height: 10, borderRadius: 99, flexShrink: 0, background: campaignCtx.speler.kleur || TOW.gold, border: `1px solid ${TOW.line}` }} />
        <span style={{ ...eb, fontSize: 8, color: TOW.muted, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          Campaign · {campaignCtx.speler.naam} · Phase {campaignCtx.fase} · {fmt(campaignCtx.puntenCap)} pts{compLabel ? ` · ${compLabel}` : ''}
        </span>
        {capBumped && <span style={{ ...eb, fontSize: 7.5, color: TOW.gold, flexShrink: 0 }}>Phase advanced — cap updated to {fmt(campaignCtx.puntenCap)} pts</span>}
        <button onClick={() => setUnlocksOpen((o) => !o)} aria-expanded={unlocksOpen} aria-label="Campaign unlocks"
          style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 5, border: `1px solid ${TOW.line}`, background: 'transparent', borderRadius: 7, cursor: 'pointer', color: TOW.muted, padding: '3px 8px' }}>
          <span style={{ ...eb, fontSize: 7.5 }}>Unlocks</span>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" style={{ transform: unlocksOpen ? 'rotate(90deg)' : 'none', transition: 'transform .18s ease' }} aria-hidden="true"><path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      </div>
      {/* Fase-compositie is veranderd: de lijst-rule valt buiten de toegestane set. Geen auto-wissel —
          alleen een duidelijke gouden hint om de lijst zelf om te zetten. */}
      {compMismatch && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 16px', borderTop: `1px solid ${TOW.line}`, background: 'rgba(138,108,48,0.10)' }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={TOW.gold} strokeWidth="2" style={{ flexShrink: 0 }} aria-hidden="true"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" strokeLinecap="round" strokeLinejoin="round" /></svg>
          <span style={{ fontFamily: towFont.serif, fontSize: 11.5, color: TOW.goldDeep, fontWeight: 600 }}>Phase composition changed — switch this list to {compLabel}</span>
        </div>
      )}
      {unlocksOpen && (
        <div style={{ padding: '4px 16px 12px', borderTop: `1px solid ${TOW.line}` }}>
          {/* Quartermaster/Armoury-perk: +20 pt magic-item allowance. Informatief — gevonden campagne-
              items (≤30 pt) tellen binnen de normale allowance, niet erbovenop. */}
          {campaignCtx.itemAllowanceBonus > 0 && (
            <div style={{ marginTop: 10, padding: '8px 10px', borderRadius: 8, border: `1px solid ${TOW.goldDeep}`, background: 'rgba(138,108,48,0.10)' }}>
              <span style={{ fontFamily: towFont.serif, fontSize: 11.5, color: TOW.goldDeep, lineHeight: 1.4 }}>
                <span style={{ fontWeight: 700 }}>Quartermaster:</span> +{campaignCtx.itemAllowanceBonus} pts magic item allowance — found campaign items (30 pts or less) count within your allowance.
              </span>
            </div>
          )}
          {campaignCtx.rosterOpties.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div style={{ ...eb, fontSize: 8.5, color: TOW.gold, marginBottom: 7 }}>Perks</div>
              {/* index in de key: een speler kan meerdere exemplaren van hetzelfde gebouw hebben */}
              {campaignCtx.rosterOpties.map((o, i) => <div key={`${o.id}-${i}`}>{unlockRow(o.naam, o.level, o.effect)}</div>)}
              {tableRuleTag}
            </div>
          )}
          {campaignCtx.tafelTactiek.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ ...eb, fontSize: 8.5, color: TOW.gold, marginBottom: 7 }}>Tactics</div>
              {campaignCtx.tafelTactiek.map((o, i) => <div key={`${o.id}-${i}`}>{unlockRow(o.naam, o.level, o.effect)}</div>)}
              {tableRuleTag}
            </div>
          )}
          {campaignCtx.events.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ ...eb, fontSize: 8.5, color: TOW.gold, marginBottom: 7 }}>Phase events</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {campaignCtx.events.map((ev) => <span key={ev.id} style={{ fontFamily: towFont.serif, fontSize: 11.5, padding: '2px 9px', borderRadius: 99, border: `1px solid ${TOW.line}`, background: 'rgba(138,108,48,0.06)', color: TOW.muted }}>{prettyEvent(ev.id)}</span>)}
              </div>
              {tableRuleTag}
            </div>
          )}
        </div>
      )}
    </div>
  );

  // ════════════════════ NAAM-DIALOOG (campagne) — gedeeld door wide + narrow ════════════════════
  // Geopend via de "Name"-knop in de unit-detail-kop; draft + expliciete Save (pas dán toegepast).
  const naamDialoog = (() => {
    if (!naamUid || !list.campaign) return null;
    const e = list.entries.find((x) => x.uid === naamUid);
    const u = e ? getUnit(e.cat, e.unitId) : null;
    if (!e || !u) return null;
    const register = (campaignCtx?.units ?? []).filter((r) => r.naam && (!r.catalogusId || r.catalogusId === u.id));
    const klaar = naamConcept.trim().length > 0;
    const bewaar = () => { if (klaar) { setCustomName(e.uid, naamConcept.trim()); setNaamUid(null); } };
    return (
      <div onClick={() => setNaamUid(null)} style={{ position: 'absolute', inset: 0, zIndex: 70, background: 'rgba(30,20,8,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <div onClick={(ev) => ev.stopPropagation()} style={{ width: '100%', maxWidth: 440, background: TOW.panel, borderRadius: 16, border: `1px solid ${TOW.lineStrong}`, boxShadow: '0 16px 50px rgba(40,24,8,0.34)', padding: 16, animation: 'sheet-pop .18s ease-out' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ ...eb, fontSize: 8, color: TOW.muted }}>Campaign · {u.name_en}</span>
            <button onClick={() => setNaamUid(null)} aria-label="Close" style={{ marginLeft: 'auto', width: 30, height: 30, borderRadius: 8, border: `1px solid ${TOW.line}`, background: TOW.cardLt, cursor: 'pointer', color: TOW.muted, fontSize: 18, lineHeight: 1 }}>×</button>
          </div>
          <div style={{ fontFamily: towFont.display, fontWeight: 700, fontSize: 18, color: TOW.ink, marginBottom: 4 }}>Name this regiment</div>
          <div style={{ fontFamily: towFont.serif, fontSize: 12, color: TOW.muted, marginBottom: 10 }}>Campaign veterans follow this name — XP, abilities and scars stay with it across lists.</div>
          <input
            value={naamConcept}
            onChange={(ev) => setNaamConcept(ev.target.value)}
            onKeyDown={(ev) => { if (ev.key === 'Enter') bewaar(); }}
            placeholder={e.cat === 'characters' ? `e.g. "Aldric the Grim" (${u.name_en})` : `e.g. "The Blackspears" (${u.name_en})`}
            maxLength={40}
            autoFocus
            style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 9, border: `1.5px solid ${klaar ? TOW.lineStrong : TOW.blood}`, background: TOW.cardLt, fontFamily: towFont.serif, fontSize: 14, color: TOW.ink, outline: 'none' }}
          />
          {register.length > 0 && (
            <select
              value=""
              onChange={(ev) => { if (ev.target.value) setNaamConcept(ev.target.value); }}
              style={{ width: '100%', boxSizing: 'border-box', marginTop: 7, padding: '9px 10px', borderRadius: 9, border: `1px solid ${TOW.lineStrong}`, background: TOW.cardLt, fontFamily: towFont.serif, fontSize: 13, color: TOW.ink }}
            >
              <option value="">Pick an existing regiment…</option>
              {register.map((r) => (
                <option key={r.naam} value={r.naam}>
                  {r.naam} · {r.xp} XP{r.abilities ? ` · ${r.abilities} abilit${r.abilities === 1 ? 'y' : 'ies'}` : ''}{r.littekens ? ` · ${r.littekens} scar${r.littekens === 1 ? '' : 's'}` : ''}
                </option>
              ))}
            </select>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8, alignItems: 'center' }}>
            <button onClick={() => rolNamen(u.name_en, e.cat)} style={{ border: `1px solid ${TOW.line}`, background: 'transparent', borderRadius: 7, cursor: 'pointer', color: TOW.goldDeep, padding: '4px 9px', ...eb, fontSize: 7.5 }}>
              {naamSuggesties.length ? 'Reroll names' : 'Suggest names'}
            </button>
            {naamSuggesties.map((n) => (
              <button key={n} onClick={() => setNaamConcept(n)} style={{ border: `1px solid ${TOW.line}`, background: naamConcept === n ? 'rgba(138,108,48,0.2)' : 'rgba(138,108,48,0.08)', borderRadius: 99, cursor: 'pointer', color: TOW.ink, padding: '4px 10px', fontFamily: towFont.serif, fontSize: 11.5 }}>
                {n}
              </button>
            ))}
          </div>
          <button onClick={bewaar} disabled={!klaar} style={{ width: '100%', marginTop: 14, padding: 12, borderRadius: 10, border: 'none', cursor: klaar ? 'pointer' : 'default', background: klaar ? goldGrad : TOW.cardLt, color: klaar ? TOW.onGrad : TOW.muted, fontFamily: towFont.display, fontWeight: 700, fontSize: 14, letterSpacing: '0.04em' }}>
            Save name
          </button>
        </div>
      </div>
    );
  })();

  // ════════════════════ WIDE — three columns ════════════════════
  if (wide) {
    const selEntry = list.entries.find((e) => e.uid === selUid) || null;
    const selUnit = selEntry ? getUnit(selEntry.cat, selEntry.unitId) : null;
    return (
      <div ref={rootRef} style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: TOW.panel, color: TOW.ink, fontFamily: towFont.serif }}>
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 14, padding: '11px 18px', borderBottom: `1px solid ${TOW.lineStrong}`, background: TOW.panel2 }}>
          <button onClick={onBack} aria-label="Back to lists" style={{ height: 34, flexShrink: 0, borderRadius: 9, cursor: 'pointer', border: `1px solid ${TOW.lineStrong}`, background: TOW.cardLt, fontFamily: towFont.display, fontWeight: 600, fontSize: 12.5, color: TOW.inkDim, padding: '0 11px', display: 'inline-flex', alignItems: 'center', gap: 4 }}>‹ Lists</button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: towFont.display, fontWeight: 700, fontSize: 20, color: TOW.ink, lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</div>
            <div style={{ ...eb, fontSize: 8.5, color: TOW.muted, marginTop: 3 }}>{headerMeta} · {fmt(list.points)} pts</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: towFont.display, fontWeight: 700, fontSize: 24, color: overBudget ? TOW.blood : TOW.ink, lineHeight: 1 }}>{fmt(v.total)}<span style={{ fontSize: 14, color: TOW.muted, fontWeight: 600 }}> / {fmt(list.points)}</span></div>
            <button onClick={() => { if (v.warnings.length) { setSettings(false); setShowIssues((s) => !s); } }} style={{ ...eb, display: 'inline-block', fontSize: 8, color: v.warnings.length ? TOW.blood : '#4f6b3a', marginTop: 4, background: 'none', border: 'none', padding: 0, cursor: v.warnings.length ? 'pointer' : 'default' }}>{v.warnings.length ? `${v.warnings.length} to fix ${showIssues ? '▴' : '▾'}` : '✓ Legal list'}</button>
          </div>
          <button onClick={() => setSettings((s) => !s)} aria-label="List settings" style={{ width: 36, height: 36, flexShrink: 0, borderRadius: 9, cursor: 'pointer', border: `1px solid ${settings ? TOW.goldDeep : TOW.lineStrong}`, background: settings ? 'rgba(138,108,48,0.12)' : TOW.cardLt, color: TOW.inkDim, fontSize: 16 }}>⚙</button>
        </div>

        {campaignBar}

        {settings && (
          <>
            <div onClick={() => setSettings(false)} style={{ position: 'absolute', inset: 0, zIndex: 40 }} />
            <div style={{ position: 'absolute', top: 60, right: 16, zIndex: 41, width: 300, background: TOW.panel, borderRadius: 14, border: `1px solid ${TOW.lineStrong}`, boxShadow: '0 14px 40px rgba(40,24,8,0.26)', padding: 16 }}>
              <div style={{ ...eb, fontSize: 8.5, color: TOW.muted, marginBottom: 6 }}>List name</div>
              <input value={name} onChange={(e) => onSetName(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', padding: '9px 11px', borderRadius: 9, border: `1px solid ${TOW.lineStrong}`, background: TOW.cardLt, fontFamily: towFont.display, fontWeight: 600, fontSize: 15, color: TOW.ink, outline: 'none' }} />
              <div style={{ ...eb, fontSize: 8.5, color: TOW.muted, margin: '16px 0 7px' }}>Points limit</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {POINT_PRESETS.map((t) => { const on = list.points === t; return <button key={t} onClick={() => onUpdate(() => ({ points: t }))} style={{ flex: '1 1 28%', minWidth: 44, padding: '9px 2px', borderRadius: 8, border: `1px solid ${on ? TOW.goldDeep : TOW.line}`, cursor: 'pointer', fontFamily: towFont.display, fontWeight: 600, fontSize: 12.5, background: on ? 'rgba(138,108,48,0.14)' : TOW.cardLt, color: on ? TOW.gold : TOW.muted }}>{t}</button>; })}
              </div>
              <input type="number" inputMode="numeric" min={0} step={50} value={list.points} onChange={(e) => onUpdate(() => ({ points: Math.max(0, Math.floor(Number(e.target.value) || 0)) }))} aria-label="Custom points" style={{ width: '100%', boxSizing: 'border-box', marginTop: 7, padding: '9px 11px', borderRadius: 9, border: `1px solid ${TOW.lineStrong}`, background: TOW.cardLt, fontFamily: towFont.display, fontWeight: 600, fontSize: 14, color: TOW.ink, outline: 'none' }} />
              <div style={{ ...eb, fontSize: 8.5, color: TOW.muted, margin: '16px 0 7px' }}>Composition</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <select value={list.composition} onChange={(e) => onUpdate(() => ({ composition: e.target.value }))} style={{ flex: 1, minWidth: 0, boxSizing: 'border-box', padding: '9px 11px', borderRadius: 9, border: `1px solid ${TOW.line}`, background: TOW.cardLt, fontFamily: towFont.serif, fontSize: 14, color: TOW.ink }}>
                  {comps.map((c) => <option key={c} value={c}>{compName(c)}</option>)}
                </select>
                <Eye title="Composition rules (tow.whfb.app)" onClick={openCompositionRules} />
              </div>
              <div style={{ ...eb, fontSize: 8.5, color: TOW.muted, margin: '14px 0 7px' }}>Composition rule</div>
              <CompositionRulePicker value={list.rule} onChange={(id) => onUpdate(() => ({ rule: id }))} onInfo={setCompInfo} fieldStyle={{ width: '100%', boxSizing: 'border-box', padding: '9px 11px', borderRadius: 9, border: `1px solid ${TOW.line}`, background: TOW.cardLt, fontFamily: towFont.serif, fontSize: 14, color: TOW.ink }} />
            </div>
          </>
        )}

        {showIssues && v.warnings.length > 0 && (
          <>
            <div onClick={() => setShowIssues(false)} style={{ position: 'absolute', inset: 0, zIndex: 40 }} />
            <div style={{ position: 'absolute', top: 60, right: 60, zIndex: 41, width: 330, maxHeight: 380, overflowY: 'auto', background: TOW.panel, borderRadius: 14, border: `1px solid rgba(124,43,34,0.45)`, boxShadow: '0 14px 40px rgba(40,24,8,0.26)', padding: 16 }}>
              <div style={{ ...eb, fontSize: 8.5, color: TOW.blood, marginBottom: 11 }}>{v.warnings.length} thing{v.warnings.length === 1 ? '' : 's'} to fix</div>
              {issuesList}
            </div>
          </>
        )}

        <div style={{ flex: 1, minHeight: 0, display: 'flex', justifyContent: 'center', overflow: 'hidden' }}>
        <div style={{ flex: 1, maxWidth: 1320, minHeight: 0, display: 'grid', gridTemplateColumns: '296px minmax(0,1fr) 452px' }}>
          {/* catalogue */}
          <div style={{ borderRight: `1px solid ${TOW.line}`, display: 'flex', flexDirection: 'column', minHeight: 0, background: TOW.panel }}>
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '12px 12px 16px' }}>
              {picker((u, cat, naam) => { const id = add(cat, u); if (naam) setCustomName(id, naam); setSelUid(id); }, true)}
            </div>
          </div>
          {/* muster */}
          <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, background: 'rgba(255,255,255,0.18)' }}>
            <div style={{ flexShrink: 0, padding: '13px 22px 12px', borderBottom: `1px solid ${TOW.line}`, background: TOW.panel }}>
              <div style={{ ...eb, fontSize: 9, color: TOW.gold, marginBottom: 9 }}>Composition · {list.entries.length} unit{list.entries.length === 1 ? '' : 's'}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0 24px' }}>{comp.map((c) => <CompBar key={c.cat} c={c} compact />)}</div>
            </div>
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '16px 22px 30px' }}>
              {list.entries.length === 0 && <div style={{ textAlign: 'center', padding: '70px 20px', fontFamily: towFont.serif, fontStyle: 'italic', fontSize: 15, color: TOW.muted }}><div style={{ marginBottom: 14 }}><Ornament /></div>Add units from the left to begin your muster.</div>}
              {grouped.map((g) => (
                <div key={g.c} style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', margin: '0 2px 8px' }}>
                    <span style={{ ...eb, fontSize: 9, color: TOW.gold }}>{CAT_LABEL[g.c]}</span>
                    {compByCat[g.c] && <span style={{ ...eb, fontSize: 8.5, color: compByCat[g.c]!.ok ? TOW.muted : TOW.blood }}>{fmt(compByCat[g.c]!.value)} <span style={{ color: TOW.faint }}>{compByCat[g.c]!.kind === 'min' ? '≥' : '≤'} {fmt(compByCat[g.c]!.limit)}</span></span>}
                  </div>
                  {g.items.map((e) => { const u = getUnit(e.cat, e.unitId); return u ? rosterRow(e, u, e.uid === selUid, () => setSelUid(e.uid)) : null; })}
                </div>
              ))}
            </div>
          </div>
          {/* detail */}
          <div style={{ borderLeft: `1px solid ${TOW.line}`, display: 'flex', flexDirection: 'column', minHeight: 0, background: TOW.panel2 }}>
            {!selUnit || !selEntry ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 30, textAlign: 'center', fontFamily: towFont.serif, fontStyle: 'italic', fontSize: 14, color: TOW.muted }}><div style={{ marginBottom: 14 }}><Ornament /></div>Select a unit to equip it.</div>
            ) : (
              <>
                <div style={{ flexShrink: 0, padding: '14px 16px 12px', borderBottom: `1px solid ${TOW.line}` }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 11 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: towFont.display, fontWeight: 700, fontSize: 17, color: TOW.ink, lineHeight: 1.1 }}>{selEntry.customName || selUnit.name_en}</div>
                      <div style={{ ...eb, fontSize: 8, color: TOW.muted, marginTop: 3 }}>{selEntry.customName ? `${selUnit.name_en} · ` : ''}{fmt(entryPoints(selUnit, selEntry, itemsData))} pts · {CAT_LABEL[effCatOf(selUnit)]}</div>
                    </div>
                    {list.campaign && (
                      <NaamKnop genoemd={!!(selEntry.customName ?? '').trim()} onClick={() => openNaamDialoog(selEntry.uid, selUnit.name_en, selEntry.customName ?? '', selEntry.cat)} />
                    )}
                  </div>
                  {list.campaign && !(selEntry.customName ?? '').trim() && (
                    <div style={{ ...eb, fontSize: 8, color: TOW.blood, margin: '-5px 0 10px' }}>Unit name required — campaign veterans follow this name</div>
                  )}
                  {(() => {
                    const effective = riderProfileFor(selUnit, selEntry);
                    return <MiniProfile rows={effective.rows} modifiers={effective.modifiers} />;
                  })()}
                  {((selUnit.maximum ?? 1) !== 1 || (selUnit.minimum ?? 1) > 1) && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, padding: '8px 11px', borderRadius: 9, background: TOW.cardLt, border: `1px solid ${TOW.line}` }}>
                      <span style={{ ...eb, fontSize: 8.5, color: TOW.muted }}>Models · {selUnit.minimum ?? 1}{selUnit.maximum ? `–${selUnit.maximum}` : '+'}</span>
                      <Stepper value={selEntry.count} min={selUnit.minimum ?? 1} max={(selUnit.maximum ?? 0) === 0 ? 9999 : selUnit.maximum!} onChange={(c) => setCount(selEntry.uid, c)} sm />
                    </div>
                  )}
                </div>
                <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '14px 16px 20px' }}>
                  {(() => { const rs = (selUnit.specialRules?.name_en || '').split(',').map((s) => s.trim()).filter(Boolean); return rs.length ? <div style={{ marginBottom: 14 }}><div style={{ ...eb, fontSize: 8.5, color: TOW.muted, marginBottom: 7 }}>Special rules</div>{rules_(rs)}</div> : null; })()}
                  {optionEditor(selEntry, selUnit)}
                </div>
                <div style={{ flexShrink: 0, display: 'flex', gap: 8, padding: '11px 16px', borderTop: `1px solid ${TOW.line}`, background: TOW.panel }}>
                  <button onClick={() => { const id = dup(selEntry.uid); setSelUid(id); }} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '10px', borderRadius: 9, cursor: 'pointer', border: `1px solid ${TOW.lineStrong}`, background: TOW.cardLt, color: TOW.inkDim, fontFamily: towFont.display, fontWeight: 600, fontSize: 12, letterSpacing: '0.04em' }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>
                    Duplicate
                  </button>
                  <button onClick={() => removeE(selEntry.uid)} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '10px', borderRadius: 9, cursor: 'pointer', border: `1px solid rgba(124,43,34,0.4)`, background: 'transparent', color: TOW.blood, fontFamily: towFont.display, fontWeight: 600, fontSize: 12, letterSpacing: '0.04em' }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M4 7h16" strokeLinecap="round" /><path d="M9 7V4h6v3" /><path d="M6 7l1 13h10l1-13" /></svg>
                    Remove
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
        </div>
        {info && <InfoPopup info={info} onClose={() => setInfo(null)} onOpenRule={(s) => { setInfo(null); openRule(s); }} />}
        <CompositionInfo ruleId={compInfo} onClose={() => setCompInfo(null)} />
        {naamDialoog}
      </div>
    );
  }

  // ════════════════════ NARROW — mobile flow ════════════════════
  const editEntry = sheet && typeof sheet === 'object' ? list.entries.find((e) => e.uid === sheet.edit) || null : null;
  const editUnit = editEntry ? getUnit(editEntry.cat, editEntry.unitId) : null;
  return (
    <div ref={rootRef} style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: TOW.panel, color: TOW.ink, fontFamily: towFont.serif, overflow: 'hidden' }}>
      {/* header */}
      <div style={{ flexShrink: 0, padding: '12px 16px 12px', borderBottom: `1px solid ${TOW.lineStrong}`, background: TOW.panel2 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={onBack} aria-label="Back to lists" style={{ height: 30, flexShrink: 0, borderRadius: 8, border: `1px solid ${TOW.line}`, background: TOW.cardLt, cursor: 'pointer', fontFamily: towFont.display, fontWeight: 600, fontSize: 12, color: TOW.inkDim, padding: '0 10px', display: 'inline-flex', alignItems: 'center', gap: 4 }}>‹ Lists</button>
          <input value={name} onChange={(e) => onSetName(e.target.value)} aria-label="List name" style={{ flex: 1, minWidth: 0, fontFamily: towFont.display, fontWeight: 700, fontSize: 17, color: TOW.ink, background: 'transparent', border: 'none', borderBottom: `1px dashed ${TOW.line}`, padding: '2px 0' }} />
          <button onClick={() => setSettings(true)} aria-label="List settings" style={{ width: 30, height: 30, flexShrink: 0, borderRadius: 8, border: `1px solid ${TOW.line}`, background: TOW.cardLt, cursor: 'pointer', fontSize: 14, color: TOW.inkDim }}>⚙</button>
        </div>
        <div style={{ ...eb, fontSize: 8, color: TOW.muted, marginTop: 8 }}>{headerMeta}</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, marginTop: 3 }}>
          <div style={{ flex: 1, fontFamily: towFont.display, fontWeight: 700, fontSize: 26, color: overBudget ? TOW.blood : TOW.ink, lineHeight: 1 }}>{fmt(v.total)}<span style={{ fontSize: 13, color: TOW.muted, fontWeight: 600 }}> / {fmt(list.points)}</span></div>
          <button onClick={() => { if (v.warnings.length) setShowIssues((s) => !s); }} style={{ ...eb, fontSize: 8, color: v.warnings.length ? TOW.blood : '#4f6b3a', padding: '4px 9px', borderRadius: 99, cursor: v.warnings.length ? 'pointer' : 'default', background: 'none', border: `1px solid ${v.warnings.length ? 'rgba(124,43,34,0.4)' : 'rgba(79,107,58,0.4)'}` }}>{v.warnings.length ? `${v.warnings.length} to fix ${showIssues ? '▴' : '▾'}` : '✓ Legal'}</button>
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 11 }}>
          {comp.map((c) => {
            const denom = c.kind === 'min' ? Math.max(c.limit, c.value, 1) : Math.max(c.limit, 1);
            return (
              <div key={c.cat} style={{ flex: 1 }}>
                <div style={{ height: 4, borderRadius: 99, background: 'rgba(74,55,22,0.12)', overflow: 'hidden' }}><div style={{ width: Math.min(100, (c.value / denom) * 100) + '%', height: '100%', background: c.ok ? TOW.goldDeep : TOW.blood }} /></div>
                <div style={{ ...eb, fontSize: 6.5, color: c.ok ? TOW.muted : TOW.blood, marginTop: 4, textAlign: 'center' }}>{c.label}</div>
              </div>
            );
          })}
        </div>
        {showIssues && v.warnings.length > 0 && (
          <div style={{ marginTop: 11, padding: '11px 13px', borderRadius: 11, border: `1px solid rgba(124,43,34,0.35)`, background: 'rgba(124,43,34,0.06)' }}>
            {issuesList}
          </div>
        )}
      </div>

      {campaignBar}

      {/* roster */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '12px 14px 14px' }}>
        {list.entries.length === 0 && <div style={{ textAlign: 'center', padding: '54px 16px', fontFamily: towFont.serif, fontStyle: 'italic', fontSize: 14.5, color: TOW.muted }}><div style={{ marginBottom: 14 }}><Ornament /></div>Tap “Add unit” to begin.</div>}
        {grouped.map((g) => (
          <div key={g.c} style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', margin: '0 2px 7px' }}>
              <span style={{ ...eb, fontSize: 8.5, color: TOW.gold }}>{CAT_LABEL[g.c]}</span>
              {compByCat[g.c] && <span style={{ ...eb, fontSize: 8, color: compByCat[g.c]!.ok ? TOW.muted : TOW.blood }}>{fmt(compByCat[g.c]!.value)} pts</span>}
            </div>
            {g.items.map((e) => { const u = getUnit(e.cat, e.unitId); return u ? rosterRow(e, u, false, () => setSheet({ edit: e.uid })) : null; })}
          </div>
        ))}
      </div>

      {/* add bar */}
      <div style={{ flexShrink: 0, padding: '10px 14px', borderTop: `1px solid ${TOW.lineStrong}`, background: TOW.panel2 }}>
        <button onClick={() => setSheet('pick')} style={{ width: '100%', padding: 14, borderRadius: 12, border: 'none', cursor: 'pointer', background: goldGrad, color: TOW.onGrad, fontFamily: towFont.display, fontWeight: 700, fontSize: 14, letterSpacing: '0.04em' }}>＋ Add unit</button>
      </div>

      {/* picker sheet */}
      {sheet === 'pick' && (
        <Sheet title="Add a unit" sub="Search or browse" onClose={() => setSheet(null)}>
          {picker((u, cat, naam) => { const id = add(cat, u); if (naam) setCustomName(id, naam); setSheet({ edit: id }); }, true)}
        </Sheet>
      )}

      {/* editor sheet */}
      {editEntry && editUnit && (
        <Sheet title={editEntry.customName || editUnit.name_en} sub={`${editEntry.customName ? `${editUnit.name_en} · ` : ''}${fmt(entryPoints(editUnit, editEntry, itemsData))} pts · ${CAT_LABEL[effCatOf(editUnit)]}`} onClose={() => setSheet(null)}
          headerExtra={list.campaign ? <NaamKnop genoemd={!!(editEntry.customName ?? '').trim()} onClick={() => openNaamDialoog(editEntry.uid, editUnit.name_en, editEntry.customName ?? '', editEntry.cat)} /> : undefined}
          foot={<button onClick={() => { removeE(editEntry.uid); setSheet(null); }} style={{ width: '100%', padding: 12, borderRadius: 10, border: `1px solid rgba(124,43,34,0.4)`, background: 'transparent', color: TOW.blood, cursor: 'pointer', fontFamily: towFont.display, fontWeight: 600, fontSize: 13, letterSpacing: '0.04em' }}>Remove from list</button>}>
          <div style={{ marginBottom: 14 }}>
            {(() => {
              const effective = riderProfileFor(editUnit, editEntry);
              return <MiniProfile rows={effective.rows} modifiers={effective.modifiers} />;
            })()}
          </div>
          {((editUnit.maximum ?? 1) !== 1 || (editUnit.minimum ?? 1) > 1) && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, padding: '10px 13px', borderRadius: 10, background: TOW.cardLt, border: `1px solid ${TOW.line}` }}>
              <span style={{ ...eb, fontSize: 9, color: TOW.muted }}>Models · {editUnit.minimum ?? 1}{editUnit.maximum ? `–${editUnit.maximum}` : '+'}</span>
              <Stepper value={editEntry.count} min={editUnit.minimum ?? 1} max={(editUnit.maximum ?? 0) === 0 ? 9999 : editUnit.maximum!} onChange={(c) => setCount(editEntry.uid, c)} />
            </div>
          )}
          {(() => { const rs = (editUnit.specialRules?.name_en || '').split(',').map((s) => s.trim()).filter(Boolean); return rs.length ? <div style={{ marginBottom: 16 }}><div style={{ ...eb, fontSize: 8.5, color: TOW.muted, marginBottom: 7 }}>Special rules</div>{rules_(rs)}</div> : null; })()}
          {optionEditor(editEntry, editUnit)}
        </Sheet>
      )}
      {/* settings sheet (mobile) */}
      {settings && (
        <Sheet title="List settings" sub="Edit this list" onClose={() => setSettings(false)}>
          <div style={{ ...eb, fontSize: 8.5, color: TOW.muted, marginBottom: 6 }}>List name</div>
          <input value={name} onChange={(e) => onSetName(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 9, border: `1px solid ${TOW.lineStrong}`, background: TOW.cardLt, fontFamily: towFont.display, fontWeight: 600, fontSize: 15, color: TOW.ink, outline: 'none' }} />
          <div style={{ ...eb, fontSize: 8.5, color: TOW.muted, margin: '16px 0 7px' }}>Points limit</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {POINT_PRESETS.map((t) => { const on = list.points === t; return <button key={t} onClick={() => onUpdate(() => ({ points: t }))} style={{ flex: '1 1 28%', minWidth: 46, padding: '10px 2px', borderRadius: 8, border: `1px solid ${on ? TOW.goldDeep : TOW.line}`, cursor: 'pointer', fontFamily: towFont.display, fontWeight: 600, fontSize: 13, background: on ? 'rgba(138,108,48,0.14)' : TOW.cardLt, color: on ? TOW.gold : TOW.muted }}>{t}</button>; })}
          </div>
          <input type="number" inputMode="numeric" min={0} step={50} value={list.points} onChange={(e) => onUpdate(() => ({ points: Math.max(0, Math.floor(Number(e.target.value) || 0)) }))} aria-label="Custom points" style={{ width: '100%', boxSizing: 'border-box', marginTop: 7, padding: '10px 12px', borderRadius: 9, border: `1px solid ${TOW.lineStrong}`, background: TOW.cardLt, fontFamily: towFont.display, fontWeight: 600, fontSize: 14, color: TOW.ink, outline: 'none' }} />
          <div style={{ ...eb, fontSize: 8.5, color: TOW.muted, margin: '16px 0 7px' }}>Composition</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select value={list.composition} onChange={(e) => onUpdate(() => ({ composition: e.target.value }))} style={{ flex: 1, minWidth: 0, boxSizing: 'border-box', padding: '10px 12px', borderRadius: 9, border: `1px solid ${TOW.line}`, background: TOW.cardLt, fontFamily: towFont.serif, fontSize: 14, color: TOW.ink }}>
              {comps.map((c) => <option key={c} value={c}>{compName(c)}</option>)}
            </select>
            <Eye title="Composition rules (tow.whfb.app)" onClick={openCompositionRules} />
          </div>
          <div style={{ ...eb, fontSize: 8.5, color: TOW.muted, margin: '14px 0 7px' }}>Composition rule</div>
          <CompositionRulePicker value={list.rule} onChange={(id) => onUpdate(() => ({ rule: id }))} onInfo={setCompInfo} fieldStyle={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 9, border: `1px solid ${TOW.line}`, background: TOW.cardLt, fontFamily: towFont.serif, fontSize: 14, color: TOW.ink }} />
        </Sheet>
      )}
      {info && <InfoPopup info={info} onClose={() => setInfo(null)} onOpenRule={(s) => { setInfo(null); openRule(s); }} />}
      {naamDialoog}
    </div>
  );
}

// De "Name"-knop in de unit-detail-kop (naast het sluitkruisje) — alleen campagne-lijsten.
// Rood zolang de unit naamloos is (naam is verplicht), goud zodra hij een naam heeft.
function NaamKnop({ genoemd, onClick }: { genoemd: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{ height: 32, flexShrink: 0, borderRadius: 8, cursor: 'pointer', padding: '0 11px', ...eb, fontSize: 8, letterSpacing: '0.08em', border: `1px solid ${genoemd ? TOW.goldDeep : 'rgba(124,43,34,0.55)'}`, background: genoemd ? 'rgba(138,108,48,0.14)' : 'rgba(124,43,34,0.14)', color: genoemd ? TOW.gold : TOW.blood }}
    >
      Name
    </button>
  );
}

// A small centred popup. Shows a mount/unit stat profile (rows) for options without a rule page, or
// — when `rows` is empty and a `note` is given — a single muted italic meta line (e.g. magic items,
// which have no verbatim rule text in our data: name + "Magic item · <category> · <pts> pts").
function InfoPopup({ info, onClose, onOpenRule }: { info: { title: string; rows: StatRow[]; note?: string; ruleSlug?: string; flavour?: string; body?: string; ruleChips?: { name: string; slug: string | null }[]; chipsLabel?: string }; onClose: () => void; onOpenRule?: (slug: string) => void }) {
  const showNote = info.rows.length === 0 && !!info.note;
  return (
    <div onClick={onClose} style={{ position: 'absolute', inset: 0, zIndex: 60, background: 'rgba(30,20,8,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 460, background: TOW.panel, borderRadius: 16, border: `1px solid ${TOW.lineStrong}`, boxShadow: '0 16px 50px rgba(40,24,8,0.34)', padding: 16, animation: 'sheet-pop .18s ease-out' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ ...eb, fontSize: 8, color: TOW.muted }}>{showNote ? 'Item' : 'Profile'}</span>
          <button onClick={onClose} aria-label="Close" style={{ marginLeft: 'auto', width: 30, height: 30, borderRadius: 8, border: `1px solid ${TOW.line}`, background: TOW.cardLt, cursor: 'pointer', color: TOW.muted, fontSize: 18, lineHeight: 1 }}>×</button>
        </div>
        <div style={{ fontFamily: towFont.display, fontWeight: 700, fontSize: 18, color: TOW.ink, marginBottom: 10 }}>{info.title}</div>
        {showNote
          ? <div style={{ ...eb, fontSize: 8.5, color: TOW.muted, marginBottom: info.flavour || info.body ? 10 : 0 }}>{info.note}</div>
          : <MiniProfile rows={info.rows} />}
        {info.flavour && <div style={{ fontFamily: towFont.serif, fontStyle: 'italic', fontSize: 13, color: TOW.muted, lineHeight: 1.5, marginBottom: info.body ? 9 : 0 }}>{info.flavour}</div>}
        {info.body && <div style={{ fontFamily: towFont.serif, fontSize: 13.5, color: TOW.ink, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{info.body}</div>}
        {info.ruleChips && info.ruleChips.length > 0 && (
          <>
            <div style={{ ...eb, fontSize: 8.5, color: TOW.muted, margin: (info.rows.length || info.note ? 12 : 0) + 'px 0 7px' }}>{info.chipsLabel ?? 'Special rules'}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {info.ruleChips.map((c, i) => (c.slug && onOpenRule
                ? <button key={i} onClick={() => onOpenRule(c.slug!)} style={{ fontFamily: towFont.serif, fontSize: 12, padding: '3px 10px', borderRadius: 99, border: `1px solid ${TOW.goldDeep}`, background: 'rgba(138,108,48,0.10)', color: TOW.goldDeep, cursor: 'pointer' }}>{c.name}</button>
                : <span key={i} style={{ fontFamily: towFont.serif, fontSize: 12, padding: '3px 10px', borderRadius: 99, border: `1px solid ${TOW.line}`, background: 'transparent', color: TOW.muted }}>{c.name}</span>))}
            </div>
          </>
        )}
        {info.ruleSlug && onOpenRule && (
          <button onClick={() => onOpenRule(info.ruleSlug!)} style={{ marginTop: 14, display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 13px', borderRadius: 9, cursor: 'pointer', border: `1px solid ${TOW.goldDeep}`, background: 'rgba(138,108,48,0.10)', color: TOW.goldDeep, fontFamily: towFont.display, fontWeight: 600, fontSize: 12.5 }}>
            Full rune rules →
          </button>
        )}
      </div>
      <style>{`@keyframes sheet-pop { from { opacity: 0; transform: translateY(8px) scale(0.98); } to { opacity: 1; transform: none; } }`}</style>
    </div>
  );
}

// bottom sheet (mobile)
function Sheet({ title, sub, onClose, foot, headerExtra, children }: { title: string; sub?: string; onClose: () => void; foot?: React.ReactNode; headerExtra?: React.ReactNode; children: React.ReactNode }) {
  const { handleProps, sheetStyle } = useSwipeToDismiss(onClose);
  return (
    <div onClick={onClose} style={{ position: 'absolute', inset: 0, zIndex: 50, background: 'rgba(30,20,8,0.42)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', height: '92%', display: 'flex', flexDirection: 'column', background: TOW.panel, borderTopLeftRadius: 22, borderTopRightRadius: 22, border: `1px solid ${TOW.lineStrong}`, boxShadow: '0 -16px 50px rgba(40,24,8,0.34)', animation: 'sheet-up .26s cubic-bezier(.2,.8,.25,1) both', ...sheetStyle }}>
        <div {...handleProps} style={{ flexShrink: 0, padding: '10px 16px 12px', borderBottom: `1px solid ${TOW.line}`, touchAction: 'none' }}>
          <div style={{ width: 40, height: 4, borderRadius: 99, background: TOW.lineStrong, margin: '0 auto 12px', opacity: 0.7 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              {sub && <div style={{ ...eb, fontSize: 8, color: TOW.muted }}>{sub}</div>}
              <div style={{ fontFamily: towFont.display, fontWeight: 700, fontSize: 19, color: TOW.ink, lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>
            </div>
            {headerExtra}
            <button onClick={onClose} aria-label="Close" style={{ width: 32, height: 32, flexShrink: 0, borderRadius: 8, border: `1px solid ${TOW.line}`, background: TOW.cardLt, cursor: 'pointer', color: TOW.muted, fontSize: 20, lineHeight: 1 }}>×</button>
          </div>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '14px 16px 18px' }}>{children}</div>
        {foot && <div style={{ flexShrink: 0, padding: '10px 16px', borderTop: `1px solid ${TOW.line}`, background: TOW.panel2 }}>{foot}</div>}
      </div>
      <style>{`@keyframes sheet-up { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>
    </div>
  );
}
