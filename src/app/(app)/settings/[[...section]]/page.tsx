'use client';
import React, { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useLibrary, useStore } from '@/lib/store';
import { sb, BUCKET, deviceLabel } from '@/lib/supabase';
import { Icon } from '@/components/Icon';
import { Seg, Toggle } from '@/components/ui';
import { ACCENTS, allReadingThemes, BUILTIN_APP_THEMES, DEFAULT_READING, DEFAULT_SETTINGS, FONTS, fontCss } from '@/lib/settings';
import { uploadWithProgress } from '@/lib/files';
import { bytes, download, extOf, fmtDate, MONTHS_LONG, relDate } from '@/lib/util';
import type { AppTheme, ReadingSettings } from '@/lib/types';

const TITLES: Record<string, string> = {
  account: 'Account', appearance: 'Appearance', reading: 'Reading', library: 'Library and import',
  sync: 'Sync and storage', goals: 'Goals', privacy: 'Privacy and backup',
};

function Section({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <section className="col" style={{ gap: 4 }}>
      <div className="gh" style={{ padding: '0 0 4px' }}>{title}</div>
      {desc && <p className="cap" style={{ margin: '0 0 6px' }}>{desc}</p>}
      <div className="card" style={{ padding: '4px 16px' }}>{children}</div>
    </section>
  );
}

function Row({ label, hint, children }: { label: string; hint?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="row wrap" style={{ gap: 12, padding: '12px 0', borderBottom: '1px solid var(--border)', justifyContent: 'space-between' }}>
      <div className="col" style={{ gap: 2, minWidth: 180, flex: 1 }}><span style={{ fontSize: 14 }}>{label}</span>{hint && <span className="cap">{hint}</span>}</div>
      <div className="row wrap" style={{ gap: 8 }}>{children}</div>
    </div>
  );
}

function Num({ value, onChange, min, max, step = 1, label, unit }: { value: number; onChange: (v: number) => void; min: number; max: number; step?: number; label: string; unit?: string }) {
  return (
    <div className="row" style={{ gap: 8 }}>
      <input type="range" min={min} max={max} step={step} value={value} aria-label={label} onChange={(e) => onChange(Number(e.target.value))} style={{ width: 140, accentColor: 'var(--primary)' }} />
      <span className="cap" style={{ width: 44, textAlign: 'right' }}>{value}{unit}</span>
    </div>
  );
}

/* ───────── Account ───────── */
function Account() {
  const { auth, displayName, toast } = useStore();
  const router = useRouter();
  const [name, setName] = useState(displayName);
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [email, setEmail] = useState(auth?.user.email || '');
  useEffect(() => setName(displayName), [displayName]);
  const saveName = async () => {
    if (!auth || name === displayName) return;
    const { error } = await sb().from('orchive_profiles').update({ display_name: name.trim() }).eq('id', auth.user.id);
    toast(error ? `Could not save: ${error.message}` : 'Name saved');
  };
  const changePw = async () => {
    if (pw.length < 8) return toast('Use at least 8 characters');
    if (pw !== pw2) return toast('Passwords do not match');
    const { error } = await sb().auth.updateUser({ password: pw });
    if (error) toast(error.message); else { toast('Password changed'); setPw(''); setPw2(''); }
  };
  const changeEmail = async () => {
    if (!email || email === auth?.user.email) return;
    const { error } = await sb().auth.updateUser({ email }, { emailRedirectTo: `${location.origin}/library` });
    toast(error ? error.message : 'Check both inboxes to confirm the change');
  };
  const signOut = async (scope: 'local' | 'global') => { await sb().auth.signOut({ scope }); router.replace('/login'); };
  return (
    <>
      <Section title="Profile">
        <Row label="Display name"><label className="input" style={{ width: 240 }}><input value={name} aria-label="Display name" onChange={(e) => setName(e.target.value)} onBlur={saveName} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} /></label></Row>
        <Row label="Email" hint="A confirmation link is sent to the new address."><label className="input" style={{ width: 240 }}><input type="email" value={email} aria-label="Email" onChange={(e) => setEmail(e.target.value)} /></label><button className="btn sec sm" onClick={changeEmail} disabled={email === auth?.user.email}>Change</button></Row>
        <Row label="Member since">{fmtDate(auth?.user.created_at)}</Row>
      </Section>
      <Section title="Password">
        <Row label="New password"><label className="input" style={{ width: 240 }}><input type="password" autoComplete="new-password" value={pw} aria-label="New password" onChange={(e) => setPw(e.target.value)} /></label></Row>
        <Row label="Confirm password"><label className="input" style={{ width: 240 }}><input type="password" autoComplete="new-password" value={pw2} aria-label="Confirm new password" onChange={(e) => setPw2(e.target.value)} /></label><button className="btn sec sm" onClick={changePw} disabled={!pw}>Update</button></Row>
      </Section>
      <Section title="Sessions">
        <Row label="Sign out of this device"><button className="btn sec sm" onClick={() => signOut('local')}><Icon name="logout" size={14} />Sign out</button></Row>
        <Row label="Sign out everywhere" hint="Ends the session on every phone, tablet and computer."><button className="btn sec sm" onClick={() => signOut('global')}>Sign out everywhere</button></Row>
      </Section>
      <Section title="Delete account">
        <Row label="Account deletion" hint="Not available yet. You can export everything from Privacy and backup at any time." />
      </Section>
    </>
  );
}

/* ───────── Appearance ───────── */
function Appearance() {
  const { settings, saveSettings } = useStore();
  const [hex, setHex] = useState(settings.accent.startsWith('#') ? settings.accent : '#763D82');
  const [draft, setDraft] = useState<AppTheme | null>(null);
  const themes = [...BUILTIN_APP_THEMES, ...settings.customAppThemes];
  return (
    <>
      <Section title="Mode">
        <Row label="App appearance"><Seg label="App appearance" value={settings.mode} onChange={(mode) => saveSettings({ mode, schedule: { ...settings.schedule, on: false } })} options={[{ v: 'light', l: 'Light' }, { v: 'dark', l: 'Dark' }, { v: 'system', l: 'System' }]} /></Row>
        <Row label="Switch to dark on a schedule" hint={settings.schedule.on ? `Dark from ${settings.schedule.from} to ${settings.schedule.to}` : undefined}><Toggle label="Dark on a schedule" on={settings.schedule.on} onChange={(on) => saveSettings({ schedule: { ...settings.schedule, on } })} /></Row>
        {settings.schedule.on && <Row label="Dark between">
          <label className="input" style={{ width: 120 }}><input type="time" aria-label="Dark from" value={settings.schedule.from} onChange={(e) => saveSettings({ schedule: { ...settings.schedule, from: e.target.value } })} /></label>
          <span className="cap">and</span>
          <label className="input" style={{ width: 120 }}><input type="time" aria-label="Dark until" value={settings.schedule.to} onChange={(e) => saveSettings({ schedule: { ...settings.schedule, to: e.target.value } })} /></label>
        </Row>}
      </Section>
      <Section title="Accent colour" desc="Used sparingly — for the current selection, primary buttons and progress.">
        <Row label="Preset">
          {ACCENTS.map((a) => (
            <button key={a.id} className={`chip ${settings.accent === a.id ? 'on' : ''}`} onClick={() => saveSettings({ accent: a.id, appThemeId: 'orchive' })} aria-pressed={settings.accent === a.id}>
              <span style={{ width: 12, height: 12, borderRadius: '50%', background: a.light, border: '1px solid var(--border)' }} />{a.name}
            </button>
          ))}
        </Row>
        <Row label="Custom colour" hint="Any colour; Orchive keeps text on it readable.">
          <input type="color" value={hex} aria-label="Custom accent colour" onChange={(e) => setHex(e.target.value.toUpperCase())} style={{ width: 36, height: 32, border: 0, background: 'none' }} />
          <label className="input" style={{ width: 110 }}><input value={hex} aria-label="Hex value" onChange={(e) => setHex(e.target.value)} /></label>
          <button className="btn sec sm" disabled={!/^#[0-9a-f]{6}$/i.test(hex)} onClick={() => saveSettings({ accent: hex.toUpperCase(), appThemeId: 'orchive' })}>Use</button>
        </Row>
      </Section>
      <Section title="App themes" desc="A theme sets the background, surfaces and accent together.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10, padding: '12px 0' }}>
          {themes.map((t) => (
            <div key={t.id} className="col" style={{ gap: 6 }}>
              <button onClick={() => saveSettings({ appThemeId: t.id })} aria-pressed={settings.appThemeId === t.id} aria-label={`Use ${t.name} theme`} style={{ height: 70, borderRadius: 10, background: t.bg, border: `2px solid ${settings.appThemeId === t.id ? 'var(--primary)' : 'var(--border)'}`, padding: 8, display: 'flex', gap: 6, cursor: 'pointer' }}>
                <span style={{ flex: 1, borderRadius: 6, background: t.surface }} /><span style={{ width: 14, height: 14, borderRadius: '50%', background: t.primary, alignSelf: 'flex-end' }} />
              </button>
              <div className="row" style={{ fontSize: 13 }}><span className="grow truncate">{t.name}</span>
                {!t.builtin && <><button className="ib" aria-label={`Edit ${t.name}`} onClick={() => setDraft(t)}><Icon name="edit" size={13} /></button>
                  <button className="ib" aria-label={`Delete ${t.name}`} onClick={() => saveSettings({ customAppThemes: settings.customAppThemes.filter((x) => x.id !== t.id), appThemeId: settings.appThemeId === t.id ? 'orchive' : settings.appThemeId })}><Icon name="trash" size={13} /></button></>}
              </div>
            </div>
          ))}
          <button className="col" onClick={() => setDraft({ id: `t${Date.now()}`, name: 'My theme', primary: '#763D82', bg: '#F4F2F1', surface: '#FFFFFF' })} style={{ height: 70, borderRadius: 10, border: '1.5px dashed var(--border-control)', background: 'none', alignItems: 'center', justifyContent: 'center', gap: 4, color: 'var(--ink-secondary)', cursor: 'pointer', font: 'inherit', fontSize: 13 }}><Icon name="plus" size={16} />New theme</button>
        </div>
        {draft && (
          <div className="col" style={{ gap: 8, padding: '12px 0', borderTop: '1px solid var(--border)' }}>
            <Row label="Name"><label className="input" style={{ width: 200 }}><input value={draft.name} aria-label="Theme name" onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label></Row>
            {(['bg', 'surface', 'primary'] as const).map((k) => (
              <Row key={k} label={k === 'bg' ? 'Background' : k === 'surface' ? 'Surface' : 'Accent'}><input type="color" aria-label={k} value={draft[k]} onChange={(e) => setDraft({ ...draft, [k]: e.target.value.toUpperCase() })} style={{ width: 36, height: 30, border: 0, background: 'none' }} /><span className="cap">{draft[k]}</span></Row>
            ))}
            <div className="row" style={{ justifyContent: 'flex-end', gap: 8, paddingTop: 8 }}>
              <button className="btn ghost sm" onClick={() => setDraft(null)}>Cancel</button>
              <button className="btn pri sm" onClick={() => { const rest = settings.customAppThemes.filter((x) => x.id !== draft.id); saveSettings({ customAppThemes: [...rest, draft], appThemeId: draft.id }); setDraft(null); }}>Save and use</button>
            </div>
          </div>
        )}
      </Section>
      <Section title="Interface">
        <Row label="Match the reading theme" hint="While reading, the app chrome takes on the colours of the page."><Toggle label="Match the reading theme" on={settings.matchReadingTheme} onChange={(v) => saveSettings({ matchReadingTheme: v })} /></Row>
        <Row label="Interface size"><Seg label="Interface size" value={settings.uiScale} onChange={(uiScale) => saveSettings({ uiScale })} options={[{ v: 'small', l: 'Small' }, { v: 'default', l: 'Default' }, { v: 'large', l: 'Large' }]} /></Row>
        <Row label="Reset appearance" hint="Back to Orchid accent, system mode, default size."><button className="btn sec sm" onClick={() => saveSettings({ mode: DEFAULT_SETTINGS.mode, schedule: DEFAULT_SETTINGS.schedule, accent: DEFAULT_SETTINGS.accent, appThemeId: DEFAULT_SETTINGS.appThemeId, matchReadingTheme: false, uiScale: 'default' })}>Reset</button></Row>
      </Section>
    </>
  );
}

/* ───────── Reading defaults ───────── */
function Reading() {
  const { settings, saveSettings, auth, toast } = useStore();
  const r = settings.reading;
  const set = (patch: Partial<ReadingSettings>) => saveSettings({ reading: { ...r, ...patch } });
  const themes = allReadingThemes(settings);
  const fileRef = useRef<HTMLInputElement>(null);
  const [upl, setUpl] = useState<number | null>(null);
  const addFont = async (file: File) => {
    if (!auth) return;
    const ext = extOf(file.name);
    if (!['ttf', 'otf', 'woff', 'woff2'].includes(ext)) return toast('Use a .ttf, .otf, .woff or .woff2 file');
    const name = file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim();
    const path = `${auth.user.id}/fonts/${Date.now()}-${file.name.replace(/[^\w.-]+/g, '_')}`;
    setUpl(0);
    try {
      await uploadWithProgress(path, file, `font/${ext}`, setUpl).promise;
      await saveSettings({ customFonts: [...settings.customFonts.filter((f) => f.name !== name), { name, path }] });
      toast(`${name} added`);
    } catch (e: any) { toast(`Upload failed: ${e?.message || e}`); }
    setUpl(null);
  };
  const removeFont = async (f: { name: string; path: string }) => {
    await sb().storage.from(BUCKET).remove([f.path]);
    saveSettings({ customFonts: settings.customFonts.filter((x) => x.path !== f.path), reading: r.font === f.name ? { ...r, font: DEFAULT_READING.font } : r });
  };
  return (
    <>
      <p className="cap" style={{ margin: 0 }}>Defaults for every book. A book can keep its own settings — choose “This book” in the reader’s settings panel.</p>
      <Section title="Theme">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(92px, 1fr))', gap: 10, padding: '12px 0' }}>
          {themes.map((t) => (
            <button key={t.id} onClick={() => set({ theme: t.id })} aria-pressed={r.theme === t.id} style={{ height: 64, borderRadius: 10, background: t.bg, color: t.ink, border: `2px solid ${r.theme === t.id ? 'var(--primary)' : 'var(--border)'}`, fontFamily: fontCss(settings, r.font), fontSize: 13, cursor: 'pointer' }}>Aa<br /><span style={{ fontSize: 11, opacity: 0.8 }}>{t.name}</span></button>
          ))}
        </div>
        <Row label="Night theme on a schedule" hint={r.nightSchedule ? `${r.nightFrom}–${r.nightTo}` : 'Make your own themes from the reader’s settings panel.'}><Toggle label="Night theme on a schedule" on={r.nightSchedule} onChange={(v) => set({ nightSchedule: v })} /></Row>
        {r.nightSchedule && <Row label="Night theme">
          <select className="input" style={{ width: 140 }} aria-label="Night theme" value={r.nightTheme} onChange={(e) => set({ nightTheme: e.target.value })}>{themes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
          <label className="input" style={{ width: 110 }}><input type="time" aria-label="Night from" value={r.nightFrom} onChange={(e) => set({ nightFrom: e.target.value })} /></label>
          <label className="input" style={{ width: 110 }}><input type="time" aria-label="Night until" value={r.nightTo} onChange={(e) => set({ nightTo: e.target.value })} /></label>
        </Row>}
        <Row label="PDF theme"><select className="input" style={{ width: 140 }} aria-label="PDF theme" value={r.pdfTheme} onChange={(e) => set({ pdfTheme: e.target.value })}>{themes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Row>
        <Row label="Invert PDF pages in dark themes"><Toggle label="Invert PDF pages" on={r.invertPdf} onChange={(v) => set({ invertPdf: v })} /></Row>
      </Section>
      <Section title="Text">
        <Row label="Font">
          <select className="input" style={{ width: 200 }} aria-label="Font" value={r.font} onChange={(e) => set({ font: e.target.value })}>
            {FONTS.map((f) => <option key={f.name} value={f.name}>{f.name}</option>)}
            {settings.customFonts.map((f) => <option key={f.path} value={f.name}>{f.name} (yours)</option>)}
          </select>
        </Row>
        <Row label="Size"><Num label="Font size" value={r.fontSize} min={12} max={32} onChange={(v) => set({ fontSize: v })} unit="px" /></Row>
        <Row label="Weight"><Num label="Font weight" value={r.fontWeight} min={300} max={700} step={100} onChange={(v) => set({ fontWeight: v })} /></Row>
        <Row label="Line spacing"><Num label="Line spacing" value={r.lineHeight} min={1.1} max={2.4} step={0.1} onChange={(v) => set({ lineHeight: v })} /></Row>
        <Row label="Paragraph spacing"><Num label="Paragraph spacing" value={r.paragraphSpacing} min={0} max={2} step={0.1} onChange={(v) => set({ paragraphSpacing: v })} unit="em" /></Row>
        <Row label="Letter spacing"><Num label="Letter spacing" value={r.letterSpacing} min={-0.05} max={0.15} step={0.01} onChange={(v) => set({ letterSpacing: v })} unit="em" /></Row>
        <Row label="First-line indent"><Num label="Indent" value={r.indent} min={0} max={3} step={0.5} onChange={(v) => set({ indent: v })} unit="em" /></Row>
        <Row label="Alignment"><Seg label="Alignment" value={r.align} onChange={(align) => set({ align })} options={[{ v: 'left', l: 'Left' }, { v: 'justify', l: 'Justified' }]} /></Row>
        <Row label="Hyphenation"><Toggle label="Hyphenation" on={r.hyphenate} onChange={(v) => set({ hyphenate: v })} /></Row>
        <Row label="Override publisher styles" hint="Apply your font and spacing even where the book sets its own."><Toggle label="Override publisher styles" on={r.overrideStyles} onChange={(v) => set({ overrideStyles: v })} /></Row>
        <div style={{ padding: '14px 0', fontFamily: fontCss(settings, r.font), fontSize: r.fontSize, fontWeight: r.fontWeight, lineHeight: r.lineHeight, letterSpacing: `${r.letterSpacing}em`, textAlign: r.align, textIndent: `${r.indent}em`, hyphens: r.hyphenate ? 'auto' : 'manual' }} lang="en">
          It was a bright cold day in April, and the reading lamp had been on since morning. Somewhere between chapters the tea went cold, and nobody minded at all.
        </div>
      </Section>
      <Section title="Your fonts" desc="Upload a font file once and use it on every device.">
        {settings.customFonts.length === 0 && <Row label="No fonts uploaded yet" />}
        {settings.customFonts.map((f) => <Row key={f.path} label={f.name}><button className="btn ghost sm" onClick={() => removeFont(f)}><Icon name="trash" size={14} />Remove</button></Row>)}
        <Row label="Add a font" hint=".ttf, .otf, .woff or .woff2">
          {upl != null && <span className="cap">{Math.round(upl * 100)}%</span>}
          <input ref={fileRef} type="file" hidden accept=".ttf,.otf,.woff,.woff2" onChange={(e) => { const f = e.target.files?.[0]; if (f) addFont(f); e.target.value = ''; }} />
          <button className="btn sec sm" disabled={upl != null} onClick={() => fileRef.current?.click()}><Icon name="upload" size={14} />Upload font</button>
        </Row>
      </Section>
      <Section title="Layout and navigation">
        <Row label="Page turning"><Seg label="Page turning" value={r.flow} onChange={(flow) => set({ flow })} options={[{ v: 'paginated', l: 'Pages' }, { v: 'scrolled', l: 'Scroll' }]} /></Row>
        <Row label="Two pages side by side on wide screens"><Toggle label="Two-page spread" on={r.twoPage} onChange={(v) => set({ twoPage: v })} /></Row>
        <Row label="Page animation"><Toggle label="Page animation" on={r.animation} onChange={(v) => set({ animation: v })} /></Row>
        <Row label="Side margins"><Num label="Side margins" value={r.marginSide} min={0} max={120} step={4} onChange={(v) => set({ marginSide: v })} unit="px" /></Row>
        <Row label="Top and bottom margins"><Num label="Top margin" value={r.marginTop} min={0} max={100} step={4} onChange={(v) => set({ marginTop: v, marginBottom: v })} unit="px" /></Row>
        <Row label="Tap zones" hint="Tap the edges of the page to turn it."><Seg label="Tap zones" value={r.tapZones} onChange={(tapZones) => set({ tapZones })} options={[{ v: 'sides', l: 'Sides' }, { v: 'thirds', l: 'Thirds' }, { v: 'off', l: 'Off' }]} /></Row>
        <Row label="Auto-scroll speed"><Num label="Auto-scroll speed" value={r.autoScrollSpeed} min={1} max={10} onChange={(v) => set({ autoScrollSpeed: v })} /></Row>
        <Row label="Keep the screen awake while reading"><Toggle label="Keep screen awake" on={r.keepAwake} onChange={(v) => set({ keepAwake: v })} /></Row>
        <Row label="Reset reading defaults"><button className="btn sec sm" onClick={() => saveSettings({ reading: DEFAULT_READING })}>Reset</button></Row>
      </Section>
    </>
  );
}

/* ───────── Library ───────── */
function LibrarySettings() {
  const { settings, saveSettings } = useStore();
  return (
    <>
      <Section title="Importing">
        <Row label="Add imported books to Read Next"><Toggle label="Add imports to Read Next" on={settings.addImportsToReadNext} onChange={(v) => saveSettings({ addImportsToReadNext: v })} /></Row>
        <Row label="When a file is already in your library" hint="Duplicates are found by file contents, not just the name."><Seg label="Duplicate handling" value={settings.autoUploadDuplicates} onChange={(autoUploadDuplicates) => saveSettings({ autoUploadDuplicates })} options={[{ v: 'skip', l: 'Skip it' }, { v: 'ask', l: 'Ask me' }]} /></Row>
        <Row label="Supported formats" hint="EPUB, PDF, MOBI, AZW3, FB2, CBZ, DOCX, DOC, RTF, ODT, TXT, Markdown, HTML and ZIP open in the reader. DjVu and CHM are stored and can be downloaded." />
        <Row label="File size limit" hint="Up to 50 MB per file." />
      </Section>
      <Section title="Library view">
        <Row label="Default sort">
          <select className="input" style={{ width: 200 }} aria-label="Default sort" value={settings.librarySort} onChange={(e) => saveSettings({ librarySort: e.target.value })}>
            <option value="opened">Recently opened</option><option value="added">Recently added</option><option value="title">Title</option><option value="author">Author</option><option value="progress">Progress</option><option value="rating">Rating</option>
          </select>
        </Row>
        <Row label="Default view"><Seg label="Default view" value={settings.libraryView} onChange={(libraryView) => saveSettings({ libraryView })} options={[{ v: 'list', l: 'List' }, { v: 'covers', l: 'Covers' }]} /></Row>
      </Section>
      <Section title="Organise">
        <Row label="Tags"><Link className="btn sec sm" href="/tags">Manage tags</Link></Row>
        <Row label="Collections"><Link className="btn sec sm" href="/collections/new">New collection</Link></Row>
        <Row label="Trash" hint="Books in the trash keep their notes and highlights until you delete them for good."><Link className="btn sec sm" href="/trash">Open trash</Link></Row>
      </Section>
    </>
  );
}

/* ───────── Sync ───────── */
function Sync() {
  const { auth, online, syncing, refresh, toast, settings } = useStore();
  const { live, books } = useLibrary();
  const [last, setLast] = useState<Date>(new Date());
  const [fontBytes, setFontBytes] = useState(0);
  const used = books.reduce((a, b) => a + (b.file_path ? b.file_size || 0 : 0), 0) + fontBytes;
  const quota = 1024 ** 3;
  useEffect(() => {
    if (!auth) return;
    sb().storage.from(BUCKET).list(`${auth.user.id}/fonts`, { limit: 200 }).then(({ data }) => setFontBytes((data || []).reduce((a, f: any) => a + (f.metadata?.size || 0), 0)));
  }, [auth, settings.customFonts.length]);
  const biggest = [...live].filter((b) => b.file_path).sort((a, b) => (b.file_size || 0) - (a.file_size || 0)).slice(0, 5);
  return (
    <>
      <Section title="Sync">
        <Row label="Status" hint={online ? (syncing ? 'Saving changes…' : 'Changes save instantly and appear on your other devices.') : 'Offline — reconnect to save changes.'}>
          <span className="row" style={{ gap: 6, fontSize: 13 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: online ? 'var(--rating-4)' : 'var(--ink-muted)' }} />{online ? 'Connected' : 'Offline'}</span>
        </Row>
        <Row label="This device" hint="Shown when another device has a newer reading position.">{deviceLabel()}</Row>
        <Row label="Last refreshed" hint={relDate(last.toISOString())}><button className="btn sec sm" onClick={async () => { await refresh(); setLast(new Date()); toast('Library refreshed'); }}><Icon name="history" size={14} />Sync now</button></Row>
      </Section>
      <Section title="Storage" desc="Book files and fonts are stored in your private cloud space.">
        <div className="col" style={{ gap: 8, padding: '14px 0' }}>
          <div className="row" style={{ fontSize: 14 }}><span className="grow">{bytes(used)} used</span><span className="cap">shared 1 GB project limit</span></div>
          <div className="track"><i style={{ width: `${Math.min(100, (used / quota) * 100)}%`, background: 'var(--primary)' }} /></div>
          <span className="cap">{live.filter((b) => b.file_path).length} files · {live.filter((b) => !b.file_path).length} books without a file · {settings.customFonts.length} fonts</span>
        </div>
        {biggest.length > 0 && <div style={{ borderTop: '1px solid var(--border)', padding: '8px 0' }}>
          <div className="cap" style={{ padding: '4px 0' }}>Largest files</div>
          {biggest.map((b) => <Link key={b.id} href={`/book/${b.id}`} className="row" style={{ fontSize: 13, padding: '5px 0', color: 'inherit', textDecoration: 'none' }}><span className="grow truncate">{b.title}</span><span className="cap">{bytes(b.file_size)}</span></Link>)}
        </div>}
      </Section>
    </>
  );
}

/* ───────── Goals ───────── */
function GoalsSettings() {
  const { goals, setGoal } = useStore();
  const y = new Date().getFullYear();
  const yg = goals.find((g) => g.year === y && g.month == null)?.target ?? null;
  const [v, setV] = useState(yg ? String(yg) : '');
  useEffect(() => setV(yg ? String(yg) : ''), [yg]);
  return (
    <>
      <Section title={`${y}`}>
        <Row label="Books to finish this year">
          <label className="input" style={{ width: 100 }}><input type="number" min={1} aria-label="Yearly goal" value={v} onChange={(e) => setV(e.target.value)} onBlur={() => setGoal(y, null, v ? Math.max(1, Math.round(Number(v))) : null)} /></label>
        </Row>
        <Row label="Monthly goals" hint={`Set per month, including ${MONTHS_LONG[new Date().getMonth()]}.`}><Link href="/goals" className="btn sec sm">Open goals</Link></Row>
        <Row label="What counts" hint="A book counts in the month you mark it completed. Rereads count again each time you finish." />
      </Section>
    </>
  );
}

/* ───────── Privacy & backup ───────── */
const TABLES = ['orchive_books', 'orchive_tags', 'orchive_book_tags', 'orchive_collections', 'orchive_collection_books', 'orchive_notes', 'orchive_annotations', 'orchive_reading_sessions', 'orchive_goals'] as const;
const CONFLICT: Record<string, string> = { orchive_book_tags: 'book_id,tag_id', orchive_collection_books: 'collection_id,book_id' };

function Privacy() {
  const { auth, settings, toast, refresh, collections, updateCollection, books } = useStore();
  const [busy, setBusy] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const exportAll = async () => {
    if (!auth) return;
    setBusy('export');
    const out: Record<string, unknown> = { app: 'orchive', version: 1, exported_at: new Date().toISOString(), settings };
    for (const t of TABLES) {
      const all: unknown[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await sb().from(t).select('*').range(from, from + 999);
        if (error) { toast(`Export failed: ${error.message}`); setBusy(null); return; }
        all.push(...(data || []));
        if (!data || data.length < 1000) break;
      }
      out[t.replace('orchive_', '')] = all;
    }
    download(`orchive-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(out, null, 2), 'application/json');
    setBusy(null);
  };
  const restore = async (file: File) => {
    if (!auth) return;
    setBusy('restore');
    try {
      const data = JSON.parse(await file.text());
      if (data.app !== 'orchive') throw new Error('This is not an Orchive backup');
      const uid = auth.user.id;
      let n = 0;
      for (const t of TABLES) {
        const rows = (data[t.replace('orchive_', '')] || []) as Record<string, unknown>[];
        for (let i = 0; i < rows.length; i += 500) {
          const chunk = rows.slice(i, i + 500).map((r) => ({ ...r, user_id: uid }));
          const { error } = await sb().from(t).upsert(chunk, CONFLICT[t] ? { onConflict: CONFLICT[t] } : undefined);
          if (error) throw new Error(`${t.replace('orchive_', '')}: ${error.message}`);
          n += chunk.length;
        }
      }
      if (data.settings) await sb().from('orchive_profiles').update({ settings: data.settings }).eq('id', uid);
      await refresh();
      toast(`Restored ${n} items`);
    } catch (e: any) { toast(`Restore failed: ${e?.message || e}`); }
    setBusy(null);
  };
  const exportCsv = () => {
    const cols = ['title', 'author', 'series', 'status', 'rating', 'progress', 'started_at', 'completed_at', 'format', 'file_name'] as const;
    const esc = (v: unknown) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const csv = [cols.join(','), ...books.filter((b) => !b.deleted_at).map((b) => cols.map((c) => esc(b[c])).join(','))].join('\n');
    download('orchive-library.csv', csv, 'text/csv');
  };
  const publicOnes = collections.filter((c) => c.is_public);
  return (
    <>
      <Section title="Backup" desc="Your library, tags, collections, notes, highlights, sessions, goals and settings. Book files are not included — download those from each book.">
        <Row label="Export everything" hint="A single JSON file you can keep or restore later."><button className="btn sec sm" disabled={!!busy} onClick={exportAll}><Icon name="download" size={14} />{busy === 'export' ? 'Exporting…' : 'Export JSON'}</button></Row>
        <Row label="Export library list" hint="Titles, authors, status and ratings as a spreadsheet."><button className="btn sec sm" onClick={exportCsv}><Icon name="download" size={14} />Export CSV</button></Row>
        <Row label="Restore from backup" hint="Adds and updates items from the file. Nothing is deleted.">
          <input ref={fileRef} type="file" hidden accept="application/json,.json" onChange={(e) => { const f = e.target.files?.[0]; if (f) restore(f); e.target.value = ''; }} />
          <button className="btn sec sm" disabled={!!busy} onClick={() => fileRef.current?.click()}><Icon name="upload" size={14} />{busy === 'restore' ? 'Restoring…' : 'Restore'}</button>
        </Row>
        <Row label="Highlights and notes" hint="Export as Markdown, text or PDF."><Link href="/highlights" className="btn sec sm">Open highlights</Link></Row>
      </Section>
      <Section title="Privacy">
        <Row label="Your library is private" hint="Only you can see your books, notes and highlights. Book files are stored privately and opened with short-lived links." />
        <Row label="Public collections" hint={publicOnes.length ? 'Anyone with the link can see these collections and the titles in them.' : 'None of your collections are shared.'} />
        {publicOnes.map((c) => <Row key={c.id} label={c.name}><Link href={`/collections/${c.id}`} className="btn ghost sm">Open</Link><button className="btn sec sm" onClick={() => updateCollection(c.id, { is_public: false })}>Make private</button></Row>)}
        <Row label="Looking words up" hint="Define sends the word to dictionaryapi.dev; Translate, Wikipedia and web search open in a new tab." />
      </Section>
    </>
  );
}

export default function SettingsPage() {
  const params = useParams<{ section?: string[] }>();
  const section = params.section?.[0] || 'account';
  const body = section === 'appearance' ? <Appearance /> : section === 'reading' ? <Reading /> : section === 'library' ? <LibrarySettings /> : section === 'sync' ? <Sync /> : section === 'goals' ? <GoalsSettings /> : section === 'privacy' ? <Privacy /> : <Account />;
  return (
    <div className="page" style={{ maxWidth: 760 }}>
      <h1 className="page-title">{TITLES[section] || 'Settings'}</h1>
      {body}
    </div>
  );
}
