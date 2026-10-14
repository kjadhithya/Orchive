import './globals.css';
import type { Metadata, Viewport } from 'next';
import { StoreProvider } from '@/lib/store';
import { HoverLabels, Toasts } from '@/components/ui';

export const metadata: Metadata = {
  title: 'Orchive',
  description: 'A quiet reading archive: your books, notes and highlights, in sync across devices.',
  icons: {
    icon: [{ url: '/icon.svg', type: 'image/svg+xml' }, { url: '/icon-32.png', sizes: '32x32', type: 'image/png' }],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180' }],
  },
  manifest: '/manifest.webmanifest',
  appleWebApp: { title: 'Orchive', capable: true, statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [{ media: '(prefers-color-scheme: light)', color: '#F4F2F1' }, { media: '(prefers-color-scheme: dark)', color: '#181615' }],
};

const themeBoot = `(function(){try{var s=JSON.parse(localStorage.getItem('orchive-settings')||'{}');var m=s.mode||'system';var d=m==='dark'||(m==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=d?'dark':'light';if(s.uiScale)document.documentElement.dataset.scale=s.uiScale;}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBoot }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600&family=Fraunces:opsz,wght@9..144,600&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;1,8..60,400&family=Literata:ital,opsz,wght@0,7..72,400;0,7..72,600;1,7..72,400&family=Atkinson+Hyperlegible:ital,wght@0,400;0,700;1,400&family=JetBrains+Mono:wght@600&display=swap" />
      </head>
      <body>
        <StoreProvider>
          {children}
          <Toasts />
          <HoverLabels />
        </StoreProvider>
      </body>
    </html>
  );
}
