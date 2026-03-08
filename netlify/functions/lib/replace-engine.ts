/**
 * LP置換エンジン - TypeScript移植
 * Python replace_engine.py からの移植
 *
 * 2種類のプレースホルダーを処理:
 * 1. {{variable}} - head/meta/footer等の単純置換
 * 2. data-placeholder="name" - body内テキストコンテンツ (Sonnet生成)
 */

import type {
  MetaData,
  CopyData,
  ReplaceResult,
  ReplaceStats,
  TemplateScanResult,
} from "./types.js";

/** {{variable}} パターン (事前コンパイル) */
const HEAD_PLACEHOLDER_PATTERN = /\{\{(\w+)\}\}/g;

/** data-placeholder パターン (事前コンパイル) */
const BODY_PLACEHOLDER_PATTERN = new RegExp(
  "(<[^>]+\\s+data-placeholder=\"([^\"]+)\"[^>]*>)" + // 開始タグ + placeholder名
    "(.*?)" + // 内部コンテンツ
    "(</[a-zA-Z][a-zA-Z0-9]*>)", // 閉じタグ
  "gs",
);

/**
 * {{variable}} 形式のプレースホルダーを置換。
 * @returns [置換済みHTML, 未置換プレースホルダーリスト, 置換成功数]
 */
export function replaceHeadPlaceholders(
  html: string,
  data: MetaData,
): [string, string[], number] {
  const unreplaced: string[] = [];
  let replacedCount = 0;

  const result = html.replace(
    HEAD_PLACEHOLDER_PATTERN,
    (match: string, key: string): string => {
      const value = data[key];
      if (value !== undefined && value !== null) {
        replacedCount++;
        return value;
      }
      unreplaced.push(key);
      return match; // そのまま残す
    },
  );

  return [result, unreplaced, replacedCount];
}

/**
 * data-placeholder="name" 属性を持つ要素の内部テキストを置換。
 *
 * 対応パターン:
 * 1. <tag data-placeholder="key">古いテキスト</tag>
 * 2. <tag data-placeholder="key">古いテキスト<br/>改行あり</tag>
 * 3. ネストされたインライン要素を含むケース
 *
 * @returns [置換済みHTML, 未置換プレースホルダーリスト, 置換成功数]
 */
export function replaceBodyPlaceholders(
  html: string,
  copyData: CopyData,
): [string, string[], number] {
  const unreplaced: string[] = [];
  let replacedCount = 0;

  // パターンのlastIndexをリセット (グローバルフラグ使用時の必須操作)
  BODY_PLACEHOLDER_PATTERN.lastIndex = 0;

  const result = html.replace(
    BODY_PLACEHOLDER_PATTERN,
    (
      _match: string,
      openTag: string,
      key: string,
      _content: string,
      closeTag: string,
    ): string => {
      const value = copyData[key];
      if (value !== undefined && value !== null) {
        replacedCount++;
        return `${openTag}${value}${closeTag}`;
      }
      unreplaced.push(key);
      return _match; // そのまま残す
    },
  );

  return [result, unreplaced, replacedCount];
}

/**
 * 全プレースホルダーを一括置換。
 */
export function replaceAll(
  html: string,
  metaData: MetaData,
  copyData: CopyData,
): ReplaceResult {
  // Phase 1: {{variable}} 置換
  const [htmlAfterMeta, metaUnreplaced, metaReplacedCount] =
    replaceHeadPlaceholders(html, metaData);

  // Phase 2: data-placeholder 置換
  const [htmlAfterBody, bodyUnreplaced, bodyReplacedCount] =
    replaceBodyPlaceholders(htmlAfterMeta, copyData);

  // 統計計算
  HEAD_PLACEHOLDER_PATTERN.lastIndex = 0;
  const remainingMetaMatches = htmlAfterBody.match(HEAD_PLACEHOLDER_PATTERN);
  const remainingMetaCount = remainingMetaMatches
    ? remainingMetaMatches.length
    : 0;

  const bodyPlaceholderPattern = /data-placeholder="([^"]+)"/g;
  const remainingBodyMatches = htmlAfterBody.match(bodyPlaceholderPattern);
  const remainingBodyCount = remainingBodyMatches
    ? remainingBodyMatches.length
    : 0;

  const stats: ReplaceStats = {
    meta_replaced: metaReplacedCount,
    body_replaced: bodyReplacedCount,
    meta_total_in_template: remainingMetaCount + metaReplacedCount,
    body_total_in_template: remainingBodyCount + bodyReplacedCount,
  };

  return {
    html: htmlAfterBody,
    meta_unreplaced: metaUnreplaced,
    body_unreplaced: bodyUnreplaced,
    stats,
  };
}

/**
 * テンプレートのプレースホルダーを全スキャンして一覧を返す。
 */
export function scanTemplate(html: string): TemplateScanResult {
  // {{variable}} を収集
  HEAD_PLACEHOLDER_PATTERN.lastIndex = 0;
  const metaMatches = html.matchAll(HEAD_PLACEHOLDER_PATTERN);
  const metaKeysSet = new Set<string>();
  for (const m of metaMatches) {
    const key = m[1];
    if (key !== undefined) {
      metaKeysSet.add(key);
    }
  }
  const metaKeys = Array.from(metaKeysSet).sort();

  // data-placeholder を収集
  const bodyPattern = /data-placeholder="([^"]+)"/g;
  const bodyMatches = html.matchAll(bodyPattern);
  const bodyKeysSet = new Set<string>();
  for (const m of bodyMatches) {
    const key = m[1];
    if (key !== undefined) {
      bodyKeysSet.add(key);
    }
  }
  const bodyKeys = Array.from(bodyKeysSet).sort();

  return {
    meta_placeholders: metaKeys,
    body_placeholders: bodyKeys,
    meta_count: metaKeys.length,
    body_count: bodyKeys.length,
  };
}
