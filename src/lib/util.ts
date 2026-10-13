import type { Book, Note, Status } from './types';

export const STATUS_LABEL: Record<Status, string> = { to_read: 'To Read', reading: 'Reading', completed: 'Completed', paused: 'Paused' };

export const SUPPORTED = ['epub', 'pdf', 'txt', 'mobi', 'azw3', 'azw', 'kf8', 'prc', 'fb2', 'fbz', 'djvu', 'djv', 'doc', 'docx', 'rtf', 'odt', 'chm', 'zip', 'cbz', 'md', 'html', 'htm'];
export const ACCEPT = SUPPORTED.map((e) => '.' + e).join(',') + ',.fb2.zip';

export function extOf(name: string): string {
  const n = name.toLowerCase();
  if (n.endsWith('.fb2.zip')) return 'fbz';
  return n.split('.').pop() || '';
}

export function formatLabel(fmt: string | null | undefined): string {
  if (!fmt) return '—';
  const f = fmt.toLowerCase();
  if (f === 'fbz') return 'FB2';
  if (f === 'kf8' || f === 'azw') return 'AZW3';
  return f.toUpperCase();
}

export function bytes(n: number | null | undefined): string {
  if (!n) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0, v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v < 10 && i > 0 ? v.toFixed(1) : Math.round(v)} ${u[i]}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export { MONTHS };

export function fmtDate(iso: string | null | undefined, withYear = true): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${withYear ? ' ' + d.getFullYear() : ''}`;
}

export function relDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const now = new Date();
  const days = Math.floor((new Date(now.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return fmtDate(iso, d.getFullYear() !== now.getFullYear());
}

export function daysBetween(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  return Math.max(1, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000));
}

export function duration(seconds: number): string {
  const h = Math.floor(seconds / 3600), m = Math.round((seconds % 3600) / 60);
  if (h && m) return `${h} h ${m} m`;
  if (h) return `${h} h`;
  return `${m} min`;
}

export function pct(n: number | null | undefined): string {
  return `${Math.round((n || 0) * 100)}%`;
}

export function norm(s: string | null | undefined): string {
  return (s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Title similarity 0..1 by shared words, for matching an imported file to a placeholder book. */
export function similarity(a: string, b: string): number {
  const A = new Set(norm(a).split(' ').filter((w) => w.length > 1));
  const B = new Set(norm(b).split(' ').filter((w) => w.length > 1));
  if (!A.size || !B.size) return 0;
  let shared = 0;
  A.forEach((w) => { if (B.has(w)) shared++; });
  return shared / Math.max(A.size, B.size);
}

export function titleFromFile(name: string): string {
  return name.replace(/\.(fb2\.zip|[a-z0-9]+)$/i, '').replace(/[_]+/g, ' ').replace(/\s*-\s*/g, ' - ').replace(/\s+/g, ' ').trim()
    .split(' ').map((w) => (w.length > 2 && w === w.toLowerCase() ? w[0].toUpperCase() + w.slice(1) : w)).join(' ');
}

export async function sha256(file: Blob): Promise<string> {
  const buf = await file.arrayBuffer();
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** [[Wiki links]] inside a note body. */
export function wikiLinks(body: string): string[] {
  const out: string[] = [];
  const re = /\[\[([^\]\n|]+)(?:\|[^\]\n]*)?\]\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) out.push(m[1].trim());
  return out;
}

export type LinkTarget = { kind: 'book'; book: Book } | { kind: 'note'; note: Note } | { kind: 'missing'; name: string };

export function resolveLink(name: string, books: Book[], notes: Note[]): LinkTarget {
  const n = norm(name);
  const book = books.find((b) => !b.deleted_at && norm(b.title) === n);
  if (book) return { kind: 'book', book };
  const [bk, nt] = name.split('/').map((x) => x.trim());
  if (nt) {
    const b2 = books.find((b) => norm(b.title) === norm(bk));
    const note2 = notes.find((x) => norm(x.title) === norm(nt) && (!b2 || x.book_id === b2.id));
    if (note2) return { kind: 'note', note: note2 };
  }
  const note = notes.find((x) => norm(x.title) === n);
  if (note) return { kind: 'note', note };
  return { kind: 'missing', name };
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

export function download(name: string, content: Blob | string, type = 'text/plain') {
  const blob = typeof content === 'string' ? new Blob([content], { type }) : content;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function safeName(s: string): string {
  return s.replace(/[^a-z0-9.\-_ ]/gi, '').trim().replace(/\s+/g, '-').slice(0, 80) || 'book';
}

export function startOfDay(d: Date) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
export function dayKey(d: Date | string) { const x = typeof d === 'string' ? new Date(d) : d; return `${x.getFullYear()}-${x.getMonth() + 1}-${x.getDate()}`; }
