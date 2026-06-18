import { useMemo, useRef } from 'react';
import { TOW, towFont } from '../../design/tow';
import { terrainType, deploymentFor, type BattleSetupState, type TerrainPiece } from '../../lib/battle';
import { terrainIconNode } from './terrainIcons';

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

// Interactive battlefield: an SVG grid measured in inches (viewBox = the table size, so 1 unit = 1").
// Shows a light 1" grid + bold 12" lines, the two standard deployment zones, and the placed terrain
// features. Terrain can be dragged (pointer = mouse + touch, snaps to 1") and tapped to select.
export function BattleBoard({ setup, onChange, selectedId, onSelect, editable = true }: {
  setup: BattleSetupState;
  onChange: (terrain: TerrainPiece[]) => void;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  editable?: boolean;
}) {
  const { tableW, tableH, terrain } = setup;
  const svgRef = useRef<SVGSVGElement>(null);
  const terrainRef = useRef(terrain); terrainRef.current = terrain;
  const drag = useRef<{ id: string; px: number; py: number; ox: number; oy: number; moved: boolean } | null>(null);

  const pxPerInch = () => { const el = svgRef.current; return el ? el.getBoundingClientRect().width / tableW : 8; };

  const onPointerDown = (e: React.PointerEvent, p: TerrainPiece) => {
    if (!editable) return;
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    drag.current = { id: p.id, px: e.clientX, py: e.clientY, ox: p.x, oy: p.y, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current; if (!d) return;
    const s = pxPerInch();
    if (Math.abs(e.clientX - d.px) + Math.abs(e.clientY - d.py) > 3) d.moved = true;
    const np = terrainRef.current.map((t) => {
      if (t.id !== d.id) return t;
      const nx = clamp(Math.round(d.ox + (e.clientX - d.px) / s), 0, tableW - t.w);
      const ny = clamp(Math.round(d.oy + (e.clientY - d.py) / s), 0, tableH - t.h);
      return { ...t, x: nx, y: ny };
    });
    onChange(np);
  };
  const onPointerUp = () => { const d = drag.current; drag.current = null; if (d && !d.moved) onSelect(d.id === selectedId ? null : d.id); };

  // 1" grid (light) + 12" lines (bold) — memoised so dragging terrain doesn't rebuild them.
  const grid = useMemo(() => {
    const lines: React.ReactNode[] = [];
    for (let x = 0; x <= tableW; x++) lines.push(<line key={`v${x}`} x1={x} y1={0} x2={x} y2={tableH} stroke={x % 12 === 0 ? 'rgba(74,55,22,0.5)' : 'rgba(74,55,22,0.12)'} strokeWidth={x % 12 === 0 ? 0.25 : 0.08} />);
    for (let y = 0; y <= tableH; y++) lines.push(<line key={`h${y}`} x1={0} y1={y} x2={tableW} y2={y} stroke={y % 12 === 0 ? 'rgba(74,55,22,0.5)' : 'rgba(74,55,22,0.12)'} strokeWidth={y % 12 === 0 ? 0.25 : 0.08} />);
    return lines;
  }, [tableW, tableH]);

  // Scenario-specific deployment: zones (main/flank), an optional central objective, and the
  // impassable cliff strips for Mountain Pass. Drawn so the chosen pitched battle is visible.
  const layout = deploymentFor(setup.scenario, tableW, tableH);

  return (
    <svg
      ref={svgRef}
      viewBox={`-0.5 -0.5 ${tableW + 1} ${tableH + 1}`}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onClick={() => onSelect(null)}
      style={{ width: '100%', aspectRatio: `${tableW} / ${tableH}`, display: 'block', background: '#efe7d4', borderRadius: 10, border: `1px solid ${TOW.lineStrong}`, touchAction: 'none' }}
    >
      {/* deployment zones — main (gold) and flank (blue); rectangles, or a polygon for diagonal maps */}
      {layout.zones.map((z, i) => {
        const flank = z.kind === 'flank';
        const fill = flank ? 'rgba(70,110,150,0.12)' : 'rgba(138,108,48,0.12)';
        const line = flank ? 'rgba(70,110,150,0.55)' : 'rgba(138,108,48,0.5)';
        const txtFill = flank ? 'rgba(70,110,150,0.8)' : 'rgba(138,108,48,0.75)';
        const fs = flank ? 3 : 4.5;
        if (z.poly) {
          const cx = z.poly.reduce((s, p) => s + p[0], 0) / z.poly.length;
          const cy = z.poly.reduce((s, p) => s + p[1], 0) / z.poly.length;
          return (
            <g key={`${z.label}${i}`}>
              <polygon points={z.poly.map((p) => p.join(',')).join(' ')} fill={fill} stroke={line} strokeWidth={0.25} strokeDasharray="1.5 1.2" />
              <text x={cx} y={cy + fs / 2} fontSize={fs} textAnchor="middle" fontFamily={towFont.display} fontWeight={700} fill={txtFill}>{z.label}</text>
            </g>
          );
        }
        return (
          <g key={`${z.label}${i}`}>
            <rect x={z.x} y={z.y} width={z.w} height={z.h} fill={fill} stroke={line} strokeWidth={0.25} strokeDasharray="1.5 1.2" />
            <text x={z.x + Math.min(2.5, z.w / 2)} y={z.y + Math.min(5.5, z.h - 1.5)} fontSize={fs} fontFamily={towFont.display} fontWeight={700} fill={txtFill}>{z.label}</text>
          </g>
        );
      })}
      {/* impassable cliff strips (Mountain Pass) */}
      {layout.impassable?.map((c, i) => (
        <rect key={`imp${i}`} x={c.x} y={c.y} width={c.w} height={c.h} fill="rgba(60,45,30,0.55)" />
      ))}
      {grid}
      {/* central special feature / objective (Command & Control) */}
      {layout.objective && (
        <g>
          <circle cx={layout.objective.x} cy={layout.objective.y} r={3.4} fill="rgba(138,108,48,0.18)" stroke={TOW.goldDeep} strokeWidth={0.3} />
          <text x={layout.objective.x} y={layout.objective.y + 1.7} fontSize={4.4} textAnchor="middle" fill={TOW.goldDeep} style={{ pointerEvents: 'none' }}>★</text>
        </g>
      )}
      {/* terrain features */}
      {terrain.map((p) => {
        const tt = terrainType(p.type);
        const sel = p.id === selectedId;
        // Trait styling: dangerous = red dashed, difficult = brown dashed; selection turns it gold.
        const trait = p.dangerous ? { stroke: '#b23b3b', dash: '1.4 1', sw: 0.55 } : p.difficult ? { stroke: '#5c4326', dash: '1 1', sw: 0.5 } : { stroke: tt.color, dash: undefined as string | undefined, sw: 0.35 };
        // Clean type icon centred in the piece (nested SVG remaps its 0..24 space to inches).
        const iconSize = Math.min(p.w, p.h) * 0.66;
        return (
          <g key={p.id} onPointerDown={(e) => onPointerDown(e, p)} style={{ cursor: editable ? 'move' : 'default' }}>
            <rect x={p.x} y={p.y} width={p.w} height={p.h} rx={1.2} fill={tt.color} fillOpacity={0.26} stroke={sel ? TOW.goldBright : trait.stroke} strokeWidth={sel ? 0.8 : trait.sw} strokeDasharray={trait.dash} />
            <svg x={p.x + (p.w - iconSize) / 2} y={p.y + (p.h - iconSize) / 2} width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke="#46341a" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={{ pointerEvents: 'none' }}>{terrainIconNode(p.type)}</svg>
            {p.dangerous && <text x={p.x + 1.4} y={p.y + 2.6} fontSize={2.6} fill="#fff" stroke="#b23b3b" strokeWidth={0.15} style={{ pointerEvents: 'none' }}>⚠</text>}
            {sel && editable && (
              <g onPointerDown={(e) => { e.stopPropagation(); onChange(terrainRef.current.filter((t) => t.id !== p.id)); onSelect(null); }} style={{ cursor: 'pointer' }}>
                <circle cx={p.x + p.w} cy={p.y} r={2.2} fill={TOW.blood} />
                <text x={p.x + p.w} y={p.y + 0.9} fontSize={3} textAnchor="middle" fill="#fff" style={{ pointerEvents: 'none' }}>×</text>
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}
