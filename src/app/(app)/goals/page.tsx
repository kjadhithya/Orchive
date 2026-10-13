'use client';
import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { useLibrary } from '@/lib/store';
import { Icon, RatingMark } from '@/components/Icon';
import { BookCover, Empty } from '@/components/ui';
import { fmtDate, MONTHS, MONTHS_LONG } from '@/lib/util';
import type { Book } from '@/lib/types';

function GoalInput({ value, onSave, label }: { value: number | null; onSave: (v: number | null) => void; label: string }) {
  const [v, setV] = useState(value == null ? '' : String(value));
  React.useEffect(() => setV(value == null ? '' : String(value)), [value]);
  const commit = () => {
    const n = v.trim() === '' ? null : Math.max(1, Math.min(999, Math.round(Number(v))));
    if (n !== value && (n == null || !Number.isNaN(n))) onSave(n);
  };
  return (
    <label className="input" style={{ width: 96, height: 32 }}>
      <input type="number" min={1} max={999} inputMode="numeric" aria-label={label} placeholder="—" value={v} onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
      <span className="cap">books</span>
    </label>
  );
}

function Ring({ value, target, size = 132 }: { value: number; target: number | null; size?: number }) {
  const r = size / 2 - 8, c = 2 * Math.PI * r;
  const f = target ? Math.min(1, value / target) : 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={target ? `${value} of ${target} books` : `${value} books`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-alt)" strokeWidth={8} />
      {target ? <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--primary)" strokeWidth={8} strokeLinecap="round" strokeDasharray={`${c * f} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} /> : null}
      <text x="50%" y="47%" textAnchor="middle" fontSize={30} fontWeight={600} fill="var(--ink)" fontFamily="var(--font-display)">{value}</text>
      <text x="50%" y="64%" textAnchor="middle" fontSize={12} fill="var(--ink-muted)">{target ? `of ${target}` : 'no goal'}</text>
    </svg>
  );
}

export default function GoalsPage() {
  const { live, goals, setGoal } = useLibrary();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const completed = useMemo(() => live.filter((b) => b.completed_at), [live]);
  const inYear = completed.filter((b) => new Date(b.completed_at!).getFullYear() === year);
  const byMonth = MONTHS.map((_, m) => inYear.filter((b) => new Date(b.completed_at!).getMonth() === m));
  const yearGoal = goals.find((g) => g.year === year && g.month == null)?.target ?? null;
  const monthGoal = (m: number) => goals.find((g) => g.year === year && g.month === m + 1)?.target ?? null;
  const isCurrent = year === now.getFullYear();
  const dayOfYear = Math.floor((+now - +new Date(year, 0, 1)) / 86400000) + 1;
  const daysInYear = (new Date(year + 1, 0, 1).getTime() - new Date(year, 0, 1).getTime()) / 86400000;
  const expected = yearGoal ? (isCurrent ? (yearGoal * dayOfYear) / daysInYear : year < now.getFullYear() ? yearGoal : 0) : 0;
  const diff = Math.round((inYear.length - expected) * 10) / 10;
  const remaining = yearGoal ? Math.max(0, yearGoal - inYear.length) : 0;
  const weeksLeft = isCurrent ? Math.max(1, (daysInYear - dayOfYear) / 7) : 0;
  const years = Array.from(new Set([now.getFullYear(), ...goals.map((g) => g.year), ...completed.map((b) => new Date(b.completed_at!).getFullYear())])).sort((a, b) => b - a);
  const maxBar = Math.max(1, ...byMonth.map((l) => l.length), ...MONTHS.map((_, m) => monthGoal(m) || 0));
  const cm = now.getMonth();
  const curMonthGoal = monthGoal(cm);
  const curMonthDone = isCurrent ? byMonth[cm].length : 0;

  return (
    <div className="page" style={{ maxWidth: 980 }}>
      <div className="row wrap">
        <div className="grow"><h1 className="page-title">Goals</h1><div className="cap" style={{ fontSize: 13, marginTop: 2 }}>Books you finish count toward the year and month they were completed.</div></div>
        <div className="row" style={{ gap: 4 }}>
          <button className="ib" aria-label="Previous year" onClick={() => setYear(year - 1)}><Icon name="chevron-left" size={16} /></button>
          <span style={{ fontWeight: 600, minWidth: 48, textAlign: 'center' }}>{year}</span>
          <button className="ib" aria-label="Next year" onClick={() => setYear(year + 1)} disabled={year >= now.getFullYear() + 1}><Icon name="chevron-right" size={16} /></button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
        <section className="card row" style={{ padding: 20, gap: 20, alignItems: 'center' }} aria-label={`${year} goal`}>
          <Ring value={inYear.length} target={yearGoal} />
          <div className="col" style={{ gap: 10, flex: 1, minWidth: 0 }}>
            <div className="gh" style={{ padding: 0 }}>{year} goal</div>
            <GoalInput value={yearGoal} label={`Books to finish in ${year}`} onSave={(v) => setGoal(year, null, v)} />
            {yearGoal ? (
              <span className="secondary" style={{ fontSize: 13 }}>
                {inYear.length >= yearGoal ? <>Goal reached{inYear.length > yearGoal ? ` — ${inYear.length - yearGoal} beyond it` : ''}.</>
                  : isCurrent ? <>{diff >= 0 ? <><b>{diff}</b> ahead of pace</> : <><b>{Math.abs(diff)}</b> behind pace</>} · {remaining} to go, about {(remaining / weeksLeft).toFixed(1)} a week</>
                  : year < now.getFullYear() ? <>Finished {inYear.length} of {yearGoal}.</> : <>{yearGoal} planned.</>}
              </span>
            ) : <span className="cap">Set a number to track your pace.</span>}
          </div>
        </section>
        <section className="card col" style={{ padding: 20, gap: 10 }} aria-label="This month">
          <div className="gh" style={{ padding: 0 }}>{isCurrent ? MONTHS_LONG[cm] : 'Monthly goals'}</div>
          {isCurrent ? (
            <>
              <div className="row" style={{ gap: 12 }}>
                <span style={{ fontSize: 30, fontWeight: 600, fontFamily: 'var(--font-display)' }}>{curMonthDone}</span>
                <span className="cap">{curMonthGoal ? `of ${curMonthGoal} this month` : 'finished this month'}</span>
                <span className="grow" />
                <GoalInput value={curMonthGoal} label={`Books to finish in ${MONTHS_LONG[cm]}`} onSave={(v) => setGoal(year, cm + 1, v)} />
              </div>
              {curMonthGoal ? <div className="track" style={{ height: 6 }}><i style={{ width: `${Math.min(100, (curMonthDone / curMonthGoal) * 100)}%` }} /></div> : null}
            </>
          ) : <span className="cap">Set a goal for any month in the chart below.</span>}
        </section>
      </div>

      <section className="card" style={{ padding: 20 }} aria-label="Books per month">
        <div className="row" style={{ marginBottom: 14 }}><div className="gh grow" style={{ padding: 0 }}>Books per month</div><span className="cap row" style={{ gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--primary)' }} />Finished<span style={{ width: 10, height: 2, background: 'var(--ink-muted)', marginLeft: 8 }} />Goal</span></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 6, alignItems: 'end', height: 180 }}>
          {byMonth.map((list, m) => {
            const goal = monthGoal(m);
            return (
              <div key={m} className="col" style={{ alignItems: 'center', gap: 4, height: '100%', justifyContent: 'flex-end', position: 'relative' }} title={`${MONTHS_LONG[m]}: ${list.length} finished${goal ? `, goal ${goal}` : ''}`}>
                <span className="cap">{list.length || ''}</span>
                <div style={{ width: '70%', maxWidth: 34, height: `${(list.length / maxBar) * 140}px`, minHeight: list.length ? 4 : 0, background: isCurrent && m === cm ? 'var(--primary)' : 'var(--rating-3)', borderRadius: '4px 4px 0 0' }} />
                {goal ? <div style={{ position: 'absolute', bottom: 20 + (goal / maxBar) * 140, width: '86%', height: 2, background: 'var(--ink-muted)' }} /> : null}
                <span className="cap" style={{ fontWeight: isCurrent && m === cm ? 600 : 400 }}>{MONTHS[m]}</span>
              </div>
            );
          })}
        </div>
        <details style={{ marginTop: 14 }}>
          <summary className="cap" style={{ cursor: 'pointer' }}>Set monthly goals for {year}</summary>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10, marginTop: 10 }}>
            {MONTHS.map((mn, m) => <div key={m} className="row" style={{ gap: 8 }}><span style={{ width: 32, fontSize: 13 }}>{mn}</span><GoalInput value={monthGoal(m)} label={`Goal for ${MONTHS_LONG[m]}`} onSave={(v) => setGoal(year, m + 1, v)} /></div>)}
          </div>
        </details>
      </section>

      <section className="col" style={{ gap: 10 }} aria-label={`Finished in ${year}`}>
        <div className="gh" style={{ padding: 0 }}>Finished in {year} · {inYear.length}</div>
        {inYear.length === 0 ? <Empty icon="goal" title="Nothing finished yet this year">Mark a book as completed and it appears here.</Empty> : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 14 }}>
            {[...inYear].sort((a, b) => b.completed_at!.localeCompare(a.completed_at!)).map((b: Book) => (
              <Link key={b.id} href={`/book/${b.id}`} className="col" style={{ gap: 6, color: 'inherit', textDecoration: 'none' }}>
                <BookCover book={b} width={110} height={160} />
                <span className="truncate" style={{ fontSize: 13, fontWeight: 500 }}>{b.title}</span>
                <span className="cap row" style={{ gap: 4 }}>{fmtDate(b.completed_at, false)}{b.rating ? <RatingMark rating={b.rating} size={12} /> : null}</span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {years.length > 1 && (
        <section className="card" style={{ padding: 16 }} aria-label="Past years">
          <div className="gh" style={{ padding: '0 0 8px' }}>History</div>
          {years.map((y) => {
            const n = completed.filter((b) => new Date(b.completed_at!).getFullYear() === y).length;
            const g = goals.find((x) => x.year === y && x.month == null)?.target;
            return (
              <button key={y} className="si" style={{ width: '100%' }} onClick={() => setYear(y)}>
                <span style={{ width: 48, fontWeight: y === year ? 600 : 400 }}>{y}</span>
                <span className="grow"><span className="track" style={{ height: 4, display: 'block' }}><i style={{ width: `${g ? Math.min(100, (n / g) * 100) : n ? 100 : 0}%` }} /></span></span>
                <span className="cap" style={{ width: 90, textAlign: 'right' }}>{n}{g ? ` / ${g}` : ''} books</span>
              </button>
            );
          })}
        </section>
      )}
    </div>
  );
}
