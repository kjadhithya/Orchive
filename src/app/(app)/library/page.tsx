'use client';
import React, { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useLibrary } from '@/lib/store';
import { Icon, RatingMark } from '@/components/Icon';
import { BookCover, Empty, Seg } from '@/components/ui';
import { BookMenu } from '@/components/BookMenu';
import { openImport } from '@/components/Shell';
import { bytes, formatLabel, norm, pct, relDate, STATUS_LABEL } from '@/lib/util';
import type { Book } from '@/lib/types';

type SortKey = 'opened' | 'title' | 'author' | 'added' | 'progress' | 'rating' | 'size';
const SORTS: { v: SortKey; l: string }[] = [
  { v: 'opened', l: 'Last opened' }, { v: 'title', l: 'Title' }, { v: 'author', l: 'Author' }, { v: 'added', l: 'Date added' },
  { v: 'progress', l: 'Progress' }, { v: 'rating', l: 'Rating' }, { v: 'size', l: 'File size' },
];

function sorter(k: SortKey) {
  return (a: Book, b: Book) => {
    switch (k) {
      case 'title': return a.title.localeCompare(b.title);
      case 'author': return (a.author || '~').localeCompare(b.author || '~') || a.title.localeCompare(b.title);
      case 'added': return b.created_at.localeCompare(a.created_at);
      case 'progress': return (b.progress || 0) - (a.progress || 0);
      case 'rating': return (b.rating ?? -1) - (a.rating ?? -1);
      case 'size': return (b.file_size || 0) - (a.file_size || 0);
      default: return (b.last_opened_at || b.created_at).localeCompare(a.last_opened_at || a.created_at);
    }
  };
}

function LibraryInner() {
  const lib = useLibrary();
  const { live, readNext, tagsOf, tags, collections, collectionBooks, settings, saveSettings, reorderReadNext } = lib;
  const params = useSearchParams();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<string>(params.get('status') || 'all');
  const [fileFilter, setFileFilter] = useState<'all' | 'with' | 'without'>(params.get('nofile') ? 'without' : 'all');
  const [tagFilter, setTagFilter] = useState<string[]>(params.get('tag') ? [params.get('tag')!] : []);
  const [format, setFormat] = useState('all');
  const [minRating, setMinRating] = useState(0);
  const [favOnly, setFavOnly] = useState(false);
  const [coll, setColl] = useState('all');
  const [group, setGroup] = useState<'none' | 'author' | 'series' | 'format'>('none');
  const [dupesOnly, setDupesOnly] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const sort = (settings.librarySort as SortKey) || 'opened';
  const view = settings.libraryView;

  useEffect(() => { const s = params.get('status'); if (s) setStatus(s); const t = params.get('tag'); if (t) setTagFilter([t]); }, [params]);

  const dupes = useMemo(() => {
    const seen = new Map<string, Book[]>();
    live.forEach((b) => { const k = b.file_hash || `t:${norm(b.title)}|${norm(b.author)}`; seen.set(k, [...(seen.get(k) || []), b]); });
    return new Set(Array.from(seen.values()).filter((l) => l.length > 1).flat().map((b) => b.id));
  }, [live]);

  const formats = useMemo(() => Array.from(new Set(live.map((b) => b.format).filter(Boolean))) as string[], [live]);

  const filtered = useMemo(() => {
    const nq = norm(q);
    return live.filter((b) => {
      if (status !== 'all' && b.status !== status) return false;
      if (fileFilter === 'with' && !b.file_path) return false;
      if (fileFilter === 'without' && b.file_path) return false;
      if (format !== 'all' && b.format !== format) return false;
      if (minRating && (b.rating ?? 0) < minRating) return false;
      if (favOnly && !b.favorite) return false;
      if (dupesOnly && !dupes.has(b.id)) return false;
      if (coll !== 'all' && !collectionBooks.some((x) => x.collection_id === coll && x.book_id === b.id)) return false;
      const bt = tagsOf(b.id).map((t) => t.name.toLowerCase());
      if (tagFilter.length && !tagFilter.every((t) => bt.includes(t.toLowerCase()))) return false;
      if (nq && !norm(`${b.title} ${b.author} ${b.series} ${bt.join(' ')}`).includes(nq)) return false;
      return true;
    }).sort(sorter(sort));
  }, [live, status, fileFilter, format, minRating, favOnly, dupesOnly, coll, tagFilter, q, sort, tagsOf, collectionBooks, dupes]);

  // Read Next always stays on top of the list.
  const pinned = filtered.filter((b) => b.read_next_pos != null).sort((a, b) => (a.read_next_pos ?? 0) - (b.read_next_pos ?? 0));
  const rest = filtered.filter((b) => b.read_next_pos == null);
  const recent = live.filter((b) => b.last_opened_at).sort(sorter('opened')).slice(0, 6);
  const filtersOn = status !== 'all' || fileFilter !== 'all' || tagFilter.length || format !== 'all' || minRating || favOnly || coll !== 'all' || dupesOnly || q;

  const groups = useMemo(() => {
    if (group === 'none') return null;
    const m = new Map<string, Book[]>();
    rest.forEach((b) => {
      const k = group === 'author' ? b.author || 'Unknown author' : group === 'series' ? b.series || 'Not in a series' : formatLabel(b.format) === '—' ? 'No file' : formatLabel(b.format);
      m.set(k, [...(m.get(k) || []), b]);
    });
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([k, l]) => [k, group === 'series' ? l.sort((x, y) => (x.series_index ?? 0) - (y.series_index ?? 0)) : l] as [string, Book[]]);
  }, [group, rest]);

  const onDrop = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    const ids = readNext.map((b) => b.id).filter((id) => id !== dragId);
    ids.splice(ids.indexOf(targetId), 0, dragId);
    reorderReadNext(ids);
    setDragId(null);
  };

  if (live.length === 0) return (
    <div className="page">
      <h1 className="page-title">Library</h1>
      <Empty icon="library" title="Your library is empty">
        <span>Import your ebooks, or add a book you’re reading elsewhere.</span>
        <div className="row"><button className="btn pri" onClick={() => openImport('files')}><Icon name="upload" size={15} className="ink" style={{ color: 'var(--on-primary)' }} />Import files</button><button className="btn sec" onClick={() => openImport('placeholder')}>Add without a file</button></div>
      </Empty>
    </div>
  );

  const renderRows = (list: Book[], pinnedList = false) => list.map((b) => {
    const t = tagsOf(b.id);
    return (
      <tr key={b.id} draggable={pinnedList} onDragStart={() => setDragId(b.id)} onDragOver={(e) => pinnedList && e.preventDefault()} onDrop={() => pinnedList && onDrop(b.id)}>
        <td>
          <span className="row" style={{ gap: 10 }}>
            {pinnedList ? <Icon name="bookmark" size={15} className="ink" title="Read Next" /> : <Icon name={b.file_path ? 'book' : 'book-nofile'} size={16} className="mut" />}
            <span className="truncate" style={{ maxWidth: 360 }}>
              <Link href={`/book/${b.id}`} style={{ fontWeight: 500, color: b.file_path ? 'var(--ink)' : 'var(--ink-secondary)' }}>{b.title}</Link>
              {b.author && <span className="cap" style={{ fontSize: 12 }}> {b.author}</span>}
            </span>
            {b.favorite && <Icon name="heart" size={13} className="mut" title="Favorite" />}
            {dupes.has(b.id) && <span className="chip out" style={{ height: 20 }}>possible duplicate</span>}
          </span>
        </td>
        <td style={{ whiteSpace: 'nowrap' }}>{STATUS_LABEL[b.status]}{(b.status === 'reading' || b.status === 'paused') && ` · ${pct(b.progress)}`}</td>
        <td><RatingMark rating={b.rating} size={16} />{b.rating == null && <span className="cap">—</span>}</td>
        <td><span className="row" style={{ gap: 4 }}>{t.slice(0, 2).map((x) => <button key={x.id} className="chip" onClick={() => setTagFilter([x.name])}>#{x.name}</button>)}{t.length > 2 && <span className="cap">+{t.length - 2}</span>}</span></td>
        <td className="secondary hide-sm">{b.file_path ? formatLabel(b.format) : <button className="btn ghost sm" style={{ color: 'var(--primary)', padding: 0 }} onClick={() => openImport('files', b.id)}>No file · Import</button>}</td>
        <td className="secondary hide-sm">{b.file_path ? bytes(b.file_size) : "—"}</td>
        <td className="secondary hide-sm" style={{ whiteSpace: 'nowrap' }}>{relDate(b.last_opened_at)}</td>
        <td style={{ width: 36 }}><BookMenu book={b} /></td>
      </tr>
    );
  });

  const renderCovers = (list: Book[]) => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(112px, 1fr))', gap: 20 }}>
      {list.map((b) => (
        <div key={b.id} className="col" style={{ gap: 6 }} draggable={b.read_next_pos != null} onDragStart={() => setDragId(b.id)} onDragOver={(e) => b.read_next_pos != null && e.preventDefault()} onDrop={() => b.read_next_pos != null && onDrop(b.id)}>
          <BookCover book={b} width={112} height={164} link />
          <div className="row" style={{ gap: 6, alignItems: 'flex-start' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <Link href={`/book/${b.id}`} className="truncate" style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>{b.title}</Link>
              <span className="cap truncate" style={{ display: 'block' }}>{b.status === 'completed' ? STATUS_LABEL[b.status] : b.status === 'to_read' ? (b.file_path ? 'Not started' : 'No file') : pct(b.progress)}</span>
            </div>
            <RatingMark rating={b.rating} size={14} />
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="page" style={{ maxWidth: 1200 }}>
      <div className="row wrap" style={{ alignItems: 'flex-end', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <h1 className="page-title">Library</h1>
          <div className="cap" style={{ fontSize: 13, marginTop: 2 }}>{live.length} books · {live.filter((b) => !b.file_path).length} without a file</div>
        </div>
        <label className="input" style={{ width: 260 }}><Icon name="search" size={16} className="mut" /><input type="search" placeholder="Search title, author, series, tag" aria-label="Search library" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        <Seg label="View" value={view} onChange={(v) => saveSettings({ libraryView: v })} options={[{ v: 'list', l: 'List' }, { v: 'covers', l: 'Covers' }]} />
        <button className="btn sec" onClick={() => openImport('files')}><Icon name="upload" size={15} />Import</button>
        <button className="btn pri" onClick={() => openImport('placeholder')}><Icon name="plus" size={15} style={{ color: 'var(--on-primary)' }} />Add book</button>
      </div>

      <div className="row wrap" style={{ gap: 6 }}>
        {[['all', 'All'], ['reading', 'Reading'], ['completed', 'Completed'], ['to_read', 'To Read'], ['paused', 'Paused']].map(([v, l]) => (
          <button key={v} className={`chip ${status === v ? 'on' : ''}`} onClick={() => setStatus(v)}>{l}</button>
        ))}
        <span style={{ width: 8 }} />
        <button className={`chip ${fileFilter === 'without' ? 'on' : ''}`} onClick={() => setFileFilter(fileFilter === 'without' ? 'all' : 'without')}><Icon name="book-nofile" size={13} />No file</button>
        <button className={`chip ${favOnly ? 'on' : ''}`} onClick={() => setFavOnly(!favOnly)}><Icon name="heart" size={13} />Favorites</button>
        {dupes.size > 0 && <button className={`chip ${dupesOnly ? 'on' : ''}`} onClick={() => setDupesOnly(!dupesOnly)}>Possible duplicates · {dupes.size}</button>}
        {tagFilter.map((t) => <span key={t} className="chip on">#{t}<button className="x" aria-label={`Remove tag filter ${t}`} onClick={() => setTagFilter(tagFilter.filter((x) => x !== t))}><Icon name="close" size={12} /></button></span>)}
        <select className="chip out" aria-label="Filter by tag" value="" onChange={(e) => e.target.value && setTagFilter([...tagFilter, e.target.value])}>
          <option value="">+ Tag</option>
          {tags.filter((t) => !tagFilter.includes(t.name)).sort((a, b) => a.name.localeCompare(b.name)).map((t) => <option key={t.id} value={t.name}>#{t.name}</option>)}
        </select>
        <select className="chip out" aria-label="Filter by format" value={format} onChange={(e) => setFormat(e.target.value)}>
          <option value="all">Any format</option>{formats.map((f) => <option key={f} value={f}>{formatLabel(f)}</option>)}
        </select>
        <select className="chip out" aria-label="Minimum rating" value={minRating} onChange={(e) => setMinRating(Number(e.target.value))}>
          <option value={0}>Any rating</option><option value={2}>Okay or better</option><option value={3}>Good or better</option><option value={4}>Loved it or better</option>
        </select>
        {collections.length > 0 && (
          <select className="chip out" aria-label="Collection" value={coll} onChange={(e) => setColl(e.target.value)}>
            <option value="all">All collections</option>{collections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
        {filtersOn ? <button className="btn ghost sm" onClick={() => { setStatus('all'); setFileFilter('all'); setTagFilter([]); setFormat('all'); setMinRating(0); setFavOnly(false); setColl('all'); setDupesOnly(false); setQ(''); }}>Clear filters</button> : null}
        <span className="grow" />
        <label className="row cap" style={{ gap: 6 }}>Group
          <select className="chip out" value={group} onChange={(e) => setGroup(e.target.value as typeof group)}><option value="none">None</option><option value="author">Author</option><option value="series">Series</option><option value="format">Format</option></select>
        </label>
        <label className="row cap" style={{ gap: 6 }}>Sort
          <select className="chip out" value={sort} onChange={(e) => saveSettings({ librarySort: e.target.value })}>{SORTS.map((s) => <option key={s.v} value={s.v}>{s.l}</option>)}</select>
        </label>
      </div>

      {!filtersOn && recent.length > 0 && view === 'covers' && (
        <section className="col" style={{ gap: 10 }}>
          <h2 className="h2">Recently opened</h2>
          <div className="row" style={{ gap: 16, overflowX: 'auto', paddingBottom: 4 }}>{recent.map((b) => <BookCover key={b.id} book={b} width={88} height={128} link />)}</div>
        </section>
      )}

      {pinned.length > 0 && (
        <section className="col" style={{ gap: 10 }} aria-labelledby="rn">
          <div className="row"><Icon name="bookmark" size={16} className="ink" /><h2 id="rn" className="h2">Read Next</h2><span className="cap">Always on top. Drag to reorder.</span></div>
          {view === 'covers' ? renderCovers(pinned) : (
            <div style={{ overflowX: 'auto' }}><table className="table"><tbody>{renderRows(pinned, true)}</tbody></table></div>
          )}
        </section>
      )}

      <section className="col" style={{ gap: 10 }} aria-labelledby="all">
        <div className="row"><h2 id="all" className="h2">{filtersOn ? 'Results' : 'All books'}</h2><span className="cap">{rest.length}</span></div>
        {rest.length === 0 && <p className="cap">No books match these filters.</p>}
        {groups ? groups.map(([k, l]) => (
          <div key={k} className="col" style={{ gap: 8 }}>
            <div className="lbl" style={{ paddingTop: 8 }}>{k} <span className="cap">· {l.length}</span></div>
            {view === 'covers' ? renderCovers(l) : <div style={{ overflowX: 'auto' }}><table className="table"><tbody>{renderRows(l)}</tbody></table></div>}
          </div>
        )) : view === 'covers' ? renderCovers(rest) : rest.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ minWidth: 720 }}>
              <thead><tr><th>Title</th><th>Status</th><th>Rating</th><th>Tags</th><th className="hide-sm">Format</th><th className="hide-sm">Size</th><th className="hide-sm">Opened</th><th /></tr></thead>
              <tbody>{renderRows(rest)}</tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

export default function LibraryPage() {
  return <Suspense><LibraryInner /></Suspense>;
}
