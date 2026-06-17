import { useMemo, useRef } from 'react';
import { TOW, towFont } from '../../design/tow';
import { terrainType, type BattleSetupState, type TerrainPiece } from '../../lib/battle';

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

  // Standard deployment zones: 12"-deep bands off the two LONG edges (top/bottom on a landscape table).
  const landscape = tableW >= tableH;
  const zoneDepth = 12;
  const zones = landscape
    ? [{ x: 0, y: 0, w: tableW, h: zoneDepth, label: 'A' }, { x: 0, y: tableH - zoneDepth, w: tableW, h: zoneDepth, label: 'B' }]
    : [{ x: 0, y: 0, w: zoneDepth, h: tableH, label: 'A' }, { x: tableW - zoneDepth, y: 0, w: zoneDepth, h: tableH, label: 'B' }];

  return (
    <svg
      ref={svgRef}
      viewBox={`-0.5 -0.5 ${tableW + 1} ${tableH + 1}`}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onClick={() => onSelect(null)}
      style={{ width: '100%', aspectRatio: `${tableW} / ${tableH}`, display: 'block', background: '#efe7d4', borderRadius: 10, border: `1px solid ${TOW.lineStrong}`, touchAction: 'none' }}
    >
      {/* deployment zones */}
      {zones.map((z) => (
        <g key={z.label}>
          <rect x={z.x} y={z.y} width={z.w} height={z.h} fill="rgba(138,108,48,0.10)" stroke="rgba(138,108,48,0.45)" strokeWidth={0.2} strokeDasharray="1.5 1.2" />
          <text x={z.x + 2} y={z.y + (landscape ? z.h - 2 : 5)} fontSize={4} fontFamily={towFont.display} fontWeight={700} fill="rgba(138,108,48,0.6)">{z.label}</text>
        </g>
      ))}
      {grid}
      {/* terrain features */}
      {terrain.map((p) => {
        const tt = terrainType(p.type);
        const sel = p.id === selectedId;
        return (
          <g key={p.id} onPointerDown={(e) => onPointerDown(e, p)} style={{ cursor: editable ? 'move' : 'default' }}>
            <rect x={p.x} y={p.y} width={p.w} height={p.h} rx={1.2} fill={tt.color} fillOpacity={0.62} stroke={sel ? TOW.goldBright : tt.color} strokeWidth={sel ? 0.7 : 0.35} />
            <text x={p.x + p.w / 2} y={p.y + p.h / 2 + 1.2} fontSize={Math.min(3.2, p.w / Math.max(2, tt.label.length) * 1.4)} textAnchor="middle" fontFamily={towFont.serif} fill="#fff" style={{ pointerEvents: 'none' }}>{tt.label}</text>
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
