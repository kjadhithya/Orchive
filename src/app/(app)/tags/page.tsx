'use client';
import React, { useState } from 'react';
import Link from 'next/link';
import { useStore } from '@/lib/store';
import { Empty } from '@/components/ui';
import { Icon } from '@/components/Icon';

export default function TagsPage() {
  const { tags, bookTags, books, renameTag, deleteTag, mergeTags } = useStore();
  const [editing, setEditing] = useState<string | null>(null);
  const [merging, setMerging] = useState<string | null>(null);
  const live = new Set(books.filter((b) => !b.deleted_at).map((b) => b.id));
  const count = (id: string) => bookTags.filter((x) => x.tag_id === id && live.has(x.book_id)).length;
  const sorted = [...tags].sort((a, b) => count(b.id) - count(a.id) || a.name.localeCompare(b.name));
  return (
    <div className="page" style={{ maxWidth: 760 }}>
      <div><h1 className="page-title">Tags</h1><div className="cap" style={{ fontSize: 13, marginTop: 2 }}>Rename, merge or delete tags. Click a tag to see its books.</div></div>
      {tags.length === 0 ? <Empty icon="tag" title="No tags yet">Add tags from a book page, then search and filter your library by them.</Empty> : (
        <table className="table">
          <thead><tr><th>Tag</th><th>Books</th><th /></tr></thead>
          <tbody>{sorted.map((t) => (
            <tr key={t.id}>
              <td>{editing === t.id ? (
                <form onSubmit={(e) => { e.preventDefault(); const v = (e.currentTarget.elements.namedItem('n') as HTMLInputElement).value.trim(); if (v) renameTag(t.id, v.replace(/^#/, '')); setEditing(null); }} className="row">
                  <input name="n" className="text-input" defaultValue={t.name} autoFocus style={{ maxWidth: 220 }} /><button className="btn sec sm">Save</button>
                </form>
              ) : merging === t.id ? (
                <span className="row">Merge #{t.name} into
                  <select className="chip out" autoFocus onChange={(e) => { if (e.target.value) mergeTags(t.id, e.target.value); setMerging(null); }} defaultValue="">
                    <option value="">Choose a tag</option>{tags.filter((x) => x.id !== t.id).map((x) => <option key={x.id} value={x.id}>#{x.name}</option>)}
                  </select>
                  <button className="btn ghost sm" onClick={() => setMerging(null)}>Cancel</button>
                </span>
              ) : <Link className="chip" href={`/library?tag=${encodeURIComponent(t.name)}`}>#{t.name}</Link>}</td>
              <td className="secondary">{count(t.id)}</td>
              <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                <button className="btn ghost sm" onClick={() => setEditing(t.id)}>Rename</button>
                <button className="btn ghost sm" onClick={() => setMerging(t.id)}>Merge</button>
                <button className="ib" aria-label={`Delete tag ${t.name}`} onClick={() => { if (confirm(`Delete #${t.name}? Books keep everything else.`)) deleteTag(t.id); }}><Icon name="trash" size={15} /></button>
              </td>
            </tr>
          ))}</tbody>
        </table>
      )}
    </div>
  );
}
