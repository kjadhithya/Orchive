'use client';
import React, { useState } from 'react';
import Link from 'next/link';
import { MenuButton, Modal } from './ui';
import { Icon } from './Icon';
import { useLibrary } from '@/lib/store';
import type { Book } from '@/lib/types';
import { signedDownloadUrl } from '@/lib/files';
import { openImport } from './Shell';

export async function downloadBook(b: Book) {
  if (!b.file_path) return;
  const url = await signedDownloadUrl(b.file_path, b.file_name || `${b.title}.${b.format}`);
  if (url) window.location.href = url;
}

export function CollectionPicker({ book, onClose }: { book: Book; onClose: () => void }) {
  const { collections, collectionBooks, setBookCollections, createCollection } = useLibrary();
  const [sel, setSel] = useState<string[]>(collectionBooks.filter((x) => x.book_id === book.id).map((x) => x.collection_id));
  const [name, setName] = useState('');
  return (
    <Modal title="Collections" onClose={onClose} width={420} footer={<><span className="grow" /><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn pri" onClick={async () => { await setBookCollections(book.id, sel); onClose(); }}>Save</button></>}>
      <p className="secondary" style={{ margin: 0, fontSize: 13 }}>Choose the shelves for “{book.title}”.</p>
      <div className="col" style={{ gap: 4 }}>
        {collections.map((c) => (
          <label key={c.id} className="row" style={{ padding: '6px 4px', fontSize: 14 }}>
            <input type="checkbox" checked={sel.includes(c.id)} onChange={(e) => setSel(e.target.checked ? [...sel, c.id] : sel.filter((x) => x !== c.id))} />
            <Icon name="folder" size={15} className="mut" />{c.name}{c.is_public && <span className="cap">· shared</span>}
          </label>
        ))}
        {collections.length === 0 && <span className="cap">No collections yet.</span>}
      </div>
      <form className="row" onSubmit={async (e) => { e.preventDefault(); if (!name.trim()) return; const c = await createCollection(name.trim()); if (c) setSel([...sel, c.id]); setName(''); }}>
        <input className="text-input" placeholder="New collection name" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn sec" type="submit">Create</button>
      </form>
    </Modal>
  );
}

export function BookMenu({ book }: { book: Book }) {
  const { setReadNext, updateBook, trashBook, removeFile } = useLibrary();
  const [pick, setPick] = useState(false);
  return (
    <>
      <MenuButton label={`More for ${book.title}`}>
        {(close) => (
          <>
            <Link href={`/book/${book.id}`} onClick={close}><Icon name="book" size={15} />Open book page</Link>
            {book.file_path ? <Link href={`/read/${book.id}`} onClick={close}><Icon name="library" size={15} />Read</Link>
              : <button onClick={() => { close(); openImport('files', book.id); }}><Icon name="upload" size={15} />Import file</button>}
            <button onClick={() => { close(); setReadNext(book.id, book.read_next_pos == null); }}><Icon name="bookmark" size={15} />{book.read_next_pos == null ? 'Add to Read Next' : 'Remove from Read Next'}</button>
            <button onClick={() => { close(); updateBook(book.id, { favorite: !book.favorite }); }}><Icon name="heart" size={15} />{book.favorite ? 'Remove from favorites' : 'Add to favorites'}</button>
            <button onClick={() => { close(); setPick(true); }}><Icon name="folder" size={15} />Collections…</button>
            {book.file_path && <button onClick={() => { close(); downloadBook(book); }}><Icon name="download" size={15} />Download file</button>}
            {book.file_path && <button onClick={() => { close(); if (confirm('Remove the file and keep this book as a placeholder? Notes, rating and tags stay.')) removeFile(book.id); }}><Icon name="book-nofile" size={15} />Remove file, keep book</button>}
            <button className="dan" onClick={() => { close(); trashBook(book.id); }}><Icon name="trash" size={15} />Move to Trash</button>
          </>
        )}
      </MenuButton>
      {pick && <CollectionPicker book={book} onClose={() => setPick(false)} />}
    </>
  );
}
