import type { Annotation, AppSettings, ReadingSettings, ReadingTheme } from '@/lib/types';

export interface TocItem { label: string; target: string; subitems?: TocItem[] }

export interface RelocateInfo {
  fraction: number;
  chapter: string;
  page?: number;
  pages?: number;
  minutesSection?: number;
  minutesTotal?: number;
  location: string;
  sectionFractions?: number[];
}

export interface SelectionInfo {
  text: string;
  location: string;
  rect: { x: number; y: number; w: number; h: number };
  chapter: string;
  page?: number;
  position: number;
}

export interface SpeakBlock { text: string; highlight: () => void; clear: () => void }

export interface SearchResult { label: string; items: { target: string; excerpt: string }[] }

export interface ReaderHandle {
  next(): void;
  prev(): void;
  goTo(target: string): void;
  goToFraction(f: number): void;
  back(): void;
  canGoBack(): boolean;
  search(q: string, onResult: (r: SearchResult) => void, onProgress: (p: number) => void): Promise<void>;
  clearSearch(): void;
  clearSelection(): void;
  speakBlocks(): Promise<SpeakBlock[]>;
  nextSection(): Promise<boolean>;
  scrollBy(px: number): void;
  currentText(): Promise<string>;
}

export interface ReaderProps {
  settings: AppSettings;
  reading: ReadingSettings;
  theme: ReadingTheme;
  annotations: Annotation[];
  initial: string | null;
  extraCss?: string;
  onReady: (toc: TocItem[], meta: { pages?: number }) => void;
  onRelocate: (r: RelocateInfo) => void;
  onSelect: (s: SelectionInfo | null) => void;
  onAnnotationClick: (id: string, rect: { x: number; y: number }) => void;
  onTap: (zone: 'left' | 'center' | 'right') => void;
  onFootnote: (html: string) => void;
  onError: (msg: string) => void;
}
