'use client';
import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useStore } from '@/lib/store';
import { Icon } from '@/components/Icon';
import { Empty, Seg, usePanel } from '@/components/ui';
import { headings, renderMarkdown, excerpt } from '@/lib/markdown';
import { download, fmtDate, norm, resolveLink, wikiLinks } from '@/lib/util';

function NoteInner() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const router = useRouter();
  const { notes, books, updateNote, deleteNote, toast } = useStore();
  const note = notes.find((n) => n.id === id);
  const [mode, setMode] = useState<'edit' | 'read'>(params.get('edit') || !note?.body ? 'edit' : 'read');
  const [side, toggleSide] = usePanel('note');
  const [body, setBody] = useState(note?.body || '');
  const [title, setTitle] = useState(note?.title || '');
  const [saved, setSaved] = useState(true);
  const [ac, setAc] = useState<{ q: string; start: number; idx: number } | null>(null);
  const ta = useRef<HTMLTextAreaElement>(null);
  const loadedId = useRef<string | null>(null);

  useEffect(() => {
    if (note && loadedId.current !== note.id) { loadedId.current = note.id; setBody(note.body); setTitle(note.title); setMode(params.get('edit') || !note.body ? 'edit' : 'read'); }
  }, [note, params]);
  // pick up edits from another device when not typing here
  useEffect(() => { if (note && saved && note.body !== body && document.activeElement !== ta.current) setBody(note.body); }, [note?.body]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!note || body === note.body) return;
    setSaved(false);
    const t = setTimeout(async () => { await updateNote(note.id, { body }); setSaved(true); }, 700);
    return () => clearTimeout(t);
  }, [body]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (ta.current) { ta.current.style.height = 'auto'; ta.current.style.height = Math.max(320, ta.current.scrollHeight) + 'px'; }
  }, [body, mode]);

  const live = books.filter((b) => !b.deleted_at);
  const suggestions = useMemo(() => {
    if (!ac) return [];
    const q = norm(ac.q);
    const bs = live.filter((b) => norm(b.title).includes(q)).slice(0, 6).map((b) => ({ label: b.title, sub: b.file_path ? 'book' : 'book · no file', value: b.title }));
    const ns = notes.filter((n) => n.id !== id && norm(n.title).includes(q)).slice(0, 4).map((n) => { const ob = live.find((b) => b.id === n.book_id); return { label: n.title, sub: ob ? `note · ${ob.title}` : 'note', value: ob ? `${ob.title}/${n.title}` : n.title }; });
    const all = [...bs, ...ns];
    if (ac.q.trim() && !all.some((x) => norm(x.label) === q)) all.push({ label: `Add “${ac.q.trim()}” as a book without a file`, sub: 'new', value: `__new__${ac.q.trim()}` });
    return all;
  }, [ac, live, notes, id]);

  if (!note) return <div className="page"><Empty icon="note" title="Note not found"><Link className="btn sec" href="/notes">All notes</Link></Empty></div>;
  const owner = live.find((b) => b.id === note.book_id);
  const html = renderMarkdown(body, books, notes);
  const outline = headings(body);
  const links = Array.from(new Set(wikiLinks(body))).map((n) => ({ name: n, r: resolveLink(n, books, notes) }));
  const backlinks = notes.filter((n) => n.id !== note.id && wikiLinks(n.body).some((l) => { const r = resolveLink(l, books, notes); return r.kind === 'note' && r.note.id === note.id; }));

  const onType = (v: string, caret: number) => {
    setBody(v);
    const before = v.slice(0, caret);
    const open = before.lastIndexOf('[[');
    if (open >= 0 && !before.slice(open).includes(']]') && !before.slice(open).includes('\n') && caret - open < 60) setAc({ q: before.slice(open + 2), start: open, idx: 0 });
    else setAc(null);
  };

  const pick = async (value: string) => {
    if (!ac || !ta.current) return;
    let name = value;
    if (value.startsWith('__new__')) {
      name = value.slice(7);
      const { createBook } = storeRef.current!;
      await createBook({ title: name, status: 'to_read' });
      toast(`Added “${name}” as a book without a file`);
    }
    const caret = ta.current.selectionStart;
    const after = body.slice(caret).replace(/^[^\]\n]*\]\]/, '');
    const next = body.slice(0, ac.start) + `[[${name}]]` + after;
    setBody(next);
    setAc(null);
    requestAnimationFrame(() => { const pos = ac.start + name.length + 4; ta.current?.setSelectionRange(pos, pos); ta.current?.focus(); });
  };

  const wrap = (pre: string, post = pre, line = false) => {
    const el = ta.current;
    if (!el) return;
    const s = el.selectionStart, e = el.selectionEnd;
    let next: string, cs: number, ce: number;
    if (line) {
      const ls = body.lastIndexOf('\n', s - 1) + 1;
      next = body.slice(0, ls) + pre + body.slice(ls);
      cs = s + pre.length; ce = e + pre.length;
    } else {
      next = body.slice(0, s) + pre + body.slice(s, e) + post + body.slice(e);
      cs = s + pre.length; ce = e + pre.length;
    }
    setBody(next);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(cs, ce); });
  };

  const onPreviewClick = (e: React.MouseEvent) => {
    const a = (e.target as HTMLElement).closest('a');
    if (a && a.getAttribute('href')?.startsWith('/')) { e.preventDefault(); router.push(a.getAttribute('href')!); }
  };

  return (
    <div style={{ display: 'flex', minHeight: '100%' }}>
      <StoreBridge />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="vh">
          {owner ? <Link href={`/book/${owner.id}`} style={{ color: 'var(--ink-muted)' }}>{owner.title}</Link> : <Link href="/notes" style={{ color: 'var(--ink-muted)' }}>Notes</Link>}
          <span>/</span><b className="truncate">{title || 'Untitled'}</b><span className="grow" />
          <Seg label="Mode" value={mode} onChange={setMode} options={[{ v: 'edit', l: 'Edit' }, { v: 'read', l: 'Read' }]} />
          <button className="ib" aria-label="Export as Markdown" onClick={() => download(`${title || 'note'}.md`, `# ${title}\n\n${body}`, 'text/markdown')}><Icon name="download" size={16} /></button>
          <button className="ib" aria-label="Delete note" onClick={() => { if (!confirm(`Delete “${title || 'Untitled'}”?`)) return; deleteNote(note.id); router.push(owner ? `/book/${owner.id}` : '/notes'); }}><Icon name="trash" size={16} /></button>
          <button className={`ib ${side ? 'on' : ''}`} aria-label={side ? 'Hide outline and links' : 'Show outline and links'} aria-pressed={side} onClick={toggleSide}><Icon name="sidebar-right" size={16} /></button>
        </div>
        <div className="doc" style={{ gap: 6 }}>
          <input className="serif" aria-label="Note title" value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => title.trim() && title !== note.title && updateNote(note.id, { title: title.trim() })}
            style={{ border: 0, background: 'none', fontSize: 34, lineHeight: '40px', color: 'var(--ink)', padding: 0, outline: 'none' }} />
          <div className="row wrap cap" style={{ fontSize: 12, marginBottom: 14, gap: 6 }}>
            <span>Note on</span>
            <select className="chip out" style={{ height: 22 }} value={note.book_id || ''} onChange={(e) => updateNote(note.id, { book_id: e.target.value || null })} aria-label="Book this note belongs to">
              <option value="">No book</option>{live.map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}
            </select>
            <span>· {fmtDate(note.created_at)} · {saved ? 'Saved' : 'Saving…'}</span>
          </div>
          {mode === 'edit' ? (
            <div style={{ position: 'relative' }}>
              <div className="row" role="toolbar" aria-label="Formatting" style={{ gap: 2, marginBottom: 8, position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 2, padding: '4px 0' }}>
                <button className="ib" aria-label="Heading" onClick={() => wrap('## ', '', true)} style={{ fontWeight: 700 }}>H</button>
                <button className="ib" aria-label="Bold" onClick={() => wrap('**')} style={{ fontWeight: 700 }}>B</button>
                <button className="ib" aria-label="Italic" onClick={() => wrap('*')} style={{ fontStyle: 'italic', fontFamily: 'var(--font-read)' }}>I</button>
                <button className="ib" aria-label="Bulleted list" onClick={() => wrap('- ', '', true)}><Icon name="list" size={16} /></button>
                <button className="ib" aria-label="Quote" onClick={() => wrap('> ', '', true)} style={{ fontFamily: 'var(--font-display)', fontSize: 18 }}>“</button>
                <button className="btn ghost sm" aria-label="Link a book or note" onClick={() => { wrap('[[', ']]'); }}>[[ ]]</button>
                <span className="grow" /><span className="cap">Markdown · type [[ to link a book</span>
              </div>
              <textarea ref={ta} value={body} aria-label="Note text" placeholder="Start writing… Type [[ to link to a book or another note."
                onChange={(e) => onType(e.target.value, e.target.selectionStart)}
                onKeyDown={(e) => {
                  if (!ac || !suggestions.length) return;
                  if (e.key === 'ArrowDown') { e.preventDefault(); setAc({ ...ac, idx: (ac.idx + 1) % suggestions.length }); }
                  else if (e.key === 'ArrowUp') { e.preventDefault(); setAc({ ...ac, idx: (ac.idx - 1 + suggestions.length) % suggestions.length }); }
                  else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pick(suggestions[ac.idx].value); }
                  else if (e.key === 'Escape') setAc(null);
                }}
                style={{ width: '100%', border: 0, outline: 'none', resize: 'none', background: 'none', fontSize: 15, lineHeight: 1.7, fontFamily: 'var(--font-sans)', color: 'var(--ink)', minHeight: 320 }} />
              {ac && suggestions.length > 0 && (
                <div className="menu" role="listbox" aria-label="Link to" style={{ top: 48, left: 0, width: 320 }}>
                  {suggestions.map((s, i) => (
                    <button key={s.value} role="option" aria-selected={i === ac.idx} style={i === ac.idx ? { background: 'var(--hover)' } : undefined} onMouseDown={(e) => { e.preventDefault(); pick(s.value); }}>
                      <Icon name={s.sub.startsWith('note') ? 'note' : s.sub === 'new' ? 'plus' : s.sub.includes('no file') ? 'book-nofile' : 'book'} size={15} className="mut" />
                      <span className="grow truncate">{s.label}</span><span className="cap">{s.sub === 'new' ? '' : s.sub}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="md" onClick={onPreviewClick} dangerouslySetInnerHTML={{ __html: html || '<p class="muted">Empty note. Switch to Edit to write.</p>' }} />
          )}
        </div>
      </div>
      {side && <aside className="side-r" aria-label="Note details">
        <section className="col" style={{ gap: 4 }}>
          <div className="gh" style={{ padding: 0 }}><Icon name="outline" size={14} className="mut" />Outline</div>
          {outline.length === 0 && <span className="cap">Add ## headings to build an outline.</span>}
          {outline.map((h, i) => <div key={i} className="secondary" style={{ fontSize: 13, paddingLeft: (h.level - 1) * 12 + 4 }}>{h.text}</div>)}
        </section>
        <section className="col" style={{ gap: 4 }}>
          <div className="gh" style={{ padding: 0 }}><Icon name="link" size={14} className="mut" />Links in this note<span className="c">{links.length}</span></div>
          {links.map(({ name, r }) => r.kind === 'book' ? <Link key={name} href={`/book/${r.book.id}`} className="si" style={{ paddingLeft: 4 }}><Icon name={r.book.file_path ? 'book' : 'book-nofile'} size={15} className="mut" /><span className="t">{r.book.title}</span></Link>
            : r.kind === 'note' ? <Link key={name} href={`/notes/${r.note.id}`} className="si" style={{ paddingLeft: 4 }}><Icon name="note" size={15} className="mut" /><span className="t">{r.note.title}</span></Link>
            : <span key={name} className="si nf" style={{ paddingLeft: 4 }}><Icon name="book-nofile" size={15} className="mut" /><span className="t">{name} <span className="cap">· not found</span></span></span>)}
        </section>
        <section className="col" style={{ gap: 6 }}>
          <div className="gh" style={{ padding: 0 }}><Icon name="note" size={14} className="mut" />Backlinks<span className="c">{backlinks.length}</span></div>
          {backlinks.map((n) => <Link key={n.id} href={`/notes/${n.id}`} className="card" style={{ padding: '8px 10px', borderRadius: 8, color: 'inherit', textDecoration: 'none' }}><div style={{ fontSize: 12, fontWeight: 500 }}>{n.title}</div><div className="secondary" style={{ fontSize: 12 }}>{excerpt(n.body, 90)}</div></Link>)}
        </section>
      </aside>}
    </div>
  );
}

// gives the autocomplete access to createBook without re-rendering the editor on every store change
const storeRef: { current: ReturnType<typeof useStore> | null } = { current: null };
function StoreBridge() { storeRef.current = useStore(); return null; }

export default function NotePage() {
  return <Suspense><NoteInner /></Suspense>;
}
