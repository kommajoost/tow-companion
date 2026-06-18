import { useMemo, useRef } from 'react';
import { TOW, towFont } from '../../design/tow';
import { deploymentFor, type BattleSetupState, type TerrainPiece } from '../../lib/battle';
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

  // Uniform 1" grid (everything is measured in inches; no bold foot lines) — memoised so dragging
  // terrain doesn't rebuild them.
  const grid = useMemo(() => {
    const lines: React.ReactNode[] = [];
    for (let x = 0; x <= tableW; x++) lines.push(<line key={`v${x}`} x1={x} y1={0} x2={x} y2={tableH} stroke="rgba(74,55,22,0.13)" strokeWidth={0.08} />);
    for (let y = 0; y <= tableH; y++) lines.push(<line key={`h${y}`} x1={0} y1={y} x2={tableW} y2={y} stroke="rgba(74,55,22,0.13)" strokeWidth={0.08} />);
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
      {/* deployment zones — just a darker shaded area (no border); main = gold, flank = blue */}
      {layout.zones.map((z, i) => {
        const flank = z.kind === 'flank';
        const fill = flank ? 'rgba(70,110,150,0.20)' : 'rgba(120,92,40,0.20)';
        const txtFill = flank ? 'rgba(70,110,150,0.7)' : 'rgba(120,92,40,0.7)';
        const fs = flank ? 2.2 : 3;
        if (z.poly) {
          const cx = z.poly.reduce((s, p) => s + p[0], 0) / z.poly.length;
          const cy = z.poly.reduce((s, p) => s + p[1], 0) / z.poly.length;
          return (
            <g key={`${z.label}${i}`}>
              <polygon points={z.poly.map((p) => p.join(',')).join(' ')} fill={fill} />
              <text x={cx} y={cy + fs / 2} fontSize={fs} textAnchor="middle" fontFamily={towFont.display} fontWeight={700} fill={txtFill}>{z.label}</text>
            </g>
          );
        }
        return (
          <g key={`${z.label}${i}`}>
            <rect x={z.x} y={z.y} width={z.w} height={z.h} fill={fill} />
            <text x={z.x + Math.min(2, z.w / 2)} y={z.y + Math.min(4, z.h - 1)} fontSize={fs} fontFamily={towFont.display} fontWeight={700} fill={txtFill}>{z.label}</text>
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
        const sel = p.id === selectedId;
        // Just the symbol on the map — no box, no border. Trait shown by icon colour
        // (dangerous = red, difficult = brown), selection turns it gold.
        const iconColor = sel ? TOW.goldBright : p.dangerous ? '#b23b3b' : p.difficult ? '#5c4326' : '#46341a';
        const iconSize = Math.min(p.w, p.h) * (sel ? 0.86 : 0.74);
        return (
          <g key={p.id} onPointerDown={(e) => onPointerDown(e, p)} style={{ cursor: editable ? 'move' : 'default' }}>
            {/* invisible hit area so the symbol can still be dragged/tapped */}
            <rect x={p.x} y={p.y} width={p.w} height={p.h} fill="transparent" />
            <svg x={p.x + (p.w - iconSize) / 2} y={p.y + (p.h - iconSize) / 2} width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke={iconColor} strokeWidth={sel ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round" style={{ pointerEvents: 'none' }}>{terrainIconNode(p.type)}</svg>
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
