'use client';
import React, { useState } from 'react';
import Link from 'next/link';
import { useLibrary } from '@/lib/store';
import { Icon } from './Icon';
import type { Annotation } from '@/lib/types';

export function HighlightItem({ h, bookId, meta }: { h: Annotation; bookId: string; meta?: React.ReactNode }) {
  const { updateAnnotation, deleteAnnotation, toast } = useLibrary();
  const [edit, setEdit] = useState(false);
  const [note, setNote] = useState(h.note || '');
  return (
    <div className="hl-item" style={{ position: 'relative' }}>
      <blockquote className="read-font" style={{ margin: 0, padding: '10px 14px', paddingRight: 84, borderRadius: 8, background: `var(--hl-${h.color || 'orchid'})`, fontSize: 16, lineHeight: '26px', textDecoration: h.style === 'strike' ? 'line-through' : h.style === 'underline' ? 'underline' : undefined }}>
        <Link href={`/read/${bookId}?at=${encodeURIComponent(h.location || '')}`} style={{ color: 'inherit', textDecoration: 'inherit' }}>{h.quote || 'Open this place in the book'}</Link>
        {!edit && h.note && <span style={{ display: 'block', fontFamily: 'var(--font-sans)', fontSize: 13, marginTop: 6, textDecoration: 'none' }}>{h.note}</span>}
        {edit && (
          <span className="col" style={{ fontFamily: 'var(--font-sans)', marginTop: 8, gap: 6 }}>
            <textarea className="text-input" rows={2} aria-label="Note on this highlight" value={note} autoFocus onChange={(e) => setNote(e.target.value)} />
            <span className="row" style={{ gap: 6 }}>
              {Object.keys(HL).map((c) => <button key={c} aria-label={`Colour ${c}`} onClick={() => updateAnnotation(h.id, { color: c })} style={{ width: 20, height: 20, borderRadius: '50%', border: 0, background: `var(--hl-${c})`, boxShadow: h.color === c ? '0 0 0 2px var(--surface), 0 0 0 3.5px var(--ink)' : 'inset 0 0 0 1px rgba(0,0,0,.15)' }} />)}
              <span className="grow" />
              <button className="btn ghost sm" onClick={() => { setEdit(false); setNote(h.note || ''); }}>Cancel</button>
              <button className="btn pri sm" onClick={() => { updateAnnotation(h.id, { note: note.trim() || null }); setEdit(false); }}>Save</button>
            </span>
          </span>
        )}
        <span className="cap" style={{ display: 'block', fontFamily: 'var(--font-sans)', marginTop: 4, color: 'var(--ink-secondary)' }}>{meta ?? <>{h.chapter}{h.page ? ` · p. ${h.page}` : ''}</>}</span>
      </blockquote>
      {!edit && <span className="row" style={{ position: 'absolute', top: 6, right: 6, gap: 2 }}>
        <button className="ib" aria-label="Edit note and colour" onClick={() => setEdit(true)}><Icon name="edit" size={14} /></button>
        <button className="ib" aria-label="Delete highlight" onClick={() => { deleteAnnotation(h.id); toast('Highlight deleted'); }}><Icon name="trash" size={14} /></button>
      </span>}
    </div>
  );
}

const HL: Record<string, true> = { orchid: true, blush: true, apricot: true, sky: true };

