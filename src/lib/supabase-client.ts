/**
 * ブラウザ側 Supabase クライアント
 *
 * anon key を使用 (RLS 有効)。
 * Realtime subscription で extracted_data, generation_jobs を購読する。
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

/** Supabase クライアントのシングルトン */
let clientInstance: SupabaseClient | null = null;

/**
 * ブラウザ用 Supabase クライアントを取得する
 * 環境変数は VITE_ prefix で Vite から注入される
 */
export function getSupabaseBrowserClient(): SupabaseClient {
  if (clientInstance) {
    return clientInstance;
  }

  const supabaseUrl = import.meta.env['VITE_SUPABASE_URL'] as string | undefined;
  const supabaseAnonKey = import.meta.env['VITE_SUPABASE_ANON_KEY'] as string | undefined;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Supabase環境変数が設定されていません。VITE_SUPABASE_URL と VITE_SUPABASE_ANON_KEY を .env に設定してください。'
    );
  }

  clientInstance = createClient(supabaseUrl, supabaseAnonKey, {
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
    },
  });

  return clientInstance;
}

export { type SupabaseClient };
