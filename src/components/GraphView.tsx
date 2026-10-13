'use client';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, SimulationNodeDatum } from 'd3-force';
import type { GEdge, GNode } from '@/lib/graph';
import { ratingColor } from './Icon';

type SimNode = GNode & SimulationNodeDatum;

export function GraphView({ nodes, edges, height = 600, selected, focus, onSelect, onOpen, colorByRating, sizeBy = 'links', compact }: {
  nodes: GNode[]; edges: GEdge[]; height?: number; selected?: string | null; focus?: string | null;
  onSelect?: (id: string | null) => void; onOpen?: (n: GNode) => void; colorByRating?: boolean; sizeBy?: 'links' | 'notes'; compact?: boolean;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [tick, setTick] = useState(0);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const [hover, setHover] = useState<string | null>(null);
  const simNodes = useRef<SimNode[]>([]);
  const drag = useRef<{ id?: string; panX?: number; panY?: number; sx: number; sy: number; moved: boolean } | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const key = nodes.map((n) => n.id).join('|') + '#' + edges.length;
  useEffect(() => {
    const prev = new Map(simNodes.current.map((n) => [n.id, n]));
    const sn: SimNode[] = nodes.map((n) => ({ ...n, x: prev.get(n.id)?.x, y: prev.get(n.id)?.y }));
    simNodes.current = sn;
    const links = edges.map((e) => ({ source: e.source, target: e.target }));
    const sim = forceSimulation(sn)
      .force('link', forceLink(links).id((d: any) => d.id).distance(compact ? 46 : 70).strength(0.5))
      .force('charge', forceManyBody().strength(compact ? -110 : -170))
      .force('center', forceCenter(0, 0))
      .force('x', forceX(0).strength(0.04)).force('y', forceY(0).strength(0.06))
      .force('collide', forceCollide(compact ? 14 : 20))
      .alpha(0.9);
    if (focus) { const f = sn.find((n) => n.id === focus); if (f) { f.fx = 0; f.fy = 0; } }
    let frames = 0;
    sim.on('tick', () => { frames++; if (frames % 2 === 0) setTick((t) => t + 1); });
    return () => { sim.stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, focus, compact]);

  const pos = useMemo(() => new Map(simNodes.current.map((n) => [n.id, n])), [tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const active = hover || selected || null;
  const neighbors = useMemo(() => {
    if (!active) return null;
    const s = new Set([active]);
    edges.forEach((e) => { if (e.source === active) s.add(e.target); if (e.target === active) s.add(e.source); });
    return s;
  }, [active, edges]);

  const radius = (n: GNode) => {
    if (n.kind === 'note') return 4;
    if (n.kind === 'tag' || n.kind === 'author') return 5.5;
    const w = sizeBy === 'notes' ? n.weight : n.weight;
    return Math.min(13, 6 + Math.sqrt(w) * 1.8) + (n.id === focus ? 3 : 0);
  };

  const toWorld = (cx: number, cy: number) => {
    const r = wrap.current!.getBoundingClientRect();
    return { x: (cx - r.left - width / 2 - view.x) / view.k, y: (cy - r.top - height / 2 - view.y) / view.k };
  };

  const onDown = (e: React.PointerEvent, id?: string) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = id ? { id, sx: e.clientX, sy: e.clientY, moved: false } : { panX: view.x, panY: view.y, sx: e.clientX, sy: e.clientY, moved: false };
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (Math.abs(e.clientX - d.sx) + Math.abs(e.clientY - d.sy) > 3) d.moved = true;
    if (d.id) {
      const n = simNodes.current.find((x) => x.id === d.id);
      if (n) { const w = toWorld(e.clientX, e.clientY); n.fx = w.x; n.fy = w.y; n.x = w.x; n.y = w.y; setTick((t) => t + 1); }
    } else setView((v) => ({ ...v, x: d.panX! + e.clientX - d.sx, y: d.panY! + e.clientY - d.sy }));
  };
  const onUp = (e: React.PointerEvent, n?: GNode) => {
    const d = drag.current;
    drag.current = null;
    if (d?.id && !d.moved && n) { onSelect?.(n.id); if (e.detail >= 2 || compact) onOpen?.(n); }
    else if (!d?.id && !d?.moved) onSelect?.(null);
  };
  const onWheel = (e: React.WheelEvent) => {
    const k = Math.min(3, Math.max(0.3, view.k * (e.deltaY < 0 ? 1.1 : 0.9)));
    setView((v) => ({ ...v, k }));
  };

  return (
    <div ref={wrap} style={{ position: 'relative', width: '100%', height, overflow: 'hidden', touchAction: 'none', cursor: drag.current && !drag.current.id ? 'grabbing' : 'grab' }}
      onPointerDown={(e) => onDown(e)} onPointerMove={onMove} onPointerUp={(e) => onUp(e)} onWheel={onWheel}>
      <svg width={width} height={height} role="img" aria-label="Graph of books, tags and notes" style={{ display: 'block' }}>
        <g transform={`translate(${width / 2 + view.x},${height / 2 + view.y}) scale(${view.k})`}>
          {edges.map((e, i) => {
            const a = pos.get(e.source), b = pos.get(e.target);
            if (!a || !b || a.x == null || b.x == null) return null;
            const hot = neighbors && neighbors.has(e.source) && neighbors.has(e.target);
            return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={hot ? 'var(--ink-secondary)' : 'var(--border-control)'} strokeOpacity={neighbors ? (hot ? 0.9 : 0.15) : 0.4} strokeWidth={1.1 / view.k} strokeDasharray={e.kind === 'tag' ? `${3 / view.k} ${3 / view.k}` : undefined} />;
          })}
          {simNodes.current.map((n) => {
            if (n.x == null) return null;
            const r = radius(n);
            const sel = n.id === selected || n.id === focus;
            const dim = neighbors && !neighbors.has(n.id);
            const fill = sel ? 'var(--primary)' : n.kind === 'book' ? (n.nofile ? 'var(--surface)' : colorByRating && n.rating != null ? ratingColor(n.rating) : 'var(--ink-muted)') : n.kind === 'note' ? 'var(--border-control)' : 'var(--surface)';
            const stroke = n.kind === 'tag' || n.kind === 'author' ? 'var(--ink-muted)' : n.nofile ? 'var(--border-control)' : 'none';
            const showLabel = !compact || n.kind !== 'note' || sel;
            return (
              <g key={n.id} transform={`translate(${n.x},${n.y})`} opacity={dim ? 0.25 : n.status === 'paused' ? 0.6 : 1}
                onPointerDown={(e) => onDown(e, n.id)} onPointerUp={(e) => { e.stopPropagation(); onUp(e, n); }}
                onMouseEnter={() => setHover(n.id)} onMouseLeave={() => setHover(null)} style={{ cursor: 'pointer' }}>
                {sel && <circle r={r + 5} fill="var(--primary-soft)" />}
                <circle r={r} fill={fill} stroke={stroke} strokeWidth={1.5} strokeDasharray={n.nofile ? '3 2' : undefined} />
                {showLabel && <text y={r + 12} textAnchor="middle" fontSize={compact ? 10 : 11} fill={sel ? 'var(--ink)' : 'var(--ink-secondary)'} fontWeight={sel ? 600 : 400} style={{ pointerEvents: 'none', userSelect: 'none' }}>{n.label.length > 26 ? n.label.slice(0, 25) + '…' : n.label}</text>}
                <title>{n.label}</title>
              </g>
            );
          })}
        </g>
      </svg>
      {!compact && (
        <div className="row" style={{ position: 'absolute', right: 12, top: 12, gap: 4 }}>
          <button className="ib" aria-label="Zoom in" onClick={() => setView((v) => ({ ...v, k: Math.min(3, v.k * 1.2) }))} style={{ background: 'var(--surface)' }}>+</button>
          <button className="ib" aria-label="Zoom out" onClick={() => setView((v) => ({ ...v, k: Math.max(0.3, v.k / 1.2) }))} style={{ background: 'var(--surface)' }}>−</button>
          <button className="btn ghost sm" onClick={() => setView({ x: 0, y: 0, k: 1 })} style={{ background: 'var(--surface)' }}>Fit</button>
        </div>
      )}
    </div>
  );
}
