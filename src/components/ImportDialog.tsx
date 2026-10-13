'use client';
import React, { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Modal, Seg, Toggle, TagEditor, RatingSlider } from './ui';
import { Icon } from './Icon';
import { useLibrary, useStore } from '@/lib/store';
import { ACCEPT, bytes, extOf, sha256, similarity, SUPPORTED, titleFromFile, norm } from '@/lib/util';
import { extractMeta, ExtractedMeta } from '@/lib/convert';
import { mimeFor, uploadWithProgress, UploadHandle } from '@/lib/files';
import type { Book, Status } from '@/lib/types';

const MAX = 50 * 1024 * 1024;

type Item = {
  key: string;
  file: File;
  ext: string;
  status: 'checking' | 'ready' | 'uploading' | 'done' | 'error' | 'skipped' | 'cancelled';
  progress: number;
  error?: string;
  hash?: string;
  meta?: ExtractedMeta;
  duplicateOf?: Book;
  match?: Book;
  action: 'attach' | 'new' | 'skip';
  handle?: UploadHandle;
};

export function ImportDialog({ mode: initialMode, attachTo, onClose }: { mode: 'files' | 'placeholder'; attachTo?: string; onClose: () => void }) {
  const [mode, setMode] = useState(initialMode);
  return (
    <Modal title="Add books" onClose={onClose} width={640}>
      <Seg label="How to add" value={mode} onChange={setMode} options={[{ v: 'files', l: 'Import files' }, { v: 'placeholder', l: 'Without a file' }]} />
      {mode === 'files' ? <FilesPane attachTo={attachTo} onClose={onClose} /> : <PlaceholderPane onClose={onClose} />}
    </Modal>
  );
}

function FilesPane({ attachTo, onClose }: { attachTo?: string; onClose: () => void }) {
  const { live, auth, createBook, updateBook, settings, saveSettings, setReadNext, toast, books } = useLibrary();
  const [items, setItems] = useState<Item[]>([]);
  const [drag, setDrag] = useState(false);
  const [running, setRunning] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const placeholders = live.filter((b) => !b.file_path);
  const upd = (key: string, patch: Partial<Item>) => setItems((l) => l.map((x) => (x.key === key ? { ...x, ...patch } : x)));

  const addFiles = async (list: FileList | File[]) => {
    const files = Array.from(list);
    const fresh: Item[] = files.map((file) => {
      const ext = extOf(file.name);
      const bad = !SUPPORTED.includes(ext) && ext !== 'fbz';
      return {
        key: `${file.name}-${file.size}-${Math.random()}`, file, ext, progress: 0,
        status: bad || file.size > MAX ? 'error' : 'checking',
        error: bad ? 'This file type isn’t supported.' : file.size > MAX ? `Larger than the 50 MB limit (${bytes(file.size)}).` : undefined,
        action: 'new',
      };
    });
    setItems((l) => [...l, ...fresh]);
    for (const it of fresh) {
      if (it.status === 'error') continue;
      const [hash, meta] = await Promise.all([sha256(it.file).catch(() => undefined), extractMeta(it.file)]);
      const title = meta.title || titleFromFile(it.file.name);
      const duplicateOf = books.find((b) => !b.deleted_at && b.file_hash && b.file_hash === hash);
      let match: Book | undefined = attachTo ? placeholders.find((p) => p.id === attachTo) : undefined;
      if (!match) {
        let best = 0;
        for (const p of placeholders) {
          const s = similarity(p.title, title);
          if (s > best && s >= 0.6) { best = s; match = p; }
        }
      }
      upd(it.key, { status: 'ready', hash, meta, duplicateOf, match, action: duplicateOf ? 'skip' : match ? 'attach' : 'new' });
    }
  };

  const ready = items.filter((i) => i.status === 'ready' && i.action !== 'skip');

  const run = async () => {
    if (!auth) return;
    setRunning(true);
    let added = 0;
    for (const it of items) {
      if (it.status !== 'ready' || it.action === 'skip') continue;
      const uid = auth.user.id;
      const id = crypto.randomUUID();
      const path = `${uid}/books/${id}.${it.ext}`;
      const handle = uploadWithProgress(path, it.file, mimeFor(it.ext), (p) => upd(it.key, { progress: p }));
      upd(it.key, { status: 'uploading', handle });
      try {
        await handle.promise;
        let coverPath: string | null = null;
        if (it.meta?.cover) {
          coverPath = `${uid}/covers/${id}.jpg`;
          await uploadWithProgress(coverPath, it.meta.cover, it.meta.cover.type || 'image/jpeg', () => {}).promise.catch(() => { coverPath = null; });
        }
        const fileFields = { file_path: path, file_name: it.file.name, file_size: it.file.size, format: it.ext, file_hash: it.hash || null };
        if (it.action === 'attach' && it.match) {
          await updateBook(it.match.id, { ...fileFields, ...(coverPath && !it.match.cover_path ? { cover_path: coverPath } : {}) });
        } else {
          const b = await createBook({
            title: it.meta?.title || titleFromFile(it.file.name), author: it.meta?.author || null, series: it.meta?.series || null,
            description: it.meta?.description || null, cover_path: coverPath, ...fileFields, status: 'to_read' as Status,
          });
          if (b && settings.addImportsToReadNext) await setReadNext(b.id, true);
        }
        upd(it.key, { status: 'done', progress: 1 });
        added++;
      } catch (e: any) {
        upd(it.key, e?.message === 'cancelled' ? { status: 'cancelled' } : { status: 'error', error: e?.message || 'Upload failed' });
      }
    }
    setRunning(false);
    if (added) toast(`${added} ${added === 1 ? 'book' : 'books'} added`);
  };

  const allDone = items.length > 0 && items.every((i) => ['done', 'error', 'skipped', 'cancelled'].includes(i.status) || i.action === 'skip');

  return (
    <>
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files); }}
        style={{ border: `1.5px dashed ${drag ? 'var(--ink)' : 'var(--border-control)'}`, borderRadius: 12, padding: 22, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, textAlign: 'center', background: drag ? 'var(--hover)' : undefined }}
      >
        <Icon name="upload" size={24} />
        <div style={{ fontSize: 14, fontWeight: 500 }}>Drop files here or <button className="btn ghost sm" style={{ color: 'var(--primary)', padding: 0, height: 'auto' }} onClick={() => input.current?.click()}>browse</button></div>
        <div className="cap">EPUB, PDF, MOBI, AZW3, FB2, DjVu, DOC, DOCX, RTF, ODT, CHM, TXT or ZIP · up to 50 MB each</div>
        <input ref={input} type="file" multiple accept={ACCEPT} hidden onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ''; }} />
      </div>

      {items.length > 0 && (
        <div className="card" style={{ borderRadius: 10, maxHeight: 340, overflowY: 'auto' }}>
          {items.map((it) => (
            <div key={it.key} className="row" style={{ gap: 12, padding: '10px 12px', borderBottom: '1px solid var(--border)', alignItems: 'flex-start' }}>
              <Icon name="file" size={16} className="mut" style={{ marginTop: 2 }} />
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div className="truncate" style={{ fontSize: 13, fontWeight: 500 }}>{it.meta?.title || it.file.name} <span className="cap">· {bytes(it.file.size)}</span></div>
                {it.status === 'checking' && <span className="cap">Reading details…</span>}
                {it.status === 'error' && <span style={{ fontSize: 12, color: 'var(--danger)' }}>{it.error}</span>}
                {it.status === 'cancelled' && <span className="cap">Cancelled</span>}
                {it.status === 'done' && <span className="cap">Added</span>}
                {it.status === 'uploading' && <div className="track" style={{ height: 4 }}><i style={{ width: `${Math.round(it.progress * 100)}%` }} /></div>}
                {it.status === 'ready' && it.duplicateOf && <span className="cap" style={{ color: 'var(--ink-secondary)' }}>Already in your library as “{it.duplicateOf.title}”. It will be skipped.</span>}
                {it.status === 'ready' && !it.duplicateOf && it.match && <span className="cap" style={{ color: 'var(--ink-secondary)' }}>Matches <b style={{ fontWeight: 500, color: 'var(--ink)' }}>{it.match.title}</b>, a book without a file. Its notes, rating and tags stay.</span>}
                {it.status === 'ready' && it.meta?.author && <span className="cap">{it.meta.author}</span>}
              </div>
              {it.status === 'ready' && it.duplicateOf && <button className="btn ghost sm" onClick={() => upd(it.key, { action: it.action === 'skip' ? 'new' : 'skip' })}>{it.action === 'skip' ? 'Import anyway' : 'Skip'}</button>}
              {it.status === 'ready' && !it.duplicateOf && it.match && <Seg label="Attach or add new" value={it.action as 'attach' | 'new'} onChange={(v) => upd(it.key, { action: v })} options={[{ v: 'attach', l: 'Attach' }, { v: 'new', l: 'New' }]} />}
              {it.status === 'uploading' && <><span className="cap">{Math.round(it.progress * 100)}%</span><button className="ib" aria-label="Cancel upload" onClick={() => it.handle?.cancel()}><Icon name="close" size={14} /></button></>}
              {(it.status === 'ready' || it.status === 'error' || it.status === 'cancelled') && <button className="ib" aria-label="Remove from list" onClick={() => setItems((l) => l.filter((x) => x.key !== it.key))}><Icon name="close" size={14} /></button>}
            </div>
          ))}
        </div>
      )}
      <div className="row"><Toggle on={settings.addImportsToReadNext} onChange={(v) => saveSettings({ addImportsToReadNext: v })} label="Add new books to Read Next" /><span style={{ fontSize: 13 }}>Add new books to Read Next</span></div>
      <div className="row" style={{ borderTop: '1px solid var(--border)', paddingTop: 14, marginTop: 4 }}>
        <span className="cap grow">Files are stored privately in your library.</span>
        <button className="btn ghost" onClick={onClose}>{allDone ? 'Done' : 'Cancel'}</button>
        {!allDone && <button className="btn pri" disabled={!ready.length || running} onClick={run}>{running ? 'Adding…' : `Add ${ready.length || ''} ${ready.length === 1 ? 'book' : 'books'}`}</button>}
      </div>
    </>
  );
}

function PlaceholderPane({ onClose }: { onClose: () => void }) {
  const { createBook, setBookTags, tags, auth, updateBook, live } = useLibrary();
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [series, setSeries] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<Status>('to_read');
  const [rating, setRating] = useState<number | null>(null);
  const [tagList, setTagList] = useState<string[]>([]);
  const [cover, setCover] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const dup = title && live.find((b) => norm(b.title) === norm(title));

  const save = async () => {
    if (!title.trim()) return;
    setBusy(true);
    const b = await createBook({
      title: title.trim(), author: author.trim() || null, series: series.trim() || null, description: description.trim() || null, status, rating: status === 'completed' ? rating : null,
      completed_at: status === 'completed' ? new Date().toISOString() : null, started_at: status !== 'to_read' ? new Date().toISOString() : null,
    });
    if (b) {
      if (tagList.length) await setBookTags(b.id, tagList);
      if (cover && auth) {
        const path = `${auth.user.id}/covers/${b.id}.${extOf(cover.name) || 'jpg'}`;
        await uploadWithProgress(path, cover, cover.type, () => {}).promise.then(() => updateBook(b.id, { cover_path: path })).catch(() => {});
      }
      onClose();
      router.push(`/book/${b.id}`);
    }
    setBusy(false);
  };

  return (
    <>
      <p className="secondary" style={{ margin: 0, fontSize: 13 }}>Add a book you’re reading on paper or elsewhere. You can rate it, tag it, write notes and complete it now, and attach a file later.</p>
      <label className="field"><span>Title</span><input className="text-input" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus required /></label>
      {dup && <span className="cap" style={{ marginTop: -8 }}>You already have “{dup.title}” in your library.</span>}
      <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
        <label className="field grow"><span>Author</span><input className="text-input" value={author} onChange={(e) => setAuthor(e.target.value)} /></label>
        <label className="field grow"><span>Series</span><input className="text-input" value={series} onChange={(e) => setSeries(e.target.value)} /></label>
      </div>
      <label className="field"><span>Description</span><textarea className="text-input" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} /></label>
      <div className="field"><span>Status</span><Seg label="Status" value={status} onChange={setStatus} options={[{ v: 'to_read', l: 'To Read' }, { v: 'reading', l: 'Reading' }, { v: 'completed', l: 'Completed' }]} /></div>
      {status === 'completed' && <div className="field"><span>Rating</span><RatingSlider value={rating} onChange={setRating} /></div>}
      <div className="field"><span>Tags</span><TagEditor value={tagList} onChange={setTagList} suggestions={tags.map((t) => t.name)} /></div>
      <label className="field"><span>Cover image (optional)</span><input type="file" accept="image/*" onChange={(e) => setCover(e.target.files?.[0] || null)} /></label>
      <div className="row" style={{ borderTop: '1px solid var(--border)', paddingTop: 14, marginTop: 4 }}>
        <span className="grow" />
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn pri" disabled={!title.trim() || busy} onClick={save}>{busy ? 'Adding…' : 'Add book'}</button>
      </div>
    </>
  );
}
