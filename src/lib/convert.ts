'use client';
/* Turns every supported file into something the reader can open:
   - EPUB, MOBI, AZW3, FB2, CBZ  -> foliate-js directly
   - PDF                          -> pdf.js
   - TXT, MD, HTML, DOCX, DOC, RTF, ODT -> converted in the browser to FB2, then foliate-js
   - ZIP                          -> the first readable book inside
   - DjVu, CHM                    -> stored and downloadable, no in-browser rendering */
import { extOf, escapeHtml, titleFromFile } from './util';

export type Prepared =
  | { kind: 'foliate'; file: File }
  | { kind: 'pdf'; data: ArrayBuffer }
  | { kind: 'unsupported'; reason: string };

// ---------- runtime-loaded engines (plain ES modules in /public/vendor)
let foliatePromise: Promise<any> | null = null;
export function loadFoliate(): Promise<any> {
  if (!foliatePromise) foliatePromise = import(/* webpackIgnore: true */ '/vendor/foliate/view.js' as string);
  return foliatePromise;
}
let pdfPromise: Promise<any> | null = null;
export function loadPdf(): Promise<any> {
  if (!pdfPromise) {
    pdfPromise = import(/* webpackIgnore: true */ '/vendor/pdfjs/pdf.min.mjs' as string).then((m) => {
      m.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.mjs';
      return m;
    });
  }
  return pdfPromise;
}

// ---------- FB2 builder
type Section = { title: string; html: string };

function inlineToFb2(node: Node): string {
  if (node.nodeType === 3) return escapeHtml(node.textContent || '');
  if (node.nodeType !== 1) return '';
  const el = node as HTMLElement;
  const inner = Array.from(el.childNodes).map(inlineToFb2).join('');
  const tag = el.tagName.toLowerCase();
  if (tag === 'strong' || tag === 'b') return `<strong>${inner}</strong>`;
  if (tag === 'em' || tag === 'i') return `<emphasis>${inner}</emphasis>`;
  if (tag === 's' || tag === 'del' || tag === 'strike') return `<strikethrough>${inner}</strikethrough>`;
  if (tag === 'sup') return `<sup>${inner}</sup>`;
  if (tag === 'sub') return `<sub>${inner}</sub>`;
  if (tag === 'code') return `<code>${inner}</code>`;
  if (tag === 'br') return ' ';
  return inner;
}

/** Converts sanitized HTML into FB2 sections, splitting at h1/h2 headings. */
function htmlToSections(html: string, images: Map<string, { type: string; data: string }>): Section[] {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const root = doc.body.firstElementChild as HTMLElement;
  const sections: Section[] = [];
  let cur: Section = { title: '', html: '' };
  const push = () => { if (cur.html.trim() || cur.title) sections.push(cur); };
  let imgN = 0;
  const walk = (el: Element) => {
    for (const child of Array.from(el.children)) {
      const tag = child.tagName.toLowerCase();
      if (tag === 'h1' || tag === 'h2') {
        push();
        cur = { title: (child.textContent || '').trim(), html: '' };
      } else if (/^h[3-6]$/.test(tag)) {
        cur.html += `<subtitle>${inlineToFb2(child)}</subtitle>`;
      } else if (tag === 'p') {
        const imgs = child.querySelectorAll('img');
        imgs.forEach((img) => {
          const src = img.getAttribute('src') || '';
          const m = /^data:([^;]+);base64,(.*)$/.exec(src);
          if (m) { const id = `img${++imgN}`; images.set(id, { type: m[1], data: m[2] }); cur.html += `<image l:href="#${id}"/>`; }
        });
        const t = inlineToFb2(child).trim();
        cur.html += t ? `<p>${t}</p>` : '<empty-line/>';
      } else if (tag === 'ul' || tag === 'ol') {
        Array.from(child.children).forEach((li, i) => { cur.html += `<p>${tag === 'ol' ? `${i + 1}. ` : '• '}${inlineToFb2(li).trim()}</p>`; });
      } else if (tag === 'blockquote') {
        cur.html += `<cite>${Array.from(child.children).length ? Array.from(child.children).map((c) => `<p>${inlineToFb2(c)}</p>`).join('') : `<p>${inlineToFb2(child)}</p>`}</cite>`;
      } else if (tag === 'pre') {
        (child.textContent || '').split('\n').forEach((line) => { cur.html += `<p><code>${escapeHtml(line) || ' '}</code></p>`; });
      } else if (tag === 'table') {
        child.querySelectorAll('tr').forEach((tr) => { cur.html += `<p>${Array.from(tr.children).map((td) => inlineToFb2(td).trim()).join(' · ')}</p>`; });
      } else if (tag === 'hr') {
        cur.html += '<empty-line/>';
      } else if (tag === 'img') {
        const src = child.getAttribute('src') || '';
        const m = /^data:([^;]+);base64,(.*)$/.exec(src);
        if (m) { const id = `img${++imgN}`; images.set(id, { type: m[1], data: m[2] }); cur.html += `<image l:href="#${id}"/>`; }
      } else if (child.children.length) {
        walk(child);
      } else {
        const t = (child.textContent || '').trim();
        if (t) cur.html += `<p>${escapeHtml(t)}</p>`;
      }
    }
  };
  walk(root);
  push();
  return sections.length ? sections : [{ title: '', html: '<p> </p>' }];
}

function textToSections(text: string): Section[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const sections: Section[] = [];
  let cur: Section = { title: '', html: '' };
  let para: string[] = [];
  const heading = /^\s*(chapter|book|part|section|prologue|epilogue|introduction|preface|contents)\b.{0,60}$/i;
  const flush = () => { if (para.length) { cur.html += `<p>${escapeHtml(para.join(' ').trim())}</p>`; para = []; } };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) { flush(); continue; }
    const isHeading = (heading.test(line) || (line.length < 60 && line === line.toUpperCase() && /[A-Z]/.test(line) && !/[.!?,;]$/.test(line))) && para.length === 0;
    if (isHeading) {
      flush();
      if (cur.html || cur.title) sections.push(cur);
      cur = { title: line.trim(), html: '' };
    } else para.push(line.trim());
  }
  flush();
  if (cur.html || cur.title) sections.push(cur);
  // keep sections a sensible size for long text files without headings
  const out: Section[] = [];
  for (const s of sections) {
    if (s.html.length < 120_000) { out.push(s); continue; }
    const parts = s.html.split('</p>');
    let chunk = '', n = 1;
    for (const p of parts) {
      chunk += p + (p ? '</p>' : '');
      if (chunk.length > 60_000) { out.push({ title: s.title ? `${s.title} (${n++})` : `Part ${n++}`, html: chunk }); chunk = ''; }
    }
    if (chunk.trim()) out.push({ title: s.title ? `${s.title} (${n})` : `Part ${n}`, html: chunk });
  }
  return out.length ? out : [{ title: '', html: '<p> </p>' }];
}

function buildFb2(title: string, author: string, sections: Section[], images = new Map<string, { type: string; data: string }>()): Blob {
  const authorXml = author ? `<author><nickname>${escapeHtml(author)}</nickname></author>` : '<author><nickname></nickname></author>';
  const body = sections.map((s) => `<section>${s.title ? `<title><p>${escapeHtml(s.title)}</p></title>` : ''}${s.html}</section>`).join('');
  const bins = Array.from(images.entries()).map(([id, im]) => `<binary id="${id}" content-type="${im.type}">${im.data}</binary>`).join('');
  const xml = `<?xml version="1.0" encoding="utf-8"?><FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0" xmlns:l="http://www.w3.org/1999/xlink"><description><title-info><book-title>${escapeHtml(title)}</book-title>${authorXml}<lang>en</lang></title-info></description><body>${body}</body>${bins}</FictionBook>`;
  return new Blob([xml], { type: 'application/x-fictionbook+xml' });
}

// ---------- format-specific extractors
function decodeText(buf: ArrayBuffer): string {
  const u8 = new Uint8Array(buf);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(u8); } catch { return new TextDecoder('windows-1252').decode(u8); }
}

export function rtfToText(rtf: string): string {
  let out = '';
  let i = 0;
  const stack: boolean[] = [];
  let skip = false;
  let uc = 1;
  const skipDest = /^(fonttbl|colortbl|stylesheet|info|pict|object|header|footer|headerl|headerr|footerl|footerr|listtable|listoverridetable|rsidtbl|generator|themedata|colorschememapping|latentstyles|datastore|xmlnstbl)$/;
  while (i < rtf.length) {
    const c = rtf[i];
    if (c === '{') { stack.push(skip); i++; continue; }
    if (c === '}') { skip = stack.pop() ?? false; i++; continue; }
    if (c === '\\') {
      const n = rtf[i + 1];
      if (n === '\\' || n === '{' || n === '}') { if (!skip) out += n; i += 2; continue; }
      if (n === '*') { skip = true; i += 2; continue; }
      if (n === "'") { if (!skip) out += String.fromCharCode(parseInt(rtf.substr(i + 2, 2), 16)); i += 4; continue; }
      const m = /^\\([a-z]+)(-?\d+)? ?/i.exec(rtf.slice(i, i + 40));
      if (m) {
        const word = m[1], arg = m[2];
        i += m[0].length;
        if (skipDest.test(word)) skip = true;
        else if (!skip) {
          if (word === 'par' || word === 'line' || word === 'sect' || word === 'page') out += '\n\n';
          else if (word === 'tab') out += '\t';
          else if (word === 'uc') uc = Number(arg) || 1;
          else if (word === 'u') { let code = Number(arg); if (code < 0) code += 65536; out += String.fromCharCode(code); i += uc; }
          else if (word === 'emdash') out += '—';
          else if (word === 'endash') out += '–';
          else if (word === 'lquote') out += '‘';
          else if (word === 'rquote') out += '’';
          else if (word === 'ldblquote') out += '“';
          else if (word === 'rdblquote') out += '”';
          else if (word === 'bullet') out += '•';
        }
        continue;
      }
      i += 2;
      continue;
    }
    if (c === '\r' || c === '\n') { i++; continue; }
    if (!skip) out += c;
    i++;
  }
  return out.replace(/\n{3,}/g, '\n\n');
}

async function odtToHtml(buf: ArrayBuffer): Promise<string> {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file('content.xml')?.async('string');
  if (!xml) return '';
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const TEXT = 'urn:oasis:names:tc:opendocument:xmlns:text:1.0';
  let html = '';
  const walk = (el: Element) => {
    for (const c of Array.from(el.children)) {
      if (c.namespaceURI === TEXT && c.localName === 'h') {
        const lvl = Number(c.getAttributeNS(TEXT, 'outline-level') || 1);
        html += `<h${Math.min(3, lvl)}>${escapeHtml(c.textContent || '')}</h${Math.min(3, lvl)}>`;
      } else if (c.namespaceURI === TEXT && c.localName === 'p') {
        html += `<p>${escapeHtml(c.textContent || '')}</p>`;
      } else walk(c);
    }
  };
  walk(doc.documentElement);
  return html;
}

function docBinaryToText(buf: ArrayBuffer): string {
  // Legacy .doc: pull readable text runs out of the binary (formatting is lost).
  const s = new TextDecoder('windows-1252').decode(new Uint8Array(buf));
  const runs = s.match(/[\x20-\x7E -ÿ\r\n\t]{24,}/g) || [];
  return runs.filter((r) => /[a-z]{3,}/i.test(r) && !/[\\{}]{3,}/.test(r)).join('\n\n').replace(/\r/g, '\n');
}

async function zipInner(file: Blob): Promise<File | null> {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir && !n.startsWith('__MACOSX'));
  // An EPUB or comic zip opens as-is.
  if (names.includes('META-INF/container.xml') || names.includes('mimetype')) return null;
  const order = ['epub', 'pdf', 'mobi', 'azw3', 'fb2', 'docx', 'odt', 'rtf', 'txt', 'md', 'html', 'htm', 'doc'];
  for (const ext of order) {
    const n = names.find((x) => extOf(x) === ext);
    if (n) {
      const blob = await zip.files[n].async('blob');
      return new File([blob], n.split('/').pop()!);
    }
  }
  return null;
}

/** Converts a non-native document into an FB2 file foliate can open. */
async function convertToFb2(file: File, ext: string, titleHint?: string, authorHint?: string): Promise<File> {
  const title = titleHint || titleFromFile(file.name);
  const author = authorHint || '';
  const buf = await file.arrayBuffer();
  let blob: Blob;
  if (ext === 'txt') blob = buildFb2(title, author, textToSections(decodeText(buf)));
  else if (ext === 'rtf') blob = buildFb2(title, author, textToSections(rtfToText(decodeText(buf))));
  else if (ext === 'doc') blob = buildFb2(title, author, textToSections(docBinaryToText(buf)));
  else {
    let html = '';
    const images = new Map<string, { type: string; data: string }>();
    if (ext === 'docx') {
      const mammoth: any = await import('mammoth/mammoth.browser');
      const res = await mammoth.convertToHtml({ arrayBuffer: buf });
      html = res.value;
    } else if (ext === 'odt') html = await odtToHtml(buf);
    else if (ext === 'md') { const { marked } = await import('marked'); html = await marked.parse(decodeText(buf)); }
    else html = decodeText(buf);
    const DOMPurify = (await import('dompurify')).default;
    html = DOMPurify.sanitize(html);
    blob = buildFb2(title, author, htmlToSections(html, images), images);
  }
  return new File([blob], `${title}.fb2`, { type: 'application/x-fictionbook+xml' });
}

export async function prepareForReader(blob: Blob, fileName: string, hints?: { title?: string; author?: string }): Promise<Prepared> {
  let file = new File([blob], fileName);
  let ext = extOf(fileName);
  if (ext === 'zip') {
    const inner = await zipInner(file);
    if (inner) { file = inner; ext = extOf(inner.name); }
    else return { kind: 'foliate', file: new File([blob], fileName.replace(/\.zip$/i, '.epub')) };
  }
  if (ext === 'pdf') return { kind: 'pdf', data: await file.arrayBuffer() };
  if (['epub', 'mobi', 'azw3', 'azw', 'kf8', 'prc', 'fb2', 'fbz', 'cbz'].includes(ext)) {
    if (ext === 'azw' || ext === 'kf8' || ext === 'prc') file = new File([file], fileName.replace(/\.[^.]+$/, '.azw3'));
    return { kind: 'foliate', file };
  }
  if (['txt', 'md', 'html', 'htm', 'docx', 'doc', 'rtf', 'odt'].includes(ext)) {
    return { kind: 'foliate', file: await convertToFb2(file, ext === 'htm' ? 'html' : ext, hints?.title, hints?.author) };
  }
  if (ext === 'djvu' || ext === 'djv') return { kind: 'unsupported', reason: 'DjVu files are stored safely in your library, but browsers can’t display DjVu yet. Download it to read in a DjVu app.' };
  if (ext === 'chm') return { kind: 'unsupported', reason: 'CHM (Windows Help) files are stored safely in your library, but browsers can’t display CHM. Download it to read in a CHM viewer.' };
  return { kind: 'unsupported', reason: 'This file type can’t be opened in the browser. You can still download it.' };
}

// ---------- metadata on import
export interface ExtractedMeta { title?: string; author?: string; series?: string; description?: string; cover?: Blob | null; pages?: number }

function metaText(x: any): string {
  if (!x) return '';
  if (typeof x === 'string') return x;
  if (Array.isArray(x)) return x.map(metaText).filter(Boolean).join(', ');
  if (typeof x === 'object') return x.name ? metaText(x.name) : Object.values(x).map(metaText).find(Boolean) || '';
  return String(x);
}

export async function extractMeta(file: File): Promise<ExtractedMeta> {
  const ext = extOf(file.name);
  try {
    if (ext === 'pdf') {
      const pdfjs = await loadPdf();
      const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
      const info: any = (await pdf.getMetadata().catch(() => null))?.info || {};
      const page = await pdf.getPage(1);
      const vp = page.getViewport({ scale: 1 });
      const scale = 320 / vp.width;
      const v2 = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = v2.width; canvas.height = v2.height;
      await page.render({ canvasContext: canvas.getContext('2d')!, viewport: v2, canvas }).promise;
      const cover = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.82));
      const res = { title: info.Title || undefined, author: info.Author || undefined, cover, pages: pdf.numPages };
      pdf.destroy();
      return res;
    }
    const prepared = await prepareForReader(file, file.name);
    if (prepared.kind !== 'foliate') return {};
    const { makeBook } = await loadFoliate();
    const book = await makeBook(prepared.file);
    const md = book.metadata || {};
    let cover: Blob | null = null;
    try { cover = (await book.getCover?.()) || null; } catch {}
    const series = md.belongsTo?.series ? metaText(md.belongsTo.series) : undefined;
    const desc = md.description ? new DOMParser().parseFromString(String(md.description), 'text/html').body.textContent?.trim() : undefined;
    return { title: metaText(md.title) || undefined, author: metaText(md.author) || undefined, series, description: desc || undefined, cover };
  } catch (e) {
    console.warn('metadata', e);
    return {};
  }
}
