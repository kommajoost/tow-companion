import { useEffect, useMemo, useState } from 'react';
import { usePersistentState } from '../../store';
import { TOW, towFont, engraved } from '../../design/tow';
import { validate, type Category, type OwbArmy, type OwbUnit, type BuilderList, type MagicItemsData } from '../../lib/owbBuilder';
import { listTotal } from '../../lib/builderToArmy';
import { compName } from '../../lib/armies';
import { BuilderWorkspace } from './BuilderWorkspace';
import { NewListSetup, type NewListValues } from './NewListSetup';
import { useBackClose } from '../../lib/backStack';
import {
  getCampaignCode, getCachedCampaign, versCampagneContext, cacheCampaignContext,
  hernoemRegiment, verwijderRegiment, regimentSlug, type CampaignContext,
} from '../../lib/campaign';

const BASE = import.meta.env.BASE_URL;
const eb = engraved as React.CSSProperties;
const goldGrad = `linear-gradient(180deg, ${TOW.goldBright} 0%, ${TOW.gold} 55%, ${TOW.goldDeep} 100%)`;

// Multi-army list builder. This file owns the army registry (index.json), each army's composition +
// item-list metadata (the-old-world.json), an on-demand per-army catalogue cache, and the "My lists"
// collection (saved locally). The open list is edited in the responsive <BuilderWorkspace> (Claude
// Design's PC-columns / mobile-sheets builder on our OWB data); each list carries its own army.
const FALLBACK_ARMY = 'dark-elves';

interface SavedList extends BuilderList {
  id: string; name: string; army: string; createdAt: number; updatedAt: number; groupId?: string | null;
  // Campagne-koppeling (De Grensvorsten) — optioneel, zodat bestaande opgeslagen lijsten geldig blijven
  // en de list-sync (jsonb) deze velden vanzelf meeneemt.
  campaign?: boolean; campaignSpeler?: string; campaignNaam?: string; campaignFase?: number;
  /** Campagne: de BEREKENDE puntensom van deze lijst (incl. magic items). `points` is alleen het
   *  DOEL (de fase-cap waarop de lijst is aangemaakt); de campagne heeft de echte som nodig om te
   *  toetsen of de lijst binnen 500 + 250×(Act−1) blijft. Alleen gezet voor campagne-lijsten, en
   *  alleen als de som betrouwbaar te berekenen is (zie het effect in ListBuilder). */
  computedPoints?: number;
}
const newId = (p: string) => `${p}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;

// ── My regiments — het campagne-register onder "My lists" ────────────────────────────────────────
// Overzicht van je named units (veteranen): hernoemen (XP reist mee) of definitief verwijderen
// (extra bevestiging — XP/abilities gaan verloren). Beide acties werken server-side door in de
// cloud-lijsten; lokale lijsten worden hier direct gelijkgetrokken zodat sync niets herschept.
function RegimentenPaneel({ onClose, setLists }: {
  onClose: () => void;
  setLists: (fn: (ls: SavedList[]) => SavedList[]) => void;
}) {
  const code = getCampaignCode();
  const [ctx, setCtx] = useState<CampaignContext | null>(() => getCachedCampaign()?.context ?? null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);   // slug van de unit in hernoem-modus
  const [editNaam, setEditNaam] = useState('');
  const [delId, setDelId] = useState<string | null>(null);     // slug van de unit in delete-bevestiging

  useEffect(() => {
    if (!code) return;
    versCampagneContext(code).then((f) => { setCtx(f); cacheCampaignContext(f); }).catch(() => {});
  }, [code]);

  const vernieuw = async () => {
    if (!code) return;
    try { const f = await versCampagneContext(code); setCtx(f); cacheCampaignContext(f); } catch { /* cache blijft */ }
  };
  const meldFout = (e: unknown) => {
    const m = e instanceof Error ? e.message : '';
    setErr(m === 'NAAM_BESTAAT_AL' ? 'That name is already taken by another regiment.'
      : m === 'NIET_GEVONDEN' ? 'Regiment not found — refresh and try again.'
      : 'Could not update — check your connection.');
  };
  // Lokale lijsten gelijktrekken: nieuwe naam invullen, of (naam=null) de naam strippen.
  const werkLijstenBij = (unitId: string, naam: string | null) => setLists((ls) => ls.map((l) => {
    if (!l.campaign || !Array.isArray(l.entries)) return l;
    return { ...l, entries: l.entries.map((e) => (regimentSlug(e.customName ?? '') === unitId ? { ...e, customName: naam ?? undefined } : e)) };
  }));

  const hernoem = async (unitId: string) => {
    const naam = editNaam.trim();
    if (!code || !naam || busy) return;
    setBusy(true); setErr(null);
    try {
      const res = await hernoemRegiment(code, unitId, naam);
      werkLijstenBij(unitId, res.naam);
      setEditId(null);
      await vernieuw();
    } catch (e) { meldFout(e); } finally { setBusy(false); }
  };
  const verwijder = async (unitId: string) => {
    if (!code || busy) return;
    setBusy(true); setErr(null);
    try {
      await verwijderRegiment(code, unitId);
      werkLijstenBij(unitId, null);
      setDelId(null);
      await vernieuw();
    } catch (e) { meldFout(e); } finally { setBusy(false); }
  };

  const typeNaam = (id?: string | null) => (id ? id.split('-').map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(' ') : null);
  const units = ctx?.units ?? [];

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(30,20,8,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 480, maxHeight: '86%', display: 'flex', flexDirection: 'column', background: TOW.panel, borderRadius: 16, border: `1px solid ${TOW.lineStrong}`, boxShadow: '0 16px 50px rgba(40,24,8,0.34)', animation: 'sheet-pop .18s ease-out' }}>
        <div style={{ flexShrink: 0, padding: '14px 16px 10px', borderBottom: `1px solid ${TOW.line}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ ...eb, fontSize: 8, color: TOW.muted }}>Campaign</div>
              <div style={{ fontFamily: towFont.display, fontWeight: 700, fontSize: 19, color: TOW.ink }}>My regiments</div>
            </div>
            <button onClick={onClose} aria-label="Close" style={{ width: 32, height: 32, flexShrink: 0, borderRadius: 8, border: `1px solid ${TOW.line}`, background: TOW.cardLt, cursor: 'pointer', color: TOW.muted, fontSize: 20, lineHeight: 1 }}>×</button>
          </div>
          <div style={{ fontFamily: towFont.serif, fontSize: 11.5, color: TOW.muted, marginTop: 2 }}>Your named campaign units. Renaming keeps XP; deleting is forever.</div>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '12px 16px 16px' }}>
          {err && <div style={{ fontFamily: towFont.serif, fontSize: 12, color: TOW.blood, marginBottom: 8 }}>{err}</div>}
          {units.length === 0 ? (
            <p style={{ fontFamily: towFont.serif, fontStyle: 'italic', fontSize: 13, color: TOW.muted }}>
              No named units yet — open a campaign list, tap a unit and use the “Name” button.
            </p>
          ) : units.map((u) => {
            const rowId = regimentSlug(u.naam);
            const bewerkt = editId === rowId;
            const teWissen = delId === rowId;
            const meta = [typeNaam(u.catalogusId), `${u.xp} XP`];
            if (u.abilities) meta.push(`${u.abilities} abilit${u.abilities === 1 ? 'y' : 'ies'}`);
            if (u.littekens) meta.push(`${u.littekens} scar${u.littekens === 1 ? '' : 's'}`);
            if (u.status !== 'actief') meta.push('reserve');
            return (
              <div key={u.naam} style={{ border: `1px solid ${teWissen ? 'rgba(124,43,34,0.5)' : TOW.line}`, borderRadius: 11, background: TOW.cardLt, padding: '10px 12px', marginBottom: 8, opacity: u.status === 'actief' ? 1 : 0.7 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: towFont.display, fontWeight: 600, fontSize: 14.5, color: TOW.ink }}>{u.naam}</div>
                    <div style={{ fontFamily: towFont.serif, fontSize: 11.5, color: TOW.muted, marginTop: 1 }}>{meta.filter(Boolean).join(' · ')}</div>
                  </div>
                  {!bewerkt && !teWissen && (
                    <>
                      <button onClick={() => { setEditId(rowId); setEditNaam(u.naam); setDelId(null); }} style={{ flexShrink: 0, border: `1px solid ${TOW.line}`, background: 'transparent', borderRadius: 7, cursor: 'pointer', color: TOW.goldDeep, padding: '4px 9px', ...eb, fontSize: 7.5 }}>Rename</button>
                      <button onClick={() => { setDelId(rowId); setEditId(null); }} style={{ flexShrink: 0, border: '1px solid rgba(124,43,34,0.4)', background: 'transparent', borderRadius: 7, cursor: 'pointer', color: TOW.blood, padding: '4px 9px', ...eb, fontSize: 7.5 }}>Delete</button>
                    </>
                  )}
                </div>
                {bewerkt && (
                  <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                    <input
                      value={editNaam}
                      onChange={(e) => setEditNaam(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') void hernoem(rowId); }}
                      maxLength={40}
                      autoFocus
                      style={{ flex: 1, minWidth: 0, borderRadius: 8, border: `1px solid ${TOW.lineStrong}`, background: TOW.panel, color: TOW.ink, padding: '7px 10px', fontFamily: towFont.serif, fontSize: 13, boxSizing: 'border-box', outline: 'none' }}
                    />
                    <button disabled={busy || !editNaam.trim()} onClick={() => void hernoem(rowId)} style={{ flexShrink: 0, border: 'none', borderRadius: 8, cursor: 'pointer', padding: '7px 13px', background: goldGrad, color: TOW.onGrad, fontFamily: towFont.display, fontWeight: 700, fontSize: 12, opacity: busy || !editNaam.trim() ? 0.6 : 1 }}>Save</button>
                    <button onClick={() => setEditId(null)} style={{ flexShrink: 0, border: `1px solid ${TOW.line}`, background: 'transparent', borderRadius: 8, cursor: 'pointer', color: TOW.muted, padding: '7px 10px', fontFamily: towFont.display, fontWeight: 600, fontSize: 12 }}>Cancel</button>
                  </div>
                )}
                {teWissen && (
                  <div style={{ marginTop: 8 }}>
                    <p style={{ fontFamily: towFont.serif, fontSize: 12, color: TOW.blood, margin: '0 0 6px' }}>
                      Delete this regiment forever? Its {u.xp} XP{u.abilities ? ` and ${u.abilities} abilit${u.abilities === 1 ? 'y' : 'ies'}` : ''} are lost, and its name is removed from your lists (the unit itself stays, unnamed).
                    </p>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button disabled={busy} onClick={() => void verwijder(rowId)} style={{ flexShrink: 0, border: '1px solid rgba(124,43,34,0.6)', borderRadius: 8, cursor: 'pointer', padding: '7px 13px', background: 'rgba(124,43,34,0.16)', color: TOW.blood, fontFamily: towFont.display, fontWeight: 700, fontSize: 12, opacity: busy ? 0.6 : 1 }}>Delete forever</button>
                      <button onClick={() => setDelId(null)} style={{ flexShrink: 0, border: `1px solid ${TOW.line}`, background: 'transparent', borderRadius: 8, cursor: 'pointer', color: TOW.muted, padding: '7px 10px', fontFamily: towFont.display, fontWeight: 600, fontSize: 12 }}>Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// OWB's normalizeRuleName (rules index is keyed by this) + a final-word singular fallback.
const normRule = (s: string) => (s || '').toLowerCase().replace(/ *\([^)]*\) */g, '').replace(/[{}[\]*]/g, '').replace(/^[0-9]x /g, '').replace(/[“”]/g, '"').trim();
interface StatRow { Name: string; M: string; WS: string; BS: string; S: string; T: string; W: string; I: string; A: string; Ld: string }
let statIndexCache: Record<string, { stats?: StatRow[] }> | null = null;

// Per-army metadata from the-old-world.json: which compositions it offers + which magic-item lists.
interface ArmyMeta { comps: string[]; items: string[] }

export function ListBuilder() {
  const [armies, setArmies] = useState<{ slug: string; name: string }[]>([]);
  const [metaByArmy, setMetaByArmy] = useState<Record<string, ArmyMeta>>({});
  const [catalogues, setCatalogues] = useState<Record<string, OwbArmy>>({}); // slug → catalogue (on demand)
  const [itemsData, setItemsData] = useState<MagicItemsData | null>(null);
  const [statIdx, setStatIdx] = useState<Record<string, { stats?: StatRow[] }> | null>(statIndexCache);
  const [lists, setLists] = usePersistentState<SavedList[]>('tow:lists', []);
  const [groups, setGroups] = usePersistentState<{ id: string; name: string }[]>('tow:list-groups', []);
  const [activeId, setActiveId] = usePersistentState<string | null>('tow:builder-active', null);
  const [setupOpen, setSetupOpen] = useState(false);
  const [regimentenOpen, setRegimentenOpen] = useState(false); // "My regiments"-overzicht (campagne)
  const [dragOver, setDragOver] = useState<string | null>(null); // section id being hovered (group id, or '__ungrouped__')
  const [dragOverCard, setDragOverCard] = useState<{ id: string; before: boolean } | null>(null); // card hovered during a reorder drag (+ which edge)
  const [collapsed, setCollapsed] = usePersistentState<string[]>('tow:list-groups-collapsed', []); // collapsed section ids
  const toggleCollapse = (id: string) => setCollapsed((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));

  // In-app Back: each navigable layer owns one history entry (deepest registers last → handled first).
  useBackClose(!!activeId, () => setActiveId(null)); // open builder → back to My lists
  useBackClose(setupOpen, () => setSetupOpen(false)); // new-list dialog
  useBackClose(regimentenOpen, () => setRegimentenOpen(false)); // regiments overview

  // Army registry + per-army comps/items + the army-agnostic stat index + magic-items data.
  useEffect(() => {
    fetch(`${BASE}owb/index.json`).then((r) => r.json()).then((idx) => {
      if (Array.isArray(idx?.armies)) setArmies(idx.armies.map((a: { slug: string; name: string }) => ({ slug: a.slug, name: a.name })));
    }).catch(() => {});
    fetch(`${BASE}owb/the-old-world.json`).then((r) => r.json()).then((m) => {
      const map: Record<string, ArmyMeta> = {};
      for (const a of (m.armies ?? [])) map[a.id] = { comps: Array.isArray(a.armyComposition) ? a.armyComposition : [a.id], items: Array.isArray(a.items) ? a.items : [] };
      setMetaByArmy(map);
    }).catch(() => {});
    fetch(`${BASE}owb/magic-items.json`).then((r) => r.json()).then(setItemsData).catch(() => setItemsData(null));
    if (statIndexCache) setStatIdx(statIndexCache);
    else fetch(`${BASE}owb/rules-index.json`).then((r) => r.json()).then((idx) => { statIndexCache = idx; setStatIdx(idx); }).catch(() => {});
  }, []);

  // One-time migration: fold an earlier single saved list (`tow:builder-de`) into the collection.
  useEffect(() => {
    if (lists.length > 0) return;
    try {
      const legacy = JSON.parse(localStorage.getItem('tow:builder-de') || 'null');
      if (legacy && Array.isArray(legacy.entries) && legacy.entries.length) {
        const id = newId('l');
        setLists([{ id, name: 'My list', army: FALLBACK_ARMY, composition: legacy.composition || 'dark-elves', rule: legacy.rule || 'open-war', points: legacy.points || 2000, entries: legacy.entries, createdAt: Date.now(), updatedAt: Date.now() }]);
        localStorage.removeItem('tow:builder-de');
      }
    } catch { /* ignore */ }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Campagne: de ECHTE puntensom meeschrijven (`computedPoints`) ────────────────────────────────
  // De campagne ("De Grensvorsten") moet kunnen toetsen of een campagne-lijst binnen de fase-cap
  // valt, maar `points` is enkel het DOEL waarop de lijst is aangemaakt — niet de som. Dit scherm is
  // de meest betrouwbare plek om die som weg te schrijven: het bezit `tow:lists`, laadt de catalogus
  // van ELKE army die in de lijsten voorkomt (effect hierboven) én de magic-items-data, dus de som
  // klopt inclusief items — ook voor lijsten die je niet openslaat (bv. van een ander device
  // gesynct). En omdat ListBuilder de <BuilderWorkspace> zélf rendert, loopt elke wijziging in de
  // builder via `setLists` hier langs, dus de waarde blijft actueel (niet alleen bij aanmaken).
  // Ontbreekt de catalogus of de items-data, dan schrijven we NIETS: liever geen waarde dan een te
  // lage som — de campagne behandelt een ontbrekende `computedPoints` als waarschuwing, geen fout.
  // `updatedAt` bumpen we bewust niet (afgeleide waarde, geen gebruikers-bewerking); de list-sync
  // pikt de wijziging op via de snapshot en duwt het veld mee naar `tow_lists`.
  useEffect(() => {
    if (!itemsData) return;
    const sommen = new Map<string, number>();
    for (const l of lists) {
      if (!l.campaign) continue;
      const cat = catalogues[l.army];
      if (!cat) continue;
      const total = listTotal(l, cat, itemsData);
      if (l.computedPoints !== total) sommen.set(l.id, total);
    }
    if (sommen.size === 0) return;
    setLists((ls) => ls.map((l) => {
      const t = sommen.get(l.id);
      return t === undefined ? l : { ...l, computedPoints: t };
    }));
  }, [lists, catalogues, itemsData, setLists]);

  const active = lists.find((l) => l.id === activeId) || null;

  // Load the ACTIVE list's army catalogue on demand (cache by slug) before opening the workspace.
  const activeArmySlug = active?.army ?? null;
  useEffect(() => {
    if (!activeArmySlug || catalogues[activeArmySlug]) return;
    let cancelled = false;
    fetch(`${BASE}owb/${activeArmySlug}.json`).then((r) => r.json()).then((c) => { if (!cancelled) setCatalogues((m) => ({ ...m, [activeArmySlug]: c })); }).catch(() => {});
    return () => { cancelled = true; };
  }, [activeArmySlug, catalogues]);

  // Load the catalogue of every distinct army among the saved lists (for the "My lists" totals).
  useEffect(() => {
    const need = Array.from(new Set(lists.map((l) => l.army))).filter((s) => s && !catalogues[s]);
    if (need.length === 0) return;
    let cancelled = false;
    Promise.all(need.map((s) => fetch(`${BASE}owb/${s}.json`).then((r) => r.json()).then((c) => [s, c] as const).catch(() => null)))
      .then((pairs) => { if (cancelled) return; const add: Record<string, OwbArmy> = {}; for (const p of pairs) if (p) add[p[0]] = p[1]; if (Object.keys(add).length) setCatalogues((m) => ({ ...m, ...add })); });
    return () => { cancelled = true; };
  }, [lists, catalogues]);

  const activeCatalogue = activeArmySlug ? catalogues[activeArmySlug] ?? null : null;
  const getUnitFor = (cat: OwbArmy | null) => (c: Category, id: string): OwbUnit | undefined => cat?.[c]?.find((u) => u.id === id);
  const compsByArmy = useMemo(() => Object.fromEntries(Object.entries(metaByArmy).map(([k, v]) => [k, v.comps])), [metaByArmy]);
  // Army slug → its magic-item list ids (the same `items` array BuilderWorkspace gets as armyItemLists).
  const itemListsByArmy = useMemo(() => Object.fromEntries(Object.entries(metaByArmy).map(([slug, m]) => [slug, m.items ?? []])), [metaByArmy]);
  const armyName = (slug: string) => armies.find((a) => a.slug === slug)?.name ?? slug;
  const statsFor = useMemo(() => (unitName: string): StatRow[] => {
    if (!statIdx) return [];
    const key = normRule(unitName);
    let e = statIdx[key];
    if (!e?.stats?.length) { const w = key.split(' '); const last = w[w.length - 1]; if (/s$/.test(last)) e = statIdx[[...w.slice(0, -1), last.replace(/s$/, '')].join(' ')]; }
    return e?.stats ?? [];
  }, [statIdx]);

  const updateActive = (p: Partial<BuilderList> | ((l: SavedList) => Partial<BuilderList>)) =>
    setLists((ls) => ls.map((l) => (l.id === activeId ? { ...l, ...(typeof p === 'function' ? p(l) : p), updatedAt: Date.now() } : l)));
  const setName = (name: string) => setLists((ls) => ls.map((l) => (l.id === activeId ? { ...l, name, updatedAt: Date.now() } : l)));

  const createListWith = (v: NewListValues) => {
    const id = newId('l');
    setLists((ls) => [{ id, name: v.name, army: v.army, composition: v.composition, rule: v.rule, points: v.points, entries: v.entries, createdAt: Date.now(), updatedAt: Date.now(), campaign: v.campaign, campaignSpeler: v.campaignSpeler, campaignNaam: v.campaignNaam, campaignFase: v.campaignFase }, ...ls]);
    setSetupOpen(false);
    setActiveId(id);
  };
  const duplicateList = (l: SavedList) => { const id = newId('l'); setLists((ls) => [{ ...l, id, name: `${l.name} (copy)`, createdAt: Date.now(), updatedAt: Date.now() }, ...ls]); };
  const deleteList = (id: string) => { setLists((ls) => ls.filter((l) => l.id !== id)); if (activeId === id) setActiveId(null); };

  // ── groups (folders) ──
  const addGroup = () => { const name = window.prompt('Group name'); if (name && name.trim()) setGroups((g) => [...g, { id: newId('g'), name: name.trim() }]); };
  const renameGroup = (id: string, current: string) => { const name = window.prompt('Group name', current); if (name && name.trim()) setGroups((g) => g.map((x) => (x.id === id ? { ...x, name: name.trim() } : x))); };
  const deleteGroup = (id: string, name: string) => {
    if (!window.confirm(`Delete folder “${name}”? Its lists move back to Ungrouped.`)) return;
    setGroups((g) => g.filter((x) => x.id !== id));
    setLists((ls) => ls.map((l) => (l.groupId === id ? { ...l, groupId: null } : l)));
  };
  // Reorder a list within the manual `lists` order (drag-drop). `targetId` null = append to the end of
  // `groupId`'s section; otherwise insert before/after the target card. Also adopts the target's group.
  const reorderList = (draggedId: string, targetId: string | null, before: boolean, groupId: string | null) =>
    setLists((ls) => {
      const arr = [...ls];
      const di = arr.findIndex((x) => x.id === draggedId);
      if (di < 0) return ls;
      const [moved] = arr.splice(di, 1);
      const next = { ...moved, groupId: groupId ?? null, updatedAt: Date.now() };
      if (targetId == null) { arr.push(next); }
      else {
        const ti = arr.findIndex((x) => x.id === targetId);
        if (ti < 0) { arr.push(next); }
        else { arr.splice(before ? ti : ti + 1, 0, next); }
      }
      return arr;
    });

  const card: React.CSSProperties = { border: `1px solid ${TOW.line}`, borderRadius: 12, background: TOW.panel2 };

  // ── open list → the responsive builder (wait for that army's catalogue to load) ──
  if (active) {
    if (!activeCatalogue) return <div style={{ padding: 24, fontFamily: towFont.serif, color: TOW.muted }}>Loading the catalogue…</div>;
    const meta = metaByArmy[active.army];
    return (
      <BuilderWorkspace
        list={active}
        name={active.name}
        onUpdate={updateActive}
        onSetName={setName}
        onBack={() => setActiveId(null)}
        army={activeCatalogue}
        armySlug={active.army}
        statsFor={statsFor}
        comps={meta?.comps ?? compsByArmy[active.army] ?? [active.army]}
        armyName={armyName(active.army)}
        compName={(c) => compName(c, active.army)}
        itemsData={itemsData ?? undefined}
        armyItemLists={meta?.items ?? []}
      />
    );
  }

  // ── My lists ──
  const UNGROUPED = '__ungrouped__'; // synthetic section id for the Ungrouped drop target
  const groupIds = new Set(groups.map((g) => g.id));
  // MANUAL order = the `lists` array order (drag to reorder; new lists prepend via createListWith).
  const listsInGroup = (gid: string) => lists.filter((l) => l.groupId === gid);
  // Ungrouped = no/null groupId OR a groupId that no longer maps to an existing group.
  const ungrouped = lists.filter((l) => !l.groupId || !groupIds.has(l.groupId));

  // One saved-list card. `sectionId` is the section it currently sits in (so a drop adopts that group).
  const renderCard = (l: SavedList, sectionId: string) => {
    const cat = catalogues[l.army] ?? null;
    const total = cat ? validate(l, getUnitFor(cat), itemsData ?? undefined).total : null;
    // Group this card currently lives in (null = Ungrouped) — a drop adopts this section's group.
    const cardGroup = sectionId === UNGROUPED ? null : sectionId;
    const dropLine = dragOverCard?.id === l.id ? dragOverCard.before : null; // true=top, false=bottom, null=none
    return (
      <div
        key={l.id}
        draggable
        onDragStart={(e) => { e.dataTransfer.setData('text/plain', l.id); e.dataTransfer.effectAllowed = 'move'; }}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          const r = e.currentTarget.getBoundingClientRect();
          const before = e.clientY < r.top + r.height / 2;
          setDragOverCard({ id: l.id, before });
        }}
        onDragLeave={() => setDragOverCard((d) => (d?.id === l.id ? null : d))}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation(); // don't also fire the section's append-to-end drop
          const dragged = e.dataTransfer.getData('text/plain');
          const r = e.currentTarget.getBoundingClientRect();
          const before = e.clientY < r.top + r.height / 2;
          if (dragged && dragged !== l.id) reorderList(dragged, l.id, before, cardGroup);
          setDragOverCard(null);
        }}
        style={{ ...card, position: 'relative', display: 'flex', alignItems: 'center', gap: 8, padding: '11px 13px', cursor: 'grab' }}
      >
        {dropLine != null && <div style={{ position: 'absolute', left: 0, right: 0, [dropLine ? 'top' : 'bottom']: -1, height: 2, background: TOW.goldDeep, borderRadius: 2, pointerEvents: 'none' }} />}
        <button onClick={() => setActiveId(l.id)} style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
          <div style={{ fontFamily: towFont.display, fontWeight: 700, fontSize: 15.5, color: TOW.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.name}</div>
          <div style={{ ...eb, fontSize: 8, color: TOW.muted, marginTop: 3 }}>{armyName(l.army)} · {compName(l.composition, l.army)} · {total ?? '…'}/{l.points} pts</div>
        </button>
        <button onClick={() => duplicateList(l)} onMouseDown={(e) => e.stopPropagation()} aria-label="Duplicate" title="Duplicate" style={{ border: `1px solid ${TOW.line}`, background: 'transparent', borderRadius: 8, cursor: 'pointer', color: TOW.muted, fontSize: 13, padding: '5px 8px' }}>⧉</button>
        <button onClick={() => { if (confirm(`Delete “${l.name}”?`)) deleteList(l.id); }} onMouseDown={(e) => e.stopPropagation()} aria-label="Delete" title="Delete" style={{ border: `1px solid ${TOW.line}`, background: 'transparent', borderRadius: 8, cursor: 'pointer', color: TOW.muted, fontSize: 16, lineHeight: 1, padding: '4px 9px' }}>×</button>
      </div>
    );
  };

  // A drop target wrapping a section's cards. `targetId` is the group id, or null for Ungrouped.
  const sectionId = (targetId: string | null) => targetId ?? UNGROUPED;
  const dropProps = (targetId: string | null) => ({
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOver(sectionId(targetId)); },
    onDragLeave: () => setDragOver((d) => (d === sectionId(targetId) ? null : d)),
    // Dropping on a section's empty area → move the dragged list to the END of that section.
    onDrop: (e: React.DragEvent) => { e.preventDefault(); const id = e.dataTransfer.getData('text/plain'); if (id) reorderList(id, null, false, targetId); setDragOver(null); setDragOverCard(null); },
  });

  // A collapsible section header: a chevron + title (+ count), with optional right-aligned actions.
  // No decorative folder icon — just the chevron, which also drives the collapse.
  const sectionHeader = (key: string, title: string, count: number | null, actions?: React.ReactNode) => {
    const isCol = collapsed.includes(key);
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <button onClick={() => toggleCollapse(key)} aria-expanded={!isCol} style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 7, border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, textAlign: 'left' }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={TOW.muted} strokeWidth="2.6" style={{ flexShrink: 0, transform: isCol ? 'none' : 'rotate(90deg)', transition: 'transform .15s ease' }} aria-hidden="true"><path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" /></svg>
          <span style={{ ...eb, fontSize: 9, color: TOW.muted }}>{title}</span>
          {count != null && <span style={{ fontFamily: towFont.serif, fontSize: 11, color: TOW.faint }}>({count})</span>}
        </button>
        {actions}
      </div>
    );
  };

  const renderSection = (targetId: string | null, title: string, sectionLists: SavedList[], actions?: React.ReactNode) => {
    const key = sectionId(targetId);
    const hovered = dragOver === key;
    const isCol = collapsed.includes(key);
    return (
      <div
        key={key}
        {...dropProps(targetId)}
        style={{ border: `1px ${hovered ? 'dashed' : 'solid'} ${hovered ? TOW.goldDeep : 'transparent'}`, borderRadius: 12, background: hovered ? 'rgba(176,141,87,0.10)' : 'transparent', padding: hovered ? 6 : 7, transition: 'background 120ms' }}
      >
        {sectionHeader(key, title, targetId === null ? null : sectionLists.length, actions)}
        {!isCol && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {sectionLists.length === 0
              ? <div style={{ fontFamily: towFont.serif, fontStyle: 'italic', fontSize: 12.5, color: TOW.faint, padding: '8px 4px' }}>Drop lists here</div>
              : sectionLists.map((l) => renderCard(l, key))}
          </div>
        )}
      </div>
    );
  };

  const groupActions = (g: { id: string; name: string }) => (
    <>
      <button onClick={() => renameGroup(g.id, g.name)} aria-label="Rename folder" title="Rename folder" style={{ border: `1px solid ${TOW.line}`, background: 'transparent', borderRadius: 7, cursor: 'pointer', color: TOW.muted, fontSize: 12, padding: '3px 7px' }}>Rename</button>
      <button onClick={() => deleteGroup(g.id, g.name)} aria-label="Delete folder" title="Delete folder" style={{ border: `1px solid ${TOW.line}`, background: 'transparent', borderRadius: 7, cursor: 'pointer', color: TOW.muted, fontSize: 12, padding: '3px 8px' }}>Delete</button>
    </>
  );

  return (
    <div className="tow-field" style={{ height: '100%', overflowY: 'auto', color: TOW.ink }}>
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '14px 14px 48px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <h1 style={{ fontFamily: towFont.display, fontWeight: 700, fontSize: 22, color: TOW.ink, margin: 0 }}>My lists</h1>
          <button onClick={addGroup} style={{ marginLeft: 'auto', fontFamily: towFont.display, fontWeight: 700, fontSize: 13, padding: '7px 13px', borderRadius: 9, cursor: 'pointer', border: `1px solid ${TOW.line}`, background: 'transparent', color: TOW.ink }}>＋ New group</button>
          <button onClick={() => setSetupOpen(true)} style={{ fontFamily: towFont.display, fontWeight: 700, fontSize: 13, padding: '7px 14px', borderRadius: 9, cursor: 'pointer', border: 'none', background: goldGrad, color: TOW.onGrad }}>＋ New list</button>
        </div>
        {lists.length === 0 && groups.length === 0 ? (
          <p style={{ fontFamily: towFont.serif, fontStyle: 'italic', fontSize: 14, color: TOW.muted }}>No saved lists yet — tap “New list” to start building.</p>
        ) : groups.length === 0 ? (
          // No folders yet — keep the original flat look.
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {ungrouped.map((l) => renderCard(l, UNGROUPED))}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {groups.map((g) => renderSection(g.id, g.name, listsInGroup(g.id), groupActions(g)))}
            {renderSection(null, 'Ungrouped', ungrouped)}
          </div>
        )}
        {/* Campagne: overzicht van je named units (regimenten-register) — hernoem of verwijder ze hier. */}
        {getCampaignCode() && (
          <button
            onClick={() => setRegimentenOpen(true)}
            style={{ width: '100%', marginTop: 16, padding: '11px 12px', borderRadius: 10, cursor: 'pointer', border: `1px solid ${TOW.goldDeep}`, background: 'rgba(138,108,48,0.10)', color: TOW.gold, fontFamily: towFont.display, fontWeight: 700, fontSize: 13, letterSpacing: '0.03em' }}
          >
            My regiments — named campaign units
          </button>
        )}
        <p style={{ fontFamily: towFont.serif, fontSize: 11, color: TOW.faint, marginTop: 18, textAlign: 'center', lineHeight: 1.6 }}>
          Lists are saved on this device. Catalogue from <a href="https://github.com/nthiebes/old-world-builder" target="_blank" rel="noreferrer" className="underline">Old World Builder</a> (CC BY 4.0).
        </p>
      </div>
      {regimentenOpen && <RegimentenPaneel onClose={() => setRegimentenOpen(false)} setLists={setLists} />}
      {setupOpen && (
        <NewListSetup
          armies={armies}
          compsByArmy={compsByArmy}
          defaultArmy={armies.find((a) => a.slug === FALLBACK_ARMY)?.slug ?? armies[0]?.slug ?? FALLBACK_ARMY}
          defaultName={`New list ${lists.length + 1}`}
          onCancel={() => setSetupOpen(false)}
          onCreate={createListWith}
          itemsData={itemsData ?? undefined}
          itemListsByArmy={itemListsByArmy}
        />
      )}
    </div>
  );
}
