'use client';
import React, { useState } from 'react';
import Link from 'next/link';
import { useLibrary } from '@/lib/store';
import { BookCover, Empty } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { pct, STATUS_LABEL } from '@/lib/util';

export default function ReadNextPage() {
  const { readNext, reorderReadNext, setReadNext } = useLibrary();
  const [drag, setDrag] = useState<string | null>(null);
  const move = (id: string, dir: -1 | 1) => {
    const ids = readNext.map((b) => b.id);
    const i = ids.indexOf(id), j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    reorderReadNext(ids);
  };
  return (
    <div className="page" style={{ maxWidth: 760 }}>
      <div><h1 className="page-title">Read Next</h1><div className="cap" style={{ fontSize: 13, marginTop: 2 }}>Your queue. These books always stay at the top of the library. Drag or use the arrows to reorder.</div></div>
      {readNext.length === 0 ? <Empty icon="bookmark" title="Nothing queued">Use “Add to Read Next” on any book page or library row.</Empty> : (
        <ol className="col" style={{ listStyle: 'none', margin: 0, padding: 0, gap: 8 }}>
          {readNext.map((b, i) => (
            <li key={b.id} draggable onDragStart={() => setDrag(b.id)} onDragOver={(e) => e.preventDefault()}
              onDrop={() => { if (!drag || drag === b.id) return; const ids = readNext.map((x) => x.id).filter((x) => x !== drag); ids.splice(ids.indexOf(b.id), 0, drag); reorderReadNext(ids); setDrag(null); }}
              className="card row" style={{ padding: 12, gap: 14, cursor: 'grab' }}>
              <span className="serif" style={{ fontSize: 20, width: 24, textAlign: 'center' }}>{i + 1}</span>
              <BookCover book={b} width={44} height={64} link />
              <div className="grow" style={{ minWidth: 0 }}>
                <Link href={`/book/${b.id}`} style={{ fontWeight: 500, color: 'var(--ink)' }}>{b.title}</Link>
                <div className="cap">{b.author}{b.author ? ' · ' : ''}{b.file_path ? (b.progress > 0 ? `${STATUS_LABEL[b.status]} · ${pct(b.progress)}` : 'Not started') : 'No file yet'}</div>
              </div>
              <button className="ib" aria-label="Move up" onClick={() => move(b.id, -1)} disabled={i === 0}><Icon name="chevron-up" size={16} /></button>
              <button className="ib" aria-label="Move down" onClick={() => move(b.id, 1)} disabled={i === readNext.length - 1}><Icon name="chevron-down" size={16} /></button>
              {b.file_path && <Link className="btn sec sm" href={`/read/${b.id}`}>Read</Link>}
              <button className="ib" aria-label={`Remove ${b.title} from Read Next`} onClick={() => setReadNext(b.id, false)}><Icon name="close" size={15} /></button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
