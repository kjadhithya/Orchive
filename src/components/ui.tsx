'use client';
import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Icon, Mark, ratingColor, ratingWord } from './Icon';
import { signedUrl } from '@/lib/files';
import type { Book } from '@/lib/types';
import { useStore } from '@/lib/store';

export function Modal({ title, onClose, children, footer, width }: { title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; width?: number }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-label={title} className="dialog" style={width ? { maxWidth: width } : undefined}>
        <header><h2>{title}</h2><button className="ib" aria-label="Close" onClick={onClose}><Icon name="close" size={16} /></button></header>
        <div className="body">{children}</div>
        {footer && <footer>{footer}</footer>}
      </section>
    </div>
  );
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button type="button" className={`toggle ${on ? 'on' : ''}`} aria-pressed={on} aria-label={label} onClick={() => onChange(!on)} />;
}

export function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: { v: T; l: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.v} type="button" className={value === o.v ? 'on' : ''} aria-pressed={value === o.v} onClick={() => onChange(o.v)}>{o.l}</button>
      ))}
    </div>
  );
}

/** A small popover menu anchored to its trigger. */
export function MenuButton({ label, icon = 'more', children, align = 'right', className = 'ib', text }: { label: string; icon?: string; children: (close: () => void) => React.ReactNode; align?: 'left' | 'right'; className?: string; text?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', h);
    document.addEventListener('keydown', k);
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('keydown', k); };
  }, [open]);
  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      <button type="button" className={className} aria-label={label} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Icon name={icon} size={16} />{text}
      </button>
      {open && <div className="menu" role="menu" style={{ top: '100%', marginTop: 4, [align]: 0 }}>{children(() => setOpen(false))}</div>}
    </div>
  );
}

export function RatingSlider({ value, onChange, compact }: { value: number | null; onChange: (v: number | null) => void; compact?: boolean }) {
  const v = value ?? 0;
  return (
    <div className="rate" style={{ ['--rate-ring' as string]: ratingColor(value ?? 3) }}>
      <Mark size={20} color={value == null ? 'var(--border-control)' : ratingColor(value)} />
      <input
        type="range" min={0} max={5} step={0.1} value={v}
        aria-label="Rating" aria-valuetext={value == null ? 'Not rated' : `${value} of 5, ${ratingWord(value)}`}
        onChange={(e) => onChange(Math.round(Number(e.target.value) * 10) / 10)}
        style={compact ? { width: 130 } : undefined}
      />
      <span className="cap" style={{ minWidth: 92 }}>{ratingWord(value)}</span>
      {value != null && <button type="button" className="btn ghost sm" onClick={() => onChange(null)}>Clear</button>}
    </div>
  );
}

export function TagEditor({ value, onChange, suggestions }: { value: string[]; onChange: (v: string[]) => void; suggestions: string[] }) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const matches = suggestions.filter((s) => !value.some((v) => v.toLowerCase() === s.toLowerCase()) && s.toLowerCase().includes(text.toLowerCase().replace(/^#/, ''))).slice(0, 6);
  const add = (t: string) => {
    const clean = t.replace(/^#/, '').trim();
    if (clean && !value.some((v) => v.toLowerCase() === clean.toLowerCase())) onChange([...value, clean]);
    setText('');
  };
  return (
    <div style={{ position: 'relative', display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
      {value.map((t) => (
        <span key={t} className="chip">#{t}<button type="button" className="x" aria-label={`Remove ${t}`} onClick={() => onChange(value.filter((x) => x !== t))}><Icon name="close" size={12} /></button></span>
      ))}
      <input
        className="chip out" style={{ width: 120, outline: 'none' }} placeholder="+ Add tag" value={text} aria-label="Add tag"
        onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ',') && text.trim()) { e.preventDefault(); add(text); } if (e.key === 'Backspace' && !text && value.length) onChange(value.slice(0, -1)); }}
      />
      {open && (matches.length > 0 || text.trim()) && (
        <div className="menu" style={{ top: '100%', left: 0, marginTop: 4 }}>
          {matches.map((m) => <button key={m} type="button" onMouseDown={(e) => { e.preventDefault(); add(m); }}>#{m}</button>)}
          {text.trim() && !suggestions.some((s) => s.toLowerCase() === text.trim().replace(/^#/, '').toLowerCase()) && (
            <button type="button" onMouseDown={(e) => { e.preventDefault(); add(text); }}><Icon name="plus" size={14} />Create “{text.replace(/^#/, '')}”</button>
          )}
        </div>
      )}
    </div>
  );
}

const COVER_TINTS = ['#E6E0E6', '#DFE2DE', '#EAE3E0', '#E0E1E5', '#E8E2DA'];
const COVER_TINTS_DARK = ['#2E2B33', '#26302C', '#322D27', '#282C33', '#2E2A27'];

export function BookCover({ book, width = 96, height = 140, link = false }: { book: Book; width?: number; height?: number; link?: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (book.cover_path) signedUrl(book.cover_path).then((u) => { if (alive) setUrl(u); });
    else setUrl(null);
    return () => { alive = false; };
  }, [book.cover_path]);
  const i = (book.title.charCodeAt(0) + (book.title.length % 5)) % COVER_TINTS.length;
  const dark = typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark';
  const style: React.CSSProperties = { width, height, padding: width < 60 ? 0 : undefined, background: book.file_path ? (dark ? COVER_TINTS_DARK[i] : COVER_TINTS[i]) : undefined };
  const inner = (
    <>
      {url && <img src={url} alt="" loading="lazy" />}
      {!url && width >= 60 && <><span className="ct" style={{ fontSize: width < 90 ? 12 : 13 }}>{book.title}</span>{book.file_path ? <span className="ca">{book.author}</span> : <Icon name="book-nofile" size={18} className="mut" />}</>}
      {!url && width < 60 && !book.file_path && <span style={{ display: 'grid', placeItems: 'center', width: '100%', height: '100%' }}><Icon name="book-nofile" size={14} className="mut" /></span>}
    </>
  );
  const cls = `cover ${book.file_path ? '' : 'nf'}`;
  if (link) return <Link href={`/book/${book.id}`} className={cls} style={style} aria-label={book.title}>{inner}</Link>;
  return <div className={cls} style={style} aria-hidden="true">{inner}</div>;
}

export function Toasts() {
  const { toasts } = useStore();
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="toast">{t.text}{t.action && <button onClick={t.action.run}>{t.action.label}</button>}</div>
      ))}
    </div>
  );
}

export function Empty({ icon, title, children }: { icon: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="empty">
      <Icon name={icon} size={28} className="mut" />
      <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--ink)' }}>{title}</div>
      {children}
    </div>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}

export function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}
