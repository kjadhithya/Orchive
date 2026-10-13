'use client';
import React, { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useLibrary } from '@/lib/store';
import { Icon, RatingMark } from '@/components/Icon';
import { BookCover, Empty, FavButton, MenuButton, ReadNextButton, Seg, Toggle } from '@/components/ui';
import { BookMenu } from '@/components/BookMenu';
import { openImport } from '@/components/Shell';
import { formatLabel, norm, pct, relDate, STATUS_LABEL } from '@/lib/util';
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
        <button className="btn pri" onClick={() => openImport('files')}><Icon name="plus" size={15} style={{ color: 'var(--on-primary)' }} />Add book</button>
      </Empty>
    </div>
  );

  const renderRows = (list: Book[], pinnedList = false) => list.map((b) => {
    const t = tagsOf(b.id);
    return (
      <tr key={b.id} draggable={pinnedList} onDragStart={() => setDragId(b.id)} onDragOver={(e) => pinnedList && e.preventDefault()} onDrop={() => pinnedList && onDrop(b.id)}>
        <td>
          <span className="row" style={{ gap: 10 }}>
            <Icon name={b.file_path ? 'book' : 'book-nofile'} size={16} className="mut" title={b.file_path ? undefined : 'No file'} />
            <span className="truncate" style={{ maxWidth: 360 }}>
              <Link href={`/book/${b.id}`} style={{ fontWeight: 500, color: b.file_path ? 'var(--ink)' : 'var(--ink-secondary)' }}>{b.title}</Link>
              {b.author && <span className="cap" style={{ fontSize: 12 }}> {b.author}</span>}
            </span>
            {dupes.has(b.id) && <span className="chip out" style={{ height: 20 }}>possible duplicate</span>}
          </span>
        </td>
        <td style={{ whiteSpace: 'nowrap' }}>{STATUS_LABEL[b.status]}{(b.status === 'reading' || b.status === 'paused') && ` · ${pct(b.progress)}`}</td>
        <td><RatingMark rating={b.rating} size={16} />{b.rating == null && <span className="cap">—</span>}</td>
        <td><span className="row" style={{ gap: 4 }}>{t.slice(0, 2).map((x) => <button key={x.id} className="chip" onClick={() => setTagFilter([x.name])}>#{x.name}</button>)}{t.length > 2 && <span className="cap">+{t.length - 2}</span>}</span></td>
        <td className="secondary hide-sm">{b.file_path ? formatLabel(b.format) : <button className="btn ghost sm" style={{ color: 'var(--primary)', padding: 0 }} onClick={() => openImport('files', b.id)}>Add file</button>}</td>
        <td className="secondary hide-sm" style={{ whiteSpace: 'nowrap' }}>{relDate(b.last_opened_at)}</td>
        <td style={{ width: 96 }}><span className="row" style={{ gap: 0, justifyContent: 'flex-end' }}><ReadNextButton book={b} className="fav" /><FavButton book={b} /><BookMenu book={b} /></span></td>
      </tr>
    );
  });

  const renderCovers = (list: Book[]) => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(124px, 1fr))', gap: 22 }}>
      {list.map((b) => (
        <div key={b.id} className="col cvw" style={{ gap: 6 }} draggable={b.read_next_pos != null} onDragStart={() => setDragId(b.id)} onDragOver={(e) => b.read_next_pos != null && e.preventDefault()} onDrop={() => b.read_next_pos != null && onDrop(b.id)}>
          <div className="cv" style={{ width: 124 }}>
            <BookCover book={b} width={124} height={180} link />
            <ReadNextButton book={b} />
          </div>
          <div className="row" style={{ gap: 6, alignItems: 'flex-start', width: 124 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <Link href={`/book/${b.id}`} className="truncate" style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>{b.title}</Link>
              <span className="cap truncate" style={{ display: 'block' }}>{b.status === 'completed' ? STATUS_LABEL[b.status] : b.status === 'to_read' ? (b.file_path ? 'Not started' : 'No file') : pct(b.progress)}</span>
            </div>
            <RatingMark rating={b.rating} size={14} />
            <FavButton book={b} size={14} className="fav heart" />
          </div>
        </div>
      ))}
    </div>
  );

  const clearAll = () => { setStatus('all'); setFileFilter('all'); setTagFilter([]); setFormat('all'); setMinRating(0); setFavOnly(false); setColl('all'); setDupesOnly(false); setQ(''); };
  const extraFilters = (fileFilter !== 'all' ? 1 : 0) + (favOnly ? 1 : 0) + (dupesOnly ? 1 : 0) + (format !== 'all' ? 1 : 0) + (minRating ? 1 : 0) + (coll !== 'all' ? 1 : 0) + (group !== 'none' ? 1 : 0);
  const list = (l: Book[], pinnedList = false) => view === 'covers' ? renderCovers(l) : (
    <div style={{ overflowX: 'auto' }}>
      <table className="table" style={{ minWidth: 680 }}>
        {!pinnedList && <thead><tr><th>Title</th><th>Status</th><th>Rating</th><th>Tags</th><th className="hide-sm">Format</th><th className="hide-sm">Opened</th><th><span className="sr-only">Actions</span></th></tr></thead>}
        <tbody>{renderRows(l, pinnedList)}</tbody>
      </table>
    </div>
  );

  return (
    <div className="page" style={{ maxWidth: 1200 }}>
      <div className="row wrap" style={{ alignItems: 'flex-end', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 180 }}>
          <h1 className="page-title">Library</h1>
          <div className="cap" style={{ fontSize: 13, marginTop: 2 }}>{live.length} books{live.some((b) => !b.file_path) ? ` · ${live.filter((b) => !b.file_path).length} without a file` : ''}</div>
        </div>
        <label className="input" style={{ width: 260, maxWidth: '100%' }}><Icon name="search" size={16} className="mut" /><input type="search" placeholder="Search title, author, series, tag" aria-label="Search library" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        <Seg label="View" value={view} onChange={(v) => saveSettings({ libraryView: v })} options={[{ v: 'covers', l: 'Covers' }, { v: 'list', l: 'List' }]} />
        <button className="btn pri" onClick={() => openImport('files')}><Icon name="plus" size={15} style={{ color: 'var(--on-primary)' }} />Add book</button>
      </div>

      <div className="row wrap" style={{ gap: 6 }}>
        {[['all', 'All'], ['reading', 'Reading'], ['to_read', 'To Read'], ['completed', 'Completed'], ['paused', 'Paused']].map(([v, l]) => (
          <button key={v} className={`chip ${status === v ? 'on' : ''}`} aria-pressed={status === v} onClick={() => setStatus(v)}>{l}</button>
        ))}
        {tagFilter.map((t) => <span key={t} className="chip on">#{t}<button className="x" aria-label={`Remove tag filter ${t}`} onClick={() => setTagFilter(tagFilter.filter((x) => x !== t))}><Icon name="close" size={12} /></button></span>)}
        {filtersOn ? <button className="btn ghost sm" onClick={clearAll}>Clear</button> : null}
        <span className="grow" />
        <MenuButton label="More filters" icon="sort" className="btn sec sm" text={extraFilters ? `Filters · ${extraFilters}` : 'Filters'}>
          {() => (
            <div className="col" style={{ gap: 10, padding: 8, width: 250 }}>
              <label className="row" style={{ justifyContent: 'space-between', fontSize: 13 }}>Favourites only<Toggle label="Favourites only" on={favOnly} onChange={setFavOnly} /></label>
              <label className="row" style={{ justifyContent: 'space-between', fontSize: 13 }}>Without a file<Toggle label="Without a file" on={fileFilter === 'without'} onChange={(v) => setFileFilter(v ? 'without' : 'all')} /></label>
              {dupes.size > 0 && <label className="row" style={{ justifyContent: 'space-between', fontSize: 13 }}>Possible duplicates ({dupes.size})<Toggle label="Possible duplicates" on={dupesOnly} onChange={setDupesOnly} /></label>}
              <label className="field"><span>Tag</span><select className="text-input" value="" onChange={(e) => e.target.value && setTagFilter([...tagFilter, e.target.value])}><option value="">Add a tag filter…</option>{tags.filter((t) => !tagFilter.includes(t.name)).sort((a, b) => a.name.localeCompare(b.name)).map((t) => <option key={t.id} value={t.name}>#{t.name}</option>)}</select></label>
              <label className="field"><span>Format</span><select className="text-input" value={format} onChange={(e) => setFormat(e.target.value)}><option value="all">Any format</option>{formats.map((f) => <option key={f} value={f}>{formatLabel(f)}</option>)}</select></label>
              <label className="field"><span>Rating</span><select className="text-input" value={minRating} onChange={(e) => setMinRating(Number(e.target.value))}><option value={0}>Any rating</option><option value={2}>Okay or better</option><option value={3}>Good or better</option><option value={4}>Loved it or better</option></select></label>
              {collections.length > 0 && <label className="field"><span>Collection</span><select className="text-input" value={coll} onChange={(e) => setColl(e.target.value)}><option value="all">All collections</option>{collections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}
              <label className="field"><span>Group by</span><select className="text-input" value={group} onChange={(e) => setGroup(e.target.value as typeof group)}><option value="none">Nothing</option><option value="author">Author</option><option value="series">Series</option><option value="format">Format</option></select></label>
            </div>
          )}
        </MenuButton>
        <label className="row cap" style={{ gap: 6 }}><span className="sr-only">Sort by</span>
          <select className="chip out" aria-label="Sort by" value={sort} onChange={(e) => saveSettings({ librarySort: e.target.value })}>{SORTS.map((s) => <option key={s.v} value={s.v}>{s.l}</option>)}</select>
        </label>
      </div>

      {pinned.length > 0 && (
        <section className="col" style={{ gap: 10 }} aria-labelledby="rn">
          <div className="row"><Icon name="readnext" size={16} className="ink" /><h2 id="rn" className="h2">Read Next</h2><span className="cap">Drag to reorder</span></div>
          {list(pinned, true)}
        </section>
      )}

      <section className="col" style={{ gap: 10 }} aria-labelledby="all">
        <div className="row"><h2 id="all" className="h2">{filtersOn ? 'Results' : pinned.length ? 'Everything else' : 'All books'}</h2><span className="cap">{rest.length}</span></div>
        {rest.length === 0 && <p className="cap">No books match these filters.</p>}
        {groups ? groups.map(([k, l]) => (
          <div key={k} className="col" style={{ gap: 8 }}>
            <div className="lbl" style={{ paddingTop: 8 }}>{k} <span className="cap">· {l.length}</span></div>
            {list(l)}
          </div>
        )) : rest.length > 0 && list(rest)}
      </section>
    </div>
  );
}

export default function LibraryPage() {
  return <Suspense><LibraryInner /></Suspense>;
}
