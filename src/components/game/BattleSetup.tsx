import { useState } from 'react';
import { usePersistentState } from '../../store';
import { useUI } from '../../state';
import { useBackClose } from '../../lib/backStack';
import { TOW, towFont, engraved } from '../../design/tow';
import {
  SCENARIOS, scenarioById, TERRAIN_TYPES, TABLE_PRESETS, DEFAULT_BATTLE,
  recommendedTerrainCount, scatterTerrain, addTerrain,
  type BattleSetupState, type TerrainPiece,
} from '../../lib/battle';
import { BattleBoard } from './BattleBoard';

const eb = engraved as React.CSSProperties;
const goldGrad = `linear-gradient(180deg, ${TOW.goldBright} 0%, ${TOW.gold} 55%, ${TOW.goldDeep} 100%)`;

// Pre-game battlefield setup: pick a pitched-battle scenario (rules behind an eye), set the table
// size, then place terrain on an inch-grid board — manually from the palette or scattered randomly
// per the rulebook's "one feature per 12 inches" guide. Saved locally as a planning aid you recreate
// on the real table. (Pre-made layouts are a later step.)
export function BattleSetup({ onBack }: { onBack: () => void }) {
  const [setup, setSetup] = usePersistentState<BattleSetupState>('tow:battle', DEFAULT_BATTLE);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { openRule } = useUI();
  useBackClose(true, onBack);

  const scenario = scenarioById(setup.scenario);
  const recCount = recommendedTerrainCount(setup.tableW, setup.tableH);
  const isPreset = (w: number, h: number) => setup.tableW === w && setup.tableH === h;

  const setTable = (w: number, h: number) => setSetup((s) => ({
    ...s, tableW: w, tableH: h,
    terrain: s.terrain.map((t) => ({ ...t, x: Math.min(t.x, Math.max(0, w - t.w)), y: Math.min(t.y, Math.max(0, h - t.h)) })),
  }));
  const setTerrain = (terrain: TerrainPiece[]) => setSetup((s) => ({ ...s, terrain }));

  const label: React.CSSProperties = { ...eb, fontSize: 8.5, color: TOW.muted, margin: '16px 0 7px' };
  const eyeSvg =<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" strokeLinecap="round" strokeLinejoin="round" /><circle cx="12" cy="12" r="3" /></svg>;

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '12px 14px 32px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <button onClick={onBack} aria-label="Back" style={{ height: 32, flexShrink: 0, borderRadius: 8, cursor: 'pointer', border: `1px solid ${TOW.lineStrong}`, background: TOW.cardLt, fontFamily: towFont.display, fontWeight: 600, fontSize: 12.5, color: TOW.inkDim, padding: '0 11px', display: 'inline-flex', alignItems: 'center', gap: 4 }}>‹ Back</button>
        <h2 style={{ margin: 0, fontFamily: towFont.display, fontWeight: 700, fontSize: 20, color: TOW.ink }}>Battlefield setup</h2>
      </div>

      {/* Scenario */}
      <div style={label}>Scenario · Pitched Battle</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {SCENARIOS.map((s) => {
          const on = setup.scenario === s.id;
          return (
            <div key={s.id} style={{ display: 'flex', alignItems: 'stretch', gap: 6 }}>
              <button onClick={() => setSetup((p) => ({ ...p, scenario: s.id }))} style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', padding: '9px 11px', borderRadius: 9, cursor: 'pointer', border: `1px solid ${on ? TOW.goldDeep : TOW.line}`, background: on ? 'rgba(138,108,48,0.10)' : TOW.cardLt }}>
                <span style={{ width: 20, height: 20, flexShrink: 0, borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: towFont.display, fontWeight: 700, fontSize: 12, color: on ? TOW.onGrad : TOW.muted, background: on ? goldGrad : 'transparent', border: on ? 'none' : `1px solid ${TOW.line}` }}>{s.d6}</span>
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

      {/* Terrain */}
      <div style={{ ...label, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span>Terrain · {setup.terrain.length}/{recCount} recommended</span>
        <button onClick={() => openRule('how-much-terrain')} aria-label="Terrain rules" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, borderRadius: 999, border: `1px solid ${TOW.goldDeep}`, background: 'rgba(184,134,47,0.12)', color: TOW.goldDeep, cursor: 'pointer', padding: 0 }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" strokeLinecap="round" strokeLinejoin="round" /><circle cx="12" cy="12" r="3" /></svg></button>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 9 }}>
        {TERRAIN_TYPES.map((t) => (
          <button key={t.id} onClick={() => { const p = addTerrain(setup, t.id); setTerrain([...setup.terrain, p]); setSelectedId(p.id); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 10px', borderRadius: 8, border: `1px solid ${TOW.line}`, background: TOW.cardLt, cursor: 'pointer', fontFamily: towFont.serif, fontSize: 12.5, color: TOW.ink }}>
            <span style={{ width: 11, height: 11, borderRadius: 3, background: t.color, flexShrink: 0 }} />+ {t.label}
          </button>
        ))}
        <button onClick={() => { setSetup((s) => ({ ...s, terrain: scatterTerrain(s.tableW, s.tableH) })); setSelectedId(null); }} style={{ padding: '7px 12px', borderRadius: 8, border: `1px solid ${TOW.goldDeep}`, background: 'rgba(184,134,47,0.12)', color: TOW.goldDeep, cursor: 'pointer', fontFamily: towFont.display, fontWeight: 600, fontSize: 12.5 }}>🎲 Random</button>
        {setup.terrain.length > 0 && <button onClick={() => { setTerrain([]); setSelectedId(null); }} style={{ padding: '7px 12px', borderRadius: 8, border: `1px solid ${TOW.line}`, background: 'transparent', color: TOW.muted, cursor: 'pointer', fontFamily: towFont.display, fontWeight: 600, fontSize: 12.5 }}>Clear</button>}
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, margin: '4px 0 6px' }}>
        <span style={{ fontFamily: towFont.display, fontWeight: 700, fontSize: 13.5, color: TOW.ink }}>{scenario?.name ?? 'Battlefield'}</span>
        <span style={{ fontFamily: towFont.serif, fontSize: 11.5, color: TOW.faint }}>{setup.tableW}″ × {setup.tableH}″</span>
      </div>
      <BattleBoard setup={setup} onChange={setTerrain} selectedId={selectedId} onSelect={setSelectedId} />
      <div style={{ fontFamily: towFont.serif, fontStyle: 'italic', fontSize: 11.5, color: TOW.muted, marginTop: 7 }}>
        Drag a feature to move it (snaps to 1″) · tap to select · × to remove. Zones A/B are the standard 12″ deployment areas — see the scenario for exact deployment.
      </div>
    </div>
  );
}
