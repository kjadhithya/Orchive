'use client';
import React, { useMemo } from 'react';
import type { Session } from '@/lib/types';
import { dayKey, duration, MONTHS } from '@/lib/util';

export function dailySeconds(sessions: Session[]) {
  const m = new Map<string, number>();
  sessions.forEach((s) => { const k = dayKey(s.started_at); m.set(k, (m.get(k) || 0) + (s.seconds || 0)); });
  return m;
}

export function streaks(days: Map<string, number>) {
  let current = 0, longest = 0, run = 0;
  const today = new Date();
  // current: count back from today (or yesterday if nothing today yet)
  for (let i = 0; i < 400; i++) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    if ((days.get(dayKey(d)) || 0) >= 60) current++;
    else if (i === 0) continue;
    else break;
  }
  for (let i = 400; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    if ((days.get(dayKey(d)) || 0) >= 60) { run++; longest = Math.max(longest, run); } else run = 0;
  }
  return { current, longest };
}

export function Heatmap({ sessions, weeks = 26 }: { sessions: Session[]; weeks?: number }) {
  const days = useMemo(() => dailySeconds(sessions), [sessions]);
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (weeks * 7 - 1) - today.getDay());
  const cells: { d: Date; s: number }[] = [];
  for (let i = 0; i < weeks * 7 + today.getDay() + 1 && i < (weeks + 1) * 7; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    if (d > today) break;
    cells.push({ d, s: days.get(dayKey(d)) || 0 });
  }
  const level = (s: number) => (s < 60 ? 0 : s < 600 ? 1 : s < 1500 ? 2 : s < 2700 ? 3 : s < 4500 ? 4 : 5);
  const colors = ['var(--surface-alt)', 'var(--rating-1)', 'var(--rating-2)', 'var(--rating-3)', 'var(--rating-4)', 'var(--rating-5)'];
  const monthLabels: { col: number; label: string }[] = [];
  cells.forEach((c, i) => { if (c.d.getDate() <= 7 && c.d.getDay() === 0) monthLabels.push({ col: Math.floor(i / 7), label: MONTHS[c.d.getMonth()] }); });
  return (
    <div className="col" style={{ gap: 6, overflowX: 'auto' }}>
      <div style={{ position: 'relative', height: 14, minWidth: Math.ceil(cells.length / 7) * 18 }}>
        {monthLabels.map((m) => <span key={m.col} className="cap" style={{ position: 'absolute', left: m.col * 18 }}>{m.label}</span>)}
      </div>
      <div role="img" aria-label="Daily reading time" style={{ display: 'grid', gridTemplateRows: 'repeat(7, 14px)', gridAutoFlow: 'column', gridAutoColumns: '14px', gap: 4 }}>
        {cells.map((c, i) => <span key={i} title={`${c.d.toDateString()}: ${c.s ? duration(c.s) : 'no reading'}`} style={{ borderRadius: 3, background: colors[level(c.s)] }} />)}
      </div>
      <div className="row cap" style={{ gap: 4 }}>Less{colors.map((c, i) => <span key={i} style={{ width: 12, height: 12, borderRadius: 3, background: c }} />)}More</div>
    </div>
  );
}
