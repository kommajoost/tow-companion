import { useState } from 'react';
import { usePersistentState } from '../../store';
import { useUI } from '../../state';
import { useBackClose } from '../../lib/backStack';
import { TOW, towFont, engraved } from '../../design/tow';
import {
  SCENARIOS, scenarioById, TERRAIN_TYPES, TABLE_PRESETS, DEFAULT_BATTLE, TRAIT_RULE, SECONDARY_OBJECTIVES,
  recommendedTerrainCount, scatterTerrain, shufflePlacement, addPieceBalanced, terrainType,
  type BattleSetupState, type TerrainPiece, type TerrainTrait,
} from '../../lib/battle';
import { BattleBoard } from './BattleBoard';
import { TerrainIcon, TraitIcon } from './terrainIcons';

const TRAITS: TerrainTrait[] = ['difficult', 'dangerous'];
const traitColor = (t: TerrainTrait) => (t === 'dangerous' ? '#b23b3b' : '#5c4326');
const clampN = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

const eb = engraved as React.CSSProperties;
const goldGrad = `linear-gradient(180deg, ${TOW.goldBright} 0%, ${TOW.gold} 55%, ${TOW.goldDeep} 100%)`;

// Pre-game battlefield setup: pick a pitched-battle scenario (rules behind an eye), set the table
// size, then place terrain on an inch-grid board — manually from the palette or scattered randomly
// per the rulebook's "one feature per 12 inches" guide. Saved locally as a planning aid you recreate
// on the real table. (Pre-made layouts are a later step.)
export function BattleSetup({ onBack }: { onBack: () => void }) {
  const [setup, setSetup] = usePersistentState<BattleSetupState>('tow:battle', DEFAULT_BATTLE);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [enabledTypes, setEnabledTypes] = useState<Set<string>>(() => new Set(TERRAIN_TYPES.map((t) => t.id)));
  const [randomCount, setRandomCount] = useState<number | null>(null); // null → follow the recommendation
  const [tab, setTab] = useState<'scenario' | 'secondaries' | 'table' | 'terrain'>('scenario');
  const { openRule } = useUI();
  useBackClose(true, onBack);

  const scenario = scenarioById(setup.scenario);
  const recCount = recommendedTerrainCount(setup.tableW, setup.tableH);
  const count = randomCount ?? recCount; // how many features the Random button lays out
  const isPreset = (w: number, h: number) => setup.tableW === w && setup.tableH === h;

  const setTable = (w: number, h: number) => setSetup((s) => ({
    ...s, tableW: w, tableH: h,
    terrain: s.terrain.map((t) => ({ ...t, x: Math.min(t.x, Math.max(0, w - t.w)), y: Math.min(t.y, Math.max(0, h - t.h)) })),
  }));
  const setTerrain = (terrain: TerrainPiece[]) => setSetup((s) => ({ ...s, terrain }));
  const toggleType = (id: string) => setEnabledTypes((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const selectedPiece = selectedId ? setup.terrain.find((t) => t.id === selectedId) ?? null : null;
  const setTrait = (id: string, trait: TerrainTrait, val: boolean) => setTerrain(setup.terrain.map((t) => (t.id === id ? { ...t, [trait]: val } : t)));
  const removePiece = (id: string) => { setTerrain(setup.terrain.filter((t) => t.id !== id)); setSelectedId(null); };
  // Secondary objectives (Matched Play) — a set of ids; the Strategic Locations counts are exclusive.
  const secondaries = setup.secondaries ?? [];
  const hasSec = (id: string) => secondaries.includes(id);
  const toggleSecondary = (id: string) => setSetup((s) => {
    const cur = s.secondaries ?? [];
    let next: string[];
    if (cur.includes(id)) next = cur.filter((x) => x !== id);
    else if (id.startsWith('strategic-')) next = [...cur.filter((x) => !x.startsWith('strategic-')), id];
    else next = [...cur, id];
    return { ...s, secondaries: next };
  });

  const label: React.CSSProperties = { ...eb, fontSize: 8.5, color: TOW.muted, margin: '16px 0 7px' };
  const eyeSvg =<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" strokeLinecap="round" strokeLinejoin="round" /><circle cx="12" cy="12" r="3" /></svg>;

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '12px 14px 32px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <button onClick={onBack} aria-label="Back" style={{ height: 32, flexShrink: 0, borderRadius: 8, cursor: 'pointer', border: `1px solid ${TOW.lineStrong}`, background: TOW.cardLt, fontFamily: towFont.display, fontWeight: 600, fontSize: 12.5, color: TOW.inkDim, padding: '0 11px', display: 'inline-flex', alignItems: 'center', gap: 4 }}>‹ Back</button>
        <h2 style={{ margin: 0, fontFamily: towFont.display, fontWeight: 700, fontSize: 20, color: TOW.ink }}>Battlefield setup</h2>
      </div>

      {/* Board + notes — always visible above the tabs, so you see the map at the top */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, margin: '6px 0 6px' }}>
        <span style={{ fontFamily: towFont.display, fontWeight: 700, fontSize: 13.5, color: TOW.ink }}>{scenario?.name ?? 'Battlefield'}</span>
        <span style={{ fontFamily: towFont.serif, fontSize: 11.5, color: TOW.faint }}>{setup.tableW}″ × {setup.tableH}″</span>
      </div>
      <BattleBoard setup={setup} onChange={setTerrain} selectedId={selectedId} onSelect={setSelectedId} />

      {/* Selected feature: set its difficult / dangerous traits (each with a rules eye) or remove it */}
      {selectedPiece && (
        <div style={{ marginTop: 8, padding: '9px 11px', borderRadius: 10, border: `1px solid ${TOW.goldDeep}`, background: 'rgba(184,134,47,0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ flexShrink: 0, color: TOW.inkDim, display: 'inline-flex' }}><TerrainIcon type={selectedPiece.type} size={18} /></span>
            <span style={{ flex: 1, minWidth: 0, fontFamily: towFont.display, fontWeight: 700, fontSize: 13.5, color: TOW.ink }}>{terrainType(selectedPiece.type).label}</span>
            <button onClick={() => removePiece(selectedPiece.id)} style={{ flexShrink: 0, padding: '5px 11px', borderRadius: 7, border: `1px solid ${TOW.line}`, background: 'transparent', color: TOW.muted, cursor: 'pointer', fontFamily: towFont.display, fontWeight: 600, fontSize: 12 }}>Remove</button>
          </div>
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
            {TRAITS.map((tr) => {
              const active = !!selectedPiece[tr];
              return (
                <div key={tr} style={{ display: 'inline-flex', alignItems: 'stretch', borderRadius: 8, overflow: 'hidden', border: `1px solid ${active ? TOW.goldDeep : TOW.line}`, background: active ? 'rgba(184,134,47,0.12)' : 'transparent' }}>
                  <button onClick={() => setTrait(selectedPiece.id, tr, !active)} aria-pressed={active} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 10px', border: 'none', cursor: 'pointer', background: 'transparent', color: active ? TOW.goldDeep : TOW.muted, fontFamily: towFont.display, fontWeight: 600, fontSize: 12.5 }}>
                    <span style={{ display: 'inline-flex', color: active ? traitColor(tr) : TOW.faint }}><TraitIcon trait={tr} size={14} /></span>
                    {TRAIT_RULE[tr].label}
                  </button>
                  <button onClick={() => openRule(TRAIT_RULE[tr].slug)} aria-label={`${TRAIT_RULE[tr].label} rules`} title={`${TRAIT_RULE[tr].label} rules`} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 8px', border: 'none', borderLeft: `1px solid ${active ? TOW.goldDeep : TOW.line}`, background: 'transparent', color: TOW.goldDeep, cursor: 'pointer' }}>{eyeSvg}</button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {scenario && (
        <div style={{ marginTop: 8, padding: '8px 10px', borderRadius: 9, background: 'rgba(138,108,48,0.07)', border: `1px solid ${TOW.line}` }}>
          <div style={{ display: 'flex', gap: 7, alignItems: 'flex-start' }}>
            <span style={{ flexShrink: 0, fontFamily: towFont.display, fontWeight: 700, fontSize: 11.5, color: TOW.goldDeep }}>Deployment</span>
            <span style={{ fontFamily: towFont.serif, fontSize: 11.5, color: TOW.ink, lineHeight: 1.35 }}>{scenario.deployNote}</span>
          </div>
          {scenario.gameEnd && (
            <div style={{ display: 'flex', gap: 7, alignItems: 'flex-start', marginTop: 5 }}>
              <span style={{ flexShrink: 0, fontFamily: towFont.display, fontWeight: 700, fontSize: 11.5, color: TOW.goldDeep }}>Game end</span>
              <span style={{ fontFamily: towFont.serif, fontSize: 11.5, color: TOW.ink, lineHeight: 1.35 }}>{scenario.gameEnd}</span>
            </div>
          )}
        </div>
      )}

      {/* Legend + hint */}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', marginTop: 7, fontFamily: towFont.serif, fontSize: 10.5, color: TOW.muted }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ display: 'inline-flex', color: traitColor('difficult') }}><TraitIcon trait="difficult" size={13} /></span> Difficult (brown dashed)</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ display: 'inline-flex', color: traitColor('dangerous') }}><TraitIcon trait="dangerous" size={13} /></span> Dangerous (red dashed)</span>
      </div>
      <div style={{ fontFamily: towFont.serif, fontStyle: 'italic', fontSize: 11.5, color: TOW.muted, margin: '5px 0 4px' }}>
        Tap a feature to select it (set Difficult / Dangerous below) · drag to move (snaps to 1″) · × to remove.
      </div>

      {/* Tabs to keep the many options organised */}
      <div style={{ display: 'flex', gap: 4, padding: 4, borderRadius: 11, background: 'rgba(74,55,22,0.06)', border: `1px solid ${TOW.line}`, margin: '10px 0 12px' }}>
        {([['scenario', 'Scenarios'], ['secondaries', 'Secondaries'], ['table', 'Map size'], ['terrain', 'Terrain']] as const).map(([id, lbl]) => {
          const on = tab === id;
          return (
            <button key={id} onClick={() => setTab(id)} style={{ flex: 1, padding: '8px 2px', borderRadius: 8, cursor: 'pointer', border: 'none', fontFamily: towFont.display, fontWeight: 600, fontSize: 10.5, letterSpacing: '0.02em', textTransform: 'uppercase', background: on ? goldGrad : 'transparent', color: on ? TOW.onGrad : TOW.muted }}>{lbl}</button>
          );
        })}
      </div>

      {tab === 'scenario' && (<>
      {/* Scenario — grouped into Pitched Battle, Battle March and Matched Play */}
      {(['pitched', 'battle-march', 'matched-play'] as const).map((grp) => {
        const items = SCENARIOS.filter((s) => (s.group ?? 'pitched') === grp);
        if (!items.length) return null;
        const groupLabel = grp === 'pitched' ? 'Pitched Battle' : grp === 'battle-march' ? 'Battle March (small games)' : 'Matched Play';
        return (
          <div key={grp}>
            <div style={label}>Scenario · {groupLabel}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {items.map((s) => {
                const on = setup.scenario === s.id;
                return (
                  <div key={s.id} style={{ display: 'flex', alignItems: 'stretch', gap: 6 }}>
                    <button onClick={() => setSetup((p) => ({ ...p, scenario: s.id }))} style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', padding: '9px 11px', borderRadius: 9, cursor: 'pointer', border: `1px solid ${on ? TOW.goldDeep : TOW.line}`, background: on ? 'rgba(138,108,48,0.10)' : TOW.cardLt }}>
                      <span style={{ minWidth: 20, height: 20, padding: '0 4px', flexShrink: 0, borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: towFont.display, fontWeight: 700, fontSize: s.d6Label ? 10 : 12, color: on ? TOW.onGrad : TOW.muted, background: on ? goldGrad : 'transparent', border: on ? 'none' : `1px solid ${TOW.line}` }}>{s.d6Label ?? s.d6}</span>
                      <span style={{ minWidth: 0 }}>
                        <div style={{ fontFamily: towFont.display, fontWeight: 600, fontSize: 14, color: on ? TOW.goldDeep : TOW.ink }}>{s.name}</div>
                        <div style={{ fontFamily: towFont.serif, fontSize: 11.5, color: TOW.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.blurb}</div>
                      </span>
                    </button>
                    <button onClick={() => openRule(s.ruleSlug)} aria-label={`${s.name} rules`} title={`${s.name} rules`} style={{ width: 38, flexShrink: 0, borderRadius: 9, border: `1px solid ${TOW.goldDeep}`, background: 'rgba(184,134,47,0.10)', color: TOW.goldDeep, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{eyeSvg}</button>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      </>)}

      {tab === 'secondaries' && (<>
      {/* Secondary objectives (Matched Play) — overlaid on the board */}
      <div style={label}>Secondary objectives</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {SECONDARY_OBJECTIVES.map((s) => {
          const on = hasSec(s.id);
          return (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 7px', borderRadius: 8, border: `1px solid ${on ? TOW.goldDeep : TOW.line}`, background: on ? 'rgba(138,108,48,0.10)' : TOW.cardLt }}>
              <button onClick={() => toggleSecondary(s.id)} role="checkbox" aria-checked={on} aria-label={`Toggle ${s.name}`} style={{ width: 19, height: 19, flexShrink: 0, borderRadius: 5, cursor: 'pointer', border: `1px solid ${on ? TOW.goldDeep : TOW.lineStrong}`, background: on ? goldGrad : 'transparent', color: TOW.onGrad, fontSize: 12, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>{on ? '✓' : ''}</button>
              <button onClick={() => toggleSecondary(s.id)} style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                <div style={{ fontFamily: towFont.display, fontWeight: 600, fontSize: 13, color: on ? TOW.goldDeep : TOW.ink }}>{s.name}</div>
                <div style={{ fontFamily: towFont.serif, fontSize: 11, color: TOW.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.blurb}</div>
              </button>
              <button onClick={() => openRule(s.ruleSlug)} aria-label={`${s.name} rules`} title={`${s.name} rules`} style={{ flexShrink: 0, width: 28, height: 28, borderRadius: 7, border: `1px solid ${TOW.goldDeep}`, background: 'rgba(184,134,47,0.10)', color: TOW.goldDeep, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>{eyeSvg}</button>
            </div>
          );
        })}
      </div>

      </>)}

      {tab === 'table' && (<>
      {/* Table size */}
      <div style={label}>Table size</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
        {TABLE_PRESETS.map((t) => { const on = isPreset(t.w, t.h); return (
          <button key={t.label} onClick={() => setTable(t.w, t.h)} style={{ padding: '8px 12px', borderRadius: 8, border: `1px solid ${on ? TOW.goldDeep : TOW.line}`, cursor: 'pointer', fontFamily: towFont.display, fontWeight: 600, fontSize: 12.5, background: on ? 'rgba(138,108,48,0.14)' : TOW.cardLt, color: on ? TOW.gold : TOW.muted }}>{t.label}</button>
        ); })}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ ...eb, fontSize: 8, color: TOW.faint }}>Custom (inches)</span>
        <input type="number" inputMode="numeric" min={12} step={6} value={setup.tableW} onChange={(e) => setTable(Math.max(12, Math.floor(Number(e.target.value) || 0)), setup.tableH)} aria-label="Table width" style={{ width: 64, padding: '7px 9px', borderRadius: 8, border: `1px solid ${TOW.lineStrong}`, background: TOW.cardLt, fontFamily: towFont.display, fontWeight: 600, fontSize: 13, color: TOW.ink }} />
        <span style={{ color: TOW.muted }}>×</span>
        <input type="number" inputMode="numeric" min={12} step={6} value={setup.tableH} onChange={(e) => setTable(setup.tableW, Math.max(12, Math.floor(Number(e.target.value) || 0)))} aria-label="Table height" style={{ width: 64, padding: '7px 9px', borderRadius: 8, border: `1px solid ${TOW.lineStrong}`, background: TOW.cardLt, fontFamily: towFont.display, fontWeight: 600, fontSize: 13, color: TOW.ink }} />
        <span style={{ fontFamily: towFont.serif, fontSize: 12, color: TOW.muted }}>{setup.tableW}″ × {setup.tableH}″</span>
      </div>

      </>)}

      {tab === 'terrain' && (<>
      {/* Terrain */}
      <div style={label}>Terrain mix</div>
      {(() => {
        const n = setup.terrain.length;
        const met = n >= recCount;
        const over = n > recCount + 1;
        const tone = n === 0 ? TOW.muted : over ? TOW.blood : met ? '#4e7a45' : TOW.goldDeep;
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 11px', borderRadius: 10, border: `1px solid ${TOW.line}`, background: TOW.cardLt, marginBottom: 8 }}>
            <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 3, fontFamily: towFont.display, fontWeight: 700, color: tone }}>
              <span style={{ fontSize: 22, lineHeight: 1 }}>{n}</span>
              <span style={{ fontSize: 13, color: TOW.faint }}>/ {recCount}</span>
            </span>
            <span style={{ minWidth: 0, flex: 1, fontFamily: towFont.serif, fontSize: 11.5, color: TOW.muted, lineHeight: 1.3 }}>
              features · <span style={{ color: tone, fontWeight: 600 }}>{recCount} recommended</span> for a {setup.tableW}″ table<br />
              <span style={{ color: TOW.faint }}>Rulebook: ~1 feature per 12″ of the longest edge.</span>
            </span>
            <button onClick={() => openRule('how-much-terrain')} aria-label="Terrain rules" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, flexShrink: 0, borderRadius: 8, border: `1px solid ${TOW.goldDeep}`, background: 'rgba(184,134,47,0.12)', color: TOW.goldDeep, cursor: 'pointer', padding: 0 }}>{eyeSvg}</button>
          </div>
        );
      })()}

      {/* How-to */}
      <div style={{ fontFamily: towFont.serif, fontSize: 11.5, color: TOW.muted, margin: '0 0 7px', lineHeight: 1.35 }}>
        Tick the types you want, then <b style={{ color: TOW.goldDeep }}>Randomise mix</b> to spread the total across them — or set each count by hand with − / +. Happy with it? <b style={{ color: TOW.goldDeep }}>Randomise locations</b> scatters them on the map.
      </div>

      {/* Terrain types — tick = include in the random mix · − / + sets how many · eye = that type's rules */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 9 }}>
        {TERRAIN_TYPES.map((t) => {
          const on = enabledTypes.has(t.id);
          const n = setup.terrain.filter((p) => p.type === t.id).length;
          const removeOne = () => {
            const arr = setup.terrain;
            let idx = -1;
            for (let i = arr.length - 1; i >= 0; i--) if (arr[i].type === t.id) { idx = i; break; }
            if (idx < 0) return;
            if (arr[idx].id === selectedId) setSelectedId(null);
            setTerrain(arr.slice(0, idx).concat(arr.slice(idx + 1)));
          };
          return (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 7px', borderRadius: 8, border: `1px solid ${n > 0 ? TOW.lineStrong : TOW.line}`, background: TOW.cardLt }}>
              <button onClick={() => toggleType(t.id)} role="checkbox" aria-checked={on} aria-label={`Include ${t.label} in the random mix`} title="Include in Randomise mix" style={{ width: 19, height: 19, flexShrink: 0, borderRadius: 5, cursor: 'pointer', border: `1px solid ${on ? TOW.goldDeep : TOW.lineStrong}`, background: on ? goldGrad : 'transparent', color: TOW.onGrad, fontSize: 12, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>{on ? '✓' : ''}</button>
              <span style={{ flexShrink: 0, color: TOW.inkDim, display: 'inline-flex' }}><TerrainIcon type={t.id} size={20} /></span>
              <span style={{ flex: 1, minWidth: 0, display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: towFont.serif, fontSize: 13, color: TOW.ink }}>
                {t.label}
                {t.defaultTrait && <span title={TRAIT_RULE[t.defaultTrait].label} style={{ flexShrink: 0, color: TOW.faint, display: 'inline-flex' }}><TraitIcon trait={t.defaultTrait} size={13} /></span>}
              </span>
              <div style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0, border: `1px solid ${TOW.lineStrong}`, borderRadius: 7, overflow: 'hidden', background: TOW.panel2 }}>
                <button onClick={removeOne} disabled={n === 0} aria-label={`One fewer ${t.label}`} style={{ width: 26, height: 28, border: 'none', borderRight: `1px solid ${TOW.line}`, background: 'transparent', color: n === 0 ? TOW.faint : TOW.ink, cursor: n === 0 ? 'default' : 'pointer', fontSize: 16, fontFamily: towFont.display }}>−</button>
                <span style={{ minWidth: 22, textAlign: 'center', fontFamily: towFont.display, fontWeight: 700, fontSize: 13.5, color: n > 0 ? TOW.ink : TOW.faint }}>{n}</span>
                <button onClick={() => { const p = addPieceBalanced(setup, t.id); setTerrain([...setup.terrain, p]); }} aria-label={`One more ${t.label}`} style={{ width: 26, height: 28, border: 'none', borderLeft: `1px solid ${TOW.line}`, background: 'transparent', color: TOW.ink, cursor: 'pointer', fontSize: 16, fontFamily: towFont.display }}>+</button>
              </div>
              <button onClick={() => openRule(t.ruleSlug)} aria-label={`${t.label} rules`} title={`${t.label} rules`} style={{ flexShrink: 0, width: 28, height: 28, borderRadius: 7, border: `1px solid ${TOW.goldDeep}`, background: 'rgba(184,134,47,0.10)', color: TOW.goldDeep, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>{eyeSvg}</button>
            </div>
          );
        })}
      </div>

      {/* Randomise mix (total across ticked types) + Randomise locations + Clear */}
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 9 }}>
        <span style={{ ...eb, fontSize: 8, color: TOW.faint }}>Total</span>
        <div style={{ display: 'inline-flex', alignItems: 'center', border: `1px solid ${TOW.lineStrong}`, borderRadius: 8, overflow: 'hidden', background: TOW.cardLt }}>
          <button onClick={() => setRandomCount(clampN(count - 1, 1, 40))} aria-label="Lower total" style={{ width: 30, height: 32, border: 'none', borderRight: `1px solid ${TOW.line}`, background: 'transparent', color: TOW.ink, cursor: 'pointer', fontSize: 17, fontFamily: towFont.display }}>−</button>
          <span style={{ minWidth: 30, textAlign: 'center', fontFamily: towFont.display, fontWeight: 700, fontSize: 14, color: TOW.ink }}>{count}</span>
          <button onClick={() => setRandomCount(clampN(count + 1, 1, 40))} aria-label="Raise total" style={{ width: 30, height: 32, border: 'none', borderLeft: `1px solid ${TOW.line}`, background: 'transparent', color: TOW.ink, cursor: 'pointer', fontSize: 17, fontFamily: towFont.display }}>+</button>
        </div>
        <button onClick={() => { setSetup((s) => ({ ...s, terrain: scatterTerrain(s.tableW, s.tableH, count, [...enabledTypes]) })); setSelectedId(null); }} disabled={enabledTypes.size === 0} title="Spread the total across the ticked types" style={{ padding: '8px 12px', borderRadius: 8, border: `1px solid ${TOW.goldDeep}`, background: 'rgba(184,134,47,0.12)', color: TOW.goldDeep, cursor: enabledTypes.size === 0 ? 'default' : 'pointer', opacity: enabledTypes.size === 0 ? 0.5 : 1, fontFamily: towFont.display, fontWeight: 600, fontSize: 12.5 }}>🎲 Randomise mix</button>
        {setup.terrain.length > 0 && <button onClick={() => { setTerrain(shufflePlacement(setup.terrain, setup.tableW, setup.tableH)); setSelectedId(null); }} title="Re-place the current features at random" style={{ padding: '8px 12px', borderRadius: 8, border: `1px solid ${TOW.goldDeep}`, background: 'rgba(184,134,47,0.12)', color: TOW.goldDeep, cursor: 'pointer', fontFamily: towFont.display, fontWeight: 600, fontSize: 12.5 }}>📍 Randomise locations</button>}
        {setup.terrain.length > 0 && <button onClick={() => { setTerrain([]); setSelectedId(null); }} style={{ padding: '8px 12px', borderRadius: 8, border: `1px solid ${TOW.line}`, background: 'transparent', color: TOW.muted, cursor: 'pointer', fontFamily: towFont.display, fontWeight: 600, fontSize: 12.5 }}>Clear</button>}
      </div>

      </>)}

    </div>
  );
}
