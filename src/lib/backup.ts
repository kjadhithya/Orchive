'use client';
import { sb, BUCKET } from './supabase';
import { getFile, mimeFor, uploadWithProgress } from './files';
import { extOf, safeName } from './util';

export const TABLES = ['orchive_books', 'orchive_tags', 'orchive_book_tags', 'orchive_collections', 'orchive_collection_books', 'orchive_notes', 'orchive_annotations', 'orchive_reading_sessions', 'orchive_goals'] as const;
const CONFLICT: Record<string, string> = { orchive_book_tags: 'book_id,tag_id', orchive_collection_books: 'collection_id,book_id' };

type Progress = (label: string, fraction: number) => void;
type Row = Record<string, any>;

async function readAll(table: string): Promise<Row[]> {
  const all: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb().from(table).select('*').range(from, from + 999);
    if (error) throw new Error(`${table.replace('orchive_', '')}: ${error.message}`);
    all.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return all;
}

/** Everything the account holds, as one JSON object. */
export async function collectData(settings: unknown, profile: { display_name?: string } = {}) {
  const out: Record<string, unknown> = { app: 'orchive', version: 2, exported_at: new Date().toISOString(), profile, settings };
  for (const t of TABLES) out[t.replace('orchive_', '')] = await readAll(t);
  return out;
}

const uniq = (used: Set<string>, name: string) => {
  let n = name, i = 2;
  const dot = name.lastIndexOf('.');
  while (used.has(n.toLowerCase())) { n = dot > 0 ? `${name.slice(0, dot)} (${i})${name.slice(dot)}` : `${name} (${i})`; i++; }
  used.add(n.toLowerCase());
  return n;
};

/**
 * Full export: a ZIP with the JSON backup, every book file, covers, fonts,
 * notes as Markdown files and highlights as Markdown. Restorable from Settings.
 */
export async function exportFull(settings: any, profile: { display_name?: string }, onProgress: Progress): Promise<{ blob: Blob; missing: string[] }> {
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  onProgress('Reading your library', 0.02);
  const data: any = await collectData(settings, profile);
  const books: Row[] = data.books;
  const files: Record<string, string> = {};
  const missing: string[] = [];
  const used = new Set<string>();

  const stored: { path: string; zipName: string }[] = [];
  books.forEach((b) => {
    if (b.file_path) stored.push({ path: b.file_path, zipName: `Books/${uniq(used, `${safeName(b.title || 'Untitled')}${b.author ? ` - ${safeName(b.author)}` : ''}.${extOf(b.file_name || b.file_path) || 'bin'}`)}` });
    if (b.cover_path) stored.push({ path: b.cover_path, zipName: `Covers/${uniq(used, `${safeName(b.title || 'Untitled')}.${extOf(b.cover_path) || 'jpg'}`)}` });
  });
  (settings?.customFonts || []).forEach((f: { name: string; path: string }) => stored.push({ path: f.path, zipName: `Fonts/${uniq(used, `${safeName(f.name)}.${extOf(f.path) || 'ttf'}`)}` }));

  for (let i = 0; i < stored.length; i++) {
    const s = stored[i];
    onProgress(`Downloading files (${i + 1} of ${stored.length})`, 0.05 + (0.8 * i) / Math.max(1, stored.length));
    try {
      const blob = await getFile(s.path);
      zip.file(s.zipName, blob);
      files[s.path] = s.zipName;
    } catch {
      missing.push(s.zipName.split('/').pop()!);
    }
  }

  // Notes as Markdown
  const bookTitle = (id: string | null) => books.find((b) => b.id === id)?.title;
  const noteNames = new Set<string>();
  (data.notes as Row[]).filter((n) => !n.deleted_at).forEach((n) => {
    const t = bookTitle(n.book_id);
    const front = `---\ntitle: ${JSON.stringify(n.title)}\n${t ? `book: ${JSON.stringify(t)}\n` : ''}created: ${n.created_at}\nupdated: ${n.updated_at}\n---\n\n`;
    zip.file(`Notes/${uniq(noteNames, `${safeName(n.title || 'Untitled')}.md`)}`, front + (n.body || ''));
  });

  // Highlights as one Markdown file, grouped by book
  const anns = (data.annotations as Row[]).filter((a) => a.kind !== 'bookmark');
  const byBook = new Map<string, Row[]>();
  anns.forEach((a) => byBook.set(a.book_id, [...(byBook.get(a.book_id) || []), a]));
  const md = ['# Highlights', ''];
  byBook.forEach((list, id) => {
    md.push(`## ${bookTitle(id) || 'Removed book'}`, '');
    list.sort((a, b) => (a.position ?? 0) - (b.position ?? 0)).forEach((a) => {
      md.push(`> ${(a.quote || '').replace(/\n/g, '\n> ')}`, '');
      if (a.note) md.push(a.note, '');
      if (a.chapter) md.push(`— ${a.chapter}`, '');
    });
  });
  zip.file('Highlights.md', md.join('\n'));

  // Library list
  const cols = ['title', 'author', 'series', 'status', 'rating', 'progress', 'favorite', 'started_at', 'completed_at', 'format', 'file_name'];
  const esc = (v: unknown) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  zip.file('Library.csv', [cols.join(','), ...books.filter((b) => !b.deleted_at).map((b) => cols.map((c) => esc(b[c])).join(','))].join('\n'));

  data._files = files;
  zip.file('orchive-backup.json', JSON.stringify(data, null, 2));
  zip.file('README.txt', 'Orchive export\n\nBooks/      your book files\nCovers/     custom covers\nFonts/      fonts you uploaded\nNotes/      every note as a Markdown file\nHighlights.md, Library.csv\norchive-backup.json  everything else (restore it, or this whole ZIP, from Settings → Privacy and backup)\n');

  onProgress('Packing the ZIP', 0.9);
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } }, (m) => onProgress('Packing the ZIP', 0.9 + (m.percent / 100) * 0.1));
  return { blob, missing };
}

/** Restores a JSON backup or a full ZIP export. Adds and updates; never deletes. */
export async function restoreBackup(file: File, uid: string, onProgress: Progress): Promise<number> {
  let data: any;
  let zip: any = null;
  if (/\.zip$/i.test(file.name) || file.type.includes('zip')) {
    const JSZip = (await import('jszip')).default;
    zip = await JSZip.loadAsync(file);
    const j = zip.file('orchive-backup.json');
    if (!j) throw new Error('This ZIP has no orchive-backup.json');
    data = JSON.parse(await j.async('string'));
  } else data = JSON.parse(await file.text());
  if (data.app !== 'orchive') throw new Error('This is not an Orchive backup');

  const remap = (p: string | null) => (p ? p.replace(/^[^/]+\//, `${uid}/`) : p);
  const files: Record<string, string> = data._files || {};

  // Upload files first so rows never point at missing objects.
  if (zip) {
    const entries = Object.entries(files);
    for (let i = 0; i < entries.length; i++) {
      const [path, name] = entries[i];
      const z = zip.file(name);
      if (!z) continue;
      onProgress(`Uploading files (${i + 1} of ${entries.length})`, (0.7 * i) / Math.max(1, entries.length));
      const blob: Blob = await z.async('blob');
      await uploadWithProgress(remap(path)!, blob, mimeFor(extOf(path)), () => {}).promise;
    }
  }

  let n = 0;
  for (let ti = 0; ti < TABLES.length; ti++) {
    const t = TABLES[ti];
    onProgress('Restoring your library', 0.7 + (0.3 * ti) / TABLES.length);
    const rows = (data[t.replace('orchive_', '')] || []) as Row[];
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500).map((r) => {
        const x: Row = { ...r, user_id: uid };
        if (t === 'orchive_books') {
          // without the ZIP, file paths from another account can't be read
          x.file_path = zip || !r.file_path || r.file_path.startsWith(`${uid}/`) ? remap(r.file_path) : null;
          x.cover_path = zip || !r.cover_path || r.cover_path.startsWith(`${uid}/`) ? remap(r.cover_path) : null;
          if (!x.file_path) { x.file_name = x.file_name && null; }
        }
        return x;
      });
      const { error } = await sb().from(t).upsert(chunk, CONFLICT[t] ? { onConflict: CONFLICT[t] } : undefined);
      if (error) throw new Error(`${t.replace('orchive_', '')}: ${error.message}`);
      n += chunk.length;
    }
  }
  if (data.settings) {
    const s = { ...data.settings, customFonts: (data.settings.customFonts || []).map((f: any) => ({ ...f, path: remap(f.path) })) };
    await sb().from('orchive_profiles').update({ settings: s }).eq('id', uid);
  }
  onProgress('Done', 1);
  return n;
}

export { BUCKET };
