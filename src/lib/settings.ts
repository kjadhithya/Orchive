import type { AppSettings, AppTheme, ReadingSettings, ReadingTheme } from './types';

export const BUILTIN_READING_THEMES: ReadingTheme[] = [
  { id: 'day', name: 'Day', bg: '#FFFFFF', ink: '#221F1F', link: '#763D82', highlight: '#E9D8EE', builtin: true },
  { id: 'orchid', name: 'Orchid', bg: '#F6F2F7', ink: '#2A1F2E', link: '#763D82', highlight: '#E4CFEA', builtin: true },
  { id: 'sepia', name: 'Sepia', bg: '#F2EADC', ink: '#433422', link: '#7A4E2D', highlight: '#EBD3C8', builtin: true },
  { id: 'gray', name: 'Gray', bg: '#DADADD', ink: '#232226', link: '#5A2F66', highlight: '#CDB9D3', builtin: true },
  { id: 'night', name: 'Night', bg: '#201E1D', ink: '#D9D8DD', link: '#C99BD3', highlight: '#4A3550', builtin: true },
  { id: 'amoled', name: 'Black', bg: '#000000', ink: '#BDBCC2', link: '#B884C3', highlight: '#3B2A41', builtin: true },
  { id: 'console', name: 'Console', bg: '#0B0F0C', ink: '#7FD69A', link: '#B6F0C6', highlight: '#1F3A28', builtin: true },
];

export const ACCENTS: { id: string; name: string; light: string; dark: string }[] = [
  { id: 'orchid', name: 'Orchid', light: '#763D82', dark: '#B884C3' },
  { id: 'slate', name: 'Slate', light: '#3F4E6B', dark: '#9DB0D6' },
  { id: 'moss', name: 'Moss', light: '#3F6656', dark: '#93C2AE' },
  { id: 'rose', name: 'Rose', light: '#8A3F57', dark: '#E3A0B5' },
  { id: 'graphite', name: 'Graphite', light: '#2E2D31', dark: '#C9C6C3' },
];

export const BUILTIN_APP_THEMES: AppTheme[] = [
  { id: 'orchive', name: 'Orchive', primary: '#763D82', bg: '#F4F2F1', surface: '#FFFFFF', builtin: true },
];

export const FONTS = [
  { name: 'Source Serif 4', css: '"Source Serif 4", Georgia, serif' },
  { name: 'Literata', css: 'Literata, Georgia, serif' },
  { name: 'Fraunces', css: 'Fraunces, Georgia, serif' },
  { name: 'DM Sans', css: '"DM Sans", system-ui, sans-serif' },
  { name: 'Atkinson Hyperlegible', css: '"Atkinson Hyperlegible", system-ui, sans-serif' },
  { name: 'Georgia', css: 'Georgia, serif' },
  { name: 'System', css: 'system-ui, sans-serif' },
  { name: 'Monospace', css: 'ui-monospace, Menlo, monospace' },
];

export const DEFAULT_READING: ReadingSettings = {
  theme: 'day',
  pdfTheme: 'day',
  invertPdf: false,
  font: 'Source Serif 4',
  fontSize: 19,
  fontWeight: 400,
  lineHeight: 1.65,
  paragraphSpacing: 0.6,
  letterSpacing: 0,
  marginTop: 40,
  marginBottom: 40,
  marginSide: 48,
  align: 'left',
  hyphenate: true,
  overrideStyles: false,
  indent: 0,
  flow: 'paginated',
  twoPage: true,
  animation: true,
  autoScrollSpeed: 0,
  keepAwake: true,
  dim: 0,
  warmth: 0,
  nightSchedule: false,
  nightFrom: '19:00',
  nightTo: '07:00',
  nightTheme: 'night',
  tapZones: 'sides',
};

export const DEFAULT_SETTINGS: AppSettings = {
  mode: 'system',
  schedule: { on: false, from: '19:00', to: '07:00' },
  accent: 'orchid',
  appThemeId: 'orchive',
  customAppThemes: [],
  matchReadingTheme: false,
  uiScale: 'default',
  reading: DEFAULT_READING,
  customReadingThemes: [],
  customFonts: [],
  addImportsToReadNext: false,
  autoUploadDuplicates: 'skip',
  librarySort: 'opened',
  libraryView: 'covers',
  v: 2,
};

export function mergeSettings(raw: Partial<AppSettings> | null | undefined): AppSettings {
  const r = { ...(raw || {}) };
  // v2: covers became the default library view
  if ((r.v || 1) < 2) { r.libraryView = 'covers'; r.v = 2; }
  return {
    ...DEFAULT_SETTINGS,
    ...r,
    schedule: { ...DEFAULT_SETTINGS.schedule, ...(r.schedule || {}) },
    reading: { ...DEFAULT_READING, ...(r.reading || {}) },
    customAppThemes: r.customAppThemes || [],
    customReadingThemes: r.customReadingThemes || [],
    customFonts: r.customFonts || [],
  };
}

export function allReadingThemes(s: AppSettings): ReadingTheme[] {
  return [...BUILTIN_READING_THEMES, ...s.customReadingThemes];
}

export function findReadingTheme(s: AppSettings, id: string): ReadingTheme {
  return allReadingThemes(s).find((t) => t.id === id) || BUILTIN_READING_THEMES[0];
}

export function fontCss(s: AppSettings, name: string): string {
  const f = FONTS.find((x) => x.name === name);
  if (f) return f.css;
  if (s.customFonts.find((x) => x.name === name)) return `"${name}", Georgia, serif`;
  return FONTS[0].css;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
}
function rgbToHex([r, g, b]: number[]): string {
  return '#' + [r, g, b].map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('');
}
export function mix(a: string, b: string, t: number): string {
  const A = hexToRgb(a), B = hexToRgb(b);
  return rgbToHex(A.map((x, i) => x + (B[i] - x) * t));
}
export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

export function isNightNow(from: string, to: string, d = new Date()): boolean {
  const mins = d.getHours() * 60 + d.getMinutes();
  const [fh, fm] = from.split(':').map(Number);
  const [th, tm] = to.split(':').map(Number);
  const f = fh * 60 + fm, t = th * 60 + tm;
  return f <= t ? mins >= f && mins < t : mins >= f || mins < t;
}

export function resolveDark(s: AppSettings): boolean {
  if (s.schedule.on) return isNightNow(s.schedule.from, s.schedule.to);
  if (s.mode === 'dark') return true;
  if (s.mode === 'light') return false;
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

let readerTheme: ReadingTheme | null = null;
/** The reader registers its page theme here so every later appearance refresh keeps the reader's chrome in that theme. */
export function setReaderTheme(t: ReadingTheme | null) { readerTheme = t; }

/** Writes the appearance settings onto <html> as CSS variables. */
export function applyAppearance(s: AppSettings, explicitTheme?: ReadingTheme | null) {
  const overrideTheme = explicitTheme === undefined ? readerTheme : explicitTheme;
  // overrideTheme is passed only by the reader: its toolbars and panels always take the page colours
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  let dark = resolveDark(s);
  const style = root.style;
  const clear = ['--canvas', '--sidebar', '--surface', '--surface-alt', '--hover', '--border', '--border-control', '--ink', '--ink-secondary', '--ink-muted'];
  clear.forEach((v) => style.removeProperty(v));

  const custom = s.customAppThemes.find((t) => t.id === s.appThemeId);
  let primaryLight = ACCENTS.find((a) => a.id === s.accent)?.light;
  let primaryDark = ACCENTS.find((a) => a.id === s.accent)?.dark;
  if (!primaryLight && s.accent.startsWith('#')) {
    primaryLight = s.accent;
    primaryDark = mix(s.accent, '#FFFFFF', 0.45);
  }
  if (custom) {
    primaryLight = custom.primary;
    primaryDark = mix(custom.primary, '#FFFFFF', 0.45);
    dark = luminance(custom.surface) < 0.2;
    style.setProperty('--canvas', custom.bg);
    style.setProperty('--surface', custom.surface);
    style.setProperty('--sidebar', mix(custom.bg, custom.surface, 0.5));
    style.setProperty('--surface-alt', mix(custom.bg, dark ? '#FFFFFF' : '#000000', 0.06));
    style.setProperty('--hover', mix(custom.bg, dark ? '#FFFFFF' : '#000000', 0.05));
    style.setProperty('--border', mix(custom.bg, dark ? '#FFFFFF' : '#000000', 0.1));
  }
  if (overrideTheme) {
    const t = overrideTheme;
    dark = luminance(t.bg) < 0.2;
    style.setProperty('--surface', t.bg);
    style.setProperty('--canvas', mix(t.bg, dark ? '#FFFFFF' : '#000000', 0.03));
    style.setProperty('--border-control', mix(t.ink, t.bg, 0.5));
    style.setProperty('--sidebar', mix(t.bg, dark ? '#FFFFFF' : '#000000', 0.02));
    style.setProperty('--surface-alt', mix(t.bg, dark ? '#FFFFFF' : '#000000', 0.07));
    style.setProperty('--hover', mix(t.bg, dark ? '#FFFFFF' : '#000000', 0.06));
    style.setProperty('--border', mix(t.bg, dark ? '#FFFFFF' : '#000000', 0.11));
    style.setProperty('--ink', t.ink);
    style.setProperty('--ink-secondary', mix(t.ink, t.bg, 0.25));
    style.setProperty('--ink-muted', mix(t.ink, t.bg, 0.38));
  }
  root.dataset.theme = dark ? 'dark' : 'light';
  const primary = dark ? primaryDark! : primaryLight!;
  style.setProperty('--primary', primary);
  style.setProperty('--primary-hover', dark ? mix(primary, '#FFFFFF', 0.2) : mix(primary, '#000000', 0.2));
  style.setProperty('--on-primary', contrast('#FFFFFF', primary) >= 4.5 ? '#FFFFFF' : mix(primary, '#000000', 0.85));
  style.setProperty('--primary-soft', dark ? mix(primary, '#201E1D', 0.85) : mix(primary, '#FFFFFF', 0.9));
  root.dataset.scale = s.uiScale;
}
