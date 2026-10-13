'use client';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Session as AuthSession } from '@supabase/supabase-js';
import { sb, BUCKET } from './supabase';
import type { Annotation, AppSettings, Book, BookTag, Collection, CollectionBook, Goal, Note, Session, Tag } from './types';
import { applyAppearance, mergeSettings } from './settings';

type Toast = { id: number; text: string; action?: { label: string; run: () => void } };

interface Store {
  auth: AuthSession | null;
  authReady: boolean;
  loaded: boolean;
  online: boolean;
  syncing: number;
  settings: AppSettings;
  saveSettings: (patch: Partial<AppSettings>) => Promise<void>;
  displayName: string;
  books: Book[];
  tags: Tag[];
  bookTags: BookTag[];
  collections: Collection[];
  collectionBooks: CollectionBook[];
  notes: Note[];
  annotations: Annotation[];
  goals: Goal[];
  sessions: Session[];
  loadSessions: () => Promise<void>;
  // books
  createBook: (b: Partial<Book>) => Promise<Book | null>;
  updateBook: (id: string, patch: Partial<Book>) => Promise<void>;
  trashBook: (id: string) => Promise<void>;
  restoreBook: (id: string) => Promise<void>;
  purgeBook: (id: string) => Promise<void>;
  removeFile: (id: string) => Promise<void>;
  setReadNext: (id: string, on: boolean) => Promise<void>;
  reorderReadNext: (ids: string[]) => Promise<void>;
  // tags
  setBookTags: (bookId: string, names: string[]) => Promise<void>;
  renameTag: (id: string, name: string) => Promise<void>;
  deleteTag: (id: string) => Promise<void>;
  mergeTags: (fromId: string, intoId: string) => Promise<void>;
  // collections
  createCollection: (name: string) => Promise<Collection | null>;
  updateCollection: (id: string, patch: Partial<Collection>) => Promise<void>;
  deleteCollection: (id: string) => Promise<void>;
  setBookCollections: (bookId: string, ids: string[]) => Promise<void>;
  // notes
  createNote: (n: Partial<Note>) => Promise<Note | null>;
  updateNote: (id: string, patch: Partial<Note>) => Promise<void>;
  deleteNote: (id: string) => Promise<void>;
  // annotations
  createAnnotation: (a: Partial<Annotation>) => Promise<Annotation | null>;
  updateAnnotation: (id: string, patch: Partial<Annotation>) => Promise<void>;
  deleteAnnotation: (id: string) => Promise<void>;
  // goals
  setGoal: (year: number, month: number | null, target: number | null) => Promise<void>;
  // sessions
  logSession: (s: Partial<Session>) => Promise<string | null>;
  updateSession: (id: string, patch: Partial<Session>) => Promise<void>;
  // ui
  toast: (text: string, action?: Toast['action']) => void;
  toasts: Toast[];
  refresh: () => Promise<void>;
}

const Ctx = createContext<Store | null>(null);

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('Store missing');
  return s;
}

function upsertById<T extends { id: string }>(list: T[], row: T): T[] {
  const i = list.findIndex((x) => x.id === row.id);
  if (i === -1) return [...list, row];
  const next = list.slice();
  next[i] = { ...list[i], ...row };
  return next;
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [auth, setAuth] = useState<AuthSession | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(0);
  const [settings, setSettings] = useState<AppSettings>(mergeSettings(null));
  const [displayName, setDisplayName] = useState('');
  const [books, setBooks] = useState<Book[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [bookTags, setBookTagsState] = useState<BookTag[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [collectionBooks, setCollectionBooks] = useState<CollectionBook[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const sessionsLoaded = useRef(false);
  const uid = auth?.user.id;

  const toast = useCallback((text: string, action?: Toast['action']) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, action }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), action ? 6000 : 3200);
  }, []);

  const run = useCallback(async <T,>(p: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<T | null> => {
    setSyncing((n) => n + 1);
    try {
      const { data, error } = await p;
      if (error) {
        toast(`Couldn’t save: ${error.message}`);
        return null;
      }
      return data;
    } catch (e) {
      toast('Couldn’t reach Orchive. Check your connection.');
      return null;
    } finally {
      setSyncing((n) => n - 1);
    }
  }, [toast]);

  // auth
  useEffect(() => {
    const c = sb();
    c.auth.getSession().then(({ data }) => {
      setAuth(data.session);
      setAuthReady(true);
    });
    const { data: sub } = c.auth.onAuthStateChange((_e, s) => setAuth(s));
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    setOnline(navigator.onLine);
    return () => {
      sub.subscription.unsubscribe();
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  // appearance follows settings and the system
  useEffect(() => {
    applyAppearance(settings);
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const fn = () => applyAppearance(settings);
    mq.addEventListener('change', fn);
    const t = setInterval(fn, 60_000);
    return () => { mq.removeEventListener('change', fn); clearInterval(t); };
  }, [settings]);

  // initial cached appearance before load (avoids a flash)
  useEffect(() => {
    try {
      const cached = localStorage.getItem('orchive-settings');
      if (cached) setSettings(mergeSettings(JSON.parse(cached)));
    } catch {}
  }, []);

  const refresh = useCallback(async () => {
    if (!uid) return;
    const c = sb();
    const [p, b, t, bt, co, cb, n, a, g] = await Promise.all([
      c.from('orchive_profiles').select('*').eq('id', uid).maybeSingle(),
      c.from('orchive_books').select('*').eq('user_id', uid),
      c.from('orchive_tags').select('*').eq('user_id', uid),
      c.from('orchive_book_tags').select('*').eq('user_id', uid),
      c.from('orchive_collections').select('*').eq('user_id', uid),
      c.from('orchive_collection_books').select('*').eq('user_id', uid),
      c.from('orchive_notes').select('*').eq('user_id', uid).is('deleted_at', null),
      c.from('orchive_annotations').select('*').eq('user_id', uid),
      c.from('orchive_goals').select('*').eq('user_id', uid),
    ]);
    if (!p.data) {
      await c.from('orchive_profiles').insert({ id: uid, display_name: auth?.user.email?.split('@')[0] ?? '' });
      setDisplayName(auth?.user.email?.split('@')[0] ?? '');
    } else {
      const s = mergeSettings(p.data.settings);
      setSettings(s);
      setDisplayName(p.data.display_name || '');
      try { localStorage.setItem('orchive-settings', JSON.stringify(s)); } catch {}
    }
    setBooks((b.data as Book[]) || []);
    setTags((t.data as Tag[]) || []);
    setBookTagsState((bt.data as BookTag[]) || []);
    setCollections((co.data as Collection[]) || []);
    setCollectionBooks((cb.data as CollectionBook[]) || []);
    setNotes((n.data as Note[]) || []);
    setAnnotations((a.data as Annotation[]) || []);
    setGoals((g.data as Goal[]) || []);
    setLoaded(true);
  }, [uid, auth?.user.email]);

  useEffect(() => {
    if (!uid) { setLoaded(false); return; }
    refresh();
    // realtime sync across devices
    const c = sb();
    const ch = c.channel(`orchive-${uid}`);
    const bind = <T extends { id: string }>(table: string, set: React.Dispatch<React.SetStateAction<T[]>>, filterDeleted = false) => {
      ch.on('postgres_changes', { event: '*', schema: 'public', table, filter: `user_id=eq.${uid}` }, (payload: any) => {
        if (payload.eventType === 'DELETE') set((l) => l.filter((x) => x.id !== payload.old.id));
        else if (filterDeleted && payload.new.deleted_at) set((l) => l.filter((x) => x.id !== payload.new.id));
        else set((l) => upsertById(l, payload.new as T));
      });
    };
    bind<Book>('orchive_books', setBooks);
    bind<Tag>('orchive_tags', setTags);
    bind<Collection>('orchive_collections', setCollections);
    bind<Note>('orchive_notes', setNotes, true);
    bind<Annotation>('orchive_annotations', setAnnotations);
    bind<Goal>('orchive_goals', setGoals);
    ch.on('postgres_changes', { event: '*', schema: 'public', table: 'orchive_book_tags', filter: `user_id=eq.${uid}` }, (p: any) => {
      if (p.eventType === 'DELETE') setBookTagsState((l) => l.filter((x) => !(x.book_id === p.old.book_id && x.tag_id === p.old.tag_id)));
      else setBookTagsState((l) => l.some((x) => x.book_id === p.new.book_id && x.tag_id === p.new.tag_id) ? l : [...l, p.new]);
    });
    ch.on('postgres_changes', { event: '*', schema: 'public', table: 'orchive_collection_books', filter: `user_id=eq.${uid}` }, (p: any) => {
      if (p.eventType === 'DELETE') setCollectionBooks((l) => l.filter((x) => !(x.book_id === p.old.book_id && x.collection_id === p.old.collection_id)));
      else setCollectionBooks((l) => [...l.filter((x) => !(x.book_id === p.new.book_id && x.collection_id === p.new.collection_id)), p.new]);
    });
    ch.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orchive_profiles', filter: `id=eq.${uid}` }, (p: any) => {
      setSettings(mergeSettings(p.new.settings));
      setDisplayName(p.new.display_name || '');
    });
    ch.subscribe();
    return () => { c.removeChannel(ch); };
  }, [uid, refresh]);

  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const saveSettings = useCallback(async (patch: Partial<AppSettings>) => {
    const next = mergeSettings({ ...settingsRef.current, ...patch });
    settingsRef.current = next;
    setSettings(next);
    if (!uid) return;
    try { localStorage.setItem('orchive-settings', JSON.stringify(next)); } catch {}
    await run(sb().from('orchive_profiles').update({ settings: next }).eq('id', uid));
  }, [uid, run]);

  const loadSessions = useCallback(async () => {
    if (!uid || sessionsLoaded.current) return;
    sessionsLoaded.current = true;
    const since = new Date(Date.now() - 400 * 86400000).toISOString();
    const { data } = await sb().from('orchive_reading_sessions').select('*').eq('user_id', uid).gte('started_at', since).order('started_at');
    setSessions((data as Session[]) || []);
  }, [uid]);

  // ---- books
  const createBook = useCallback(async (b: Partial<Book>) => {
    const row = await run(sb().from('orchive_books').insert({ ...b, user_id: uid }).select().single());
    if (row) setBooks((l) => upsertById(l, row as Book));
    return (row as Book) || null;
  }, [uid, run]);

  const updateBook = useCallback(async (id: string, patch: Partial<Book>) => {
    setBooks((l) => l.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    await run(sb().from('orchive_books').update(patch).eq('id', id));
  }, [run]);

  const trashBook = useCallback(async (id: string) => {
    await updateBook(id, { deleted_at: new Date().toISOString(), read_next_pos: null });
    toast('Moved to Trash', { label: 'Undo', run: () => updateBook(id, { deleted_at: null }) });
  }, [updateBook, toast]);

  const restoreBook = useCallback(async (id: string) => {
    await updateBook(id, { deleted_at: null });
    toast('Restored to your library');
  }, [updateBook, toast]);

  const purgeBook = useCallback(async (id: string) => {
    const b = books.find((x) => x.id === id);
    const paths = [b?.file_path, b?.cover_path].filter(Boolean) as string[];
    if (paths.length) await sb().storage.from(BUCKET).remove(paths);
    setBooks((l) => l.filter((x) => x.id !== id));
    await run(sb().from('orchive_books').delete().eq('id', id));
  }, [books, run]);

  const removeFile = useCallback(async (id: string) => {
    const b = books.find((x) => x.id === id);
    if (b?.file_path) await sb().storage.from(BUCKET).remove([b.file_path]);
    await updateBook(id, { file_path: null, file_name: null, file_size: null, format: null, file_hash: null, location: null });
    toast('File removed. The book stays as a placeholder.');
  }, [books, updateBook, toast]);

  const setReadNext = useCallback(async (id: string, on: boolean) => {
    if (on) {
      const max = Math.max(0, ...books.map((b) => b.read_next_pos ?? 0));
      await updateBook(id, { read_next_pos: max + 1 });
    } else await updateBook(id, { read_next_pos: null });
  }, [books, updateBook]);

  const reorderReadNext = useCallback(async (ids: string[]) => {
    await Promise.all(ids.map((id, i) => updateBook(id, { read_next_pos: i + 1 })));
  }, [updateBook]);

  // ---- tags
  const ensureTag = useCallback(async (name: string): Promise<Tag | null> => {
    const clean = name.replace(/^#/, '').trim();
    if (!clean) return null;
    const found = tags.find((t) => t.name.toLowerCase() === clean.toLowerCase());
    if (found) return found;
    const row = await run(sb().from('orchive_tags').insert({ name: clean, user_id: uid }).select().single());
    if (row) setTags((l) => upsertById(l, row as Tag));
    return (row as Tag) || null;
  }, [tags, uid, run]);

  const setBookTags = useCallback(async (bookId: string, names: string[]) => {
    const wanted: Tag[] = [];
    for (const n of names) { const t = await ensureTag(n); if (t) wanted.push(t); }
    const current = bookTags.filter((x) => x.book_id === bookId);
    const add = wanted.filter((t) => !current.some((c) => c.tag_id === t.id));
    const del = current.filter((c) => !wanted.some((t) => t.id === c.tag_id));
    setBookTagsState((l) => [...l.filter((x) => !(x.book_id === bookId && del.some((d) => d.tag_id === x.tag_id))), ...add.map((t) => ({ book_id: bookId, tag_id: t.id, user_id: uid! }))]);
    if (add.length) await run(sb().from('orchive_book_tags').insert(add.map((t) => ({ book_id: bookId, tag_id: t.id, user_id: uid }))));
    for (const d of del) await run(sb().from('orchive_book_tags').delete().eq('book_id', bookId).eq('tag_id', d.tag_id));
  }, [bookTags, ensureTag, uid, run]);

  const renameTag = useCallback(async (id: string, name: string) => {
    setTags((l) => l.map((t) => (t.id === id ? { ...t, name } : t)));
    await run(sb().from('orchive_tags').update({ name }).eq('id', id));
  }, [run]);

  const deleteTag = useCallback(async (id: string) => {
    setTags((l) => l.filter((t) => t.id !== id));
    setBookTagsState((l) => l.filter((x) => x.tag_id !== id));
    await run(sb().from('orchive_tags').delete().eq('id', id));
  }, [run]);

  const mergeTags = useCallback(async (fromId: string, intoId: string) => {
    const moving = bookTags.filter((x) => x.tag_id === fromId);
    const toAdd = moving.filter((m) => !bookTags.some((x) => x.tag_id === intoId && x.book_id === m.book_id));
    if (toAdd.length) await run(sb().from('orchive_book_tags').insert(toAdd.map((m) => ({ book_id: m.book_id, tag_id: intoId, user_id: uid }))));
    setBookTagsState((l) => [...l.filter((x) => x.tag_id !== fromId), ...toAdd.map((m) => ({ ...m, tag_id: intoId }))]);
    await deleteTag(fromId);
  }, [bookTags, deleteTag, uid, run]);

  // ---- collections
  const createCollection = useCallback(async (name: string) => {
    const row = await run(sb().from('orchive_collections').insert({ name, user_id: uid }).select().single());
    if (row) setCollections((l) => upsertById(l, row as Collection));
    return (row as Collection) || null;
  }, [uid, run]);
  const updateCollection = useCallback(async (id: string, patch: Partial<Collection>) => {
    setCollections((l) => l.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    await run(sb().from('orchive_collections').update(patch).eq('id', id));
  }, [run]);
  const deleteCollection = useCallback(async (id: string) => {
    setCollections((l) => l.filter((x) => x.id !== id));
    setCollectionBooks((l) => l.filter((x) => x.collection_id !== id));
    await run(sb().from('orchive_collections').delete().eq('id', id));
  }, [run]);
  const setBookCollections = useCallback(async (bookId: string, ids: string[]) => {
    const current = collectionBooks.filter((x) => x.book_id === bookId);
    const add = ids.filter((id) => !current.some((c) => c.collection_id === id));
    const del = current.filter((c) => !ids.includes(c.collection_id));
    setCollectionBooks((l) => [...l.filter((x) => !(x.book_id === bookId && del.some((d) => d.collection_id === x.collection_id))), ...add.map((cid) => ({ collection_id: cid, book_id: bookId, user_id: uid!, position: 0 }))]);
    if (add.length) await run(sb().from('orchive_collection_books').insert(add.map((cid) => ({ collection_id: cid, book_id: bookId, user_id: uid }))));
    for (const d of del) await run(sb().from('orchive_collection_books').delete().eq('book_id', bookId).eq('collection_id', d.collection_id));
  }, [collectionBooks, uid, run]);

  // ---- notes
  const createNote = useCallback(async (n: Partial<Note>) => {
    const row = await run(sb().from('orchive_notes').insert({ title: 'Untitled', body: '', ...n, user_id: uid }).select().single());
    if (row) setNotes((l) => upsertById(l, row as Note));
    return (row as Note) || null;
  }, [uid, run]);
  const updateNote = useCallback(async (id: string, patch: Partial<Note>) => {
    setNotes((l) => l.map((x) => (x.id === id ? { ...x, ...patch, updated_at: new Date().toISOString() } : x)));
    await run(sb().from('orchive_notes').update(patch).eq('id', id));
  }, [run]);
  const deleteNote = useCallback(async (id: string) => {
    const n = notes.find((x) => x.id === id);
    setNotes((l) => l.filter((x) => x.id !== id));
    await run(sb().from('orchive_notes').update({ deleted_at: new Date().toISOString() }).eq('id', id));
    toast('Note deleted', n ? { label: 'Undo', run: async () => { await sb().from('orchive_notes').update({ deleted_at: null }).eq('id', id); setNotes((l) => upsertById(l, n)); } } : undefined);
  }, [notes, run, toast]);

  // ---- annotations
  const createAnnotation = useCallback(async (a: Partial<Annotation>) => {
    const row = await run(sb().from('orchive_annotations').insert({ ...a, user_id: uid }).select().single());
    if (row) setAnnotations((l) => upsertById(l, row as Annotation));
    return (row as Annotation) || null;
  }, [uid, run]);
  const updateAnnotation = useCallback(async (id: string, patch: Partial<Annotation>) => {
    setAnnotations((l) => l.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    await run(sb().from('orchive_annotations').update(patch).eq('id', id));
  }, [run]);
  const deleteAnnotation = useCallback(async (id: string) => {
    setAnnotations((l) => l.filter((x) => x.id !== id));
    await run(sb().from('orchive_annotations').delete().eq('id', id));
  }, [run]);

  // ---- goals
  const setGoal = useCallback(async (year: number, month: number | null, target: number | null) => {
    const existing = goals.find((g) => g.year === year && g.month === month);
    if (!target) {
      if (existing) { setGoals((l) => l.filter((g) => g.id !== existing.id)); await run(sb().from('orchive_goals').delete().eq('id', existing.id)); }
      return;
    }
    if (existing) {
      setGoals((l) => l.map((g) => (g.id === existing.id ? { ...g, target } : g)));
      await run(sb().from('orchive_goals').update({ target }).eq('id', existing.id));
    } else {
      const row = await run(sb().from('orchive_goals').insert({ year, month, target, user_id: uid }).select().single());
      if (row) setGoals((l) => upsertById(l, row as Goal));
    }
  }, [goals, uid, run]);

  // ---- sessions
  const logSession = useCallback(async (s: Partial<Session>) => {
    const { data } = await sb().from('orchive_reading_sessions').insert({ ...s, user_id: uid }).select().single();
    if (data) setSessions((l) => upsertById(l, data as Session));
    return (data as Session)?.id ?? null;
  }, [uid]);
  const updateSession = useCallback(async (id: string, patch: Partial<Session>) => {
    setSessions((l) => l.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    await sb().from('orchive_reading_sessions').update(patch).eq('id', id);
  }, []);

  const value = useMemo<Store>(() => ({
    auth, authReady, loaded, online, syncing, settings, saveSettings, displayName,
    books, tags, bookTags, collections, collectionBooks, notes, annotations, goals, sessions, loadSessions,
    createBook, updateBook, trashBook, restoreBook, purgeBook, removeFile, setReadNext, reorderReadNext,
    setBookTags, renameTag, deleteTag, mergeTags,
    createCollection, updateCollection, deleteCollection, setBookCollections,
    createNote, updateNote, deleteNote,
    createAnnotation, updateAnnotation, deleteAnnotation,
    setGoal, logSession, updateSession, toast, toasts, refresh,
  }), [auth, authReady, loaded, online, syncing, settings, saveSettings, displayName, books, tags, bookTags, collections, collectionBooks, notes, annotations, goals, sessions, loadSessions, createBook, updateBook, trashBook, restoreBook, purgeBook, removeFile, setReadNext, reorderReadNext, setBookTags, renameTag, deleteTag, mergeTags, createCollection, updateCollection, deleteCollection, setBookCollections, createNote, updateNote, deleteNote, createAnnotation, updateAnnotation, deleteAnnotation, setGoal, logSession, updateSession, toast, toasts, refresh]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Library helpers shared by many screens. */
export function useLibrary() {
  const s = useStore();
  const live = useMemo(() => s.books.filter((b) => !b.deleted_at), [s.books]);
  const tagsOf = useCallback((bookId: string) => s.bookTags.filter((x) => x.book_id === bookId).map((x) => s.tags.find((t) => t.id === x.tag_id)).filter(Boolean) as Tag[], [s.bookTags, s.tags]);
  const readNext = useMemo(() => live.filter((b) => b.read_next_pos != null).sort((a, b) => (a.read_next_pos ?? 0) - (b.read_next_pos ?? 0)), [live]);
  return { ...s, live, tagsOf, readNext };
}
