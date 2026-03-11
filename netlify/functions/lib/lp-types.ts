/**
 * LP生成 - 型定義・ユーティリティ
 */

// ============================================================
// 型定義
// ============================================================

export type DeliverableType = "lp" | "ad_creative" | "flyer" | "hearing_form" | "line_design" | "minutes" | "profile" | "system_proposal" | "proposal";

export interface FlatData {
  company_name: string;
  service_name: string;
  industry: string;
  target_customer: string;
  strengths: string[];
  pain_points: string[];
  price_range: string;
  current_marketing: string;
  key_persons: string[];
}

export interface LpContent {
  // Person
  person_name: string;
  person_title: string;
  // Hero
  hero_headline: string;
  hero_sub: string;
  hero_features: string[];
  badge_text: string;
  // Problems
  problems: { title: string; desc: string }[];
  // Solution
  solution_title: string;
  solution_text: string;
  strengths: { title: string; desc: string }[];
  // Services
  services: { title: string; desc: string }[];
  // Reasons (選ばれる理由)
  reasons: { title: string; desc: string }[];
  // Use Cases (活用シーン)
  use_cases: { title: string; desc: string; icon_keyword: string }[];
  // Stats
  stats: { number: string; label: string }[];
  // Hero dashboard metrics (業種に合わせた指標)
  dashboard_metrics: { label: string; pct: number }[];
  // Trust badges (信頼性バッジ)
  trust_badges: string[];
  // Columns (お役立ち記事カード)
  columns: { title: string; desc: string }[];
  // Cases (real data from transcript only)
  cases: { category: string; detail: string; result: string }[];
  // Functions (主な機能)
  functions: { title: string; desc: string }[];
  // Comparison
  comparison: { feature: string; us: string; other: string }[];
  // Flow
  flow: { title: string; desc: string }[];
  faq: { q: string; a: string }[];
  // CTA
  cta_text: string;
  cta_sub: string;
  // Company
  company_profile: string;
}

export interface AdContent {
  patterns: { primary: string; headline: string; description: string; targeting: string; image_direction: string }[];
}

export interface MinutesContent {
  date: string;
  participants_self: string;
  participants_other: string;
  purpose: string;
  topics: { title: string; summary: string }[];
  decisions: string[];
  actions: { item: string; owner: string; deadline: string }[];
  next_meeting: string;
  upsell_notes: string;
}

export interface GenericContent {
  sections: { title: string; content: string }[];
  headline: string;
  sub: string;
}

// ============================================================
// データ変換
// ============================================================

export function flatten(raw: Record<string, unknown>): FlatData {
  const get = (key: string): string => {
    const v = raw[key];
    if (typeof v === "string") return v;
    if (v && typeof v === "object") {
      const obj = v as Record<string, unknown>;
      if (typeof obj["value"] === "string") return obj["value"];
    }
    return "";
  };
  const getArr = (key: string): string[] => {
    const v = raw[key];
    if (Array.isArray(v)) return v.filter((s): s is string => typeof s === "string");
    if (v && typeof v === "object") {
      const obj = v as Record<string, unknown>;
      if (Array.isArray(obj["value"])) return (obj["value"] as unknown[]).filter((s): s is string => typeof s === "string");
    }
    return [];
  };
  return {
    company_name: get("company_name") || "企業",
    service_name: get("service_name") || "サービス",
    industry: get("industry") || "",
    target_customer: get("target_customer") || "企業の経営者・担当者",
    strengths: getArr("strengths").length > 0 ? getArr("strengths") : ["実績豊富"],
    pain_points: getArr("pain_points").length > 0 ? getArr("pain_points") : ["課題あり"],
    price_range: get("price_range"),
    current_marketing: get("current_marketing"),
    key_persons: getArr("key_persons"),
  };
}

// ============================================================
// ユーティリティ
// ============================================================

export function esc(s: string): string {
  return (s ?? '').replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function hexToRgb(hex: string): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `${r},${g},${b}`;
}
