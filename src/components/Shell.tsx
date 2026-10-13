'use client';
import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Icon, Mark, RatingMark } from './Icon';
import { useLibrary, useStore } from '@/lib/store';
import { bytes, norm, pct } from '@/lib/util';
import type { Book } from '@/lib/types';
import { ImportDialog } from './ImportDialog';
import { resolveDark } from '@/lib/settings';

export const openImport = (mode: 'files' | 'placeholder' = 'files', attachTo?: string) =>
  window.dispatchEvent(new CustomEvent('orchive:import', { detail: { mode, attachTo } }));

const NAV = [
  { href: '/library', icon: 'library', label: 'Library' },
  { href: '/search', icon: 'search', label: 'Search' },
  { href: '/read-next', icon: 'readnext', label: 'Read Next' },
  { href: '/notes', icon: 'note', label: 'Notes' },
  { href: '/timeline', icon: 'timeline', label: 'Timeline' },
  { href: '/graph', icon: 'graph', label: 'Graph' },
  { href: '/goals', icon: 'goal', label: 'Goals' },
  { href: '/stats', icon: 'stats', label: 'Stats' },
];

type TabT = { href: string; title: string; icon: string };

export function useAuthGate() {
  const { auth, authReady } = useStore();
  const router = useRouter();
  useEffect(() => { if (authReady && !auth) router.replace('/login'); }, [auth, authReady, router]);
  return authReady && !!auth;
}

export function Loading({ label = 'Opening your library' }: { label?: string }) {
  return (
    <div style={{ height: '100dvh', display: 'grid', placeItems: 'center' }}>
      <div className="col" style={{ alignItems: 'center', gap: 12 }}><Mark size={36} /><span className="cap">{label}…</span></div>
    </div>
  );
}

function useTitleFor() {
  const { books, notes, collections } = useStore();
  return (href: string): TabT => {
    const seg = href.split('?')[0].split('/').filter(Boolean);
    const top = '/' + (seg[0] || 'library');
    const nav = NAV.find((n) => n.href === top);
    if (seg[0] === 'book' && seg[1]) return { href, title: books.find((b) => b.id === seg[1])?.title || 'Book', icon: 'book' };
    if (seg[0] === 'notes' && seg[1]) return { href, title: notes.find((n) => n.id === seg[1])?.title || 'Note', icon: 'note' };
    if (seg[0] === 'collections' && seg[1]) return { href, title: collections.find((c) => c.id === seg[1])?.name || 'Collection', icon: 'folder' };
    if (seg[0] === 'settings') return { href, title: 'Settings', icon: 'settings' };
    if (seg[0] === 'trash') return { href, title: 'Trash', icon: 'trash' };
    if (seg[0] === 'tags') return { href, title: 'Tags', icon: 'tag' };
    if (seg[0] === 'highlights') return { href, title: 'Highlights', icon: 'highlight' };
    if (seg[0] === 'explore') return { href, title: 'Shared collections', icon: 'globe' };
    if (nav) return { href, title: nav.label, icon: nav.icon };
    return { href, title: 'Orchive', icon: 'library' };
  };
}

function Ribbon({ path }: { path: string }) {
  const { settings, saveSettings } = useStore();
  const dark = resolveDark(settings);
  return (
    <nav className="ribbon" aria-label="Main">
      <Link href="/library" className="brand" aria-label="Orchive home"><Mark size={24} /></Link>
      {NAV.map((n) => (
        <Link key={n.href} href={n.href} className={`rb ${path.startsWith(n.href) ? 'on' : ''}`} aria-label={n.label} aria-current={path.startsWith(n.href) ? 'page' : undefined}>
          <Icon name={n.icon} /><span className="tip">{n.label}</span>
        </Link>
      ))}
      <span className="grow" />
      <button className="rb" aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'} onClick={() => saveSettings({ mode: dark ? 'light' : 'dark', schedule: { ...settings.schedule, on: false } })}>
        <Icon name={dark ? 'sun' : 'theme'} /><span className="tip">{dark ? 'Light mode' : 'Dark mode'}</span>
      </button>
      <Link href="/settings" className={`rb ${path.startsWith('/settings') ? 'on' : ''}`} aria-label="Settings"><Icon name="settings" /><span className="tip">Settings</span></Link>
    </nav>
  );
}

function BookRow({ b, active }: { b: Book; active: boolean }) {
  return (
    <Link href={`/book/${b.id}`} className={`si ${active ? 'on' : ''} ${b.file_path ? '' : 'nf'}`}>
      <Icon name={b.file_path ? 'book' : 'book-nofile'} size={15} className={active ? 'ink' : 'mut'} />
      <span className="t">{b.title}</span>
      {b.status === 'completed' ? <RatingMark rating={b.rating} size={12} /> : b.status === 'reading' || b.status === 'paused' ? <span className="m">{pct(b.progress)}</span> : null}
    </Link>
  );
}

function Group({ id, label, count, children, defaultOpen = true }: { id: string; label: React.ReactNode; count?: number; children: React.ReactNode; defaultOpen?: boolean }) {
  const key = `orchive-group-${id}`;
  const [open, setOpen] = useState(defaultOpen);
  useEffect(() => { try { const v = localStorage.getItem(key); if (v) setOpen(v === '1'); } catch {} }, [key]);
  const toggle = () => { setOpen((o) => { try { localStorage.setItem(key, o ? '0' : '1'); } catch {} return !o; }); };
  return (
    <>
      <button className="gh" onClick={toggle} aria-expanded={open}>
        <Icon name={open ? 'chevron-down' : 'chevron-right'} size={14} className="mut" />{label}{count != null && <span className="c">{count}</span>}
      </button>
      {open && children}
    </>
  );
}

function LibrarySidebar({ path, onClose }: { path: string; onClose: () => void }) {
  const { live, readNext, collections, collectionBooks, books } = useLibrary();
  const { settings } = useStore();
  const used = books.reduce((s, b) => s + (b.file_size || 0), 0);
  const active = path.startsWith('/book/') ? path.split('/')[2] : '';
  const by = (st: string) => live.filter((b) => b.status === st).sort((a, b) => (b.last_opened_at || b.updated_at).localeCompare(a.last_opened_at || a.updated_at));
  const sections: [string, string, Book[]][] = [['reading', 'Reading', by('reading')], ['completed', 'Completed', by('completed')], ['to_read', 'To Read', by('to_read')], ['paused', 'Paused', by('paused')]];
  return (
    <>
      <div className="stb">
        <h2>Library</h2>
        <button className="ib" aria-label="Add books" onClick={() => openImport('files')}><Icon name="plus" size={16} /></button>
        <Link className="ib" aria-label="Trash" href="/trash"><Icon name="trash" size={16} /></Link>
        <button className="ib" aria-label="Collapse sidebar" onClick={onClose}><Icon name="sidebar" size={16} /></button>
      </div>
      <Group id="readnext" label="Read Next" count={readNext.length}>
        {readNext.length === 0 && <p className="cap" style={{ margin: '0 8px 6px 24px' }}>Mark books as Read Next to keep them here.</p>}
        {readNext.map((b) => <BookRow key={b.id} b={b} active={b.id === active} />)}
      </Group>
      <div style={{ height: 6 }} />
      {sections.map(([id, label, list]) => list.length > 0 && (
        <Group key={id} id={id} label={label} count={list.length} defaultOpen={id !== 'to_read' && id !== 'paused'}>
          {list.slice(0, 60).map((b) => <BookRow key={b.id} b={b} active={b.id === active} />)}
          {list.length > 60 && <Link className="si" href={`/library?status=${id}`}><span className="t muted">Show all {list.length}</span></Link>}
        </Group>
      ))}
      <Group id="collections" label="Collections" count={collections.length} defaultOpen={false}>
        {collections.map((c) => (
          <Link key={c.id} href={`/collections/${c.id}`} className={`si ${path === `/collections/${c.id}` ? 'on' : ''}`}>
            <Icon name="folder" size={15} className="mut" /><span className="t">{c.name}</span>
            <span className="m">{collectionBooks.filter((x) => x.collection_id === c.id).length}</span>
          </Link>
        ))}
        <Link href="/collections/new" className="si"><Icon name="plus" size={15} className="mut" /><span className="t muted">New collection</span></Link>
        <Link href="/explore" className="si"><Icon name="globe" size={15} className="mut" /><span className="t muted">Shared collections</span></Link>
      </Group>
      <Link href="/tags" className={`si ${path === '/tags' ? 'on' : ''}`} style={{ paddingLeft: 8 }}><Icon name="tag" size={15} className="mut" /><span className="t">Tags</span></Link>
      <Link href="/highlights" className={`si ${path === '/highlights' ? 'on' : ''}`} style={{ paddingLeft: 8 }}><Icon name="highlight" size={15} className="mut" /><span className="t">Highlights</span></Link>
      <div style={{ marginTop: 'auto', padding: '10px 8px 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span className="cap">{live.length} books · {bytes(used)} of 1 GB</span>
        <div className="track" style={{ height: 4 }}><i style={{ width: `${Math.min(100, (used / 1073741824) * 100)}%` }} /></div>
        {settings && null}
      </div>
    </>
  );
}

function NotesSidebar({ path, onClose }: { path: string; onClose: () => void }) {
  const { notes, books, createNote } = useStore();
  const router = useRouter();
  const [q, setQ] = useState('');
  const active = path.split('/')[2];
  const filtered = notes.filter((n) => !q || norm(n.title + ' ' + n.body).includes(norm(q)));
  const groups = new Map<string, typeof notes>();
  filtered.forEach((n) => { const k = n.book_id || ''; groups.set(k, [...(groups.get(k) || []), n]); });
  const ordered = Array.from(groups.entries()).sort((a, b) => (a[0] ? 1 : 0) - (b[0] ? 1 : 0) || 0);
  return (
    <>
      <div className="stb">
        <h2>Notes</h2>
        <button className="ib" aria-label="New note" onClick={async () => { const n = await createNote({ title: 'Untitled' }); if (n) router.push(`/notes/${n.id}?edit=1`); }}><Icon name="plus" size={16} /></button>
        <button className="ib" aria-label="Collapse sidebar" onClick={onClose}><Icon name="sidebar" size={16} /></button>
      </div>
      <label className="input" style={{ height: 30, margin: '0 2px 8px', fontSize: 12 }}><Icon name="search" size={14} className="mut" /><input type="search" placeholder="Search notes" aria-label="Search notes" value={q} onChange={(e) => setQ(e.target.value)} /></label>
      {ordered.map(([bookId, list]) => {
        const b = books.find((x) => x.id === bookId);
        return (
          <Group key={bookId || 'none'} id={`notes-${bookId || 'none'}`} label={<><Icon name={b ? (b.file_path ? 'book' : 'book-nofile') : 'note'} size={14} className="mut" /><span className="truncate">{b ? b.title : 'Not linked to a book'}</span></>} count={list.length}>
            {list.sort((x, y) => y.updated_at.localeCompare(x.updated_at)).map((n) => (
              <Link key={n.id} href={`/notes/${n.id}`} className={`si ${active === n.id ? 'on' : ''}`}><Icon name="note" size={15} className={active === n.id ? 'ink' : 'mut'} /><span className="t">{n.title}</span></Link>
            ))}
          </Group>
        );
      })}
      {notes.length === 0 && <p className="cap" style={{ margin: 8 }}>No notes yet. Write one from any book page.</p>}
      <div style={{ marginTop: 'auto', padding: '10px 8px 0' }}><span className="cap">{notes.length} notes</span></div>
    </>
  );
}

const SETTINGS_NAV = [
  ['account', 'Account', 'user'], ['appearance', 'Appearance', 'theme'], ['reading', 'Reading', 'type'], ['library', 'Library and import', 'library'],
  ['sync', 'Sync and storage', 'cloud'], ['privacy', 'Privacy and backup', 'key'],
];

function SettingsSidebar({ path }: { path: string }) {
  const cur = path.split('/')[2] || 'account';
  return (
    <>
      <div className="stb"><h2>Settings</h2></div>
      {SETTINGS_NAV.map(([id, label, icon]) => (
        <Link key={id} href={`/settings/${id}`} className={`si ${cur === id ? 'on' : ''}`} style={{ paddingLeft: 8 }}><Icon name={icon} size={15} className={cur === id ? 'ink' : 'mut'} /><span className="t">{label}</span></Link>
      ))}
    </>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const ok = useAuthGate();
  const { loaded, syncing, online, books } = useStore();
  const path = usePathname() || '/library';
  const router = useRouter();
  const titleFor = useTitleFor();
  const [tabs, setTabs] = useState<string[]>([]);
  const [sideOpen, setSideOpen] = useState(true);
  const [mobileSide, setMobileSide] = useState(false);
  const [importReq, setImportReq] = useState<{ mode: 'files' | 'placeholder'; attachTo?: string } | null>(null);

  useEffect(() => {
    try { setTabs(JSON.parse(localStorage.getItem('orchive-tabs') || '[]')); setSideOpen(localStorage.getItem('orchive-side') !== '0'); } catch {}
    const h = (e: Event) => setImportReq((e as CustomEvent).detail);
    window.addEventListener('orchive:import', h);
    const k = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); router.push('/search'); }
      if ((e.metaKey || e.ctrlKey) && e.key === '\\') { e.preventDefault(); setSideOpen((o) => !o); }
    };
    window.addEventListener('keydown', k);
    return () => { window.removeEventListener('orchive:import', h); window.removeEventListener('keydown', k); };
  }, [router]);

  // keep the current page as a tab
  useEffect(() => {
    setTabs((t) => {
      if (t.includes(path)) return t;
      // settings sections share one tab
      const group = (p: string) => (p.startsWith('/settings') ? '/settings' : p);
      const at = t.findIndex((x) => group(x) === group(path));
      const next = at >= 0 ? t.map((x, i) => (i === at ? path : x)) : [...t, path].slice(-8);
      try { localStorage.setItem('orchive-tabs', JSON.stringify(next)); } catch {}
      return next;
    });
    setMobileSide(false);
  }, [path]);

  const closeTab = (href: string) => {
    const next = tabs.filter((t) => t !== href);
    setTabs(next);
    try { localStorage.setItem('orchive-tabs', JSON.stringify(next)); } catch {}
    if (href === path) router.push(next[next.length - 1] || '/library');
  };
  const toggleSide = () => { setSideOpen((o) => { try { localStorage.setItem('orchive-side', o ? '0' : '1'); } catch {} return !o; }); };

  const sidebar = useMemo(() => {
    if (path.startsWith('/notes')) return <NotesSidebar path={path} onClose={toggleSide} />;
    if (path.startsWith('/settings')) return <SettingsSidebar path={path} />;
    return <LibrarySidebar path={path} onClose={toggleSide} />;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, books]);

  if (!ok || !loaded) return <Loading />;
  const showSide = (sideOpen || mobileSide) && !['/graph', '/timeline', '/goals', '/stats'].some((p) => path.startsWith(p)) || path.startsWith('/settings') || mobileSide;

  return (
    <div className="ws">
      <div className="mobile-top">
        <button className="ib" aria-label="Open sidebar" onClick={() => setMobileSide(true)}><Icon name="menu" size={20} /></button>
        <Mark size={22} /><span className="serif" style={{ fontSize: 17, flex: 1 }}>Orchive</span>
        <Link href="/search" className="ib" aria-label="Search"><Icon name="search" size={20} /></Link>
        <button className="ib" aria-label="Add books" onClick={() => openImport('files')}><Icon name="plus" size={20} /></button>
      </div>
      <Ribbon path={path} />
      {showSide && (
        <>
          {mobileSide && <div className="scrim" style={{ zIndex: 80 }} onClick={() => setMobileSide(false)} />}
          <aside className={`side ${mobileSide ? 'open' : ''}`} aria-label="Sidebar">{sidebar}</aside>
        </>
      )}
      <main className="main">
        <nav className="tabs" aria-label="Open pages">
          {!sideOpen && <button className="ib" aria-label="Show sidebar" onClick={toggleSide} style={{ marginBottom: 4 }}><Icon name="sidebar" size={16} /></button>}
          {tabs.map((t) => {
            const info = titleFor(t);
            const on = t === path;
            return (
              <div key={t} className={`tab ${on ? 'on' : ''}`}>
                <Link href={t} className="row truncate" aria-current={on ? 'page' : undefined} style={{ gap: 8, color: 'inherit', textDecoration: 'none' }}><Icon name={info.icon} size={14} className={on ? 'ink' : 'mut'} /><span className="truncate">{info.title}</span></Link>
                <button className="x" aria-label={`Close ${info.title}`} onClick={() => closeTab(t)}><Icon name="close" size={13} /></button>
              </div>
            );
          })}
        </nav>
        <div className="main-scroll">{children}</div>
        <div className="status hide-sm">
          <span>{!online ? 'Offline: changes will sync when you reconnect' : syncing > 0 ? 'Saving…' : 'Synced'}</span>
        </div>
        <nav className="mobile-nav" aria-label="Main">
          {[['/library', 'library', 'Library'], ['/timeline', 'timeline', 'Timeline'], ['/notes', 'note', 'Notes'], ['/goals', 'goal', 'Goals'], ['/settings', 'menu', 'More']].map(([href, icon, label]) => (
            <Link key={href} href={href} className={path.startsWith(href) ? 'on' : ''}><Icon name={icon} size={22} className={path.startsWith(href) ? 'ink' : 'mut'} />{label}</Link>
          ))}
        </nav>
      </main>
      {importReq && <ImportDialog mode={importReq.mode} attachTo={importReq.attachTo} onClose={() => setImportReq(null)} />}
    </div>
  );
}
