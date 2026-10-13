'use client';
import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { loadFoliate } from '@/lib/convert';
import { readerCss } from '@/lib/readerStyles';
import type { ReaderHandle, ReaderProps, SpeakBlock, TocItem } from './types';

export const HL_COLORS: Record<string, string> = { orchid: '#A855A7', blush: '#E8799B', apricot: '#F59A63', sky: '#5B8FD0' };

let overlayerMod: any = null;
async function overlayer() {
  if (!overlayerMod) overlayerMod = await import(/* webpackIgnore: true */ '/vendor/foliate/overlayer.js' as string);
  return overlayerMod.Overlayer;
}
let footnoteMod: any = null;
async function footnotes() {
  if (!footnoteMod) footnoteMod = await import(/* webpackIgnore: true */ '/vendor/foliate/footnotes.js' as string);
  return footnoteMod.FootnoteHandler;
}

function mapToc(items: any[] | undefined): TocItem[] {
  return (items || []).map((t) => ({ label: (t.label || '').trim(), target: t.href, subitems: t.subitems?.length ? mapToc(t.subitems) : undefined }));
}

export const FoliateReader = forwardRef<ReaderHandle, ReaderProps & { file: File }>(function FoliateReader(props, ref) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<any>(null);
  const p = useRef(props);
  p.current = props;
  const drawn = useRef(new Set<string>());
  const lastLoc = useRef<any>(null);

  // open the book
  useEffect(() => {
    let alive = true;
    let v: any;
    (async () => {
      try {
        await loadFoliate();
        const Overlayer = await overlayer();
        const FootnoteHandler = await footnotes();
        if (!alive || !host.current) return;
        v = document.createElement('foliate-view');
        v.style.cssText = 'display:block;width:100%;height:100%';
        host.current.append(v);
        view.current = v;
        await v.open(props.file);
        if (!alive) return;
        applyLayout();
        const fn = new FootnoteHandler();
        fn.addEventListener('render', (e: any) => {
          const { view: fv, target } = e.detail;
          const html = target?.outerHTML || '';
          fv.close?.();
          p.current.onFootnote(html);
        });

        v.addEventListener('relocate', (e: any) => {
          const d = e.detail;
          lastLoc.current = d;
          p.current.onRelocate({
            fraction: d.fraction ?? 0,
            chapter: d.tocItem?.label?.trim() || '',
            page: d.location?.current != null ? d.location.current + 1 : undefined,
            pages: d.location?.total,
            minutesSection: d.time?.section,
            minutesTotal: d.time?.total,
            location: d.cfi,
            sectionFractions: v.getSectionFractions?.(),
          });
        });
        v.addEventListener('load', (e: any) => {
          const { doc, index } = e.detail;
          drawn.current.clear();
          const win = doc.defaultView;
          let selTimer: any;
          const report = () => {
            const sel = win.getSelection();
            if (!sel || sel.isCollapsed || !sel.rangeCount) { p.current.onSelect(null); return; }
            const range = sel.getRangeAt(0);
            const text = sel.toString().trim();
            if (!text) return;
            const r = range.getBoundingClientRect();
            const frame = win.frameElement?.getBoundingClientRect() || { left: 0, top: 0 };
            const cfi = v.getCFI(index, range);
            const loc = lastLoc.current;
            p.current.onSelect({
              text, location: cfi, rect: { x: r.left + frame.left, y: r.top + frame.top, w: r.width, h: r.height },
              chapter: loc?.tocItem?.label?.trim() || '', page: loc?.location?.current != null ? loc.location.current + 1 : undefined, position: loc?.fraction ?? 0,
            });
          };
          doc.addEventListener('selectionchange', () => { clearTimeout(selTimer); selTimer = setTimeout(report, 350); });
          doc.addEventListener('click', (ev: MouseEvent) => {
            if (win.getSelection()?.toString()) return;
            if ((ev.target as Element)?.closest?.('a')) return;
            const w = win.innerWidth || doc.documentElement.clientWidth;
            const frame = win.frameElement?.getBoundingClientRect();
            const x = ev.clientX + (frame?.left || 0) - (host.current?.getBoundingClientRect().left || 0);
            const W = host.current?.clientWidth || w;
            const zones = p.current.reading.tapZones;
            if (zones === 'off') return p.current.onTap('center');
            const edge = zones === 'thirds' ? 1 / 3 : 0.22;
            p.current.onTap(x < W * edge ? 'left' : x > W * (1 - edge) ? 'right' : 'center');
          });
          doc.addEventListener('keydown', (ev: KeyboardEvent) => window.dispatchEvent(new KeyboardEvent('keydown', { key: ev.key, ctrlKey: ev.ctrlKey, metaKey: ev.metaKey, shiftKey: ev.shiftKey })));
        });
        v.addEventListener('create-overlay', () => drawAll());
        v.addEventListener('draw-annotation', (e: any) => {
          const { draw, annotation } = e.detail;
          const a = p.current.annotations.find((x) => x.id === annotation.id);
          const color = HL_COLORS[a?.color || 'orchid'] || HL_COLORS.orchid;
          if (a?.kind === 'bookmark') return;
          if (a?.style === 'underline') draw(Overlayer.underline, { color, width: 2 });
          else if (a?.style === 'strike') draw(Overlayer.strikethrough, { color, width: 2 });
          else draw(Overlayer.highlight, { color });
        });
        v.addEventListener('show-annotation', (e: any) => {
          const { value, range } = e.detail;
          const a = p.current.annotations.find((x) => x.location === value);
          if (!a) return;
          const r = range.getBoundingClientRect();
          const frame = range.startContainer.ownerDocument.defaultView.frameElement?.getBoundingClientRect() || { left: 0, top: 0 };
          p.current.onAnnotationClick(a.id, { x: r.left + frame.left, y: r.bottom + frame.top });
        });
        v.addEventListener('link', (e: any) => { fn.handle(v.book, e)?.catch?.(() => {}); });
        v.addEventListener('external-link', (e: any) => { e.preventDefault(); window.open(e.detail.href, '_blank', 'noopener'); });

        await v.init({ lastLocation: props.initial || undefined, showTextStart: !props.initial });
        if (!alive) return;
        p.current.onReady(mapToc(v.book.toc), {});
        drawAll();
      } catch (e: any) {
        console.error(e);
        p.current.onError(e?.message?.includes('not supported') ? 'This file couldn’t be opened. It may be damaged or DRM-protected.' : `This book couldn’t be opened: ${e?.message || e}`);
      }
    })();
    return () => { alive = false; try { v?.close?.(); v?.remove(); } catch {} };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.file]);

  const applyLayout = () => {
    const v = view.current;
    const r = p.current.reading;
    if (!v?.renderer) return;
    const rd = v.renderer;
    rd.setAttribute('flow', r.flow);
    rd.setAttribute('max-column-count', r.twoPage ? '2' : '1');
    rd.setAttribute('margin', `${Math.max(r.marginTop, r.marginBottom)}px`);
    const w = host.current?.clientWidth || 1000;
    rd.setAttribute('gap', `${Math.min(30, Math.max(2, (r.marginSide * 2 / w) * 100))}%`);
    rd.setAttribute('max-inline-size', `${Math.round(r.fontSize * 36)}px`);
    if (r.animation) rd.setAttribute('animated', ''); else rd.removeAttribute('animated');
    rd.setStyles?.(readerCss(p.current.settings, r, p.current.theme) + (p.current.extraCss || ''));
  };

  useEffect(() => { applyLayout(); }, [props.reading, props.theme, props.extraCss]); // eslint-disable-line react-hooks/exhaustive-deps

  const drawAll = () => {
    const v = view.current;
    if (!v?.book) return;
    for (const a of p.current.annotations) {
      if (a.kind === 'bookmark' || !a.location || a.location.startsWith('pdf:')) continue;
      v.addAnnotation({ value: a.location, id: a.id }).catch?.(() => {});
    }
  };
  const annKey = props.annotations.map((a) => `${a.id}:${a.color}:${a.style}`).join('|');
  const prevAnn = useRef<string[]>([]);
  useEffect(() => {
    const v = view.current;
    if (!v?.book) return;
    const now = props.annotations.filter((a) => a.location && a.kind !== 'bookmark').map((a) => a.location!);
    prevAnn.current.filter((x) => !now.includes(x)).forEach((x) => v.deleteAnnotation({ value: x }).catch?.(() => {}));
    prevAnn.current = now;
    drawAll();
  }, [annKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useImperativeHandle(ref, () => ({
    next: () => view.current?.next(),
    prev: () => view.current?.prev(),
    goTo: (t: string) => { view.current?.goTo(t); },
    goToFraction: (f: number) => { view.current?.goToFraction(f); },
    back: () => view.current?.history?.back(),
    canGoBack: () => !!view.current?.history?.canGoBack,
    clearSelection: () => view.current?.deselect?.(),
    async search(q, onResult, onProgress) {
      const v = view.current;
      if (!v) return;
      for await (const r of v.search({ query: q })) {
        if (r === 'done') break;
        if (r.progress != null) onProgress(r.progress);
        if (r.subitems) onResult({ label: r.label, items: r.subitems.map((s: any) => ({ target: s.cfi, excerpt: `${s.excerpt.pre}«${s.excerpt.match}»${s.excerpt.post}` })) });
      }
    },
    clearSearch: () => view.current?.clearSearch(),
    async speakBlocks(): Promise<SpeakBlock[]> {
      const v = view.current;
      const c = v?.renderer?.getContents?.()[0];
      if (!c) return [];
      const doc: Document = c.doc;
      const els = Array.from(doc.body.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote, dd, figcaption')).filter((el) => !el.querySelector('p, li') && (el.textContent || '').trim());
      const range = lastLoc.current?.range as Range | undefined;
      let start = 0;
      if (range) { const i = els.findIndex((el) => range.comparePoint(el, 0) >= 0 || el.contains(range.startContainer)); if (i > 0) start = i; }
      return els.slice(start).map((el) => ({
        text: (el.textContent || '').replace(/\s+/g, ' ').trim(),
        highlight: () => { el.classList.add('orchive-tts'); const r = doc.createRange(); r.selectNodeContents(el); v.renderer.scrollToAnchor?.(r); },
        clear: () => el.classList.remove('orchive-tts'),
      }));
    },
    async nextSection() {
      const v = view.current;
      if (!v?.renderer?.nextSection) return false;
      const before = lastLoc.current?.section?.current;
      await v.renderer.nextSection();
      await new Promise((r) => setTimeout(r, 400));
      return lastLoc.current?.section?.current !== before;
    },
    scrollBy: (px: number) => { view.current?.renderer?.next?.(px); },
    async currentText() {
      const c = view.current?.renderer?.getContents?.()[0];
      return c?.doc?.body?.innerText || '';
    },
  }));

  return <div ref={host} style={{ position: 'absolute', inset: 0 }} />;
});
