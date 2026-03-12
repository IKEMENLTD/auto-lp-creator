/**
 * Netlify Deploy API 統合
 *
 * セッションIDごとにサイトを作成し、生成HTMLをデプロイする。
 * デプロイ先: {session_id}.lp.techstars.jp
 *
 * Netlify API ドキュメント:
 * https://docs.netlify.com/api/get-started/
 */

import { createHash } from "crypto";

// ============================================================
// 型定義
// ============================================================

interface NetlifySite {
  readonly id: string;
  readonly name: string;
  readonly url: string;
  readonly ssl_url: string;
  readonly custom_domain: string | null;
}

interface NetlifyDeploy {
  readonly id: string;
  readonly site_id: string;
  readonly url: string;
  readonly ssl_url: string;
  readonly state: string;
}

interface NetlifyApiError {
  readonly message: string;
  readonly code: number;
}

interface DeployFileMap {
  readonly [path: string]: string; // path -> SHA1 hash
}

// ============================================================
// 定数
// ============================================================

const NETLIFY_API_BASE = "https://api.netlify.com/api/v1";
const DEPLOY_DOMAIN = "lp.techstars.jp";
const API_TIMEOUT_MS = 30_000;

// ============================================================
// ユーティリティ
// ============================================================

/**
 * SHA1ハッシュを計算
 */
function computeSha1(content: string): string {
  return createHash("sha1").update(content, "utf-8").digest("hex");
}

/**
 * Netlify APIリクエストのラッパー
 */
async function netlifyApiRequest<T>(
  endpoint: string,
  token: string,
  options: {
    method?: string;
    body?: string;
    contentType?: string;
  } = {},
): Promise<T> {
  const { method = "GET", body, contentType = "application/json" } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const response = await fetch(`${NETLIFY_API_BASE}${endpoint}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": contentType,
      },
      body,
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      let errorMessage: string;
      try {
        const parsed = JSON.parse(errorBody) as NetlifyApiError;
        errorMessage = parsed.message || errorBody;
      } catch {
        errorMessage = errorBody;
      }
      throw new Error(
        `Netlify API error (${response.status}): ${errorMessage}`,
      );
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ============================================================
// サイト管理
// ============================================================

/**
 * 既存サイトをsession_idで検索
 */
async function findSiteByName(
  sessionId: string,
  token: string,
): Promise<NetlifySite | null> {
  try {
    const siteName = `${sessionId}-lp`;
    const sites = await netlifyApiRequest<NetlifySite[]>(
      `/sites?name=${encodeURIComponent(siteName)}`,
      token,
    );
    return sites.find((s) => s.name === siteName) ?? null;
  } catch {
    return null;
  }
}

/**
 * 新しいサイトを作成
 */
async function createSite(
  sessionId: string,
  token: string,
): Promise<NetlifySite> {
  const siteName = `${sessionId}-lp`;
  const site = await netlifyApiRequest<NetlifySite>("/sites", token, {
    method: "POST",
    body: JSON.stringify({
      name: siteName,
      custom_domain: `${sessionId}.${DEPLOY_DOMAIN}`,
    }),
  });
  return site;
}

// ============================================================
// デプロイ
// ============================================================

/**
 * HTMLをNetlifyにデプロイする。
 *
 * フロー:
 * 1. サイトが存在しなければ作成
 * 2. SHA1ダイジェストベースのデプロイ作成
 * 3. 必要なファイルをアップロード
 * 4. デプロイURLを返す
 *
 * @param html - デプロイするHTML文字列
 * @param sessionId - セッションID (サイト名に使用)
 * @param netlifyToken - Netlify API認証トークン
 * @returns デプロイURL
 */
export async function deployToNetlify(
  html: string,
  sessionId: string,
  netlifyToken: string,
): Promise<string> {
  try {
    // 1. サイト検索または作成
    let site = await findSiteByName(sessionId, netlifyToken);
    if (!site) {
      site = await createSite(sessionId, netlifyToken);
      console.log(`Created new site: ${site.name} (${site.id})`);
    } else {
      console.log(`Found existing site: ${site.name} (${site.id})`);
    }

    // 2. ファイルマップ作成 (SHA1ダイジェスト)
    const indexHash = computeSha1(html);
    const files: DeployFileMap = {
      "/index.html": indexHash,
    };

    // 3. デプロイ作成 (ダイジェスト方式)
    const deploy = await netlifyApiRequest<NetlifyDeploy>(
      `/sites/${site.id}/deploys`,
      netlifyToken,
      {
        method: "POST",
        body: JSON.stringify({
          files,
          draft: false,
        }),
      },
    );

    console.log(`Deploy created: ${deploy.id} (state: ${deploy.state})`);

    // 4. 必要なファイルをアップロード
    // deploy.stateが "uploading" の場合、ファイルをPUTでアップロード
    if (deploy.state === "uploading" || deploy.state === "prepared") {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

      try {
        const uploadResponse = await fetch(
          `${NETLIFY_API_BASE}/deploys/${deploy.id}/files/index.html`,
          {
            method: "PUT",
            headers: {
              Authorization: `Bearer ${netlifyToken}`,
              "Content-Type": "application/octet-stream",
            },
            body: html,
            signal: controller.signal,
          },
        );

        if (!uploadResponse.ok) {
          throw new Error(
            `File upload failed (${uploadResponse.status}): ${await uploadResponse.text()}`,
          );
        }
      } finally {
        clearTimeout(timeoutId);
      }

      console.log("File uploaded: /index.html");
    }

    // 5. デプロイURLを構築
    // カスタムドメインが設定されている場合はそちらを返す
    const deployUrl = `https://${sessionId}.${DEPLOY_DOMAIN}`;
    console.log(`Deploy URL: ${deployUrl}`);

    return deployUrl;
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Netlifyデプロイ中に不明なエラーが発生しました";
    throw new Error(`デプロイ失敗: ${message}`);
  }
}

/**
 * デプロイステータスを確認
 */
export async function checkDeployStatus(
  siteId: string,
  deployId: string,
  netlifyToken: string,
): Promise<string> {
  try {
    const deploy = await netlifyApiRequest<NetlifyDeploy>(
      `/sites/${siteId}/deploys/${deployId}`,
      netlifyToken,
    );
    return deploy.state;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "ステータス確認に失敗しました";
    throw new Error(`デプロイステータス確認失敗: ${message}`);
  }
}
