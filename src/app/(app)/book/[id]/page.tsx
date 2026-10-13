'use client';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useLibrary } from '@/lib/store';
import { Icon, Mark, RatingMark, ratingColor, ratingWord } from '@/components/Icon';
import { BookCover, Empty, FavButton, RatingSlider, TagEditor } from '@/components/ui';
import { BookMenu, CollectionPicker, downloadBook } from '@/components/BookMenu';
import { CompleteDialog } from '@/components/CompleteDialog';
import { HighlightItem } from '@/components/HighlightItem';
import { openImport } from '@/components/Shell';
import { GraphView } from '@/components/GraphView';
import { buildGraph, neighborhood } from '@/lib/graph';
import { excerpt } from '@/lib/markdown';
import { bytes, daysBetween, download, duration, fmtDate, formatLabel, norm, pct, resolveLink, STATUS_LABEL, wikiLinks } from '@/lib/util';
import { uploadWithProgress } from '@/lib/files';
import type { Status } from '@/lib/types';

function dateInput(iso: string | null) { return iso ? iso.slice(0, 10) : ''; }
function fromDateInput(v: string) { return v ? new Date(v + 'T12:00:00').toISOString() : null; }

export default function BookPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const lib = useLibrary();
  const { books, live, notes, annotations, tags, tagsOf, collections, collectionBooks, updateBook, setBookTags, setReadNext, createNote, updateNote, auth, removeFile } = lib;
  const book = books.find((b) => b.id === id);
  const search = useSearchParams();
  const [editing, setEditing] = useState(search.get('edit') === '1');
  const [completing, setCompleting] = useState(false);
  const [pickColl, setPickColl] = useState(false);
  const [depth, setDepth] = useState(1);
  const [side, setSide] = useState(false);
  useEffect(() => { try { setSide(localStorage.getItem('orchive-book-side') === '1'); } catch {} }, []);
  const toggleSide = () => setSide((v) => { try { localStorage.setItem('orchive-book-side', v ? '0' : '1'); } catch {} return !v; });
  const coverInput = useRef<HTMLInputElement>(null);

  const bookNotes = useMemo(() => notes.filter((n) => n.book_id === id).sort((a, b) => b.updated_at.localeCompare(a.updated_at)), [notes, id]);
  const highlights = useMemo(() => annotations.filter((a) => a.book_id === id && a.kind !== 'bookmark').sort((a, b) => (a.position ?? 0) - (b.position ?? 0)), [annotations, id]);
  const bookmarks = useMemo(() => annotations.filter((a) => a.book_id === id && a.kind === 'bookmark'), [annotations, id]);

  const mentions = useMemo(() => {
    if (!book) return { linked: [], unlinked: [] };
    const linked = notes.filter((n) => n.book_id !== id && wikiLinks(n.body).some((l) => { const r = resolveLink(l, books, notes); return r.kind === 'book' && r.book.id === id; }));
    const t = norm(book.title);
    const unlinked = t.length > 3 ? notes.filter((n) => n.book_id !== id && !linked.includes(n) && norm(n.body).includes(t)) : [];
    return { linked, unlinked };
  }, [notes, books, book, id]);

  const local = useMemo(() => {
    const g = buildGraph(books, tags, lib.bookTags, notes, { tags: true, notes: false, authors: false, placeholders: true, orphans: true, status: 'all' });
    return neighborhood(g, `b:${id}`, depth);
  }, [books, tags, lib.bookTags, notes, id, depth]);

  if (!book) return <div className="page"><Empty icon="book" title="This book isn’t in your library"><Link className="btn sec" href="/library">Back to library</Link></Empty></div>;
  const t = tagsOf(book.id).map((x) => x.name);
  const days = daysBetween(book.started_at, book.completed_at);
  const inCollections = collections.filter((c) => collectionBooks.some((x) => x.collection_id === c.id && x.book_id === book.id));

  const setStatus = (s: Status) => {
    if (s === 'completed') { setCompleting(true); return; }
    const patch: any = { status: s };
    if (s === 'reading' && !book.started_at) patch.started_at = new Date().toISOString();
    if (book.status === 'completed') patch.completed_at = null;
    updateBook(book.id, patch);
  };

  const reread = () => updateBook(book.id, { status: 'reading', reread_count: (book.reread_count || 0) + 1, started_at: new Date().toISOString(), completed_at: null, progress: 0, location: null });

  const uploadCover = async (f: File) => {
    if (!auth) return;
    const path = `${auth.user.id}/covers/${book.id}-${Date.now()}.${f.name.split('.').pop() || 'jpg'}`;
    await uploadWithProgress(path, f, f.type, () => {}).promise;
    await updateBook(book.id, { cover_path: path });
  };

  const exportHighlights = (fmt: 'md' | 'txt') => {
    const lines = highlights.map((h) => fmt === 'md' ? `> ${h.quote || ''}${h.note ? `\n\n${h.note}` : ''}\n\n— ${h.chapter || ''}${h.page ? ` · p. ${h.page}` : ''}\n` : `"${h.quote || ''}"${h.note ? `\n  Note: ${h.note}` : ''}\n  ${h.chapter || ''}${h.page ? ` · p. ${h.page}` : ''}\n`);
    const head = fmt === 'md' ? `# ${book.title}\n${book.author ? `*${book.author}*\n` : ''}\n` : `${book.title}${book.author ? ` — ${book.author}` : ''}\n\n`;
    download(`${book.title} highlights.${fmt}`, head + lines.join('\n'), fmt === 'md' ? 'text/markdown' : 'text/plain');
  };

  const linkMention = async (noteId: string) => {
    const n = notes.find((x) => x.id === noteId);
    if (!n) return;
    const re = new RegExp(book.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    await updateNote(n.id, { body: n.body.replace(re, (m) => `[[${m}]]`) });
  };

  return (
    <div style={{ display: 'flex', minHeight: '100%' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="vh">
          <Link href={`/library?status=${book.status}`} style={{ color: 'var(--ink-muted)' }}>{STATUS_LABEL[book.status]}</Link><span>/</span><b className="truncate">{book.title}</b><span className="grow" />
          <button className={`ib ${side ? 'on' : ''}`} aria-label={side ? 'Hide links and graph' : 'Show links and graph'} aria-pressed={side} onClick={toggleSide}><Icon name="sidebar-right" size={16} /></button>
          <BookMenu book={book} onPage />
        </div>
        <div className="doc">
          <div className="row" style={{ gap: 24, alignItems: 'flex-end' }}>
            <div style={{ position: 'relative' }}>
              <BookCover book={book} width={88} height={128} />
              {editing && <button className="btn sec sm" style={{ position: 'absolute', bottom: -10, left: 4 }} onClick={() => coverInput.current?.click()}>Cover</button>}
              <input ref={coverInput} hidden type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && uploadCover(e.target.files[0])} />
            </div>
            <div className="col" style={{ gap: 4, minWidth: 0 }}>
              {editing ? (
                <>
                  <input className="text-input serif" style={{ fontSize: 26, fontWeight: 600 }} aria-label="Title" defaultValue={book.title} onBlur={(e) => e.target.value.trim() && e.target.value !== book.title && updateBook(book.id, { title: e.target.value.trim() })} />
                  <input className="text-input" aria-label="Author" placeholder="Author" defaultValue={book.author || ''} onBlur={(e) => updateBook(book.id, { author: e.target.value.trim() || null })} />
                </>
              ) : (
                <>
                  <h1 className="serif row" style={{ fontSize: 34, lineHeight: '40px', alignItems: 'center', gap: 10 }}>{book.title}<FavButton book={book} size={20} /></h1>
                  <div className="secondary" style={{ fontSize: 15 }}>{book.author || 'Unknown author'}{book.series && <span className="cap" style={{ fontSize: 13 }}> · {book.series}{book.series_index ? ` #${book.series_index}` : ''}</span>}</div>
                </>
              )}
            </div>
          </div>

          {!editing ? (
            <section aria-label="About this book" className="col" style={{ gap: 10 }}>
              <div className="row wrap" style={{ gap: 10, fontSize: 14 }}>
                {book.rating != null && <span className="row" style={{ gap: 6 }}><Mark size={18} color={ratingColor(book.rating)} /><span style={{ fontWeight: 500 }}>{ratingWord(book.rating)}</span></span>}
                {book.rating != null && <span className="muted">·</span>}
                <span>{book.status === 'completed' ? `Completed ${fmtDate(book.completed_at)}` : book.status === 'reading' ? `Reading · ${pct(book.progress)}` : book.status === 'paused' ? `Paused at ${pct(book.progress)}` : 'To Read'}</span>
                {days && book.status === 'completed' && <><span className="muted">·</span><span className="secondary">{days} days</span></>}
                {book.reread_count > 0 && <><span className="muted">·</span><span className="secondary">read {book.reread_count + 1} times</span></>}
                <span className="grow" />
                <button className="btn ghost sm" onClick={() => setEditing(true)}><Icon name="edit" size={14} />Edit</button>
              </div>
              <div className="row wrap" style={{ gap: 6 }}>
                {t.map((x) => <Link key={x} className="chip" href={`/library?tag=${encodeURIComponent(x)}`}>#{x}</Link>)}
                {inCollections.map((c) => <Link key={c.id} className="chip out" href={`/collections/${c.id}`}><Icon name="folder" size={12} />{c.name}</Link>)}
                <span className="cap" style={{ marginLeft: 6 }}>{book.file_path ? `${formatLabel(book.format)} · ${bytes(book.file_size)}` : 'No file yet'}</span>
              </div>
              {book.description && <p className="secondary" style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>{book.description}</p>}
            </section>
          ) : (
            <section aria-label="Properties" style={{ padding: '12px 16px 8px', margin: '0 -16px', borderRadius: 12, background: 'var(--sidebar)', border: '1px solid var(--border)' }} className="col">
              <div className="row"><span className="lbl grow" style={{ color: 'var(--ink-muted)' }}>Properties</span><button className="btn sec sm" onClick={() => setEditing(false)}>Done</button></div>
              <Prop icon="status" label="Status">
                <select className="chip out" value={book.status} onChange={(e) => setStatus(e.target.value as Status)} aria-label="Status">
                  {(['to_read', 'reading', 'paused', 'completed'] as Status[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                </select>
              </Prop>
              <Prop icon="timeline" label="Dates">
                <label className="cap row" style={{ gap: 4 }}>Started <input type="date" className="chip out" value={dateInput(book.started_at)} onChange={(e) => updateBook(book.id, { started_at: fromDateInput(e.target.value) })} /></label>
                {book.status === 'completed' && <label className="cap row" style={{ gap: 4 }}>Completed <input type="date" className="chip out" value={dateInput(book.completed_at)} onChange={(e) => updateBook(book.id, { completed_at: fromDateInput(e.target.value) })} /></label>}
              </Prop>
              <Prop icon="tag" label="Tags"><TagEditor value={t} onChange={(v) => setBookTags(book.id, v)} suggestions={tags.map((x) => x.name)} /></Prop>
              <Prop icon="goal" label="Rating"><RatingSlider value={book.rating} onChange={(v) => updateBook(book.id, { rating: v })} /></Prop>
              <Prop icon="folder" label="Collections"><span className="row wrap" style={{ gap: 6 }}>{inCollections.map((c) => <span key={c.id} className="chip">{c.name}</span>)}<button className="chip out" onClick={() => setPickColl(true)}>Choose…</button></span></Prop>
              <Prop icon="list" label="Series">
                <input className="chip out" style={{ width: 180 }} placeholder="Series name" defaultValue={book.series || ''} onBlur={(e) => updateBook(book.id, { series: e.target.value.trim() || null })} aria-label="Series" />
                <input className="chip out" style={{ width: 64 }} type="number" placeholder="#" defaultValue={book.series_index ?? ''} onBlur={(e) => updateBook(book.id, { series_index: e.target.value ? Number(e.target.value) : null })} aria-label="Number in series" />
              </Prop>
              <Prop icon="file" label="File">
                {book.file_path ? (
                  <span className="row wrap" style={{ gap: 6 }}>{book.file_name} <span className="cap">· {bytes(book.file_size)}</span>
                    <button className="btn ghost sm" onClick={() => downloadBook(book)}>Download</button>
                    <button className="btn ghost sm" onClick={() => { if (confirm('Remove the file and keep this book as a placeholder?')) removeFile(book.id); }}>Remove</button>
                  </span>
                ) : <span className="row" style={{ gap: 6 }}><span className="secondary">No file yet</span><button className="btn ghost sm" style={{ color: 'var(--primary)' }} onClick={() => openImport('files', book.id)}>Import</button></span>}
              </Prop>
              <label className="col" style={{ padding: '6px 0', gap: 6 }}><span className="row secondary" style={{ gap: 8, fontSize: 13 }}><Icon name="note" size={15} className="mut" />Description</span>
                <textarea className="text-input" rows={3} defaultValue={book.description || ''} onBlur={(e) => updateBook(book.id, { description: e.target.value.trim() || null })} />
              </label>
            </section>
          )}

          <div className="row wrap" style={{ gap: 8 }}>
            {book.file_path ? (
              <Link className="btn pri" href={`/read/${book.id}`} onClick={() => book.status === 'completed' && reread()}><Icon name="library" size={15} style={{ color: 'var(--on-primary)' }} />{book.status === 'completed' ? 'Read again' : book.progress > 0 ? 'Continue reading' : 'Read'}</Link>
            ) : (
              <button className="btn pri" onClick={() => openImport('files', book.id)}><Icon name="upload" size={15} style={{ color: 'var(--on-primary)' }} />Import file</button>
            )}
            <button className="btn sec" aria-pressed={book.read_next_pos != null} onClick={() => setReadNext(book.id, book.read_next_pos == null)} style={book.read_next_pos != null ? { color: 'var(--primary)' } : undefined}><Icon name="readnext" size={15} style={book.read_next_pos != null ? { color: 'var(--primary)' } : undefined} />{book.read_next_pos == null ? 'Read Next' : 'In Read Next'}</button>
            {book.status !== 'completed' ? <button className="btn sec" onClick={() => setCompleting(true)}><Icon name="check" size={15} />Mark as completed</button>
              : <button className="btn sec" onClick={reread}><Icon name="restore" size={15} />Re-read</button>}
            <button className="btn sec" onClick={async () => { const n = await createNote({ book_id: book.id, title: 'Untitled' }); if (n) router.push(`/notes/${n.id}?edit=1`); }}><Icon name="plus" size={15} />New note</button>
          </div>
          <hr className="hr" />

          <section className="col" style={{ gap: 6 }} aria-labelledby="nh">
            <div className="row"><h2 id="nh" style={{ fontSize: 18, fontWeight: 600 }}>Notes</h2><span className="cap" style={{ fontSize: 13 }}>{bookNotes.length}</span></div>
            {bookNotes.length === 0 && <p className="cap" style={{ margin: 0, fontSize: 13 }}>No notes yet. Notes open full page, with Markdown and [[links]] to other books.</p>}
            {bookNotes.map((n) => (
              <Link key={n.id} href={`/notes/${n.id}`} className="row" style={{ gap: 10, padding: 10, borderRadius: 8, color: 'inherit', textDecoration: 'none', alignItems: 'flex-start' }} onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hover)')} onMouseLeave={(e) => (e.currentTarget.style.background = '')}>
                <Icon name="note" size={16} className="mut" style={{ marginTop: 3 }} />
                <span className="col" style={{ gap: 2, flex: 1, minWidth: 0 }}>
                  <span className="row"><span style={{ fontWeight: 500 }} className="grow truncate">{n.title}</span><span className="cap">{fmtDate(n.updated_at, false)}</span></span>
                  <span className="secondary" style={{ fontSize: 13, lineHeight: '20px' }}>{excerpt(n.body) || 'Empty note'}</span>
                </span>
              </Link>
            ))}
          </section>

          {(highlights.length > 0 || bookmarks.length > 0) && (
            <section className="col" style={{ gap: 8 }} aria-labelledby="hh">
              <div className="row"><h2 id="hh" style={{ fontSize: 18, fontWeight: 600 }}>Highlights</h2><span className="cap" style={{ fontSize: 13 }}>{highlights.length}</span><span className="grow" />
                <button className="btn ghost sm" onClick={() => exportHighlights('md')}><Icon name="download" size={14} />Markdown</button>
                <button className="btn ghost sm" onClick={() => exportHighlights('txt')}>Text</button>
              </div>
              {highlights.slice(0, 20).map((h) => <HighlightItem key={h.id} h={h} bookId={book.id} />)}
              {highlights.length > 20 && <Link href="/highlights" className="cap">See all {highlights.length}</Link>}
              {bookmarks.length > 0 && <div className="row wrap" style={{ gap: 6 }}><span className="cap">Bookmarks:</span>{bookmarks.map((b) => <span key={b.id} className="chip"><Link href={`/read/${book.id}?at=${encodeURIComponent(b.location || '')}`} className="row" style={{ gap: 4, color: 'inherit' }}><Icon name="bookmark" size={12} />{b.chapter || pct(b.position)}</Link><button className="x" aria-label="Delete bookmark" onClick={() => lib.deleteAnnotation(b.id)}><Icon name="close" size={12} /></button></span>)}</div>}
            </section>
          )}

          <section className="row wrap" style={{ gap: 16 }}>
            <span className="cap">Reading time {duration(book.reading_seconds || 0)}</span>
            {book.last_opened_at && <span className="cap">Last opened {fmtDate(book.last_opened_at)}</span>}
            <span className="cap">Added {fmtDate(book.created_at)}</span>
            {book.location_device && <span className="cap">Last read on {book.location_device}</span>}
          </section>
        </div>
      </div>

      {side && <aside className="side-r" aria-label="Connections">
        <section className="col" style={{ gap: 6 }}>
          <div className="gh" style={{ padding: 0 }}><Icon name="link" size={14} className="mut" />Linked mentions<span className="c">{mentions.linked.length}</span></div>
          {mentions.linked.length === 0 && <span className="cap">No other notes link here yet. Type [[{book.title}]] in any note.</span>}
          {mentions.linked.map((n) => {
            const owner = live.find((b) => b.id === n.book_id);
            return (
              <Link key={n.id} href={`/notes/${n.id}`} className="card" style={{ padding: '8px 10px', borderRadius: 8, color: 'inherit', textDecoration: 'none' }}>
                <div className="row" style={{ gap: 6, fontSize: 12, fontWeight: 500 }}><Icon name={owner ? 'book' : 'note'} size={14} className="mut" />{owner ? owner.title : n.title}</div>
                <div style={{ fontSize: 12, lineHeight: '17px', color: 'var(--ink-secondary)', marginTop: 3 }}>{n.title} · {excerpt(n.body, 90)}</div>
              </Link>
            );
          })}
        </section>
        <section className="col" style={{ gap: 6 }}>
          <div className="gh" style={{ padding: 0 }}><Icon name="graph" size={14} className="mut" />Local graph<span className="c"><select className="chip out" style={{ height: 22 }} value={depth} onChange={(e) => setDepth(Number(e.target.value))} aria-label="Graph depth"><option value={1}>depth 1</option><option value={2}>depth 2</option><option value={3}>depth 3</option></select></span></div>
          <div className="card" style={{ overflow: 'hidden' }}>
            <GraphView nodes={local.nodes} edges={local.edges} height={220} focus={`b:${book.id}`} compact onOpen={(n) => n.book ? router.push(`/book/${n.book.id}`) : n.note ? router.push(`/notes/${n.note.id}`) : n.kind === 'tag' ? router.push(`/library?tag=${encodeURIComponent(n.label.slice(1))}`) : null} />
          </div>
          <Link href={`/graph?focus=${book.id}`} className="cap">Open in graph</Link>
        </section>
        <section className="col" style={{ gap: 6 }}>
          <div className="gh" style={{ padding: 0 }}><Icon name="search" size={14} className="mut" />Unlinked mentions<span className="c">{mentions.unlinked.length}</span></div>
          {mentions.unlinked.map((n) => (
            <div key={n.id} className="card" style={{ padding: '8px 10px', borderRadius: 8, borderStyle: 'dashed', borderColor: 'var(--border-control)' }}>
              <div className="row" style={{ gap: 6, fontSize: 12, fontWeight: 500 }}><Icon name="note" size={14} className="mut" /><Link href={`/notes/${n.id}`} style={{ color: 'var(--ink)' }} className="grow truncate">{n.title}</Link><button className="chip out" style={{ height: 22 }} onClick={() => linkMention(n.id)}>Link</button></div>
              <div style={{ fontSize: 12, lineHeight: '17px', color: 'var(--ink-secondary)', marginTop: 3 }}>{excerpt(n.body, 90)}</div>
            </div>
          ))}
        </section>
      </aside>}
      {completing && <CompleteDialog book={book} onClose={() => setCompleting(false)} />}
      {pickColl && <CollectionPicker book={book} onClose={() => setPickColl(false)} />}
    </div>
  );
}

function Prop({ icon, label, children }: { icon: string; label: string; children: React.ReactNode }) {
  return (
    <div className="row" style={{ gap: 10, padding: '6px 0', fontSize: 13, minHeight: 36, flexWrap: 'wrap' }}>
      <div className="row secondary" style={{ width: 130, gap: 8 }}><Icon name={icon} size={15} className="mut" />{label}</div>
      <div className="row wrap grow" style={{ gap: 8 }}>{children}</div>
    </div>
  );
}
