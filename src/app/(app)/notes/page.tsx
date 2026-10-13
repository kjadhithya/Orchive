'use client';
import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useStore } from '@/lib/store';
import { Icon } from '@/components/Icon';
import { Empty } from '@/components/ui';
import { excerpt } from '@/lib/markdown';
import { fmtDate, norm } from '@/lib/util';

export default function NotesPage() {
  const { notes, books, createNote } = useStore();
  const router = useRouter();
  const [q, setQ] = useState('');
  const list = notes.filter((n) => !q || norm(n.title + ' ' + n.body).includes(norm(q))).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  return (
    <div className="page" style={{ maxWidth: 900 }}>
      <div className="row wrap">
        <div className="grow"><h1 className="page-title">Notes</h1><div className="cap" style={{ fontSize: 13, marginTop: 2 }}>{notes.length} notes · Markdown, with [[links]] between books</div></div>
        <label className="input" style={{ width: 240 }}><Icon name="search" size={15} className="mut" /><input type="search" placeholder="Search notes" aria-label="Search notes" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        <button className="btn pri" onClick={async () => { const n = await createNote({ title: 'Untitled' }); if (n) router.push(`/notes/${n.id}?edit=1`); }}><Icon name="plus" size={15} style={{ color: 'var(--on-primary)' }} />New note</button>
      </div>
      {list.length === 0 ? <Empty icon="note" title={q ? 'No notes match' : 'No notes yet'}>Notes can belong to a book, or stand alone.</Empty> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
          {list.map((n) => {
            const b = books.find((x) => x.id === n.book_id);
            return (
              <Link key={n.id} href={`/notes/${n.id}`} className="card" style={{ padding: 14, color: 'inherit', textDecoration: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontWeight: 600 }} className="truncate">{n.title}</span>
                <span className="secondary" style={{ fontSize: 13, lineHeight: '19px', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{excerpt(n.body, 220) || 'Empty note'}</span>
                <span className="cap row" style={{ gap: 4 }}>{b && <><Icon name="book" size={12} className="mut" /><span className="truncate">{b.title}</span> ·</>} {fmtDate(n.updated_at)}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
