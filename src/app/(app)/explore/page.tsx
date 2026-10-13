'use client';
import React, { useEffect, useState } from 'react';
import { sb, BUCKET } from '@/lib/supabase';
import { useLibrary } from '@/lib/store';
import { Empty } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { bytes, formatLabel } from '@/lib/util';
import { uploadWithProgress, mimeFor } from '@/lib/files';
import type { Book, Collection } from '@/lib/types';

export default function ExplorePage() {
  const { auth, createBook, books: mine, toast } = useLibrary();
  const [cols, setCols] = useState<(Collection & { books: Book[] })[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const c = sb();
      const { data: collections } = await c.from('orchive_collections').select('*').eq('is_public', true).neq('user_id', auth?.user.id || '').limit(50);
      const out: (Collection & { books: Book[] })[] = [];
      for (const col of (collections as Collection[]) || []) {
        const { data: links } = await c.from('orchive_collection_books').select('book_id').eq('collection_id', col.id);
        const ids = (links || []).map((l: any) => l.book_id);
        const { data: books } = ids.length ? await c.from('orchive_books').select('*').in('id', ids) : { data: [] };
        out.push({ ...col, books: (books as Book[]) || [] });
      }
      setCols(out);
    })();
  }, [auth?.user.id]);

  const importBook = async (b: Book) => {
    if (!auth) return;
    setBusy(b.id);
    try {
      let file_path: string | null = null, cover_path: string | null = null;
      const id = crypto.randomUUID();
      if (b.file_path) {
        const { data, error } = await sb().storage.from(BUCKET).download(b.file_path);
        if (error || !data) throw new Error(error?.message || 'Download failed');
        file_path = `${auth.user.id}/books/${id}.${b.format}`;
        await uploadWithProgress(file_path, data, mimeFor(b.format || ''), () => {}).promise;
      }
      if (b.cover_path) {
        const { data } = await sb().storage.from(BUCKET).download(b.cover_path);
        if (data) { cover_path = `${auth.user.id}/covers/${id}.jpg`; await uploadWithProgress(cover_path, data, data.type || 'image/jpeg', () => {}).promise.catch(() => { cover_path = null; }); }
      }
      await createBook({ title: b.title, author: b.author, series: b.series, series_index: b.series_index, description: b.description, format: b.format, file_name: b.file_name, file_size: b.file_size, file_hash: b.file_hash, file_path, cover_path, status: 'to_read' });
      toast(`“${b.title}” added to your library`);
    } catch (e: any) {
      toast(`Couldn’t import: ${e.message}`);
    }
    setBusy(null);
  };

  return (
    <div className="page">
      <div><h1 className="page-title">Shared collections</h1><div className="cap" style={{ fontSize: 13, marginTop: 2 }}>Collections other Orchive readers have shared. Import a copy of any book into your own library.</div></div>
      {cols === null ? <span className="cap">Loading…</span> : cols.length === 0 ? <Empty icon="globe" title="No shared collections yet">Share one of yours from its collection page.</Empty> : cols.map((c) => (
        <section key={c.id} className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div><h2 className="h2">{c.name}</h2>{c.description && <p className="secondary" style={{ margin: '4px 0 0', fontSize: 13 }}>{c.description}</p>}</div>
          {c.books.map((b) => {
            const have = mine.some((m) => !m.deleted_at && ((m.file_hash && m.file_hash === b.file_hash) || m.title === b.title));
            return (
              <div key={b.id} className="row" style={{ gap: 10, padding: '6px 0', borderTop: '1px solid var(--border)' }}>
                <Icon name={b.file_path ? 'book' : 'book-nofile'} size={16} className="mut" />
                <div className="grow" style={{ minWidth: 0 }}><div style={{ fontWeight: 500 }} className="truncate">{b.title}</div><div className="cap">{b.author}{b.file_path ? ` · ${formatLabel(b.format)} · ${bytes(b.file_size)}` : ' · no file'}</div></div>
                {have ? <span className="cap">In your library</span> : <button className="btn sec sm" disabled={busy === b.id} onClick={() => importBook(b)}>{busy === b.id ? 'Importing…' : 'Import'}</button>}
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}
