import type { AppSettings, ReadingSettings, ReadingTheme } from './types';
import { fontCss, luminance } from './settings';

const TEXTURES: Record<string, string> = {
  none: 'none',
  paper: 'radial-gradient(rgba(0,0,0,.025) 1px, transparent 1px)',
  linen: 'repeating-linear-gradient(0deg, rgba(0,0,0,.018) 0 1px, transparent 1px 3px), repeating-linear-gradient(90deg, rgba(0,0,0,.018) 0 1px, transparent 1px 3px)',
};

/** CSS injected into every book page in the reader. */
export function readerCss(s: AppSettings, r: ReadingSettings, t: ReadingTheme): string {
  const imp = r.overrideStyles ? ' !important' : '';
  const font = fontCss(s, r.font);
  const dark = luminance(t.bg) < 0.2;
  return `@import url("https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,opsz,wght@0,8..60,300..700;1,8..60,400&family=Literata:ital,opsz,wght@0,7..72,300..700;1,7..72,400&family=Fraunces:opsz,wght@9..144,400;9..144,600&family=DM+Sans:opsz,wght@9..40,400;9..40,600&family=Atkinson+Hyperlegible:ital,wght@0,400;0,700;1,400&display=swap");
@namespace epub "http://www.idpf.org/2007/ops";
html { color-scheme: ${dark ? 'dark' : 'light'}; --theme-bg-color: ${t.bg}; }
html, body { background-color: ${t.bg} !important; color: ${t.ink} !important; }
html { background-image: ${TEXTURES[t.texture || 'none'] || 'none'} !important; background-size: 4px 4px; }
body { font-family: ${font}${imp}; font-size: ${r.fontSize}px !important; font-weight: ${r.fontWeight}${imp}; line-height: ${r.lineHeight} !important; letter-spacing: ${r.letterSpacing}em${imp}; }
${r.overrideStyles ? `body * { font-family: inherit !important; color: inherit !important; background-color: transparent !important; }` : ''}
p, li, blockquote, dd { line-height: ${r.lineHeight} !important; text-align: ${r.align}${imp}; hyphens: ${r.hyphenate ? 'auto' : 'manual'}; -webkit-hyphens: ${r.hyphenate ? 'auto' : 'manual'}; }
p { margin-top: 0${imp}; margin-bottom: ${r.paragraphSpacing}em${imp}; ${r.indent ? `text-indent: ${r.indent}em${imp};` : ''} }
a, a:link, a:visited { color: ${t.link} !important; }
img, svg, video { max-width: 100%; ${dark ? 'filter: brightness(.88);' : ''} }
pre, code { white-space: pre-wrap !important; }
h1, h2, h3, h4 { line-height: 1.25 !important; color: ${t.ink} !important; }
::selection { background: ${t.highlight}; }
.orchive-tts { background: ${t.highlight} !important; border-radius: 2px; }
aside[epub|type~="footnote"], aside[epub|type~="endnote"], aside[epub|type~="rearnote"] { display: none; }
`;
}

export function effectiveTheme(s: AppSettings, r: ReadingSettings, now = new Date()): string {
  if (r.nightSchedule) {
    const mins = now.getHours() * 60 + now.getMinutes();
    const [fh, fm] = r.nightFrom.split(':').map(Number);
    const [th, tm] = r.nightTo.split(':').map(Number);
    const f = fh * 60 + fm, to = th * 60 + tm;
    const night = f <= to ? mins >= f && mins < to : mins >= f || mins < to;
    if (night) return r.nightTheme;
  }
  return r.theme;
}
