'use client';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import type { Book, Note } from './types';
import { escapeHtml, resolveLink } from './util';

/** Markdown to safe HTML, with [[wiki links]] to books and notes. */
export function renderMarkdown(body: string, books: Book[], notes: Note[]): string {
  const withLinks = body.replace(/\[\[([^\]\n|]+)(?:\|([^\]\n]*))?\]\]/g, (_m, name: string, alias?: string) => {
    const r = resolveLink(name.trim(), books, notes);
    const label = escapeHtml((alias || name).trim());
    if (r.kind === 'book') return `<a class="wl${r.book.file_path ? '' : ' nf'}" href="/book/${r.book.id}">${label}</a>`;
    if (r.kind === 'note') return `<a class="wl" href="/notes/${r.note.id}">${label}</a>`;
    return `<a class="wl missing" href="/library?q=${encodeURIComponent(name)}" title="No book or note called ${label} yet">${label}</a>`;
  });
  const html = marked.parse(withLinks, { async: false, breaks: true, gfm: true }) as string;
  return DOMPurify.sanitize(html);
}

/** Plain-text excerpt of a note, links shown by name. */
export function excerpt(body: string, n = 180): string {
  return body.replace(/\[\[([^\]\n|]+)(?:\|([^\]\n]*))?\]\]/g, (_m, a, b) => b || a).replace(/[#>*_`~-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
}

export function headings(body: string): { level: number; text: string; line: number }[] {
  return body.split('\n').map((l, i) => { const m = /^(#{1,4})\s+(.+)/.exec(l); return m ? { level: m[1].length, text: m[2].trim(), line: i } : null; }).filter(Boolean) as { level: number; text: string; line: number }[];
}
