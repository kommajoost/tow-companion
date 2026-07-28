import { useEffect, useState } from 'react';
import { TOW, towFont, engraved } from '../../design/tow';
import { usePersistentState } from '../../store';
import { builderListToArmy, listTotal, type MagicText, type MountText } from '../../lib/builderToArmy';
import { makeTroopTypeLookup } from '../../lib/troopTypes';
import { compName } from '../../lib/armies';
import {
  applyOverlay, applyOverlayItems, applyOverlayMagicText, applyOverlayMountText, applyOverlayStatIndex, hasOverlay, isOverlay,
  overlayStatsFor, OVERLAY_FILES, type CompositionOverlay,
} from '../../lib/overlays';
import type { BuilderList, OwbArmy, MagicItemsData } from '../../lib/owbBuilder';
import type { Army } from '../../types';

// Reusable picker over the player's saved builder lists (tow:lists). Loads each list's army
// catalogue plus the stat + magic-item data, converts the chosen list into a game Army and hands
// it back via onPick. Renders nothing when there are no saved lists. Used on the Game setup screen
// and inside a live/solo game when adding your own — or your opponent's — army from your lists.

const eb = engraved as React.CSSProperties;
const BASE = import.meta.env.BASE_URL;
interface SavedList extends BuilderList { id: string; name: string; army: string; createdAt: number; updatedAt: number }
interface StatRow { Name: string; M: string; WS: string; BS: string; S: string; T: string; W: string; I: string; A: string; Ld: string }

export function ArmyListPicker({ onPick, label = 'Choose one of your saved army lists', lockedListName = null }: { onPick: (a: Army) => void; label?: string; lockedListName?: string | null }) {
  // Lists can span different armies, so we keep a per-army catalogue cache + army metadata and
  // convert each list with ITS OWN catalogue/faction/composition.
  const [lists] = usePersistentState<SavedList[]>('tow:lists', []);
  const [showAll, setShowAll] = useState(false); // campaign lock: override the auto-matched list
  const [catalogues, setCatalogues] = useState<Record<string, OwbArmy>>({}); // slug → catalogue
  const [armyNames, setArmyNames] = useState<Record<string, string>>({}); // slug → display name
  const [itemsByArmy, setItemsByArmy] = useState<Record<string, string[]>>({}); // slug → magic-item lists
  const [statIdx, setStatIdx] = useState<Record<string, { stats?: StatRow[]; troopType?: string }> | null>(null);
  const [itemsData, setItemsData] = useState<MagicItemsData | null>(null);
  const [magicText, setMagicText] = useState<MagicText>({});
  const [mountText, setMountText] = useState<MountText>({});
  const [overlays, setOverlays] = useState<Record<string, CompositionOverlay>>({});

  useEffect(() => {
    fetch(`${BASE}owb/rules-index.json`).then((r) => r.json()).then(setStatIdx).catch(() => {});
    fetch(`${BASE}owb/magic-items.json`).then((r) => r.json()).then(setItemsData).catch(() => {});
    fetch(`${BASE}owb/magic-item-text.json`).then((r) => r.json()).then(setMagicText).catch(() => {});
    fetch(`${BASE}owb/mount-text.json`).then((r) => r.json()).then(setMountText).catch(() => {});
    fetch(`${BASE}owb/index.json`).then((r) => r.json()).then((idx) => {
      if (Array.isArray(idx?.armies)) setArmyNames(Object.fromEntries(idx.armies.map((a: { slug: string; name: string }) => [a.slug, a.name])));
    }).catch(() => {});
    fetch(`${BASE}owb/the-old-world.json`).then((r) => r.json()).then((m) => {
      const map: Record<string, string[]> = {};
      for (const a of (m.armies ?? [])) map[a.id] = Array.isArray(a.items) ? a.items : [];
      setItemsByArmy(map);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const need = Array.from(new Set(lists.map((l) => l.army))).filter((s) => s && !catalogues[s]);
    if (need.length === 0) return;
    let cancelled = false;
    Promise.all(need.map((s) => fetch(`${BASE}owb/${s}.json`).then((r) => r.json()).then((c) => [s, c] as const).catch(() => null)))
      .then((pairs) => { if (cancelled) return; const add: Record<string, OwbArmy> = {}; for (const p of pairs) if (p) add[p[0]] = p[1]; if (Object.keys(add).length) setCatalogues((m) => ({ ...m, ...add })); });
    return () => { cancelled = true; };
  }, [lists, catalogues]);

  useEffect(() => {
    const need = Array.from(new Set(lists.map((list) => list.composition)))
      .filter((composition) => hasOverlay(composition) && !overlays[composition]);
    if (!need.length) return;
    let cancelled = false;
    Promise.all(need.map((composition) => fetch(`${BASE}renegade/${OVERLAY_FILES[composition]}`)
      .then((response) => response.ok ? response.json() : null)
      .then((json) => isOverlay(json) ? [composition, json] as const : null)
      .catch(() => null)))
      .then((pairs) => {
        if (cancelled) return;
        const found: Record<string, CompositionOverlay> = {};
        for (const pair of pairs) if (pair) found[pair[0]] = pair[1];
        if (Object.keys(found).length) setOverlays((current) => ({ ...current, ...found }));
      });
    return () => { cancelled = true; };
  }, [lists, overlays]);

  if (lists.length === 0) return null;

  const armyNameFor = (slug: string) => armyNames[slug] ?? slug;
  const toArmy = (l: SavedList): Army | null => {
    const raw = catalogues[l.army];
    if (!raw || !statIdx) return null;
    const overlay = hasOverlay(l.composition) ? overlays[l.composition] : null;
    if (hasOverlay(l.composition) && !overlay) return null;
    const cat = overlay ? applyOverlay(raw, overlay) : raw;
    const itemPool = itemsData && overlay ? applyOverlayItems(itemsData, overlay) : itemsData;
    const resolvedIndex = overlay ? applyOverlayStatIndex(statIdx, overlay) : statIdx;
    const statsFor = (name: string): StatRow[] => overlayStatsFor(statIdx, name, overlay);
    const troopTypeFor = makeTroopTypeLookup(resolvedIndex);
    return builderListToArmy(l, cat, statsFor, { faction: armyNameFor(l.army), composition: compName(l.composition, l.army), overlayId: overlay?.id, itemsData: itemPool ?? undefined, armyItemLists: itemsByArmy[l.army] ?? [], magicText: applyOverlayMagicText(magicText, overlay), mountText: applyOverlayMountText(mountText, overlay), troopTypeFor, factionNames: Object.values(armyNames) });
  };

  // Campaign battle: the list is already locked in the campaign, so match it by name and show ONLY
  // that one — no picking among all saved lists. `showAll` lets the player override if the match is
  // wrong; no match on this device falls back to the full picker with the original label.
  const normName = (s: string) => (s || '').trim().toLowerCase();
  const locked = lockedListName ? lists.find((l) => normName(l.name) === normName(lockedListName)) ?? null : null;
  const solo = locked && !showAll;
  const shown = solo ? [locked] : lists;
  const heading = solo ? 'Your locked campaign list' : label;

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ ...eb, fontSize: 9, color: TOW.muted, marginBottom: 7 }}>{heading}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {shown.map((l) => {
          const raw = catalogues[l.army] ?? null;
          const overlay = hasOverlay(l.composition) ? overlays[l.composition] : null;
          const cat = raw && overlay ? applyOverlay(raw, overlay) : raw;
          const itemPool = itemsData && overlay ? applyOverlayItems(itemsData, overlay) : itemsData;
          const total = cat ? listTotal(l, cat, itemPool ?? undefined) : null;
          const ready = !!cat && (!hasOverlay(l.composition) || !!overlay);
          const primary = solo; // the locked list gets a gold "open me" accent
          return (
            <button key={l.id} disabled={!ready} onClick={() => { const a = toArmy(l); if (a) onPick(a); }}
              style={{ display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left', padding: '11px 13px', borderRadius: 11, cursor: ready ? 'pointer' : 'default', border: `1px solid ${primary ? TOW.goldDeep : TOW.line}`, background: primary ? 'rgba(184,134,47,0.12)' : TOW.panel2, opacity: ready ? 1 : 0.55 }}>
              <span style={{ flex: 1, minWidth: 0, fontFamily: towFont.display, fontWeight: 600, fontSize: 15, color: primary ? TOW.goldDeep : TOW.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.name}</span>
              <span style={{ ...eb, fontSize: 8, color: TOW.muted, flexShrink: 0 }}>{ready ? `${total ?? '…'}/${l.points} pts · ${l.entries.length} unit${l.entries.length === 1 ? '' : 's'}` : 'loading…'}</span>
            </button>
          );
        })}
      </div>
      {solo ? (
        <button onClick={() => setShowAll(true)} style={{ display: 'block', margin: '9px auto 2px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: towFont.serif, fontSize: 12.5, color: TOW.muted, textDecoration: 'underline' }}>
          use a different list
        </button>
      ) : (
        <div style={{ ...eb, fontSize: 8, color: TOW.faint, textAlign: 'center', margin: '11px 0 2px' }}>— or paste an export below —</div>
      )}
    </div>
  );
}
