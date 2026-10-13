export type Status = 'to_read' | 'reading' | 'completed' | 'paused';

export interface Book {
  id: string;
  user_id: string;
  title: string;
  author: string | null;
  series: string | null;
  series_index: number | null;
  description: string | null;
  cover_path: string | null;
  file_path: string | null;
  file_name: string | null;
  file_size: number | null;
  format: string | null;
  file_hash: string | null;
  status: Status;
  rating: number | null;
  read_next_pos: number | null;
  favorite: boolean;
  progress: number;
  location: ReaderLocation | null;
  location_updated_at: string | null;
  location_device: string | null;
  started_at: string | null;
  completed_at: string | null;
  reread_count: number;
  last_opened_at: string | null;
  reading_seconds: number;
  reader_settings: Partial<ReadingSettings> | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReaderLocation {
  cfi?: string;
  page?: number;
  fraction?: number;
  chapter?: string;
}

export interface Tag { id: string; user_id: string; name: string; created_at: string }
export interface BookTag { book_id: string; tag_id: string; user_id: string }
export interface Collection { id: string; user_id: string; name: string; description: string | null; is_public: boolean; created_at: string; updated_at: string }
export interface CollectionBook { collection_id: string; book_id: string; user_id: string; position: number }

export interface Note {
  id: string;
  user_id: string;
  book_id: string | null;
  title: string;
  body: string;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Annotation {
  id: string;
  user_id: string;
  book_id: string;
  kind: 'bookmark' | 'highlight' | 'note';
  color: string | null;
  style: 'highlight' | 'underline' | 'strike' | null;
  location: string | null;
  position: number | null;
  chapter: string | null;
  page: number | null;
  quote: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface Session {
  id: string;
  user_id: string;
  book_id: string | null;
  started_at: string;
  ended_at: string | null;
  seconds: number;
  pages: number;
  progress_from: number | null;
  progress_to: number | null;
}

export interface Goal { id: string; user_id: string; year: number; month: number | null; target: number; created_at: string }

export type ReadingThemeId = string;

export interface ReadingTheme {
  id: ReadingThemeId;
  name: string;
  bg: string;
  ink: string;
  link: string;
  highlight: string;
  texture?: 'none' | 'paper' | 'linen';
  builtin?: boolean;
}

export interface ReadingSettings {
  theme: ReadingThemeId;
  pdfTheme: ReadingThemeId;
  invertPdf: boolean;
  font: string;
  fontSize: number;
  fontWeight: number;
  lineHeight: number;
  paragraphSpacing: number;
  letterSpacing: number;
  marginTop: number;
  marginBottom: number;
  marginSide: number;
  align: 'left' | 'justify';
  hyphenate: boolean;
  overrideStyles: boolean;
  indent: number;
  flow: 'paginated' | 'scrolled';
  twoPage: boolean;
  animation: boolean;
  autoScrollSpeed: number;
  keepAwake: boolean;
  dim: number;
  warmth: number;
  nightSchedule: boolean;
  nightFrom: string;
  nightTo: string;
  nightTheme: ReadingThemeId;
  tapZones: 'sides' | 'thirds' | 'off';
}

export interface AppTheme {
  id: string;
  name: string;
  primary: string;
  bg: string;
  surface: string;
  builtin?: boolean;
}

export interface AppSettings {
  mode: 'light' | 'dark' | 'system';
  schedule: { on: boolean; from: string; to: string };
  accent: string;
  appThemeId: string;
  customAppThemes: AppTheme[];
  matchReadingTheme: boolean;
  uiScale: 'small' | 'default' | 'large';
  reading: ReadingSettings;
  customReadingThemes: ReadingTheme[];
  customFonts: { name: string; path: string }[];
  addImportsToReadNext: boolean;
  autoUploadDuplicates: 'skip' | 'ask';
  librarySort: string;
  libraryView: 'list' | 'covers';
}
