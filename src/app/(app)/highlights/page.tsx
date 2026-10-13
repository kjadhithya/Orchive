'use client';
import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { useLibrary } from '@/lib/store';
import { Empty } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { download, escapeHtml, fmtDate, norm } from '@/lib/util';

export default function HighlightsPage() {
  const { annotations, live, deleteAnnotation } = useLibrary();
  const [q, setQ] = useState('');
  const [book, setBook] = useState('all');
  const [color, setColor] = useState('all');
  const list = useMemo(() => annotations.filter((a) => a.kind !== 'bookmark' && (book === 'all' || a.book_id === book) && (color === 'all' || a.color === color) && (!q || norm(`${a.quote} ${a.note}`).includes(norm(q)))).sort((a, b) => b.created_at.localeCompare(a.created_at)), [annotations, q, book, color]);
  const title = (id: string) => live.find((b) => b.id === id)?.title || 'Removed book';

  const exportAll = (fmt: 'md' | 'txt' | 'pdf') => {
    const byBook = new Map<string, typeof list>();
    list.forEach((a) => byBook.set(a.book_id, [...(byBook.get(a.book_id) || []), a]));
    if (fmt === 'pdf') {
      const w = window.open('', '_blank');
      if (!w) return;
      w.document.write(`<html><head><title>Orchive highlights</title><style>body{font-family:Georgia,serif;max-width:680px;margin:40px auto;color:#221F1F}h1{font-size:26px}h2{font-size:18px;margin-top:28px}blockquote{margin:12px 0;padding:8px 14px;border-left:3px solid #763D82;background:#F6F2F7}small{color:#6F6865;font-family:sans-serif}</style></head><body><h1>Highlights</h1>${Array.from(byBook.entries()).map(([id, l]) => `<h2>${escapeHtml(title(id))}</h2>${l.map((a) => `<blockquote>${escapeHtml(a.quote || '')}${a.note ? `<p><small>${escapeHtml(a.note)}</small></p>` : ''}<small>${escapeHtml(a.chapter || '')}</small></blockquote>`).join('')}`).join('')}</body></html>`);
      w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
      return;
    }
    const out = Array.from(byBook.entries()).map(([id, l]) => fmt === 'md'
      ? `## ${title(id)}\n\n${l.map((a) => `> ${a.quote || ''}${a.note ? `\n\n${a.note}` : ''}\n\n— ${a.chapter || ''}`).join('\n\n')}`
      : `${title(id)}\n${'='.repeat(title(id).length)}\n\n${l.map((a) => `"${a.quote || ''}"${a.note ? `\n  Note: ${a.note}` : ''}\n  ${a.chapter || ''}`).join('\n\n')}`).join('\n\n');
    download(`orchive-highlights.${fmt}`, (fmt === 'md' ? '# Highlights\n\n' : '') + out, fmt === 'md' ? 'text/markdown' : 'text/plain');
  };

  return (
    <div className="page" style={{ maxWidth: 820 }}>
      <div className="row wrap"><div className="grow"><h1 className="page-title">Highlights</h1><div className="cap" style={{ fontSize: 13, marginTop: 2 }}>Every quote and note from every book.</div></div>
        <button className="btn ghost sm" onClick={() => exportAll('md')}><Icon name="download" size={14} />Markdown</button>
        <button className="btn ghost sm" onClick={() => exportAll('txt')}>Text</button>
        <button className="btn ghost sm" onClick={() => exportAll('pdf')}>PDF</button>
      </div>
      <div className="row wrap" style={{ gap: 8 }}>
        <label className="input" style={{ width: 260 }}><Icon name="search" size={15} className="mut" /><input type="search" placeholder="Search highlights" aria-label="Search highlights" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        <select className="chip out" value={book} onChange={(e) => setBook(e.target.value)} aria-label="Book"><option value="all">All books</option>{live.filter((b) => annotations.some((a) => a.book_id === b.id)).map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}</select>
        <div className="row" style={{ gap: 4 }}>{['all', 'orchid', 'blush', 'apricot', 'sky'].map((c) => <button key={c} className={`chip ${color === c ? 'on' : ''}`} onClick={() => setColor(c)} aria-label={`Colour ${c}`}>{c === 'all' ? 'All' : <span style={{ width: 12, height: 12, borderRadius: 3, background: `var(--hl-${c})`, display: 'inline-block' }} />}</button>)}</div>
      </div>
      {list.length === 0 ? <Empty icon="highlight" title="No highlights yet">Select text while reading to highlight it.</Empty> : list.map((a) => (
        <div key={a.id} className="col" style={{ gap: 4 }}>
          <Link href={`/read/${a.book_id}?at=${encodeURIComponent(a.location || '')}`} style={{ color: 'inherit', textDecoration: 'none' }}>
            <blockquote className="read-font" style={{ margin: 0, padding: '10px 14px', borderRadius: 8, background: `var(--hl-${a.color || 'orchid'})`, fontSize: 16, lineHeight: '26px' }}>{a.quote}{a.note && <span style={{ display: 'block', fontFamily: 'var(--font-sans)', fontSize: 13, marginTop: 6 }}>{a.note}</span>}</blockquote>
          </Link>
          <div className="row cap"><span className="grow">{title(a.book_id)}{a.chapter ? ` · ${a.chapter}` : ''} · {fmtDate(a.created_at)}</span>
            <button className="btn ghost sm" onClick={() => { const t = `“${a.quote}” — ${title(a.book_id)}`; if (navigator.share) navigator.share({ text: t }).catch(() => {}); else { navigator.clipboard.writeText(t); } }}><Icon name="share" size={13} />Share</button>
            <button className="btn ghost sm" onClick={() => deleteAnnotation(a.id)}>Delete</button>
          </div>
        </div>
      ))}
    </div>
  );
}
