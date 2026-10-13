'use client';
import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLibrary } from '@/lib/store';
import { Icon, RatingMark } from '@/components/Icon';
import { Empty, Seg, usePanel } from '@/components/ui';
import { Heatmap, dailySeconds, streaks } from '@/components/Heatmap';
import { daysBetween, duration, MONTHS, MONTHS_LONG, pct } from '@/lib/util';
import type { Book } from '@/lib/types';
import { excerpt } from '@/lib/markdown';

type Zoom = 'week' | 'month' | 'year' | 'all';
const DAY = 86400000;

export default function TimelinePage() {
  const lib = useLibrary();
  const { live, notes, goals, tagsOf, tags, sessions, loadSessions } = lib;
  const router = useRouter();
  const [view, setView] = useState<'bars' | 'journal' | 'calendar'>('bars');
  const [zoom, setZoom] = useState<Zoom>('month');
  const [status, setStatus] = useState('all');
  const [tag, setTag] = useState('');
  const [fileF, setFileF] = useState<'all' | 'without'>('all');
  const [minRating, setMinRating] = useState(0);
  useEffect(() => { loadSessions(); }, [loadSessions]);
  const [side, toggleSide] = usePanel('timeline');

  const filtered = useMemo(() => live.filter((b) => (status === 'all' || b.status === status) && (!tag || tagsOf(b.id).some((t) => t.name === tag)) && (fileF === 'all' || !b.file_path) && (!minRating || (b.rating ?? 0) >= minRating)), [live, status, tag, fileF, minRating, tagsOf]);
  const now = Date.now();

  // window
  const [from, to] = useMemo(() => {
    const d = new Date();
    if (zoom === 'week') return [now - 41 * DAY, now + 4 * DAY];
    if (zoom === 'month') return [new Date(d.getFullYear(), d.getMonth() - 5, 1).getTime(), new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime() + 0];
    if (zoom === 'year') return [new Date(d.getFullYear(), 0, 1).getTime(), new Date(d.getFullYear() + 1, 0, 1).getTime()];
    const starts = filtered.map((b) => new Date(b.started_at || b.created_at).getTime());
    const first = starts.length ? Math.min(...starts) : now - 180 * DAY;
    const f = new Date(first);
    return [new Date(f.getFullYear(), f.getMonth(), 1).getTime(), now + 15 * DAY];
  }, [zoom, filtered, now]);
  const span = to - from;
  const X = (t: number) => ((t - from) / span) * 100;

  const rows = filtered
    .filter((b) => b.started_at || b.status === 'completed')
    .map((b) => {
      const start = new Date(b.started_at || b.completed_at || b.created_at).getTime();
      const end = b.status === 'completed' ? new Date(b.completed_at || b.updated_at).getTime() : b.status === 'paused' ? new Date(b.location_updated_at || b.updated_at).getTime() : now;
      return { b, start, end: Math.max(end, start + DAY / 2) };
    })
    .filter((r) => r.end >= from && r.start <= to)
    .sort((a, b) => a.start - b.start);

  const ticks = useMemo(() => {
    const out: { t: number; label: string; month?: number; year?: number }[] = [];
    if (zoom === 'week') { for (let t = from; t <= to; t += 7 * DAY) { const d = new Date(t); out.push({ t, label: `${d.getDate()} ${MONTHS[d.getMonth()]}` }); } }
    else {
      const d0 = new Date(from);
      for (let d = new Date(d0.getFullYear(), d0.getMonth(), 1); d.getTime() < to; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
        if (zoom === 'all' && span > 600 * DAY && d.getMonth() % 3) continue;
        out.push({ t: d.getTime(), label: d.getMonth() === 0 || out.length === 0 ? `${MONTHS[d.getMonth()]} ${d.getFullYear()}` : MONTHS[d.getMonth()], month: d.getMonth() + 1, year: d.getFullYear() });
      }
    }
    return out;
  }, [zoom, from, to, span]);

  const completedIn = (y: number, m: number) => live.filter((b) => b.status === 'completed' && b.completed_at && new Date(b.completed_at).getFullYear() === y && new Date(b.completed_at).getMonth() + 1 === m).length;
  const monthGoal = (y: number, m: number) => goals.find((g) => g.year === y && g.month === m)?.target ?? goals.find((g) => g.year === y && g.month == null && false)?.target;

  // journal events
  const events = useMemo(() => {
    const ev: { t: number; kind: string; book?: Book; text: string; meta: string; href: string; noFile?: boolean; rating?: number | null }[] = [];
    filtered.forEach((b) => {
      if (b.started_at) ev.push({ t: new Date(b.started_at).getTime(), kind: 'Started', book: b, text: b.title, meta: `${b.author || ''}${b.status === 'reading' ? ` · ${pct(b.progress)} so far` : ''}`, href: `/book/${b.id}`, noFile: !b.file_path });
      if (b.status === 'completed' && b.completed_at) { const d = daysBetween(b.started_at, b.completed_at); ev.push({ t: new Date(b.completed_at).getTime(), kind: b.file_path ? 'Completed' : 'Completed · no file', book: b, text: b.title, meta: `${b.author || ''}${d ? ` · ${d} days` : ''}`, href: `/book/${b.id}`, noFile: !b.file_path, rating: b.rating }); }
      if (b.status === 'paused') ev.push({ t: new Date(b.location_updated_at || b.updated_at).getTime(), kind: 'Paused', book: b, text: b.title, meta: `Stopped at ${pct(b.progress)}`, href: `/book/${b.id}` });
    });
    const ids = new Set(filtered.map((b) => b.id));
    notes.filter((n) => !n.book_id || ids.has(n.book_id)).forEach((n) => ev.push({ t: new Date(n.created_at).getTime(), kind: 'Note', text: n.title, meta: excerpt(n.body, 90), href: `/notes/${n.id}`, book: live.find((b) => b.id === n.book_id) }));
    return ev.sort((a, b) => b.t - a.t);
  }, [filtered, notes, live]);
  const journal = useMemo(() => {
    const m = new Map<string, typeof events>();
    events.forEach((e) => { const d = new Date(e.t); const k = `${d.getFullYear()}-${d.getMonth()}`; m.set(k, [...(m.get(k) || []), e]); });
    return Array.from(m.entries());
  }, [events]);

  const days = useMemo(() => dailySeconds(sessions), [sessions]);
  const st = streaks(days);
  const thisMonthSecs = Array.from(days.entries()).filter(([k]) => { const [y, mo] = k.split('-').map(Number); const d = new Date(); return y === d.getFullYear() && mo === d.getMonth() + 1; }).reduce((s, [, v]) => s + v, 0);
  const paused = live.filter((b) => b.status === 'paused');

  return (
    <div style={{ display: 'flex', minHeight: '100%' }}>
      <div className="page" style={{ maxWidth: 'none', flex: 1, minWidth: 0 }}>
        <div className="row wrap" style={{ alignItems: 'flex-end' }}>
          <div className="grow" style={{ minWidth: 200 }}><h1 className="page-title">Timeline</h1><div className="cap" style={{ fontSize: 13, marginTop: 2 }}>{rows.length} books · {notes.length} notes</div></div>
          <Seg label="View" value={view} onChange={setView} options={[{ v: 'bars', l: 'Bars' }, { v: 'journal', l: 'Journal' }, { v: 'calendar', l: 'Calendar' }]} />
          {view === 'bars' && <Seg label="Zoom" value={zoom} onChange={setZoom} options={[{ v: 'week', l: 'Week' }, { v: 'month', l: 'Month' }, { v: 'year', l: 'Year' }, { v: 'all', l: 'All' }]} />}
          <button className={`ib ${side ? 'on' : ''}`} aria-label={side ? 'Hide this month' : 'Show this month'} aria-pressed={side} onClick={toggleSide}><Icon name="sidebar-right" size={16} /></button>
        </div>
        {view !== 'calendar' && (
          <div className="row wrap" style={{ gap: 6 }}>
            {[['all', 'All books'], ['completed', 'Completed'], ['reading', 'Reading'], ['paused', 'Paused']].map(([v, l]) => <button key={v} className={`chip ${status === v ? 'on' : ''}`} onClick={() => setStatus(v)}>{l}</button>)}
            <button className={`chip ${fileF === 'without' ? 'on' : ''}`} onClick={() => setFileF(fileF === 'without' ? 'all' : 'without')}>No file</button>
            <select className="chip out" value={tag} onChange={(e) => setTag(e.target.value)} aria-label="Tag"><option value="">Any tag</option>{tags.map((t) => <option key={t.id} value={t.name}>#{t.name}</option>)}</select>
            <select className="chip out" value={minRating} onChange={(e) => setMinRating(Number(e.target.value))} aria-label="Rating"><option value={0}>Any rating</option><option value={3}>Good or better</option><option value={4}>Loved it or better</option></select>
          </div>
        )}

        {view === 'bars' && (rows.length === 0 ? <Empty icon="timeline" title="Nothing in this period">Books appear here once you start reading them.</Empty> : (
          <div className="card" style={{ position: 'relative', padding: '0 24px', overflowX: 'auto' }}>
            <div style={{ position: 'relative', minWidth: 760, height: 64 + rows.length * 46 + 50 }}>
              {ticks.map((t, i) => (
                <React.Fragment key={i}>
                  {i > 0 && <div style={{ position: 'absolute', left: `${X(t.t)}%`, top: 44, bottom: 44, width: 1, background: 'var(--border)' }} />}
                  <div className="row" style={{ position: 'absolute', left: `calc(${X(t.t)}% + ${i ? 10 : 0}px)`, top: 14, fontSize: 13, fontWeight: 600, gap: 8 }}>
                    {t.label}
                    {zoom === 'month' && t.month && (() => { const g = monthGoal(t.year!, t.month); const c = completedIn(t.year!, t.month); return g ? <span style={{ fontSize: 12, fontWeight: 500, padding: '2px 8px', borderRadius: 999, background: c >= g ? 'var(--blush)' : 'var(--surface-alt)', color: c >= g ? 'var(--on-accent)' : 'var(--ink-secondary)' }}>{c} / {g}</span> : null; })()}
                  </div>
                </React.Fragment>
              ))}
              {now >= from && now <= to && <>
                <div style={{ position: 'absolute', left: `${X(now)}%`, top: 44, bottom: 44, width: 2, background: 'var(--apricot)' }} />
                <div style={{ position: 'absolute', left: `${X(now)}%`, top: 40, transform: 'translateX(-50%)', fontSize: 12, fontWeight: 600, padding: '2px 8px', borderRadius: 6, background: 'var(--apricot)', color: 'var(--on-accent)' }}>Today</div>
              </>}
              {rows.map(({ b, start, end }, i) => {
                const left = Math.max(0, X(start)), right = Math.min(100, X(end));
                const top = 72 + i * 46;
                const st2 = b.status === 'completed' ? (b.file_path ? 'done' : 'nf') : b.status === 'paused' ? 'pz' : b.file_path ? 'prog' : 'nf';
                const bookNotes = notes.filter((n) => n.book_id === b.id).map((n) => new Date(n.created_at).getTime()).filter((t) => t >= from && t <= to);
                return (
                  <React.Fragment key={b.id}>
                    <Link href={`/book/${b.id}`} title={b.title}
                      style={{ textDecoration: 'none', position: 'absolute', left: `${left}%`, width: `max(${right - left}%, 120px)`, top, height: 34, display: 'flex', alignItems: 'center', gap: 8, padding: '0 8px 0 12px', borderRadius: 8, fontSize: 13, fontWeight: 500, textAlign: 'left', cursor: 'pointer', color: st2 === 'nf' ? 'var(--ink-secondary)' : 'var(--ink)',
                        background: st2 === 'done' || st2 === 'pz' ? 'var(--surface-alt)' : 'var(--surface)', border: st2 === 'nf' ? '1.5px dashed var(--border-control)' : '0', boxShadow: st2 === 'prog' ? 'inset 0 0 0 1.5px var(--ink-secondary)' : undefined, opacity: st2 === 'pz' ? 0.55 : 1 }}>
                      {!b.file_path && <Icon name="book-nofile" size={14} className="mut" />}
                      <span className="truncate grow">{b.title}</span>
                      {b.status === 'completed' ? <RatingMark rating={b.rating} size={16} /> : b.status === 'paused' ? <span className="cap">paused</span> : <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-secondary)' }}>{pct(b.progress)}</span>}
                    </Link>
                    {bookNotes.map((t, k) => <span key={k} title="Note" style={{ position: 'absolute', left: `calc(${X(t)}% - 3px)`, top: top + 38, width: 7, height: 7, borderRadius: '50%', background: 'var(--petal)' }} />)}
                  </React.Fragment>
                );
              })}
              <div className="row wrap cap" style={{ position: 'absolute', left: 0, bottom: 12, gap: 18 }}>
                <span className="row" style={{ gap: 6 }}><RatingMark rating={4} size={14} />Completed, shade = rating</span>
                <span className="row" style={{ gap: 6 }}><span style={{ width: 18, height: 10, borderRadius: 3, boxShadow: 'inset 0 0 0 1.5px var(--ink-secondary)' }} />Reading</span>
                <span className="row" style={{ gap: 6 }}><span style={{ width: 18, height: 10, borderRadius: 3, border: '1.2px dashed var(--border-control)' }} />No file yet</span>
                <span className="row" style={{ gap: 6 }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--petal)' }} />Note</span>
              </div>
            </div>
          </div>
        ))}

        {view === 'journal' && (journal.length === 0 ? <Empty icon="timeline" title="No reading events yet" /> : (
          <div className="col" style={{ gap: 12, maxWidth: 620 }}>
            {journal.map(([k, list]) => {
              const [y, m] = k.split('-').map(Number);
              const g = goals.find((x) => x.year === y && x.month === m + 1);
              const c = completedIn(y, m + 1);
              return (
                <section key={k} className="col" style={{ gap: 10 }}>
                  <div className="row" style={{ paddingTop: 10 }}>
                    <div className="grow"><div className="serif" style={{ fontSize: 18 }}>{MONTHS_LONG[m]} {y}</div><div className="cap">{c} completed · {list.filter((e) => e.kind === 'Note').length} notes</div></div>
                    {g && <span style={{ fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 999, background: c >= g.target ? 'var(--blush)' : 'var(--surface-alt)', color: c >= g.target ? 'var(--on-accent)' : 'var(--ink-secondary)' }}>{c >= g.target ? 'Goal met' : `Goal ${c} / ${g.target}`}</span>}
                  </div>
                  {list.map((e, i) => {
                    const d = new Date(e.t);
                    return (
                      <div key={i} className="row" style={{ gap: 14, alignItems: 'stretch' }}>
                        <div className="col" style={{ width: 34, alignItems: 'center', gap: 0, paddingTop: 10 }}><span className="serif" style={{ fontSize: 18 }}>{d.getDate()}</span><span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-muted)' }}>{['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][d.getDay()]}</span></div>
                        <Link href={e.href} className="card row grow" style={{ padding: '11px 12px 11px 14px', gap: 10, color: 'inherit', textDecoration: 'none', borderStyle: e.noFile ? 'dashed' : 'solid', borderColor: e.noFile ? 'var(--border-control)' : undefined, opacity: e.kind === 'Paused' ? 0.7 : 1 }}>
                          <div className="col grow" style={{ gap: 2, minWidth: 0 }}>
                            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-secondary)' }}>{e.kind}{e.kind === 'Note' && e.book ? ` · ${e.book.title}` : ''}</span>
                            <span style={{ fontSize: 15, fontWeight: 500 }} className="truncate">{e.text}</span>
                            {e.meta && <span className="secondary truncate" style={{ fontSize: 12 }}>{e.meta}</span>}
                          </div>
                          {e.rating != null && <RatingMark rating={e.rating} size={24} />}
                        </Link>
                      </div>
                    );
                  })}
                </section>
              );
            })}
          </div>
        ))}

        {view === 'calendar' && (
          <div className="card row wrap" style={{ padding: 20, gap: 28, alignItems: 'flex-start' }}>
            <div className="col" style={{ gap: 10, minWidth: 0 }}>
              <div><h2 className="serif" style={{ fontSize: 22 }}>Reading calendar</h2><span className="cap" style={{ fontSize: 13 }}>Each day’s shade is time read</span></div>
              <Heatmap sessions={sessions} weeks={26} />
            </div>
            <div className="col" style={{ gap: 10, minWidth: 180 }}>
              <div style={{ padding: '10px 14px', borderRadius: 12, background: 'var(--primary-soft)' }}><div className="serif" style={{ fontSize: 22, color: 'var(--primary)' }}>{st.current} days</div><span className="cap">Current streak</span></div>
              <div style={{ padding: '10px 14px', borderRadius: 12, background: 'var(--canvas)' }}><div className="serif" style={{ fontSize: 22 }}>{st.longest} days</div><span className="cap">Longest streak</span></div>
              <div style={{ padding: '10px 14px', borderRadius: 12, background: 'var(--canvas)' }}><div className="serif" style={{ fontSize: 22 }}>{duration(thisMonthSecs)}</div><span className="cap">Read this month</span></div>
            </div>
          </div>
        )}
      </div>
      {side && <aside className="side-r" aria-label="This month">
        {(() => {
          const d = new Date(); const y = d.getFullYear(), m = d.getMonth() + 1;
          const mg = goals.find((g) => g.year === y && g.month === m); const yg = goals.find((g) => g.year === y && g.month == null);
          const yc = live.filter((b) => b.status === 'completed' && b.completed_at && new Date(b.completed_at).getFullYear() === y).length;
          return (
            <section className="col" style={{ gap: 10 }}>
              <div className="gh" style={{ padding: 0 }}>{MONTHS_LONG[m - 1]}</div>
              <div className="card col" style={{ padding: '14px 16px', gap: 8 }}>
                <div className="row"><span className="lbl grow">Monthly goal</span><span className="cap">{new Date(y, m, 0).getDate() - d.getDate()} days left</span></div>
                {mg ? <><div className="serif" style={{ fontSize: 28 }}>{completedIn(y, m)} <span style={{ fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 400, color: 'var(--ink-secondary)' }}>of {mg.target} books</span></div><div className="track"><i style={{ width: `${Math.min(100, (completedIn(y, m) / mg.target) * 100)}%` }} /></div></> : <Link href="/goals" className="cap">Set a monthly goal</Link>}
              </div>
              <div className="card col" style={{ padding: '14px 16px', gap: 8 }}>
                <div className="row"><span className="lbl grow">{y} goal</span></div>
                {yg ? <><div className="serif" style={{ fontSize: 28 }}>{yc} <span style={{ fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 400, color: 'var(--ink-secondary)' }}>of {yg.target} books</span></div><div className="track"><i style={{ width: `${Math.min(100, (yc / yg.target) * 100)}%` }} /></div></> : <Link href="/goals" className="cap">Set a yearly goal</Link>}
              </div>
            </section>
          );
        })()}
        {paused.length > 0 && (
          <section className="col" style={{ gap: 6 }}>
            <div className="gh" style={{ padding: 0 }}>Paused<span className="c">{paused.length}</span></div>
            {paused.map((b) => (
              <div key={b.id} className="card col" style={{ padding: '10px 12px', gap: 6, borderRadius: 8 }}>
                <Link href={`/book/${b.id}`} style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>{b.title}</Link>
                <span className="cap">Stopped at {pct(b.progress)}</span>
                {b.read_next_pos == null && <button className="btn sec sm" style={{ alignSelf: 'flex-start' }} onClick={() => lib.setReadNext(b.id, true)}><Icon name="readnext" size={14} />Move to Read Next</button>}
              </div>
            ))}
          </section>
        )}
      </aside>}
    </div>
  );
}
