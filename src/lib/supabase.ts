import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Public values (safe to ship in the browser). Env vars override them.
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://vrdbltstkyiffihojxta.supabase.co';
export const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_lxHG9qAWjQLjYZJZLws4Fw_m67bKzYe';
export const BUCKET = 'orchive-books';

let client: SupabaseClient | null = null;

export function sb(): SupabaseClient {
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'orchive-auth' },
    });
  }
  return client;
}

/** Device label used when saving reading positions, so conflicts can say where the other position came from. */
export function deviceLabel(): string {
  if (typeof window === 'undefined') return 'web';
  try {
    let id = localStorage.getItem('orchive-device');
    if (!id) {
      const ua = navigator.userAgent;
      const kind = /iPad|Tablet/i.test(ua) ? 'Tablet' : /Mobi|Android/i.test(ua) ? 'Phone' : 'Computer';
      id = `${kind} ${Math.random().toString(36).slice(2, 6)}`;
      localStorage.setItem('orchive-device', id);
    }
    return id;
  } catch {
    return 'web';
  }
}
