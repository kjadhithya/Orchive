'use client';
import React from 'react';
import { useStore } from '@/lib/store';
import { Empty } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { bytes, fmtDate } from '@/lib/util';

export default function TrashPage() {
  const { books, restoreBook, purgeBook } = useStore();
  const trashed = books.filter((b) => b.deleted_at).sort((a, b) => (b.deleted_at || '').localeCompare(a.deleted_at || ''));
  return (
    <div className="page" style={{ maxWidth: 820 }}>
      <div className="row wrap">
        <div className="grow"><h1 className="page-title">Trash</h1><div className="cap" style={{ fontSize: 13, marginTop: 2 }}>Restore a book with its notes, highlights and file, or delete it for good.</div></div>
        {trashed.length > 0 && <button className="btn dan" onClick={async () => { if (confirm(`Permanently delete ${trashed.length} books and their files? This can’t be undone.`)) for (const b of trashed) await purgeBook(b.id); }}><Icon name="trash" size={15} style={{ color: 'var(--danger)' }} />Empty trash</button>}
      </div>
      {trashed.length === 0 ? <Empty icon="trash" title="Trash is empty" /> : (
        <table className="table">
          <thead><tr><th>Title</th><th>Deleted</th><th>File</th><th /></tr></thead>
          <tbody>{trashed.map((b) => (
            <tr key={b.id}>
              <td><span style={{ fontWeight: 500 }}>{b.title}</span> <span className="cap">{b.author}</span></td>
              <td className="secondary">{fmtDate(b.deleted_at)}</td>
              <td className="secondary">{b.file_path ? bytes(b.file_size) : 'No file'}</td>
              <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                <button className="btn ghost sm" onClick={() => restoreBook(b.id)}><Icon name="restore" size={14} />Restore</button>
                <button className="btn ghost sm" style={{ color: 'var(--danger)' }} onClick={() => { if (confirm(`Permanently delete “${b.title}”? Notes on it are kept but unlinked.`)) purgeBook(b.id); }}>Delete forever</button>
              </td>
            </tr>
          ))}</tbody>
        </table>
      )}
    </div>
  );
}
