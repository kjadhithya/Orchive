'use client';
import { sb, BUCKET, SUPABASE_URL, SUPABASE_KEY } from './supabase';

export interface UploadHandle { promise: Promise<void>; cancel: () => void }

/** Uploads to Supabase Storage with progress and cancel (supabase-js has neither). */
export function uploadWithProgress(path: string, file: Blob, contentType: string, onProgress: (f: number) => void): UploadHandle {
  const xhr = new XMLHttpRequest();
  const promise = (async () => {
    const { data } = await sb().auth.getSession();
    const token = data.session?.access_token;
    await new Promise<void>((resolve, reject) => {
      xhr.open('POST', `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`);
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.setRequestHeader('apikey', SUPABASE_KEY);
      xhr.setRequestHeader('x-upsert', 'true');
      xhr.setRequestHeader('Content-Type', contentType || 'application/octet-stream');
      xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve();
        else {
          let msg = `Upload failed (${xhr.status})`;
          try { const j = JSON.parse(xhr.responseText); msg = j.message || j.error || msg; } catch {}
          if (xhr.status === 413) msg = 'This file is larger than the 50 MB limit.';
          reject(new Error(msg));
        }
      };
      xhr.onerror = () => reject(new Error('Network error while uploading'));
      xhr.onabort = () => reject(new Error('cancelled'));
      xhr.send(file);
    });
  })();
  return { promise, cancel: () => xhr.abort() };
}

const blobCache = new Map<string, Promise<Blob>>();

/** Downloads a stored file (cached for the session). */
export function getFile(path: string): Promise<Blob> {
  if (!blobCache.has(path)) {
    blobCache.set(path, (async () => {
      const { data, error } = await sb().storage.from(BUCKET).download(path);
      if (error || !data) { blobCache.delete(path); throw new Error(error?.message || 'Could not load file'); }
      return data;
    })());
  }
  return blobCache.get(path)!;
}

const urlCache = new Map<string, { url: string; exp: number }>();
export async function signedUrl(path: string): Promise<string | null> {
  const c = urlCache.get(path);
  if (c && c.exp > Date.now()) return c.url;
  const { data } = await sb().storage.from(BUCKET).createSignedUrl(path, 3600);
  if (!data?.signedUrl) return null;
  urlCache.set(path, { url: data.signedUrl, exp: Date.now() + 3300_000 });
  return data.signedUrl;
}

export async function signedDownloadUrl(path: string, name: string): Promise<string | null> {
  const { data } = await sb().storage.from(BUCKET).createSignedUrl(path, 600, { download: name });
  return data?.signedUrl ?? null;
}

export function mimeFor(ext: string): string {
  const m: Record<string, string> = {
    epub: 'application/epub+zip', pdf: 'application/pdf', txt: 'text/plain', md: 'text/markdown', html: 'text/html', htm: 'text/html',
    mobi: 'application/x-mobipocket-ebook', azw3: 'application/vnd.amazon.ebook', fb2: 'application/x-fictionbook+xml',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', doc: 'application/msword', rtf: 'application/rtf',
    odt: 'application/vnd.oasis.opendocument.text', zip: 'application/zip', cbz: 'application/vnd.comicbook+zip', djvu: 'image/vnd.djvu', chm: 'application/vnd.ms-htmlhelp',
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', woff2: 'font/woff2', woff: 'font/woff', ttf: 'font/ttf', otf: 'font/otf',
  };
  return m[ext] || 'application/octet-stream';
}
