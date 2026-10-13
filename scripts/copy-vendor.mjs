// Copies browser-only reader engines into public/ so they load as plain ES modules at runtime.
import { cpSync, existsSync, mkdirSync } from 'node:fs';
const out = 'public/vendor';
mkdirSync(out, { recursive: true });
if (existsSync('node_modules/foliate-js')) cpSync('node_modules/foliate-js', `${out}/foliate`, { recursive: true });
if (existsSync('node_modules/pdfjs-dist/build')) cpSync('node_modules/pdfjs-dist/build', `${out}/pdfjs`, { recursive: true });
if (existsSync('node_modules/pdfjs-dist/web/pdf_viewer.css')) cpSync('node_modules/pdfjs-dist/web/pdf_viewer.css', `${out}/pdfjs/pdf_viewer.css`);
if (existsSync('node_modules/pdfjs-dist/cmaps')) cpSync('node_modules/pdfjs-dist/cmaps', `${out}/pdfjs-cmaps`, { recursive: true });
console.log('vendor copied');
