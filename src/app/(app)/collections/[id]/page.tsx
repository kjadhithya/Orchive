'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useLibrary } from '@/lib/store';
import { BookCover, Empty, Toggle } from '@/components/ui';
import { Icon, RatingMark } from '@/components/Icon';

export default function CollectionPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { collections, collectionBooks, live, createCollection, updateCollection, deleteCollection, setBookCollections } = useLibrary();
  const [name, setName] = useState('');
  const [adding, setAdding] = useState(false);
  const c = collections.find((x) => x.id === id);

  useEffect(() => { if (c) setName(c.name); }, [c]);

  if (id === 'new') {
    return (
      <div className="page" style={{ maxWidth: 520 }}>
        <h1 className="page-title">New collection</h1>
        <form className="col" style={{ gap: 12 }} onSubmit={async (e) => { e.preventDefault(); if (!name.trim()) return; const n = await createCollection(name.trim()); if (n) router.replace(`/collections/${n.id}`); }}>
          <label className="field"><span>Name</span><input className="text-input" value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="e.g. Stoicism shelf" /></label>
          <div><button className="btn pri" type="submit" disabled={!name.trim()}>Create collection</button></div>
        </form>
      </div>
    );
  }
  if (!c) return <div className="page"><Empty icon="folder" title="Collection not found" /></div>;
  const ids = collectionBooks.filter((x) => x.collection_id === c.id).map((x) => x.book_id);
  const books = live.filter((b) => ids.includes(b.id));
  const others = live.filter((b) => !ids.includes(b.id));

  return (
    <div className="page">
      <div className="row wrap" style={{ alignItems: 'flex-end' }}>
        <div className="grow" style={{ minWidth: 240 }}>
          <input className="page-title" aria-label="Collection name" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && name !== c.name && updateCollection(c.id, { name: name.trim() })} style={{ border: 0, background: 'none', padding: 0, width: '100%', color: 'var(--ink)' }} />
          <div className="cap" style={{ fontSize: 13 }}>{books.length} books</div>
        </div>
        <label className="row" style={{ gap: 8, fontSize: 13 }}><Toggle on={c.is_public} onChange={(v) => updateCollection(c.id, { is_public: v })} label="Share publicly" />Shared with other Orchive readers</label>
        <button className="btn sec" onClick={() => setAdding(!adding)}><Icon name="plus" size={15} />Add books</button>
        <button className="ib" aria-label="Delete collection" onClick={() => { if (confirm(`Delete the collection “${c.name}”? The books stay in your library.`)) { deleteCollection(c.id); router.replace('/library'); } }}><Icon name="trash" size={16} /></button>
      </div>
      {c.is_public && <p className="cap" style={{ margin: 0, fontSize: 13 }}>Anyone signed in to Orchive can see this collection’s books and import copies of their files from Shared collections.</p>}
      <label className="field"><span>Description</span><textarea className="text-input" rows={2} defaultValue={c.description || ''} onBlur={(e) => updateCollection(c.id, { description: e.target.value.trim() || null })} /></label>
      {adding && (
        <div className="card" style={{ padding: 12, maxHeight: 280, overflowY: 'auto' }}>
          {others.length === 0 && <span className="cap">Every book is already here.</span>}
          {others.map((b) => (
            <button key={b.id} className="si" style={{ paddingLeft: 8 }} onClick={() => setBookCollections(b.id, [...collectionBooks.filter((x) => x.book_id === b.id).map((x) => x.collection_id), c.id])}>
              <Icon name="plus" size={14} className="mut" /><span className="t">{b.title}</span><span className="m">{b.author}</span>
            </button>
          ))}
        </div>
      )}
      {books.length === 0 ? <Empty icon="folder" title="No books in this collection yet" /> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(112px, 1fr))', gap: 20 }}>
          {books.map((b) => (
            <div key={b.id} className="col" style={{ gap: 6 }}>
              <BookCover book={b} width={112} height={164} link />
              <div className="row" style={{ gap: 6 }}>
                <Link href={`/book/${b.id}`} className="truncate grow" style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>{b.title}</Link>
                <RatingMark rating={b.rating} />
                <button className="ib" aria-label={`Remove ${b.title} from collection`} onClick={() => setBookCollections(b.id, collectionBooks.filter((x) => x.book_id === b.id && x.collection_id !== c.id).map((x) => x.collection_id))}><Icon name="close" size={13} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
