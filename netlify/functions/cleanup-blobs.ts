/**
 * Blob Storage クリーンアップ - Netlify Function
 *
 * POST /api/cleanup-blobs
 *
 * 一定期間（デフォルト7日）より古い Blob を削除する。
 * 手動実行 or 外部 cron（GitHub Actions等）から定期実行を想定。
 */

import type { Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import { verifyAuth } from "./lib/auth.js";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

/** デフォルト保持期間: 7日 */
const DEFAULT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

async function cleanupStore(storeName: string, maxAgeMs: number): Promise<{ deleted: number; errors: number }> {
  const store = getStore(storeName);
  const now = Date.now();
  let deleted = 0;
  let errors = 0;

  try {
    const { blobs } = await store.list();
    for (const blob of blobs) {
      try {
        const meta = await store.getMetadata(blob.key);
        const createdAt = (meta?.metadata as Record<string, string> | undefined)?.createdAt;
        if (createdAt) {
          const age = now - new Date(createdAt).getTime();
          if (age > maxAgeMs) {
            await store.delete(blob.key);
            deleted++;
          }
        }
      } catch {
        errors++;
      }
    }
  } catch (err) {
    console.error(`[cleanup] Failed to list store "${storeName}":`, err);
  }

  return { deleted, errors };
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const authError = verifyAuth(request, corsHeaders);
  if (authError) return authError;

  const stores = ["deliverables", "job-status", "job-results", "ai-images"];
  const results: Record<string, { deleted: number; errors: number }> = {};

  for (const storeName of stores) {
    results[storeName] = await cleanupStore(storeName, DEFAULT_MAX_AGE_MS);
    console.log(`[cleanup] ${storeName}: deleted=${results[storeName].deleted}, errors=${results[storeName].errors}`);
  }

  return new Response(
    JSON.stringify({ success: true, results }),
    { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } },
  );
}

export const config: Config = {
  path: "/api/cleanup-blobs",
  method: ["POST", "OPTIONS"],
};
