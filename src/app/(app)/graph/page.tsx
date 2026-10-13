'use client';
import React, { Suspense, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useStore } from '@/lib/store';
import { GraphView } from '@/components/GraphView';
import { buildGraph, GNode, neighborhood } from '@/lib/graph';
import { Icon, RatingMark } from '@/components/Icon';
import { Seg, Toggle } from '@/components/ui';
import { norm, STATUS_LABEL } from '@/lib/util';

function GraphInner() {
  const { books, tags, bookTags, notes } = useStore();
  const router = useRouter();
  const params = useSearchParams();
  const focusBook = params.get('focus');
  const [opts, setOpts] = useState({ tags: true, notes: true, authors: false, placeholders: true, orphans: true, status: 'all' });
  const [selected, setSelected] = useState<string | null>(focusBook ? `b:${focusBook}` : null);
  const [local, setLocal] = useState<string | null>(focusBook ? `b:${focusBook}` : null);
  const [depth, setDepth] = useState(2);
  const [colorRating, setColorRating] = useState(false);
  const [sizeBy, setSizeBy] = useState<'links' | 'notes'>('links');
  const [q, setQ] = useState('');
  const full = useMemo(() => buildGraph(books, tags, bookTags, notes, opts), [books, tags, bookTags, notes, opts]);
  const g = useMemo(() => (local ? neighborhood(full, local, depth) : full), [full, local, depth]);
  const sel = g.nodes.find((n) => n.id === selected) || full.nodes.find((n) => n.id === selected);
  const open = (n: GNode) => { if (n.book) router.push(`/book/${n.book.id}`); else if (n.note) router.push(`/notes/${n.note.id}`); else if (n.kind === 'tag') router.push(`/library?tag=${encodeURIComponent(n.label.slice(1))}`); };
  const set = (k: keyof typeof opts, v: any) => setOpts({ ...opts, [k]: v });
  const found = q ? full.nodes.filter((n) => norm(n.label).includes(norm(q))).slice(0, 8) : [];
  const degree = (id: string) => full.edges.filter((e) => e.source === id || e.target === id).length;

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      <div style={{ flex: 1, minWidth: 0, position: 'relative', display: 'flex', flexDirection: 'column' }}>
        <div className="vh"><b>Graph</b><span>· {g.nodes.filter((n) => n.kind === 'book').length} books · {g.nodes.filter((n) => n.kind === 'tag').length} tags · {g.nodes.filter((n) => n.kind === 'note').length} notes</span>
          {local && <><span className="grow" /><span className="chip on">Local view<button className="x" aria-label="Show whole library" onClick={() => setLocal(null)}><Icon name="close" size={12} /></button></span></>}
        </div>
        <div style={{ flex: 1, minHeight: 500 }}>
          {g.nodes.length === 0 ? <div className="empty">Add books, tags and notes with [[links]] to grow your graph.</div> : (
            <GraphView nodes={g.nodes} edges={g.edges} height={Math.max(500, typeof window !== 'undefined' ? window.innerHeight - 140 : 700)} selected={selected} focus={local} onSelect={setSelected} onOpen={open} colorByRating={colorRating} sizeBy={sizeBy} />
          )}
        </div>
        <div className="card row wrap cap" style={{ position: 'absolute', left: 16, bottom: 16, padding: '8px 12px', gap: 14, borderRadius: 10 }}>
          <span className="row" style={{ gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--ink-muted)' }} />Book</span>
          <span className="row" style={{ gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: '50%', border: '1.5px dashed var(--border-control)' }} />No file</span>
          <span className="row" style={{ gap: 6 }}><span style={{ width: 9, height: 9, borderRadius: '50%', border: '1.5px solid var(--ink-muted)' }} />Tag</span>
          <span className="row" style={{ gap: 6 }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--border-control)' }} />Note</span>
          <span>Double-click to open · drag to move · scroll to zoom</span>
        </div>
      </div>
      <aside className="side-r" aria-label="Graph settings" style={{ display: 'flex' }}>
        <div style={{ position: 'relative' }}>
          <label className="input" style={{ height: 30, fontSize: 12 }}><Icon name="search" size={14} className="mut" /><input type="search" placeholder="Find a book, tag or note" aria-label="Find in graph" value={q} onChange={(e) => setQ(e.target.value)} /></label>
          {found.length > 0 && <div className="menu" style={{ top: '100%', left: 0, right: 0, marginTop: 4 }}>{found.map((n) => <button key={n.id} onClick={() => { setSelected(n.id); setLocal(n.id); setQ(''); }}><Icon name={n.kind === 'tag' ? 'tag' : n.kind === 'note' ? 'note' : 'book'} size={14} className="mut" />{n.label}</button>)}</div>}
        </div>
        <section className="col" style={{ gap: 2 }}>
          <div className="gh" style={{ padding: '0 0 4px' }}>Show</div>
          {([['tags', 'Tags'], ['notes', 'Notes'], ['authors', 'Authors'], ['placeholders', 'Books without a file'], ['orphans', 'Unconnected books']] as const).map(([k, l]) => (
            <div key={k} className="row" style={{ justifyContent: 'space-between', fontSize: 13, padding: '4px 4px' }}><span>{l}</span><Toggle on={opts[k] as boolean} onChange={(v) => set(k, v)} label={`Show ${l}`} /></div>
          ))}
        </section>
        <section className="col" style={{ gap: 8 }}>
          <div className="gh" style={{ padding: 0 }}>Status</div>
          <div className="row wrap" style={{ gap: 6 }}>{['all', 'reading', 'completed', 'to_read', 'paused'].map((s) => <button key={s} className={`chip ${opts.status === s ? 'on' : ''}`} onClick={() => set('status', s)}>{s === 'all' ? 'All' : STATUS_LABEL[s as 'reading']}</button>)}</div>
        </section>
        <section className="col" style={{ gap: 8 }}>
          <div className="gh" style={{ padding: 0 }}>Display</div>
          <div className="row" style={{ justifyContent: 'space-between', fontSize: 13 }}><span>Colour by rating</span><Toggle on={colorRating} onChange={setColorRating} label="Colour by rating" /></div>
          {local && <div className="row" style={{ justifyContent: 'space-between', fontSize: 13 }}><span>Depth</span><Seg label="Depth" value={String(depth) as '1' | '2' | '3'} onChange={(v) => setDepth(Number(v))} options={[{ v: '1', l: '1' }, { v: '2', l: '2' }, { v: '3', l: '3' }]} /></div>}
        </section>
        {sel && (
          <section className="card col" style={{ padding: 12, gap: 8, borderRadius: 10 }}>
            <div className="row"><Icon name={sel.kind === 'tag' ? 'tag' : sel.kind === 'note' ? 'note' : sel.nofile ? 'book-nofile' : 'book'} size={15} className="ink" /><span style={{ fontWeight: 600, fontSize: 13 }} className="grow truncate">{sel.label}</span>{sel.book && <RatingMark rating={sel.book.rating} />}</div>
            <span className="cap">{degree(sel.id)} connections{sel.book ? ` · ${STATUS_LABEL[sel.book.status]}` : ''}</span>
            <div className="row" style={{ gap: 6 }}>
              {(sel.book || sel.note || sel.kind === 'tag') && <button className="btn sec sm" onClick={() => open(sel)}>Open</button>}
              <button className="btn ghost sm" onClick={() => setLocal(sel.id)}>Focus here</button>
            </div>
          </section>
        )}
        {!sel && <p className="cap" style={{ margin: 0 }}>Links come from tags and from [[book]] links in your notes. Select a node to focus on it.</p>}
        <Link href="/notes" className="cap">Write a note</Link>
      </aside>
    </div>
  );
}

export default function GraphPage() { return <Suspense><GraphInner /></Suspense>; }
