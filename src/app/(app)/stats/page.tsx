'use client';
import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useLibrary } from '@/lib/store';
import { Heatmap, dailySeconds, streaks } from '@/components/Heatmap';
import { RatingMark, ratingWord } from '@/components/Icon';
import { Seg } from '@/components/ui';
import { dayKey, duration, MONTHS, STATUS_LABEL } from '@/lib/util';

type Range = 'week' | 'month' | 'year' | 'all';

function Kpi({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="card col" style={{ padding: 16, gap: 4 }}>
      <span className="cap">{label}</span>
      <span style={{ fontSize: 26, lineHeight: '32px', fontWeight: 600, fontFamily: 'var(--font-display)' }}>{value}</span>
      {sub ? <span className="cap">{sub}</span> : null}
    </div>
  );
}

export default function StatsPage() {
  const { live, sessions, loadSessions, annotations, notes } = useLibrary();
  useEffect(() => { loadSessions(); }, [loadSessions]);
  const [range, setRange] = useState<Range>('month');
  const now = new Date();
  const from = useMemo(() => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (range === 'week') d.setDate(d.getDate() - 6);
    else if (range === 'month') d.setDate(d.getDate() - 29);
    else if (range === 'year') d.setDate(d.getDate() - 364);
    else return new Date(0);
    return d;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);
  const inRange = sessions.filter((s) => new Date(s.started_at) >= from);
  const seconds = inRange.reduce((a, s) => a + (s.seconds || 0), 0);
  const pages = inRange.reduce((a, s) => a + (s.pages || 0), 0);
  const days = useMemo(() => dailySeconds(sessions), [sessions]);
  const { current, longest } = streaks(days);
  const activeDays = new Set(inRange.filter((s) => s.seconds >= 60).map((s) => dayKey(s.started_at))).size;
  const finished = live.filter((b) => b.completed_at && new Date(b.completed_at) >= from);
  const rated = live.filter((b) => b.rating);
  const avgRating = rated.length ? rated.reduce((a, b) => a + (b.rating || 0), 0) / rated.length : 0;
  const spanDays = range === 'all' ? Math.max(1, days.size) : Math.round((+now - +from) / 86400000) + 1;

  // chart: per-day for week/month, per-month for year/all
  const bars = useMemo(() => {
    if (range === 'week' || range === 'month') {
      const n = range === 'week' ? 7 : 30;
      return Array.from({ length: n }, (_, i) => {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (n - 1 - i));
        return { label: range === 'week' ? d.toLocaleDateString(undefined, { weekday: 'short' }) : String(d.getDate()), v: days.get(dayKey(d)) || 0, title: d.toDateString() };
      });
    }
    const n = 12;
    return Array.from({ length: n }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (n - 1 - i), 1);
      const v = sessions.filter((s) => { const x = new Date(s.started_at); return x.getFullYear() === d.getFullYear() && x.getMonth() === d.getMonth(); }).reduce((a, s) => a + s.seconds, 0);
      return { label: MONTHS[d.getMonth()], v, title: `${MONTHS[d.getMonth()]} ${d.getFullYear()}` };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, sessions, days]);
  const maxBar = Math.max(60, ...bars.map((b) => b.v));

  const perBook = useMemo(() => {
    const m = new Map<string, { s: number; p: number }>();
    inRange.forEach((s) => { if (!s.book_id) return; const x = m.get(s.book_id) || { s: 0, p: 0 }; x.s += s.seconds; x.p += s.pages || 0; m.set(s.book_id, x); });
    return Array.from(m.entries()).map(([id, v]) => ({ book: live.find((b) => b.id === id), ...v })).filter((x) => x.book).sort((a, b) => b.s - a.s).slice(0, 10);
  }, [inRange, live]);
  const maxBook = Math.max(1, ...perBook.map((x) => x.s));

  const byStatus = (['reading', 'to_read', 'paused', 'completed'] as const).map((s) => ({ s, n: live.filter((b) => b.status === s).length }));
  const ratingDist = [1, 2, 3, 4, 5].map((r) => live.filter((b) => b.rating && Math.round(b.rating) === r).length);
  const maxDist = Math.max(1, ...ratingDist);
  const hours = Array.from({ length: 24 }, (_, h) => inRange.filter((s) => new Date(s.started_at).getHours() === h).reduce((a, s) => a + s.seconds, 0));
  const maxHour = Math.max(1, ...hours);
  const peak = hours.indexOf(Math.max(...hours));

  return (
    <div className="page" style={{ maxWidth: 1040 }}>
      <div className="row wrap">
        <div className="grow"><h1 className="page-title">Statistics</h1><div className="cap" style={{ fontSize: 13, marginTop: 2 }}>From your reading sessions on every device.</div></div>
        <Seg label="Range" value={range} onChange={setRange} options={[{ v: 'week', l: '7 days' }, { v: 'month', l: '30 days' }, { v: 'year', l: '12 months' }, { v: 'all', l: 'All time' }]} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
        <Kpi label="Time reading" value={duration(seconds)} sub={`${duration(Math.round(seconds / spanDays))} a day on average`} />
        <Kpi label="Pages turned" value={pages.toLocaleString()} sub={seconds > 600 ? `${Math.round(pages / (seconds / 3600))} an hour` : undefined} />
        <Kpi label="Books finished" value={finished.length} sub={`${live.filter((b) => b.completed_at).length} all time`} />
        <Kpi label="Current streak" value={`${current} ${current === 1 ? 'day' : 'days'}`} sub={`Longest ${longest} · ${activeDays} active days`} />
        <Kpi label="Average rating" value={avgRating ? <span className="row" style={{ gap: 8 }}><RatingMark rating={Math.round(avgRating)} size={22} />{avgRating.toFixed(1)}</span> : '—'} sub={avgRating ? `${ratingWord(Math.round(avgRating))} · ${rated.length} rated` : 'No ratings yet'} />
      </div>

      <section className="card" style={{ padding: 20 }} aria-label="Reading time chart">
        <div className="gh" style={{ padding: '0 0 12px' }}>Reading time {range === 'week' || range === 'month' ? 'per day' : 'per month'}</div>
        <div style={{ display: 'flex', gap: range === 'month' ? 3 : 8, alignItems: 'flex-end', height: 170 }}>
          {bars.map((b, i) => (
            <div key={i} className="col" style={{ flex: 1, alignItems: 'center', gap: 4, height: '100%', justifyContent: 'flex-end', minWidth: 0 }} title={`${b.title}: ${b.v ? duration(b.v) : 'no reading'}`}>
              <div style={{ width: '100%', maxWidth: 30, height: `${(b.v / maxBar) * 140}px`, minHeight: b.v ? 3 : 0, background: i === bars.length - 1 ? 'var(--primary)' : 'var(--rating-3)', borderRadius: '3px 3px 0 0' }} />
              <span className="cap" style={{ fontSize: 12, visibility: range === 'month' && i % 5 !== 4 && i !== bars.length - 1 ? 'hidden' : 'visible' }}>{b.label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="card" style={{ padding: 20 }} aria-label="Reading days">
        <div className="gh" style={{ padding: '0 0 12px' }}>Reading days</div>
        <Heatmap sessions={sessions} weeks={52} />
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
        <section className="card col" style={{ padding: 20, gap: 10 }} aria-label="Time per book">
          <div className="gh" style={{ padding: 0 }}>Time per book</div>
          {perBook.length === 0 ? <span className="cap">No reading sessions in this range.</span> : perBook.map(({ book, s, p }) => (
            <Link key={book!.id} href={`/book/${book!.id}`} className="col" style={{ gap: 4, color: 'inherit', textDecoration: 'none' }}>
              <span className="row" style={{ fontSize: 13 }}><span className="truncate grow">{book!.title}</span><span className="cap">{duration(s)}{p ? ` · ${p} pages` : ''}</span></span>
              <span className="track" style={{ height: 4 }}><i style={{ width: `${(s / maxBook) * 100}%`, background: 'var(--rating-4)' }} /></span>
            </Link>
          ))}
        </section>
        <section className="card col" style={{ padding: 20, gap: 14 }} aria-label="Library">
          <div className="gh" style={{ padding: 0 }}>Library</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
            {byStatus.map(({ s, n }) => <Link key={s} href={`/library?status=${s}`} className="row" style={{ fontSize: 13, color: 'inherit', textDecoration: 'none' }}><span className="grow">{STATUS_LABEL[s]}</span><b>{n}</b></Link>)}
            <span className="row" style={{ fontSize: 13 }}><span className="grow">Without a file</span><b>{live.filter((b) => !b.file_path).length}</b></span>
            <span className="row" style={{ fontSize: 13 }}><span className="grow">Highlights</span><b>{annotations.length}</b></span>
            <span className="row" style={{ fontSize: 13 }}><span className="grow">Notes</span><b>{notes.length}</b></span>
          </div>
          <div className="gh" style={{ padding: 0 }}>Ratings</div>
          <div className="col" style={{ gap: 6 }}>
            {[5, 4, 3, 2, 1].map((r) => (
              <div key={r} className="row" style={{ gap: 8, fontSize: 12 }}>
                <RatingMark rating={r} size={14} /><span style={{ width: 72 }} className="secondary">{ratingWord(r)}</span>
                <span className="track grow" style={{ height: 4 }}><i style={{ width: `${(ratingDist[r - 1] / maxDist) * 100}%`, background: `var(--rating-${r})` }} /></span>
                <span className="cap" style={{ width: 20, textAlign: 'right' }}>{ratingDist[r - 1]}</span>
              </div>
            ))}
          </div>
        </section>
        <section className="card col" style={{ padding: 20, gap: 10 }} aria-label="Time of day">
          <div className="gh" style={{ padding: 0 }}>Time of day</div>
          <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: 80 }}>
            {hours.map((v, h) => <div key={h} title={`${h}:00 · ${duration(v)}`} style={{ flex: 1, height: `${(v / maxHour) * 100}%`, minHeight: v ? 2 : 0, background: h === peak && v ? 'var(--primary)' : 'var(--rating-2)', borderRadius: 2 }} />)}
          </div>
          <div className="row cap"><span>12am</span><span className="grow" style={{ textAlign: 'center' }}>12pm</span><span>11pm</span></div>
          {hours[peak] > 0 && <span className="cap">You read most around {peak === 0 ? '12am' : peak < 12 ? `${peak}am` : peak === 12 ? '12pm' : `${peak - 12}pm`}.</span>}
        </section>
      </div>
    </div>
  );
}
