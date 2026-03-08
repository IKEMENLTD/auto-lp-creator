/**
 * Supabase クライアント + 型付きヘルパー
 * リアルタイムアポ制作物自動生成システム
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// ============================================================
// 共通型
// ============================================================

/** JSONB 型 (Supabase 標準) */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

/** sessions.status の許容値 */
export type SessionStatus = 'active' | 'paused' | 'ended';

/** generation_jobs.status の許容値 */
export type JobStatus = 'queued' | 'processing' | 'completed' | 'failed';

/** generation_jobs.type の許容値 */
export type JobType =
  | 'lp'
  | 'ad_creative'
  | 'flyer'
  | 'hearing_form'
  | 'line_design'
  | 'minutes'
  | 'profile';

// ============================================================
// Database型定義 (Supabase CLI generate types 相当)
// ============================================================

export type Database = {
  public: {
    Tables: {
      sessions: {
        Row: {
          id: string;
          user_id: string;
          status: SessionStatus;
          started_at: string;
          ended_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          status?: SessionStatus;
          started_at?: string;
          ended_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          status?: SessionStatus;
          started_at?: string;
          ended_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      chunks: {
        Row: {
          id: string;
          session_id: string;
          text: string;
          chunk_index: number;
          speaker: string | null;
          timestamp: string;
          processed: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          text: string;
          chunk_index: number;
          speaker?: string | null;
          timestamp?: string;
          processed?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          session_id?: string;
          text?: string;
          chunk_index?: number;
          speaker?: string | null;
          timestamp?: string;
          processed?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'chunks_session_id_fkey';
            columns: ['session_id'];
            isOneToOne: false;
            referencedRelation: 'sessions';
            referencedColumns: ['id'];
          },
        ];
      };
      extracted_data: {
        Row: {
          id: string;
          session_id: string;
          data_json: Json;
          version: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          data_json?: Json;
          version?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          session_id?: string;
          data_json?: Json;
          version?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'extracted_data_session_id_fkey';
            columns: ['session_id'];
            isOneToOne: false;
            referencedRelation: 'sessions';
            referencedColumns: ['id'];
          },
        ];
      };
      generation_jobs: {
        Row: {
          id: string;
          session_id: string;
          type: JobType;
          status: JobStatus;
          model: string | null;
          result_url: string | null;
          started_at: string | null;
          completed_at: string | null;
          error: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          type: JobType;
          status?: JobStatus;
          model?: string | null;
          result_url?: string | null;
          started_at?: string | null;
          completed_at?: string | null;
          error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          session_id?: string;
          type?: JobType;
          status?: JobStatus;
          model?: string | null;
          result_url?: string | null;
          started_at?: string | null;
          completed_at?: string | null;
          error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'generation_jobs_session_id_fkey';
            columns: ['session_id'];
            isOneToOne: false;
            referencedRelation: 'sessions';
            referencedColumns: ['id'];
          },
        ];
      };
      templates: {
        Row: {
          id: string;
          industry: string;
          name: string;
          html_size: number;
          config: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          industry: string;
          name: string;
          html_size?: number;
          config?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          industry?: string;
          name?: string;
          html_size?: number;
          config?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
      analytics: {
        Row: {
          id: string;
          session_id: string;
          event: string;
          metadata: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          event: string;
          metadata?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          session_id?: string;
          event?: string;
          metadata?: Json | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'analytics_session_id_fkey';
            columns: ['session_id'];
            isOneToOne: false;
            referencedRelation: 'sessions';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
  };
};

// ============================================================
// エクスポート用 Row/Insert/Update 型エイリアス
// ============================================================

export type SessionRow = Database['public']['Tables']['sessions']['Row'];
export type SessionInsert = Database['public']['Tables']['sessions']['Insert'];
export type SessionUpdate = Database['public']['Tables']['sessions']['Update'];

export type ChunkRow = Database['public']['Tables']['chunks']['Row'];
export type ChunkInsert = Database['public']['Tables']['chunks']['Insert'];
export type ChunkUpdate = Database['public']['Tables']['chunks']['Update'];

export type ExtractedDataRow = Database['public']['Tables']['extracted_data']['Row'];
export type ExtractedDataInsert = Database['public']['Tables']['extracted_data']['Insert'];
export type ExtractedDataUpdate = Database['public']['Tables']['extracted_data']['Update'];

export type GenerationJobRow = Database['public']['Tables']['generation_jobs']['Row'];
export type GenerationJobInsert = Database['public']['Tables']['generation_jobs']['Insert'];
export type GenerationJobUpdate = Database['public']['Tables']['generation_jobs']['Update'];

export type TemplateRow = Database['public']['Tables']['templates']['Row'];

export type AnalyticsRow = Database['public']['Tables']['analytics']['Row'];
export type AnalyticsInsert = Database['public']['Tables']['analytics']['Insert'];

// ============================================================
// Supabase クライアント
// ============================================================

/** 環境変数バリデーション */
function getEnvVar(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`環境変数 ${name} が設定されていません`);
  }
  return value;
}

/** シングルトン Supabase クライアント */
let clientInstance: SupabaseClient<Database> | null = null;

/**
 * 型付き Supabase クライアントを取得する
 * シングルトンパターンで同一インスタンスを返す
 */
export function getSupabaseClient(): SupabaseClient<Database> {
  if (clientInstance) {
    return clientInstance;
  }

  const supabaseUrl = getEnvVar('SUPABASE_URL');
  const supabaseServiceKey = getEnvVar('SUPABASE_SERVICE_ROLE_KEY');

  clientInstance = createClient<Database>(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return clientInstance;
}

// ============================================================
// ヘルパー関数
// ============================================================

/** Supabase エラーをスローする共通ハンドラ */
function throwOnError<T>(
  result: { data: T | null; error: { message: string; code?: string } | null },
  operation: string
): T {
  if (result.error) {
    throw new Error(
      `Supabase ${operation} エラー: ${result.error.message} (code: ${result.error.code ?? 'unknown'})`
    );
  }
  if (result.data === null) {
    throw new Error(`Supabase ${operation}: データが返されませんでした`);
  }
  return result.data;
}

/**
 * 新しいセッションを作成する
 */
export async function createSession(userId: string): Promise<SessionRow> {
  const client = getSupabaseClient();
  const result = await client
    .from('sessions')
    .insert({ user_id: userId })
    .select()
    .single();

  return throwOnError(result, 'createSession');
}

/**
 * 音声チャンクを追加する
 */
export async function addChunk(
  sessionId: string,
  text: string,
  chunkIndex: number,
  speaker?: string
): Promise<ChunkRow> {
  const client = getSupabaseClient();

  const insertData: ChunkInsert = {
    session_id: sessionId,
    text,
    chunk_index: chunkIndex,
    ...(speaker !== undefined ? { speaker } : {}),
  };

  const result = await client
    .from('chunks')
    .insert(insertData)
    .select()
    .single();

  return throwOnError(result, 'addChunk');
}

/**
 * 最新の抽出データを取得する
 */
export async function getLatestExtraction(
  sessionId: string
): Promise<ExtractedDataRow | null> {
  const client = getSupabaseClient();
  const result = await client
    .from('extracted_data')
    .select()
    .eq('session_id', sessionId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (result.error) {
    throw new Error(
      `Supabase getLatestExtraction エラー: ${result.error.message}`
    );
  }

  return result.data;
}

/**
 * 抽出データを更新する (UPSERT + バージョン指定)
 */
export async function updateExtraction(
  sessionId: string,
  data: Json,
  version: number
): Promise<void> {
  const client = getSupabaseClient();

  // 既存データを確認
  const existing = await getLatestExtraction(sessionId);

  if (existing) {
    // 既存データを更新
    const result = await client
      .from('extracted_data')
      .update({
        data_json: data,
        version,
      })
      .eq('id', existing.id);

    if (result.error) {
      throw new Error(
        `Supabase updateExtraction エラー: ${result.error.message}`
      );
    }
  } else {
    // 新規作成
    const result = await client
      .from('extracted_data')
      .insert({
        session_id: sessionId,
        data_json: data,
        version,
      });

    if (result.error) {
      throw new Error(
        `Supabase updateExtraction (insert) エラー: ${result.error.message}`
      );
    }
  }
}

/**
 * 制作物生成ジョブを作成する
 */
export async function createGenerationJob(
  sessionId: string,
  type: JobType
): Promise<GenerationJobRow> {
  const client = getSupabaseClient();
  const result = await client
    .from('generation_jobs')
    .insert({
      session_id: sessionId,
      type,
      status: 'queued' as const,
    })
    .select()
    .single();

  return throwOnError(result, 'createGenerationJob');
}

/**
 * ジョブのステータスを更新する
 */
export async function updateJobStatus(
  jobId: string,
  status: JobStatus,
  resultUrl?: string,
  error?: string
): Promise<void> {
  const client = getSupabaseClient();

  const updateData: GenerationJobUpdate = {
    status,
    ...(resultUrl !== undefined ? { result_url: resultUrl } : {}),
    ...(error !== undefined ? { error } : {}),
    ...(status === 'processing' ? { started_at: new Date().toISOString() } : {}),
    ...(status === 'completed' || status === 'failed'
      ? { completed_at: new Date().toISOString() }
      : {}),
  };

  const result = await client
    .from('generation_jobs')
    .update(updateData)
    .eq('id', jobId);

  if (result.error) {
    throw new Error(
      `Supabase updateJobStatus エラー: ${result.error.message}`
    );
  }
}

/**
 * アナリティクスイベントを記録する
 */
export async function logAnalytics(
  sessionId: string,
  event: string,
  metadata?: Json
): Promise<void> {
  const client = getSupabaseClient();

  const insertData: AnalyticsInsert = {
    session_id: sessionId,
    event,
    ...(metadata !== undefined ? { metadata } : {}),
  };

  const result = await client
    .from('analytics')
    .insert(insertData);

  if (result.error) {
    throw new Error(
      `Supabase logAnalytics エラー: ${result.error.message}`
    );
  }
}
