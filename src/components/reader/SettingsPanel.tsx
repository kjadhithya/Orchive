'use client';
import React, { useState } from 'react';
import { Seg, Toggle } from '../ui';
import { Icon } from '../Icon';
import type { AppSettings, ReadingSettings, ReadingTheme } from '@/lib/types';
import { allReadingThemes, DEFAULT_READING, FONTS } from '@/lib/settings';
import type { PdfView } from './PdfReader';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="row" style={{ justifyContent: 'space-between', gap: 12, fontSize: 13, minHeight: 32 }}><span>{label}</span><div className="row" style={{ gap: 6 }}>{children}</div></div>;
}

function Stepper({ value, onChange, step, min, max, fmt, label }: { value: number; onChange: (v: number) => void; step: number; min: number; max: number; fmt?: (v: number) => string; label: string }) {
  const clamp = (v: number) => Math.round(Math.min(max, Math.max(min, v)) * 100) / 100;
  return (
    <div className="row" style={{ gap: 2, borderRadius: 8, background: 'var(--surface-alt)', padding: 2 }}>
      <button className="ib" aria-label={`Decrease ${label}`} onClick={() => onChange(clamp(value - step))}><Icon name="minus" size={14} /></button>
      <span style={{ minWidth: 40, textAlign: 'center', fontSize: 13, fontWeight: 500 }}>{fmt ? fmt(value) : value}</span>
      <button className="ib" aria-label={`Increase ${label}`} onClick={() => onChange(clamp(value + step))}><Icon name="plus" size={14} /></button>
    </div>
  );
}

export function ReaderSettingsPanel({ settings, reading, scope, setScope, onChange, onSaveTheme, onDeleteTheme, isPdf, pdfView, setPdfView, onAutoCrop, reflow, setReflow, onClose }: {
  settings: AppSettings; reading: ReadingSettings; scope: 'book' | 'all'; setScope: (s: 'book' | 'all') => void;
  onChange: (patch: Partial<ReadingSettings>) => void; onSaveTheme: (t: ReadingTheme) => void; onDeleteTheme: (id: string) => void;
  isPdf: boolean; pdfView: PdfView; setPdfView: (v: Partial<PdfView>) => void; onAutoCrop: () => void; reflow: boolean; setReflow: (v: boolean) => void; onClose: () => void;
}) {
  const [tab, setTab] = useState<'theme' | 'text' | 'layout' | 'pdf'>(isPdf && !reflow ? 'pdf' : 'theme');
  const [draft, setDraft] = useState<ReadingTheme | null>(null);
  const themes = allReadingThemes(settings);
  const textTabs = !isPdf || reflow;
  return (
    <section aria-label="Reading settings" className="card" style={{ position: 'absolute', top: 52, right: 12, width: 340, maxWidth: 'calc(100vw - 24px)', maxHeight: 'calc(100% - 64px)', overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12, boxShadow: 'var(--shadow-pop)', zIndex: 30 }}>
      <div className="row"><Seg label="Settings section" value={tab} onChange={setTab} options={[...(isPdf ? [{ v: 'pdf' as const, l: 'PDF' }] : []), { v: 'theme', l: 'Theme' }, ...(textTabs ? [{ v: 'text' as const, l: 'Text' }] : []), { v: 'layout', l: 'Layout' }]} /><span className="grow" /><button className="ib" aria-label="Close settings" onClick={onClose}><Icon name="close" size={15} /></button></div>

      {tab === 'theme' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
            {themes.map((t) => (
              <button key={t.id} onClick={() => onChange({ theme: t.id })} aria-pressed={reading.theme === t.id} style={{ border: 0, background: 'none', padding: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, fontSize: 12, color: reading.theme === t.id ? 'var(--ink)' : 'var(--ink-secondary)', fontWeight: reading.theme === t.id ? 600 : 400 }}>
                <span style={{ width: 42, height: 42, borderRadius: '50%', background: t.bg, color: t.ink, display: 'grid', placeItems: 'center', fontFamily: 'var(--font-read)', fontSize: 15, boxShadow: reading.theme === t.id ? '0 0 0 2px var(--surface), 0 0 0 4px var(--ink)' : 'inset 0 0 0 1px rgba(127,127,127,.35)' }}>Aa</span>
                {t.name}
              </button>
            ))}
            <button onClick={() => setDraft({ id: `custom-${Date.now()}`, name: 'My theme', bg: '#F4EFEA', ink: '#2B2522', link: '#763D82', highlight: '#E9D8EE', texture: 'none' })} style={{ border: 0, background: 'none', padding: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--ink-secondary)' }}>
              <span style={{ width: 42, height: 42, borderRadius: '50%', border: '1.5px dashed var(--border-control)', display: 'grid', placeItems: 'center' }}><Icon name="plus" size={16} /></span>New
            </button>
          </div>
          {themes.find((t) => t.id === reading.theme && !t.builtin) && !draft && (
            <div className="row"><button className="btn ghost sm" onClick={() => setDraft(themes.find((t) => t.id === reading.theme)!)}>Edit theme</button><button className="btn ghost sm" style={{ color: 'var(--danger)' }} onClick={() => onDeleteTheme(reading.theme)}>Delete theme</button></div>
          )}
          {draft && (
            <div className="col" style={{ gap: 8, padding: 10, borderRadius: 10, background: 'var(--sidebar)' }}>
              <input className="text-input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} aria-label="Theme name" />
              {(['bg', 'ink', 'link', 'highlight'] as const).map((k) => (
                <Row key={k} label={{ bg: 'Background', ink: 'Text', link: 'Links', highlight: 'Selection' }[k]}><input type="color" value={draft[k]} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} aria-label={k} /></Row>
              ))}
              <Row label="Texture"><select className="chip out" value={draft.texture || 'none'} onChange={(e) => setDraft({ ...draft, texture: e.target.value as ReadingTheme['texture'] })}><option value="none">None</option><option value="paper">Paper</option><option value="linen">Linen</option></select></Row>
              <div style={{ padding: 10, borderRadius: 8, background: draft.bg, color: draft.ink, fontFamily: 'var(--font-read)' }}>The quick brown fox <span style={{ color: draft.link }}>jumps</span> <span style={{ background: draft.highlight }}>over</span> the lazy dog.</div>
              <div className="row"><span className="grow" /><button className="btn ghost sm" onClick={() => setDraft(null)}>Cancel</button><button className="btn sec sm" onClick={() => { onSaveTheme(draft); onChange({ theme: draft.id }); setDraft(null); }}>Save theme</button></div>
            </div>
          )}
          <Row label="Brightness"><input type="range" min={0} max={0.7} step={0.05} value={reading.dim} onChange={(e) => onChange({ dim: Number(e.target.value) })} aria-label="Dim screen" style={{ width: 140, direction: 'rtl' }} /></Row>
          <Row label="Warm light"><input type="range" min={0} max={1} step={0.05} value={reading.warmth} onChange={(e) => onChange({ warmth: Number(e.target.value) })} aria-label="Warm light" style={{ width: 140 }} /></Row>
          <Row label="Night theme on a schedule"><Toggle on={reading.nightSchedule} onChange={(v) => onChange({ nightSchedule: v })} label="Night theme on a schedule" /></Row>
          {reading.nightSchedule && (
            <Row label="From / to">
              <input type="time" className="chip out" value={reading.nightFrom} onChange={(e) => onChange({ nightFrom: e.target.value })} aria-label="Night from" />
              <input type="time" className="chip out" value={reading.nightTo} onChange={(e) => onChange({ nightTo: e.target.value })} aria-label="Night to" />
              <select className="chip out" value={reading.nightTheme} onChange={(e) => onChange({ nightTheme: e.target.value })} aria-label="Night theme">{themes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
            </Row>
          )}
          {isPdf && <Row label="Invert PDF colours"><Toggle on={reading.invertPdf} onChange={(v) => onChange({ invertPdf: v })} label="Invert PDF colours" /></Row>}
        </>
      )}

      {tab === 'text' && (
        <>
          <Row label="Font">
            <select className="chip out" value={reading.font} onChange={(e) => onChange({ font: e.target.value })} aria-label="Font">
              {FONTS.map((f) => <option key={f.name} value={f.name}>{f.name}</option>)}
              {settings.customFonts.map((f) => <option key={f.name} value={f.name}>{f.name} (yours)</option>)}
            </select>
          </Row>
          <Row label="Size"><Stepper label="size" value={reading.fontSize} step={1} min={12} max={36} onChange={(v) => onChange({ fontSize: v })} /></Row>
          <Row label="Bold text"><Toggle on={reading.fontWeight >= 600} onChange={(v) => onChange({ fontWeight: v ? 600 : 400 })} label="Bold text" /></Row>
          <Row label="Line spacing"><Stepper label="line spacing" value={reading.lineHeight} step={0.1} min={1} max={2.6} onChange={(v) => onChange({ lineHeight: v })} /></Row>
          <Row label="Paragraph spacing"><Stepper label="paragraph spacing" value={reading.paragraphSpacing} step={0.2} min={0} max={3} onChange={(v) => onChange({ paragraphSpacing: v })} /></Row>
          <Row label="Letter spacing"><Stepper label="letter spacing" value={reading.letterSpacing} step={0.01} min={-0.05} max={0.2} fmt={(v) => v.toFixed(2)} onChange={(v) => onChange({ letterSpacing: v })} /></Row>
          <Row label="Paragraph indent"><Stepper label="indent" value={reading.indent} step={0.5} min={0} max={4} onChange={(v) => onChange({ indent: v })} /></Row>
          <Row label="Alignment"><Seg label="Alignment" value={reading.align} onChange={(v) => onChange({ align: v })} options={[{ v: 'left', l: 'Left' }, { v: 'justify', l: 'Justified' }]} /></Row>
          <Row label="Hyphenation"><Toggle on={reading.hyphenate} onChange={(v) => onChange({ hyphenate: v })} label="Hyphenation" /></Row>
          <Row label="Use my styles over the book’s"><Toggle on={reading.overrideStyles} onChange={(v) => onChange({ overrideStyles: v })} label="Override book styles" /></Row>
        </>
      )}

      {tab === 'layout' && (
        <>
          <Row label="Layout"><Seg label="Layout" value={reading.flow} onChange={(v) => onChange({ flow: v })} options={[{ v: 'paginated', l: 'Pages' }, { v: 'scrolled', l: 'Scroll' }]} /></Row>
          {!isPdf && <Row label="Two pages on wide screens"><Toggle on={reading.twoPage} onChange={(v) => onChange({ twoPage: v })} label="Two pages" /></Row>}
          <Row label="Page animation"><Toggle on={reading.animation} onChange={(v) => onChange({ animation: v })} label="Page animation" /></Row>
          {textTabs && <>
            <Row label="Top and bottom margin"><Stepper label="vertical margin" value={reading.marginTop} step={8} min={0} max={120} onChange={(v) => onChange({ marginTop: v, marginBottom: v })} /></Row>
            <Row label="Side margin"><Stepper label="side margin" value={reading.marginSide} step={8} min={0} max={200} onChange={(v) => onChange({ marginSide: v })} /></Row>
          </>}
          <Row label="Tap zones"><select className="chip out" value={reading.tapZones} onChange={(e) => onChange({ tapZones: e.target.value as ReadingSettings['tapZones'] })} aria-label="Tap zones"><option value="sides">Edges turn pages</option><option value="thirds">Thirds</option><option value="off">Off</option></select></Row>
          <Row label="Auto-scroll speed"><input type="range" min={0} max={10} step={1} value={reading.autoScrollSpeed} onChange={(e) => onChange({ autoScrollSpeed: Number(e.target.value) })} aria-label="Auto-scroll speed" style={{ width: 140 }} /><span className="cap" style={{ width: 24 }}>{reading.autoScrollSpeed || 'Off'}</span></Row>
          <Row label="Keep screen awake"><Toggle on={reading.keepAwake} onChange={(v) => onChange({ keepAwake: v })} label="Keep screen awake" /></Row>
        </>
      )}

      {tab === 'pdf' && (
        <>
          <Row label="Fit"><Seg label="Fit" value={pdfView.fit} onChange={(v) => setPdfView({ fit: v })} options={[{ v: 'width', l: 'Width' }, { v: 'page', l: 'Page' }, { v: 'custom', l: 'Zoom' }]} /></Row>
          {pdfView.fit === 'custom' && <Row label="Zoom"><Stepper label="zoom" value={Math.round(pdfView.zoom * 100)} step={10} min={30} max={400} fmt={(v) => `${v}%`} onChange={(v) => setPdfView({ zoom: v / 100 })} /></Row>}
          <Row label="Rotate"><button className="btn sec sm" onClick={() => setPdfView({ rotate: (pdfView.rotate + 90) % 360 })}><Icon name="rotate" size={14} />{pdfView.rotate}°</button></Row>
          <Row label="Crop margins"><input type="range" min={0} max={15} step={1} value={pdfView.crop} onChange={(e) => setPdfView({ crop: Number(e.target.value) })} aria-label="Crop margins" style={{ width: 100 }} /><button className="btn ghost sm" onClick={onAutoCrop}>Auto</button></Row>
          <Row label="Two pages side by side"><Toggle on={pdfView.spread} onChange={(v) => setPdfView({ spread: v })} label="Two pages" /></Row>
          <Row label="Invert colours"><Toggle on={reading.invertPdf} onChange={(v) => onChange({ invertPdf: v })} label="Invert colours" /></Row>
          <Row label="Reflow text"><Toggle on={reflow} onChange={setReflow} label="Reflow text" /></Row>
          <p className="cap" style={{ margin: 0 }}>Reflow extracts the text so it fits the screen and uses your fonts. Layout and images are dropped.</p>
        </>
      )}

      <hr className="hr" />
      <div className="row"><span className="cap" style={{ fontSize: 12 }}>Applies to</span><Seg label="Applies to" value={scope} onChange={setScope} options={[{ v: 'book', l: 'This book' }, { v: 'all', l: 'All books' }]} /><span className="grow" /><button className="btn ghost sm" onClick={() => onChange({ ...DEFAULT_READING })}>Reset</button></div>
    </section>
  );
}
