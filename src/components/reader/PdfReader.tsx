'use client';
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { loadPdf } from '@/lib/convert';
import type { ReaderHandle, ReaderProps, SpeakBlock, TocItem } from './types';
import { HL_COLORS } from './FoliateReader';

type Fit = 'width' | 'page' | 'custom';
export interface PdfView { fit: Fit; zoom: number; rotate: number; crop: number; spread: boolean; invert: boolean; thumbs: boolean }
export interface PdfHandle extends ReaderHandle { fullText(): Promise<string>; pageCount(): number; autoCrop(): Promise<number> }

type Rect = [number, number, number, number];
function parseLoc(loc: string | null | undefined): { page: number; rects: Rect[] } | null {
  const m = loc ? /^pdf:(\d+)(?::([\s\S]*))?$/.exec(loc) : null;
  if (!m) return null;
  let rects: Rect[] = [];
  try { if (m[2]) rects = JSON.parse(m[2]); } catch {}
  return { page: parseInt(m[1], 10), rects };
}

export const PdfReader = forwardRef<PdfHandle, ReaderProps & { data: ArrayBuffer; view: PdfView }>(function PdfReader(props, ref) {
  const scroller = useRef<HTMLDivElement>(null);
  const p = useRef(props);
  p.current = props;
  const [doc, setDoc] = useState<any>(null);
  const [sizes, setSizes] = useState<{ w: number; h: number }[]>([]);
  const [width, setWidth] = useState(800);
  const [height, setHeight] = useState(800);
  const [current, setCurrent] = useState(1);
  const rendered = useRef(new Map<number, number>());
  const textCache = useRef(new Map<number, string>());
  const pdfjsRef = useRef<any>(null);
  const history = useRef<number[]>([]);

  // load document
  useEffect(() => {
    let alive = true;
    let d: any;
    (async () => {
      try {
        const pdfjs = await loadPdf();
        pdfjsRef.current = pdfjs;
        d = await pdfjs.getDocument({ data: props.data.slice(0), cMapUrl: '/vendor/pdfjs-cmaps/', cMapPacked: true }).promise;
        if (!alive) return;
        const s: { w: number; h: number }[] = [];
        for (let i = 1; i <= d.numPages; i++) {
          const pg = await d.getPage(i);
          const vp = pg.getViewport({ scale: 1 });
          s.push({ w: vp.width, h: vp.height });
        }
        setSizes(s);
        setDoc(d);
        const outline = await d.getOutline().catch(() => null);
        const toc: TocItem[] = [];
        const walk = async (items: any[], out: TocItem[]) => {
          for (const it of items || []) {
            let page = 1;
            try {
              const dest = typeof it.dest === 'string' ? await d.getDestination(it.dest) : it.dest;
              if (dest?.[0]) page = (await d.getPageIndex(dest[0])) + 1;
            } catch {}
            const node: TocItem = { label: it.title, target: `pdf:${page}` };
            if (it.items?.length) { node.subitems = []; await walk(it.items, node.subitems); }
            out.push(node);
          }
        };
        if (outline) await walk(outline, toc);
        p.current.onReady(toc, { pages: d.numPages });
        const start = parseLoc(props.initial)?.page || 1;
        requestAnimationFrame(() => scrollToPage(start, false));
      } catch (e: any) {
        p.current.onError(e?.name === 'PasswordException' ? 'This PDF is password-protected.' : `This PDF couldn’t be opened: ${e?.message || e}`);
      }
    })();
    return () => { alive = false; d?.destroy?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.data]);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(() => { setWidth(el.clientWidth); setHeight(el.clientHeight); });
    ro.observe(el);
    setWidth(el.clientWidth); setHeight(el.clientHeight);
    return () => ro.disconnect();
  }, []);

  const v = props.view;
  const crop = v.crop / 100;
  // page box after rotation and crop
  const box = useCallback((i: number) => {
    const s = sizes[i - 1] || { w: 600, h: 800 };
    const rot = v.rotate % 180 !== 0;
    const w = (rot ? s.h : s.w) * (1 - 2 * crop), h = (rot ? s.w : s.h) * (1 - 2 * crop);
    return { w, h };
  }, [sizes, v.rotate, crop]);

  const scale = useMemo(() => {
    const b = box(1);
    const cols = v.spread && width > 900 ? 2 : 1;
    const avail = (width - 48 - (cols - 1) * 16) / cols;
    if (v.fit === 'width') return avail / b.w;
    if (v.fit === 'page') return Math.min(avail / b.w, (height - 32) / b.h);
    return v.zoom;
  }, [box, v.fit, v.zoom, v.spread, width, height]);

  const pageEl = (i: number) => scroller.current?.querySelector<HTMLDivElement>(`[data-page="${i}"]`);
  const scrollToPage = (i: number, push = true) => {
    const el = pageEl(i);
    if (!el || !scroller.current) return;
    if (push) history.current.push(current);
    scroller.current.scrollTop = el.offsetTop - 16;
  };

  // render visible pages
  const renderPage = useCallback(async (i: number) => {
    if (!doc) return;
    const key = Math.round(scale * 1000) + v.rotate * 7;
    if (rendered.current.get(i) === key) return;
    rendered.current.set(i, key);
    const el = pageEl(i);
    if (!el) return;
    const page = await doc.getPage(i);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const vp = page.getViewport({ scale, rotation: (page.rotate + v.rotate) % 360 });
    const canvas = el.querySelector('canvas') as HTMLCanvasElement;
    canvas.width = Math.floor(vp.width * dpr);
    canvas.height = Math.floor(vp.height * dpr);
    canvas.style.width = `${vp.width}px`;
    canvas.style.height = `${vp.height}px`;
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    try { await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise; } catch {}
    const tl = el.querySelector('.textLayer') as HTMLDivElement;
    tl.replaceChildren();
    tl.style.setProperty('--scale-factor', String(scale));
    tl.style.setProperty('--total-scale-factor', String(scale));
    try {
      const tc = await page.getTextContent();
      const layer = new pdfjsRef.current.TextLayer({ textContentSource: tc, container: tl, viewport: vp });
      await layer.render();
    } catch {}
  }, [doc, scale, v.rotate]);

  useEffect(() => {
    if (!doc || !scroller.current) return;
    rendered.current.clear();
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) renderPage(Number((e.target as HTMLElement).dataset.page)); });
    }, { root: scroller.current, rootMargin: '600px 0px' });
    scroller.current.querySelectorAll('[data-page]').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [doc, renderPage, sizes.length]);

  // relocate on scroll
  useEffect(() => {
    const el = scroller.current;
    if (!el || !doc) return;
    let t: any;
    const onScroll = () => {
      clearTimeout(t);
      t = setTimeout(() => {
        const mid = el.scrollTop + el.clientHeight / 3;
        let pg = 1;
        el.querySelectorAll<HTMLDivElement>('[data-page]').forEach((d) => { if (d.offsetTop <= mid) pg = Number(d.dataset.page); });
        setCurrent(pg);
        const n = doc.numPages;
        p.current.onRelocate({ fraction: n > 1 ? (pg - 1) / (n - 1) : 1, chapter: '', page: pg, pages: n, location: `pdf:${pg}`, minutesTotal: (n - pg) * 1.6, minutesSection: undefined });
      }, 120);
    };
    el.addEventListener('scroll', onScroll);
    onScroll();
    return () => el.removeEventListener('scroll', onScroll);
  }, [doc]);

  // selection inside text layers
  useEffect(() => {
    let t: any;
    const onSel = () => {
      clearTimeout(t);
      t = setTimeout(() => {
        const sel = document.getSelection();
        if (!sel || sel.isCollapsed || !sel.rangeCount) { p.current.onSelect(null); return; }
        const range = sel.getRangeAt(0);
        const pageDiv = (range.startContainer.parentElement as HTMLElement)?.closest?.('[data-page]') as HTMLDivElement | null;
        if (!pageDiv || !scroller.current?.contains(pageDiv)) return;
        const pr = pageDiv.getBoundingClientRect();
        const rects: Rect[] = Array.from(range.getClientRects()).filter((r) => r.width > 1 && r.height > 1).map((r) => [(r.left - pr.left) / pr.width, (r.top - pr.top) / pr.height, r.width / pr.width, r.height / pr.height]);
        const br = range.getBoundingClientRect();
        const pg = Number(pageDiv.dataset.page);
        const text = sel.toString().trim();
        if (!text) return;
        p.current.onSelect({ text, location: `pdf:${pg}:${JSON.stringify(rects.map((r) => r.map((x) => Math.round(x * 10000) / 10000)))}`, rect: { x: br.left, y: br.top, w: br.width, h: br.height }, chapter: `Page ${pg}`, page: pg, position: doc ? (pg - 1) / Math.max(1, doc.numPages - 1) : 0 });
      }, 300);
    };
    document.addEventListener('selectionchange', onSel);
    return () => document.removeEventListener('selectionchange', onSel);
  }, [doc]);

  const getText = async (i: number): Promise<string> => {
    if (textCache.current.has(i)) return textCache.current.get(i)!;
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    const s = tc.items.map((x: any) => x.str + (x.hasEOL ? '\n' : '')).join('');
    textCache.current.set(i, s);
    return s;
  };

  useImperativeHandle(ref, () => ({
    next: () => { const el = scroller.current; if (el) el.scrollBy({ top: el.clientHeight * 0.9, behavior: p.current.reading.animation ? 'smooth' : 'auto' }); },
    prev: () => { const el = scroller.current; if (el) el.scrollBy({ top: -el.clientHeight * 0.9, behavior: p.current.reading.animation ? 'smooth' : 'auto' }); },
    goTo: (t: string) => { const l = parseLoc(t); if (l) scrollToPage(l.page); },
    goToFraction: (f: number) => { if (doc) scrollToPage(Math.max(1, Math.round(f * (doc.numPages - 1)) + 1)); },
    back: () => { const pg = history.current.pop(); if (pg) scrollToPage(pg, false); },
    canGoBack: () => history.current.length > 0,
    clearSelection: () => document.getSelection()?.removeAllRanges(),
    async search(q, onResult, onProgress) {
      if (!doc) return;
      const needle = q.toLowerCase();
      for (let i = 1; i <= doc.numPages; i++) {
        const text = await getText(i);
        const lower = text.toLowerCase();
        const items: { target: string; excerpt: string }[] = [];
        let idx = lower.indexOf(needle);
        while (idx >= 0 && items.length < 20) {
          items.push({ target: `pdf:${i}`, excerpt: `${text.slice(Math.max(0, idx - 40), idx)}«${text.slice(idx, idx + q.length)}»${text.slice(idx + q.length, idx + q.length + 40)}`.replace(/\s+/g, ' ') });
          idx = lower.indexOf(needle, idx + needle.length);
        }
        if (items.length) onResult({ label: `Page ${i}`, items });
        if (i % 5 === 0) onProgress(i / doc.numPages);
      }
      onProgress(1);
    },
    clearSearch: () => {},
    async speakBlocks(): Promise<SpeakBlock[]> {
      if (!doc) return [];
      const text: string = await getText(current);
      return text.split(/\n{1,}/).map((s) => s.trim()).filter((s) => s.length > 1).reduce<string[]>((acc, s) => { if (acc.length && acc[acc.length - 1].length < 200 && !/[.!?:]$/.test(acc[acc.length - 1])) acc[acc.length - 1] += ' ' + s; else acc.push(s); return acc; }, [])
        .map((s) => ({ text: s, highlight: () => {}, clear: () => {} }));
    },
    async nextSection() { if (!doc || current >= doc.numPages) return false; scrollToPage(current + 1, false); setCurrent(current + 1); await new Promise((r) => setTimeout(r, 300)); return true; },
    scrollBy: (px: number) => scroller.current?.scrollBy({ top: px }),
    currentText: () => getText(current),
    async fullText() { if (!doc) return ''; const parts: string[] = []; for (let i = 1; i <= doc.numPages; i++) parts.push(await getText(i)); return parts.join('\n\n'); },
    pageCount: () => doc?.numPages || 0,
    async autoCrop() {
      // Find the smallest blank margin across a few sample pages.
      if (!doc) return 0;
      let best = 0.15;
      const samples = [1, Math.ceil(doc.numPages / 2), doc.numPages].filter((x, i, a) => a.indexOf(x) === i);
      for (const i of samples) {
        const pg = await doc.getPage(i);
        const vp = pg.getViewport({ scale: 300 / pg.getViewport({ scale: 1 }).width });
        const cv = document.createElement('canvas');
        cv.width = vp.width; cv.height = vp.height;
        const ctx = cv.getContext('2d', { willReadFrequently: true })!;
        await pg.render({ canvasContext: ctx, viewport: vp, canvas: cv }).promise.catch(() => {});
        const { data, width: W, height: H } = ctx.getImageData(0, 0, cv.width, cv.height);
        let minX = W, minY = H, maxX = 0, maxY = 0;
        for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) {
          const o = (y * W + x) * 4;
          if (data[o] < 235 || data[o + 1] < 235 || data[o + 2] < 235) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
        }
        if (maxX <= minX) continue;
        const m = Math.min(minX / W, (W - maxX) / W, minY / H, (H - maxY) / H);
        best = Math.min(best, Math.max(0, m - 0.01));
      }
      return Math.round(best * 100);
    },
  }));

  const t = props.theme;
  const filter = v.invert ? 'invert(0.92) hue-rotate(180deg)' : undefined;
  const cols = v.spread && width > 900 ? 2 : 1;
  const pages = sizes.map((_, i) => i + 1);
  const anns = props.annotations.map((a) => ({ a, l: parseLoc(a.location) })).filter((x) => x.l);

  return (
    <div ref={scroller} style={{ position: 'absolute', inset: 0, overflow: 'auto', background: t.bg }}
      onClick={(e) => {
        if (document.getSelection()?.toString()) return;
        if ((e.target as HTMLElement).closest('.textLayer span')) return;
        const x = e.clientX - (scroller.current?.getBoundingClientRect().left || 0);
        const W = scroller.current?.clientWidth || 1;
        const z = props.reading.tapZones;
        props.onTap(z === 'off' ? 'center' : x < W * 0.2 ? 'left' : x > W * 0.8 ? 'right' : 'center');
      }}>
      {v.thumbs && doc ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 16, padding: 24 }}>
          {pages.map((i) => <Thumb key={i} doc={doc} page={i} active={i === current} onClick={() => { p.current.onTap('center'); (ref as any)?.current?.goTo?.(`pdf:${i}`); }} />)}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, max-content)`, justifyContent: 'center', gap: 16, padding: '16px 24px 48px' }}>
          {pages.map((i) => {
            const b = box(i);
            const s = sizes[i - 1] || { w: 600, h: 800 };
            const rot = v.rotate % 180 !== 0;
            const full = { w: (rot ? s.h : s.w) * scale, h: (rot ? s.w : s.h) * scale };
            return (
              <div key={i} data-page={i} style={{ position: 'relative', width: b.w * scale, height: b.h * scale, overflow: 'hidden', background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,.12)', filter }}>
                <div style={{ position: 'absolute', left: -crop * full.w, top: -crop * full.h, width: full.w, height: full.h }}>
                  <canvas style={{ display: 'block' }} />
                  <div className="textLayer" />
                  {anns.filter((x) => x.l!.page === i).map(({ a, l }) => l!.rects.map((r, k) => (
                    <div key={a.id + k} onClick={(e) => { e.stopPropagation(); props.onAnnotationClick(a.id, { x: e.clientX, y: e.clientY }); }}
                      style={{ position: 'absolute', left: `${r[0] * 100}%`, top: `${r[1] * 100}%`, width: `${r[2] * 100}%`, height: `${r[3] * 100}%`, cursor: 'pointer',
                        background: a.style === 'highlight' || !a.style ? HL_COLORS[a.color || 'orchid'] : 'transparent', opacity: a.style === 'highlight' || !a.style ? 0.32 : 1,
                        borderBottom: a.style === 'underline' ? `2px solid ${HL_COLORS[a.color || 'orchid']}` : undefined,
                        backgroundImage: a.style === 'strike' ? `linear-gradient(transparent 45%, ${HL_COLORS[a.color || 'orchid']} 45%, ${HL_COLORS[a.color || 'orchid']} 55%, transparent 55%)` : undefined }} />
                  )))}
                </div>
                <span style={{ position: 'absolute', right: 6, bottom: 4, fontSize: 10, color: '#999', pointerEvents: 'none' }}>{i}</span>
              </div>
            );
          })}
        </div>
      )}
      {!v.invert && t.id !== 'day' && <div style={{ position: 'fixed', inset: 0, background: t.bg, mixBlendMode: 'multiply', pointerEvents: 'none', opacity: 0.55 }} />}
    </div>
  );
});

function Thumb({ doc, page, active, onClick }: { doc: any; page: number; active: boolean; onClick: () => void }) {
  const c = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      const pg = await doc.getPage(page);
      const vp0 = pg.getViewport({ scale: 1 });
      const vp = pg.getViewport({ scale: 240 / vp0.width });
      const canvas = c.current;
      if (!canvas || !alive) return;
      canvas.width = vp.width; canvas.height = vp.height;
      await pg.render({ canvasContext: canvas.getContext('2d')!, viewport: vp, canvas }).promise.catch(() => {});
    })();
    return () => { alive = false; };
  }, [doc, page]);
  return (
    <button onClick={(e) => { e.stopPropagation(); onClick(); }} style={{ border: 0, background: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center', cursor: 'pointer' }} aria-label={`Page ${page}`}>
      <canvas ref={c} style={{ width: '100%', boxShadow: active ? '0 0 0 3px var(--primary)' : '0 1px 4px rgba(0,0,0,.15)', background: '#fff' }} />
      <span className="cap">{page}</span>
    </button>
  );
}
