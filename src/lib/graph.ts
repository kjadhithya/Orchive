import type { Book, BookTag, Note, Tag } from './types';
import { norm, resolveLink, wikiLinks } from './util';

export type GNode = { id: string; kind: 'book' | 'tag' | 'note' | 'author'; label: string; book?: Book; note?: Note; nofile?: boolean; rating?: number | null; status?: string; weight: number };
export type GEdge = { source: string; target: string; kind: 'tag' | 'owns' | 'link' | 'author' };

export interface GraphOpts { tags: boolean; notes: boolean; authors: boolean; placeholders: boolean; orphans: boolean; status: string }

export function buildGraph(books: Book[], tags: Tag[], bookTags: BookTag[], notes: Note[], o: GraphOpts) {
  const nodes = new Map<string, GNode>();
  const edges: GEdge[] = [];
  const live = books.filter((b) => !b.deleted_at && (o.placeholders || b.file_path) && (o.status === 'all' || b.status === o.status));
  live.forEach((b) => nodes.set(`b:${b.id}`, { id: `b:${b.id}`, kind: 'book', label: b.title, book: b, nofile: !b.file_path, rating: b.rating, status: b.status, weight: 0 }));
  const has = (id: string) => nodes.has(id);
  if (o.tags) {
    bookTags.forEach((bt) => {
      const t = tags.find((x) => x.id === bt.tag_id);
      if (!t || !has(`b:${bt.book_id}`)) return;
      const tid = `t:${t.id}`;
      if (!nodes.has(tid)) nodes.set(tid, { id: tid, kind: 'tag', label: `#${t.name}`, weight: 0 });
      edges.push({ source: `b:${bt.book_id}`, target: tid, kind: 'tag' });
    });
  }
  if (o.authors) {
    live.forEach((b) => {
      if (!b.author) return;
      const aid = `a:${norm(b.author)}`;
      if (!nodes.has(aid)) nodes.set(aid, { id: aid, kind: 'author', label: b.author, weight: 0 });
      edges.push({ source: `b:${b.id}`, target: aid, kind: 'author' });
    });
  }
  // Notes: either as nodes, or folded into book-to-book links.
  notes.forEach((n) => {
    const nid = `n:${n.id}`;
    const owner = n.book_id ? `b:${n.book_id}` : null;
    const targets = wikiLinks(n.body).map((name) => resolveLink(name, books, notes)).map((r) => (r.kind === 'book' ? `b:${r.book.id}` : r.kind === 'note' ? `n:${r.note.id}` : null)).filter(Boolean) as string[];
    if (o.notes) {
      nodes.set(nid, { id: nid, kind: 'note', label: n.title, note: n, weight: 0 });
      if (owner && has(owner)) edges.push({ source: nid, target: owner, kind: 'owns' });
      targets.forEach((t) => edges.push({ source: nid, target: t, kind: 'link' }));
    } else if (owner && has(owner)) {
      targets.forEach((t) => { if (t.startsWith('b:') && t !== owner) edges.push({ source: owner, target: t, kind: 'link' }); });
    }
  });
  const valid = edges.filter((e) => nodes.has(e.source) && nodes.has(e.target) && e.source !== e.target);
  valid.forEach((e) => { nodes.get(e.source)!.weight++; nodes.get(e.target)!.weight++; });
  let list = Array.from(nodes.values());
  if (!o.orphans) list = list.filter((n) => n.weight > 0 || n.kind === 'book');
  const keep = new Set(list.map((n) => n.id));
  return { nodes: list, edges: valid.filter((e) => keep.has(e.source) && keep.has(e.target)) };
}

/** Nodes within `depth` links of `center`. */
export function neighborhood(g: { nodes: GNode[]; edges: GEdge[] }, center: string, depth: number) {
  const keep = new Set([center]);
  let frontier = [center];
  for (let d = 0; d < depth; d++) {
    const next: string[] = [];
    g.edges.forEach((e) => {
      if (frontier.includes(e.source) && !keep.has(e.target)) { keep.add(e.target); next.push(e.target); }
      if (frontier.includes(e.target) && !keep.has(e.source)) { keep.add(e.source); next.push(e.source); }
    });
    frontier = next;
  }
  return { nodes: g.nodes.filter((n) => keep.has(n.id)), edges: g.edges.filter((e) => keep.has(e.source) && keep.has(e.target)) };
}
