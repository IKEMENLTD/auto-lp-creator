/**
 * 共通認証ヘルパー
 *
 * APP_PASSWORD が設定されている場合、全APIリクエストに
 * Authorization: Bearer <token> を要求する。
 *
 * トークンは verify-password 成功時に発行される
 * HMAC-SHA256(APP_PASSWORD, "auto-lp-auth-token-v1") の hex 値。
 * サーバー側で同じ値を再計算して照合するため、外部ストレージ不要。
 *
 * APP_PASSWORD 未設定時は認証をスキップ（公開モード）。
 */

import { createHmac, timingSafeEqual } from "node:crypto";

const TOKEN_MESSAGE = "auto-lp-auth-token-v1";

/**
 * APP_PASSWORD から期待されるトークン値を導出する。
 */
export function deriveToken(appPassword: string): string {
  return createHmac("sha256", appPassword).update(TOKEN_MESSAGE).digest("hex");
}

/**
 * 401 レスポンスを生成する。
 */
export function unauthorizedResponse(
  corsHeaders: Record<string, string>,
): Response {
  return new Response(
    JSON.stringify({ error: "認証が必要です" }),
    {
      status: 401,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    },
  );
}

/**
 * リクエストの Authorization ヘッダーを検証する。
 *
 * @returns null なら認証OK、Response なら 401 を返すべき
 */
export function verifyAuth(
  request: Request,
  corsHeaders: Record<string, string>,
): Response | null {
  const appPassword = process.env["APP_PASSWORD"];

  // パスワード未設定 = 公開モード
  if (!appPassword) {
    return null;
  }

  const authHeader = request.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return unauthorizedResponse(corsHeaders);
  }

  const token = authHeader.slice(7); // "Bearer " の長さ
  const expected = deriveToken(appPassword);

  // timing-safe 比較
  const tokenBuf = Buffer.from(token, "utf-8");
  const expectedBuf = Buffer.from(expected, "utf-8");

  if (
    tokenBuf.length !== expectedBuf.length ||
    !timingSafeEqual(tokenBuf, expectedBuf)
  ) {
    return unauthorizedResponse(corsHeaders);
  }

  return null; // 認証OK
}
