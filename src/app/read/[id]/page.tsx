'use client';
import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useStore } from '@/lib/store';
import { useAuthGate, Loading } from '@/components/Shell';
import { Icon, Mark } from '@/components/Icon';
import { getFile, signedUrl } from '@/lib/files';
import { prepareForReader, Prepared } from '@/lib/convert';
import { applyAppearance, DEFAULT_READING, findReadingTheme, mergeSettings } from '@/lib/settings';
import { effectiveTheme } from '@/lib/readerStyles';
import { deviceLabel } from '@/lib/supabase';
import { FoliateReader, HL_COLORS } from '@/components/reader/FoliateReader';
import { PdfReader, PdfView, PdfHandle } from '@/components/reader/PdfReader';
import { ReaderSettingsPanel } from '@/components/reader/SettingsPanel';
import type { ReaderHandle, RelocateInfo, SearchResult, SelectionInfo, TocItem } from '@/components/reader/types';
import type { Annotation, ReadingSettings, ReadingTheme } from '@/lib/types';
import { CompleteDialog } from '@/components/CompleteDialog';
import { downloadBook } from '@/components/BookMenu';
import { escapeHtml, pct } from '@/lib/util';

function minutes(m?: number) {
  if (m == null || !isFinite(m)) return '';
  if (m < 1) return 'less than a minute';
  if (m < 60) return `${Math.round(m)} min`;
  const h = Math.floor(m / 60), r = Math.round(m % 60);
  return r ? `${h} h ${r} min` : `${h} h`;
}

type Panel = 'toc' | 'search' | 'notes' | null;

function ReaderInner() {
  const ok = useAuthGate();
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const router = useRouter();
  const store = useStore();
  const { books, loaded, settings, saveSettings, updateBook, annotations, createAnnotation, updateAnnotation, deleteAnnotation, logSession, updateSession, toast } = store;
  const book = books.find((b) => b.id === id);

  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [reflowFile, setReflowFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toc, setToc] = useState<TocItem[]>([]);
  const [loc, setLoc] = useState<RelocateInfo | null>(null);
  const [chrome, setChrome] = useState(true);
  const [panel, setPanel] = useState<Panel>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [scope, setScope] = useState<'book' | 'all'>(book?.reader_settings ? 'book' : 'all');
  const [sel, setSel] = useState<SelectionInfo | null>(null);
  const [annPop, setAnnPop] = useState<{ id: string; x: number; y: number } | null>(null);
  const [lookup, setLookup] = useState<{ title: string; html: string } | null>(null);
  const [noteDraft, setNoteDraft] = useState<{ sel: SelectionInfo; text: string } | null>(null);
  const [searchQ, setSearchQ] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searchProg, setSearchProg] = useState<number | null>(null);
  const [completing, setCompleting] = useState(false);
  const [pdfView, setPdfViewState] = useState<PdfView>({ fit: typeof window !== 'undefined' && window.innerWidth > 900 ? 'page' : 'width', zoom: 1, rotate: 0, crop: 0, spread: false, invert: false, thumbs: false });
  const [tts, setTts] = useState<{ playing: boolean; rate: number; pitch: number; voice: string; sleep: number } >({ playing: false, rate: 1, pitch: 1, voice: '', sleep: 0 });
  const [ttsOpen, setTtsOpen] = useState(false);
  const [autoScroll, setAutoScroll] = useState(false);
  const [fontCss, setFontCss] = useState('');
  const reader = useRef<ReaderHandle | PdfHandle | null>(null);
  const sessionId = useRef<string | null>(null);
  const lastActive = useRef(Date.now());
  const savedLoc = useRef<string | null>(null);

  // reading settings: book overrides on top of global
  const reading: ReadingSettings = useMemo(() => ({ ...DEFAULT_READING, ...settings.reading, ...(scope === 'book' ? book?.reader_settings || {} : {}) }), [settings.reading, book?.reader_settings, scope]);
  const [clock, setClock] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setClock(Date.now()), 60_000); return () => clearInterval(t); }, []);
  const theme: ReadingTheme = useMemo(() => findReadingTheme(settings, effectiveTheme(settings, reading, new Date(clock))), [settings, reading, clock]);

  // app chrome follows the reading theme when asked
  useEffect(() => { applyAppearance(settings, theme); return () => applyAppearance(settings); }, [settings, theme]);

  const changeReading = (patch: Partial<ReadingSettings>) => {
    if (!book) return;
    if (patch === DEFAULT_READING && scope === 'book') { updateBook(book.id, { reader_settings: null }); return; }
    if (scope === 'book') updateBook(book.id, { reader_settings: { ...(book.reader_settings || {}), ...patch } });
    else saveSettings({ reading: { ...settings.reading, ...patch } });
  };

  // load the file
  useEffect(() => {
    if (!book?.file_path || prepared) return;
    let alive = true;
    (async () => {
      try {
        const blob = await getFile(book.file_path!);
        const p = await prepareForReader(blob, book.file_name || `book.${book.format}`, { title: book.title, author: book.author || undefined });
        if (alive) setPrepared(p);
      } catch (e: any) { if (alive) setError(`Couldn’t load this book: ${e.message}`); }
    })();
    return () => { alive = false; };
  }, [book?.file_path]); // eslint-disable-line react-hooks/exhaustive-deps

  // custom fonts for the book frame
  useEffect(() => {
    (async () => {
      const faces = await Promise.all(settings.customFonts.map(async (f) => { const u = await signedUrl(f.path); return u ? `@font-face{font-family:"${f.name}";src:url("${u}");font-display:swap}` : ''; }));
      setFontCss(faces.join('\n'));
    })();
  }, [settings.customFonts]);

  const initial = useMemo(() => {
    const at = params.get('at');
    if (at) return at;
    const l = book?.location;
    if (!l) return null;
    return l.cfi || (l.page ? `pdf:${l.page}` : null);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // mark opened, start a reading session
  useEffect(() => {
    if (!book || !prepared || prepared.kind === 'unsupported') return;
    const patch: any = { last_opened_at: new Date().toISOString() };
    if (book.status === 'to_read' || book.status === 'paused') { patch.status = 'reading'; if (!book.started_at) patch.started_at = new Date().toISOString(); }
    updateBook(book.id, patch);
    logSession({ book_id: book.id, started_at: new Date().toISOString(), progress_from: book.progress }).then((sid) => { sessionId.current = sid; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prepared]);

  // count active reading time every 30 s
  useEffect(() => {
    const t = setInterval(() => {
      if (!book || document.hidden || Date.now() - lastActive.current > 3 * 60_000) return;
      const b = books.find((x) => x.id === id);
      updateBook(id, { reading_seconds: (b?.reading_seconds || 0) + 30 });
      if (sessionId.current) {
        const s = store.sessions.find((x) => x.id === sessionId.current);
        updateSession(sessionId.current, { seconds: (s?.seconds || 0) + 30, ended_at: new Date().toISOString(), progress_to: loc?.fraction ?? null, pages: (s?.pages || 0) });
      }
    }, 30_000);
    return () => clearInterval(t);
  }, [book, books, id, loc, store.sessions, updateBook, updateSession]);

  // save position (debounced)
  const saveTimer = useRef<any>(null);
  const onRelocate = useCallback((r: RelocateInfo) => {
    setLoc(r);
    lastActive.current = Date.now();
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      if (!book) return;
      savedLoc.current = r.location;
      const isPdf = r.location.startsWith('pdf:');
      updateBook(book.id, {
        location: isPdf ? { page: r.page, fraction: r.fraction } : { cfi: r.location, fraction: r.fraction, chapter: r.chapter },
        progress: Math.min(1, Math.max(0, r.fraction)), location_updated_at: new Date().toISOString(), location_device: deviceLabel(),
      });
      if (sessionId.current) {
        const s = store.sessions.find((x) => x.id === sessionId.current);
        updateSession(sessionId.current, { pages: (s?.pages || 0) + 1, progress_to: r.fraction });
      }
    }, 1500);
  }, [book, updateBook, updateSession, store.sessions]);

  // another device moved further: offer to jump
  const lastRemote = useRef<string | null>(null);
  useEffect(() => {
    if (!book?.location || !book.location_updated_at || book.location_device === deviceLabel()) return;
    if (lastRemote.current === book.location_updated_at) return;
    lastRemote.current = book.location_updated_at;
    const target = book.location.cfi || (book.location.page ? `pdf:${book.location.page}` : null);
    if (!target || target === savedLoc.current || !loc) return;
    if (Math.abs((book.location.fraction ?? 0) - loc.fraction) < 0.005) return;
    toast(`You read to ${pct(book.location.fraction)} on ${book.location_device}`, { label: 'Jump there', run: () => reader.current?.goTo(target) });
  }, [book?.location_updated_at]); // eslint-disable-line react-hooks/exhaustive-deps

  // keyboard
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      lastActive.current = Date.now();
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || (e.key === ' ' && !e.shiftKey)) { e.preventDefault(); reader.current?.next(); }
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp' || (e.key === ' ' && e.shiftKey)) { e.preventDefault(); reader.current?.prev(); }
      else if (e.key === 'Escape') { setPanel(null); setSettingsOpen(false); setSel(null); setAnnPop(null); setLookup(null); setTtsOpen(false); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') { e.preventDefault(); setPanel('search'); }
      else if (e.key === 't' && !e.ctrlKey && !e.metaKey) setPanel((p) => (p === 'toc' ? null : 'toc'));
      else if (e.key === 'b' && !e.ctrlKey && !e.metaKey) toggleBookmark();
      else if (e.key === 'f' && !e.ctrlKey && !e.metaKey) fullscreen();
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });

  // keep the screen awake
  useEffect(() => {
    if (!reading.keepAwake || !('wakeLock' in navigator)) return;
    let lock: any;
    const get = async () => { try { lock = await (navigator as any).wakeLock.request('screen'); } catch {} };
    get();
    const vis = () => { if (!document.hidden) get(); };
    document.addEventListener('visibilitychange', vis);
    return () => { lock?.release?.(); document.removeEventListener('visibilitychange', vis); };
  }, [reading.keepAwake]);

  // auto-scroll / auto page turn
  useEffect(() => {
    if (!autoScroll || !reading.autoScrollSpeed) return;
    const speed = reading.autoScrollSpeed;
    const scrolled = reading.flow === 'scrolled' || prepared?.kind === 'pdf';
    const t = scrolled ? setInterval(() => reader.current?.scrollBy(speed * 0.6), 50) : setInterval(() => reader.current?.next(), Math.max(4000, 32000 - speed * 2800));
    return () => clearInterval(t);
  }, [autoScroll, reading.autoScrollSpeed, reading.flow, prepared]);

  // text to speech
  const ttsRun = useRef(0);
  const voices = typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis.getVoices() : [];
  const stopTts = () => { ttsRun.current++; window.speechSynthesis?.cancel(); setTts((t) => ({ ...t, playing: false })); };
  const startTts = async (fromText?: string) => {
    if (!('speechSynthesis' in window)) { toast('Read aloud isn’t supported in this browser.'); return; }
    const run = ++ttsRun.current;
    window.speechSynthesis.cancel();
    setTts((t) => ({ ...t, playing: true }));
    const until = tts.sleep ? Date.now() + tts.sleep * 60_000 : 0;
    let first = true;
    while (ttsRun.current === run) {
      let blocks = await reader.current!.speakBlocks();
      if (first && fromText) { const i = blocks.findIndex((b) => b.text.includes(fromText.slice(0, 40))); if (i >= 0) blocks = blocks.slice(i); }
      first = false;
      for (const b of blocks) {
        if (ttsRun.current !== run) return;
        if (until && Date.now() > until) { stopTts(); toast('Sleep timer: stopped reading aloud'); return; }
        b.highlight();
        await new Promise<void>((res) => {
          const u = new SpeechSynthesisUtterance(b.text);
          u.rate = tts.rate; u.pitch = tts.pitch;
          const v = window.speechSynthesis.getVoices().find((x) => x.name === tts.voice);
          if (v) u.voice = v;
          u.onend = () => res(); u.onerror = () => res();
          window.speechSynthesis.speak(u);
        });
        b.clear();
      }
      if (ttsRun.current !== run) return;
      const moved = await reader.current!.nextSection();
      if (!moved) { stopTts(); return; }
    }
  };
  useEffect(() => () => { window.speechSynthesis?.cancel(); }, []);

  const fullscreen = () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.().catch(() => {}); };

  const bookAnns = useMemo(() => annotations.filter((a) => a.book_id === id), [annotations, id]);
  const currentBookmark = bookAnns.find((a) => a.kind === 'bookmark' && loc && (a.location === loc.location || (a.position != null && Math.abs(a.position - loc.fraction) < 0.0015)));
  const toggleBookmark = () => {
    if (!loc || !book) return;
    if (currentBookmark) deleteAnnotation(currentBookmark.id);
    else createAnnotation({ book_id: book.id, kind: 'bookmark', location: loc.location, position: loc.fraction, chapter: loc.chapter || (loc.page ? `Page ${loc.page}` : null), page: loc.page ?? null });
  };

  const highlight = async (color: string, style: 'highlight' | 'underline' | 'strike' = 'highlight', note?: string) => {
    if (!sel || !book) return;
    await createAnnotation({ book_id: book.id, kind: note ? 'note' : 'highlight', color, style, location: sel.location, position: sel.position, chapter: sel.chapter || null, page: sel.page ?? null, quote: sel.text, note: note || null });
    reader.current?.clearSelection();
    setSel(null);
  };

  const define = async (word: string) => {
    const w = word.trim().split(/\s+/)[0].replace(/[^\p{L}'-]/gu, '');
    setLookup({ title: w, html: '<p>Looking up…</p>' });
    try {
      const r = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(w)}`);
      if (!r.ok) throw new Error();
      const j = await r.json();
      const html = j[0].meanings.slice(0, 3).map((m: any) => `<p><i>${escapeHtml(m.partOfSpeech)}</i></p><ol>${m.definitions.slice(0, 3).map((d: any) => `<li>${escapeHtml(d.definition)}</li>`).join('')}</ol>`).join('');
      setLookup({ title: w, html: (j[0].phonetic ? `<p class="cap">${escapeHtml(j[0].phonetic)}</p>` : '') + html });
    } catch { setLookup({ title: w, html: '<p>No definition found.</p>' }); }
  };
  const wiki = async (q: string) => {
    setLookup({ title: q, html: '<p>Looking up…</p>' });
    try {
      const r = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(q.trim().replace(/\s+/g, '_'))}`);
      if (!r.ok) throw new Error();
      const j = await r.json();
      setLookup({ title: j.title, html: `<p>${escapeHtml(j.extract || '')}</p><p><a href="${escapeHtml(j.content_urls?.desktop?.page || '#')}" target="_blank" rel="noopener">Open on Wikipedia</a></p>` });
    } catch { setLookup({ title: q, html: '<p>No Wikipedia article found.</p>' }); }
  };

  const runSearch = async () => {
    if (!searchQ.trim() || !reader.current) return;
    setResults([]); setSearchProg(0);
    await reader.current.search(searchQ.trim(), (r) => setResults((l) => [...l, r]), (p) => setSearchProg(p));
    setSearchProg(null);
  };

  const setReflow = async (on: boolean) => {
    if (!on) { setReflowFile(null); return; }
    const pdf = reader.current as PdfHandle;
    toast('Extracting text…');
    const text = await pdf.fullText();
    const blob = new Blob([text], { type: 'text/plain' });
    const p = await prepareForReader(blob, `${book?.title || 'book'}.txt`, { title: book?.title });
    if (p.kind === 'foliate') setReflowFile(p.file);
  };

  if (!ok || !loaded) return <Loading label="Opening your book" />;
  if (!book) return <Loading label="Book not found" />;
  if (!book.file_path) return (
    <div style={{ height: '100dvh', display: 'grid', placeItems: 'center', padding: 20 }}>
      <div className="col" style={{ alignItems: 'center', gap: 12, textAlign: 'center', maxWidth: 380 }}>
        <Icon name="book-nofile" size={32} className="mut" /><h1 className="serif" style={{ fontSize: 22 }}>{book.title} has no file yet</h1>
        <p className="secondary" style={{ margin: 0 }}>Import its file from the book page to read it here.</p>
        <Link className="btn pri" href={`/book/${book.id}`}>Go to book page</Link>
      </div>
    </div>
  );

  const isPdf = prepared?.kind === 'pdf' && !reflowFile;
  const common = {
    settings, reading, theme, annotations: bookAnns, initial, extraCss: fontCss,
    onReady: (t: TocItem[]) => setToc(t), onRelocate,
    onSelect: (s: SelectionInfo | null) => { setSel(s); if (s) setAnnPop(null); },
    onAnnotationClick: (aid: string, r: { x: number; y: number }) => setAnnPop({ id: aid, x: r.x, y: r.y }),
    onTap: (z: 'left' | 'center' | 'right') => { lastActive.current = Date.now(); if (z === 'left') reader.current?.prev(); else if (z === 'right') reader.current?.next(); else { setChrome((c) => !c); setSettingsOpen(false); } },
    onFootnote: (html: string) => setLookup({ title: 'Note', html }),
    onError: (m: string) => setError(m),
  };
  const ann = annPop ? bookAnns.find((a) => a.id === annPop.id) : null;
  const atEnd = loc && loc.fraction > 0.985 && book.status !== 'completed';
  const iconColor = { color: chrome ? 'var(--ink-secondary)' : undefined };

  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: theme.bg, color: theme.ink, position: 'relative', overflow: 'hidden' }}>
      <link rel="stylesheet" href="/vendor/pdfjs/pdf_viewer.css" />
      <header style={{ display: chrome ? 'flex' : 'none', alignItems: 'center', gap: 4, padding: '8px 12px', background: 'var(--surface)', borderBottom: '1px solid var(--border)', color: 'var(--ink)', zIndex: 20 }}>
        <Link href={`/book/${book.id}`} className="ib" aria-label="Back to book page"><Icon name="chevron-left" size={18} /></Link>
        <div className="col" style={{ gap: 0, minWidth: 0, flex: 1 }}>
          <span className="truncate" style={{ fontSize: 13, fontWeight: 500 }}>{book.title}</span>
          <span className="cap truncate">{loc?.chapter || book.author || ''}</span>
        </div>
        {[
          ['toc', 'outline', 'Contents'], ['search', 'search', 'Search in book'], ['notes', 'highlight', 'Highlights and bookmarks'],
        ].map(([pnl, icon, label]) => <button key={pnl} className={`ib ${panel === pnl ? 'on' : ''}`} aria-label={label} onClick={() => setPanel(panel === pnl ? null : (pnl as Panel))}><Icon name={icon} size={17} /></button>)}
        <button className={`ib ${currentBookmark ? 'on' : ''}`} aria-label={currentBookmark ? 'Remove bookmark' : 'Bookmark this page'} aria-pressed={!!currentBookmark} onClick={toggleBookmark}><Icon name="bookmark" size={17} style={currentBookmark ? { fill: 'currentColor' } : undefined} /></button>
        <button className={`ib ${ttsOpen || tts.playing ? 'on' : ''}`} aria-label="Read aloud" onClick={() => setTtsOpen(!ttsOpen)}><Icon name="volume" size={17} /></button>
        {prepared?.kind === 'pdf' && <button className={`ib hide-sm ${pdfView.thumbs ? 'on' : ''}`} aria-label="Page thumbnails" onClick={() => setPdfViewState((v) => ({ ...v, thumbs: !v.thumbs }))}><Icon name="grid" size={17} /></button>}
        <button className={`ib ${settingsOpen ? 'on' : ''}`} aria-label="Text and theme settings" aria-expanded={settingsOpen} onClick={() => setSettingsOpen(!settingsOpen)}><Icon name="type" size={17} /></button>
        <button className="ib hide-sm" aria-label="Full screen" onClick={fullscreen}><Icon name="maximize" size={17} /></button>
        <button className="ib hide-sm" aria-label="Download file" onClick={() => downloadBook(book)}><Icon name="download" size={17} /></button>
      </header>

      <div style={{ flex: 1, position: 'relative', minHeight: 0 }} onMouseMove={() => (lastActive.current = Date.now())}>
        {error ? (
          <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: 20 }}>
            <div className="col" style={{ alignItems: 'center', gap: 12, textAlign: 'center', maxWidth: 420, color: 'var(--ink)' }}>
              <Icon name="file" size={30} className="mut" /><p style={{ margin: 0 }}>{error}</p>
              <div className="row"><button className="btn sec" onClick={() => downloadBook(book)}><Icon name="download" size={15} />Download file</button><Link className="btn ghost" href={`/book/${book.id}`}>Book page</Link></div>
            </div>
          </div>
        ) : !prepared ? (
          <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}><div className="col" style={{ alignItems: 'center', gap: 10 }}><Mark size={34} /><span className="cap">Opening {book.title}…</span></div></div>
        ) : prepared.kind === 'unsupported' ? (
          <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: 20 }}>
            <div className="col" style={{ alignItems: 'center', gap: 12, textAlign: 'center', maxWidth: 420, color: 'var(--ink)' }}>
              <Icon name="file" size={30} className="mut" /><p style={{ margin: 0 }}>{prepared.reason}</p>
              <button className="btn pri" onClick={() => downloadBook(book)}><Icon name="download" size={15} style={{ color: 'var(--on-primary)' }} />Download {book.format?.toUpperCase()}</button>
            </div>
          </div>
        ) : reflowFile ? (
          <FoliateReader key="reflow" ref={reader as any} {...common} initial={null} file={reflowFile} />
        ) : prepared.kind === 'pdf' ? (
          <PdfReader ref={reader as any} {...common} data={prepared.data} view={{ ...pdfView, invert: reading.invertPdf }} />
        ) : (
          <FoliateReader ref={reader as any} {...common} file={prepared.file} />
        )}
        {reading.dim > 0 && <div style={{ position: 'absolute', inset: 0, background: '#000', opacity: reading.dim, pointerEvents: 'none', zIndex: 5 }} />}
        {reading.warmth > 0 && <div style={{ position: 'absolute', inset: 0, background: '#FF9A3C', opacity: reading.warmth * 0.22, mixBlendMode: 'multiply', pointerEvents: 'none', zIndex: 5 }} />}

        {panel && (
          <aside className="card" style={{ position: 'absolute', top: 8, left: 8, bottom: 8, width: 320, maxWidth: 'calc(100% - 16px)', zIndex: 25, display: 'flex', flexDirection: 'column', boxShadow: 'var(--shadow-pop)', color: 'var(--ink)' }} aria-label="Reader panel">
            <div className="row" style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
              <span className="h2 grow">{panel === 'toc' ? 'Contents' : panel === 'search' ? 'Search in book' : 'Highlights and bookmarks'}</span>
              <button className="ib" aria-label="Close panel" onClick={() => setPanel(null)}><Icon name="close" size={15} /></button>
            </div>
            <div style={{ overflowY: 'auto', flex: 1, padding: 8 }}>
              {panel === 'toc' && (toc.length ? <TocTree items={toc} current={loc?.chapter} onGo={(t) => { reader.current?.goTo(t); setPanel(null); }} /> : <p className="cap" style={{ margin: 8 }}>This book has no table of contents.</p>)}
              {panel === 'search' && (
                <>
                  <form onSubmit={(e) => { e.preventDefault(); runSearch(); }} className="row" style={{ marginBottom: 8 }}>
                    <input className="text-input" autoFocus value={searchQ} onChange={(e) => setSearchQ(e.target.value)} placeholder="Find in this book" aria-label="Find in this book" />
                    <button className="btn sec" type="submit">Find</button>
                  </form>
                  {searchProg != null && <div className="track" style={{ height: 3, marginBottom: 8 }}><i style={{ width: `${searchProg * 100}%` }} /></div>}
                  {results.map((r, i) => (
                    <div key={i} className="col" style={{ gap: 2, marginBottom: 8 }}>
                      <span className="lbl">{r.label || 'Results'}</span>
                      {r.items.map((it, j) => (
                        <button key={j} className="si" style={{ paddingLeft: 8, alignItems: 'flex-start', whiteSpace: 'normal' }} onClick={() => reader.current?.goTo(it.target)}>
                          <span style={{ fontSize: 12, lineHeight: '17px' }} dangerouslySetInnerHTML={{ __html: escapeHtml(it.excerpt).replace(/«(.*?)»/g, '<mark style="background:var(--hl-orchid);color:inherit">$1</mark>') }} />
                        </button>
                      ))}
                    </div>
                  ))}
                  {searchProg == null && searchQ && results.length === 0 && <p className="cap" style={{ margin: 8 }}>No matches yet. Press Find.</p>}
                </>
              )}
              {panel === 'notes' && (
                <>
                  {bookAnns.length === 0 && <p className="cap" style={{ margin: 8 }}>Select text to highlight it, or press B to bookmark a page.</p>}
                  {[...bookAnns].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)).map((a) => (
                    <button key={a.id} className="si" style={{ paddingLeft: 8, alignItems: 'flex-start', whiteSpace: 'normal', flexDirection: 'column', gap: 2 }} onClick={() => a.location && reader.current?.goTo(a.location)}>
                      <span className="row" style={{ gap: 6 }}><Icon name={a.kind === 'bookmark' ? 'bookmark' : a.kind === 'note' ? 'note' : 'highlight'} size={13} className="mut" /><span className="cap">{a.chapter || pct(a.position)}</span></span>
                      {a.quote && <span className="read-font" style={{ fontSize: 13, lineHeight: '19px', background: `var(--hl-${a.color || 'orchid'})`, padding: '2px 4px', borderRadius: 3 }}>{a.quote.slice(0, 200)}</span>}
                      {a.note && <span style={{ fontSize: 12 }}>{a.note}</span>}
                    </button>
                  ))}
                </>
              )}
            </div>
          </aside>
        )}

        {settingsOpen && (
          <ReaderSettingsPanel settings={settings} reading={reading} scope={scope} setScope={setScope} onChange={changeReading}
            onSaveTheme={(t) => saveSettings({ customReadingThemes: [...settings.customReadingThemes.filter((x) => x.id !== t.id), t] })}
            onDeleteTheme={(tid) => { saveSettings({ customReadingThemes: settings.customReadingThemes.filter((x) => x.id !== tid), reading: { ...settings.reading, theme: settings.reading.theme === tid ? 'day' : settings.reading.theme } }); }}
            isPdf={prepared?.kind === 'pdf'} pdfView={pdfView} setPdfView={(v) => setPdfViewState((s) => ({ ...s, ...v }))}
            onAutoCrop={async () => { const c = await (reader.current as PdfHandle)?.autoCrop?.(); if (c != null) setPdfViewState((s) => ({ ...s, crop: c })); }}
            reflow={!!reflowFile} setReflow={setReflow} onClose={() => setSettingsOpen(false)} />
        )}

        {ttsOpen && (
          <section className="card" aria-label="Read aloud" style={{ position: 'absolute', top: 8, right: 12, width: 300, padding: 14, zIndex: 30, display: 'flex', flexDirection: 'column', gap: 10, boxShadow: 'var(--shadow-pop)', color: 'var(--ink)' }}>
            <div className="row"><span className="h2 grow">Read aloud</span><button className="ib" aria-label="Close" onClick={() => setTtsOpen(false)}><Icon name="close" size={15} /></button></div>
            <div className="row" style={{ gap: 8 }}>
              {tts.playing ? <button className="btn pri" onClick={stopTts}><Icon name="pause" size={15} style={{ color: 'var(--on-primary)' }} />Stop</button> : <button className="btn pri" onClick={() => startTts()}><Icon name="play" size={15} style={{ color: 'var(--on-primary)' }} />Play from here</button>}
            </div>
            <label className="row" style={{ justifyContent: 'space-between', fontSize: 13 }}>Voice
              <select className="chip out" style={{ maxWidth: 170 }} value={tts.voice} onChange={(e) => setTts({ ...tts, voice: e.target.value })}><option value="">Default</option>{voices.map((v) => <option key={v.name} value={v.name}>{v.name}</option>)}</select>
            </label>
            <label className="row" style={{ justifyContent: 'space-between', fontSize: 13 }}>Speed <input type="range" min={0.5} max={2} step={0.1} value={tts.rate} onChange={(e) => setTts({ ...tts, rate: Number(e.target.value) })} /><span className="cap">{tts.rate.toFixed(1)}×</span></label>
            <label className="row" style={{ justifyContent: 'space-between', fontSize: 13 }}>Pitch <input type="range" min={0.5} max={1.5} step={0.1} value={tts.pitch} onChange={(e) => setTts({ ...tts, pitch: Number(e.target.value) })} /><span className="cap">{tts.pitch.toFixed(1)}</span></label>
            <label className="row" style={{ justifyContent: 'space-between', fontSize: 13 }}>Sleep timer
              <select className="chip out" value={tts.sleep} onChange={(e) => setTts({ ...tts, sleep: Number(e.target.value) })}><option value={0}>Off</option><option value={10}>10 min</option><option value={20}>20 min</option><option value={30}>30 min</option><option value={60}>1 hour</option></select>
            </label>
            <p className="cap" style={{ margin: 0 }}>Changes apply when you next press Play. The sentence being read is highlighted and pages turn automatically.</p>
          </section>
        )}

        {sel && (
          <div className="card" role="toolbar" aria-label="Selection" style={{ position: 'fixed', left: Math.max(8, Math.min(window.innerWidth - 360, sel.rect.x + sel.rect.w / 2 - 175)), top: sel.rect.y > 190 ? sel.rect.y - 124 : Math.min(window.innerHeight - 130, sel.rect.y + sel.rect.h + 10), zIndex: 40, padding: 8, display: 'flex', flexDirection: 'column', gap: 6, boxShadow: 'var(--shadow-pop)', color: 'var(--ink)', width: 350 }}>
            <div className="row" style={{ gap: 6 }}>
              {Object.entries(HL_COLORS).map(([c]) => <button key={c} aria-label={`Highlight ${c}`} onClick={() => highlight(c)} style={{ width: 24, height: 24, borderRadius: '50%', border: 0, background: `var(--hl-${c})`, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.12)' }} />)}
              <span style={{ width: 1, height: 20, background: 'var(--border)' }} />
              <button className="ib" aria-label="Underline" onClick={() => highlight('orchid', 'underline')} style={{ textDecoration: 'underline', fontWeight: 600 }}>U</button>
              <button className="ib" aria-label="Strikethrough" onClick={() => highlight('orchid', 'strike')} style={{ textDecoration: 'line-through', fontWeight: 600 }}>S</button>
              <button className="ib" aria-label="Add note" onClick={() => setNoteDraft({ sel, text: '' })}><Icon name="note" size={16} /></button>
              <span className="grow" />
              <button className="ib" aria-label="Close" onClick={() => { reader.current?.clearSelection(); setSel(null); }}><Icon name="close" size={14} /></button>
            </div>
            <div className="row wrap" style={{ gap: 4 }}>
              <button className="btn ghost sm" onClick={() => { navigator.clipboard.writeText(sel.text); toast('Copied'); }}><Icon name="copy" size={13} />Copy</button>
              <button className="btn ghost sm" onClick={() => define(sel.text)}>Define</button>
              <button className="btn ghost sm" onClick={() => window.open(`https://translate.google.com/?sl=auto&tl=en&text=${encodeURIComponent(sel.text)}`, '_blank', 'noopener')}><Icon name="translate" size={13} />Translate</button>
              <button className="btn ghost sm" onClick={() => wiki(sel.text)}>Wikipedia</button>
              <button className="btn ghost sm" onClick={() => window.open(`https://www.google.com/search?q=${encodeURIComponent(sel.text)}`, '_blank', 'noopener')}><Icon name="globe" size={13} />Web</button>
              <button className="btn ghost sm" onClick={() => { const t = sel.text; setSel(null); startTts(t); }}><Icon name="volume" size={13} />Read</button>
              <button className="btn ghost sm" onClick={() => { const t = `“${sel.text}” — ${book.title}${book.author ? `, ${book.author}` : ''}`; if (navigator.share) navigator.share({ text: t }).catch(() => {}); else { navigator.clipboard.writeText(t); toast('Quote copied'); } }}><Icon name="share" size={13} />Share</button>
            </div>
          </div>
        )}

        {noteDraft && (
          <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && setNoteDraft(null)}>
            <div className="dialog" style={{ maxWidth: 460 }}>
              <header><h2>Add a note</h2></header>
              <div className="body">
                <blockquote className="read-font" style={{ margin: 0, padding: '8px 12px', borderRadius: 8, background: 'var(--hl-orchid)', fontSize: 15 }}>{noteDraft.sel.text.slice(0, 300)}</blockquote>
                <textarea className="text-input" autoFocus rows={4} value={noteDraft.text} onChange={(e) => setNoteDraft({ ...noteDraft, text: e.target.value })} aria-label="Note" />
              </div>
              <footer><span className="grow" /><button className="btn ghost" onClick={() => setNoteDraft(null)}>Cancel</button><button className="btn pri" onClick={async () => { setSel(noteDraft.sel); await createAnnotation({ book_id: book.id, kind: 'note', color: 'orchid', style: 'highlight', location: noteDraft.sel.location, position: noteDraft.sel.position, chapter: noteDraft.sel.chapter || null, page: noteDraft.sel.page ?? null, quote: noteDraft.sel.text, note: noteDraft.text }); reader.current?.clearSelection(); setSel(null); setNoteDraft(null); }}>Save note</button></footer>
            </div>
          </div>
        )}

        {ann && annPop && (
          <div className="card" style={{ position: 'fixed', left: Math.max(8, Math.min(window.innerWidth - 330, annPop.x - 150)), top: Math.min(window.innerHeight - 220, annPop.y + 8), width: 320, zIndex: 40, padding: 10, display: 'flex', flexDirection: 'column', gap: 8, boxShadow: 'var(--shadow-pop)', color: 'var(--ink)' }}>
            <div className="row" style={{ gap: 6 }}>
              {Object.keys(HL_COLORS).map((c) => <button key={c} aria-label={`Colour ${c}`} onClick={() => updateAnnotation(ann.id, { color: c })} style={{ width: 22, height: 22, borderRadius: '50%', border: 0, background: `var(--hl-${c})`, boxShadow: ann.color === c ? '0 0 0 2px var(--surface), 0 0 0 3.5px var(--ink)' : 'inset 0 0 0 1px rgba(0,0,0,.12)' }} />)}
              <select className="chip out" value={ann.style || 'highlight'} onChange={(e) => updateAnnotation(ann.id, { style: e.target.value as Annotation['style'] })} aria-label="Style"><option value="highlight">Highlight</option><option value="underline">Underline</option><option value="strike">Strikethrough</option></select>
              <span className="grow" /><button className="ib" aria-label="Close" onClick={() => setAnnPop(null)}><Icon name="close" size={14} /></button>
            </div>
            <textarea className="text-input" rows={3} placeholder="Add a note" defaultValue={ann.note || ''} onBlur={(e) => e.target.value !== (ann.note || '') && updateAnnotation(ann.id, { note: e.target.value || null, kind: e.target.value ? 'note' : 'highlight' })} aria-label="Note" />
            <div className="row"><button className="btn ghost sm" onClick={() => { navigator.clipboard.writeText(ann.quote || ''); toast('Copied'); }}><Icon name="copy" size={13} />Copy</button><span className="grow" /><button className="btn ghost sm" style={{ color: 'var(--danger)' }} onClick={() => { deleteAnnotation(ann.id); setAnnPop(null); }}><Icon name="trash" size={13} />Delete</button></div>
          </div>
        )}

        {lookup && (
          <div className="card" style={{ position: 'absolute', bottom: 70, left: '50%', transform: 'translateX(-50%)', width: 420, maxWidth: 'calc(100% - 24px)', maxHeight: '50%', overflowY: 'auto', zIndex: 40, padding: 14, boxShadow: 'var(--shadow-pop)', color: 'var(--ink)' }}>
            <div className="row"><span className="h2 grow">{lookup.title}</span><button className="ib" aria-label="Close" onClick={() => setLookup(null)}><Icon name="close" size={14} /></button></div>
            <div className="md" style={{ fontSize: 14 }} dangerouslySetInnerHTML={{ __html: lookup.html }} />
          </div>
        )}

        {atEnd && chrome && (
          <div className="card row" style={{ position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 20, padding: '8px 10px 8px 14px', gap: 10, boxShadow: 'var(--shadow-pop)', color: 'var(--ink)' }}>
            <Mark size={18} /><span style={{ fontSize: 13 }}>You reached the end.</span><button className="btn pri sm" onClick={() => setCompleting(true)}>Mark as completed</button>
          </div>
        )}
      </div>

      <footer style={{ display: chrome ? 'flex' : 'none', alignItems: 'center', gap: 12, padding: '8px 16px 12px', background: 'var(--surface)', borderTop: '1px solid var(--border)', color: 'var(--ink-muted)', fontSize: 12, zIndex: 20 }}>
        {reader.current?.canGoBack() && <button className="btn ghost sm" onClick={() => reader.current?.back()}><Icon name="undo" size={13} />Back</button>}
        <button className="ib" aria-label="Previous page" onClick={() => reader.current?.prev()}><Icon name="chevron-left" size={16} /></button>
        <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center' }}>
          <input type="range" min={0} max={1000} value={Math.round((loc?.fraction || 0) * 1000)} aria-label="Book progress" onChange={(e) => reader.current?.goToFraction(Number(e.target.value) / 1000)} style={{ width: '100%', accentColor: 'var(--ink-secondary)' }} />
        </div>
        <span className="hide-sm" style={{ whiteSpace: 'nowrap' }}>{isPdf && loc?.page ? `Page ${loc.page} of ${loc.pages}` : loc?.chapter ? loc.chapter.slice(0, 40) : ''}</span>
        <span style={{ whiteSpace: 'nowrap' }}>{pct(loc?.fraction)}{loc?.minutesSection != null ? ` · ${minutes(loc.minutesSection)} left in chapter` : loc?.minutesTotal != null ? ` · ${minutes(loc.minutesTotal)} left` : ''}</span>
        {reading.autoScrollSpeed > 0 && <button className={`btn ghost sm ${autoScroll ? 'on' : ''}`} onClick={() => setAutoScroll(!autoScroll)}><Icon name={autoScroll ? 'pause' : 'scroll'} size={13} />{autoScroll ? 'Stop' : 'Auto'}</button>}
        <button className="ib" aria-label="Next page" onClick={() => reader.current?.next()}><Icon name="chevron-right" size={16} /></button>
      </footer>
      {completing && <CompleteDialog book={book} onClose={() => setCompleting(false)} />}
    </div>
  );
}

function TocTree({ items, current, onGo, depth = 0 }: { items: TocItem[]; current?: string; onGo: (t: string) => void; depth?: number }) {
  return (
    <>
      {items.map((t, i) => (
        <React.Fragment key={i}>
          <button className={`si ${current && t.label === current ? 'on' : ''}`} style={{ paddingLeft: 8 + depth * 14, whiteSpace: 'normal' }} onClick={() => onGo(t.target)}><span className="t" style={{ whiteSpace: 'normal' }}>{t.label || 'Untitled'}</span></button>
          {t.subitems && <TocTree items={t.subitems} current={current} onGo={onGo} depth={depth + 1} />}
        </React.Fragment>
      ))}
    </>
  );
}

export default function ReaderPage() {
  return <Suspense><ReaderInner /></Suspense>;
}
