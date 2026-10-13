'use client';
import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { useLibrary } from '@/lib/store';
import { Icon, RatingMark } from '@/components/Icon';
import { excerpt } from '@/lib/markdown';
import { norm, STATUS_LABEL } from '@/lib/util';

function hit(text: string, q: string, n = 140) {
  const i = norm(text).indexOf(norm(q));
  if (i < 0) return text.slice(0, n);
  const s = Math.max(0, i - 50);
  return (s ? '…' : '') + text.slice(s, s + n) + (text.length > s + n ? '…' : '');
}

export default function SearchPage() {
  const { live, notes, annotations, tags, tagsOf } = useLibrary();
  const [q, setQ] = useState('');
  const nq = norm(q);
  const res = useMemo(() => {
    if (nq.length < 2) return null;
    return {
      books: live.filter((b) => norm(`${b.title} ${b.author} ${b.series} ${b.description} ${tagsOf(b.id).map((t) => t.name).join(' ')}`).includes(nq)).slice(0, 30),
      tags: tags.filter((t) => norm(t.name).includes(nq)),
      notes: notes.filter((n) => norm(n.title + ' ' + n.body).includes(nq)).slice(0, 30),
      quotes: annotations.filter((a) => norm(`${a.quote} ${a.note}`).includes(nq)).slice(0, 30),
    };
  }, [nq, live, notes, annotations, tags, tagsOf]);

  return (
    <div className="page" style={{ maxWidth: 760 }}>
      <label className="input" style={{ height: 46, fontSize: 16 }}><Icon name="search" size={18} className="mut" /><input autoFocus type="search" placeholder="Search books, authors, tags, notes and highlights" aria-label="Search everything" value={q} onChange={(e) => setQ(e.target.value)} /></label>
      {!res && <p className="cap" style={{ margin: 0 }}>Tip: press Ctrl K (or ⌘ K) anywhere to search. To search inside a book’s text, open it and use the reader’s search.</p>}
      {res && (
        <>
          {res.tags.length > 0 && <div className="row wrap" style={{ gap: 6 }}>{res.tags.map((t) => <Link key={t.id} className="chip" href={`/library?tag=${encodeURIComponent(t.name)}`}>#{t.name}</Link>)}</div>}
          <section className="col" style={{ gap: 4 }}><h2 className="h2">Books <span className="cap">{res.books.length}</span></h2>
            {res.books.map((b) => (
              <Link key={b.id} href={`/book/${b.id}`} className="si" style={{ paddingLeft: 8 }}><Icon name={b.file_path ? 'book' : 'book-nofile'} size={15} className="mut" /><span className="t">{b.title} <span className="cap">{b.author}</span></span><span className="m">{STATUS_LABEL[b.status]}</span><RatingMark rating={b.rating} size={12} /></Link>
            ))}
          </section>
          <section className="col" style={{ gap: 4 }}><h2 className="h2">Notes <span className="cap">{res.notes.length}</span></h2>
            {res.notes.map((n) => (
              <Link key={n.id} href={`/notes/${n.id}`} className="card" style={{ padding: '8px 12px', color: 'inherit', textDecoration: 'none' }}><div style={{ fontWeight: 500 }}>{n.title}</div><div className="secondary" style={{ fontSize: 13 }}>{hit(excerpt(n.body, 2000), q)}</div></Link>
            ))}
          </section>
          <section className="col" style={{ gap: 4 }}><h2 className="h2">Highlights <span className="cap">{res.quotes.length}</span></h2>
            {res.quotes.map((a) => { const b = live.find((x) => x.id === a.book_id); return (
              <Link key={a.id} href={`/read/${a.book_id}?at=${encodeURIComponent(a.location || '')}`} className="card" style={{ padding: '8px 12px', color: 'inherit', textDecoration: 'none' }}><div className="read-font" style={{ fontSize: 15 }}>{hit(`${a.quote || ''} ${a.note || ''}`, q)}</div><div className="cap">{b?.title}{a.chapter ? ` · ${a.chapter}` : ''}</div></Link>
            ); })}
          </section>
        </>
      )}
    </div>
  );
}
