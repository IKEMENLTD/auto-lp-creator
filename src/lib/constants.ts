/**
 * ダッシュボード定数
 */

import type { DeliverableType } from '../types/dashboard';

/** 抽出フィールドのラベルマップ */
export const FIELD_LABELS: Record<string, string> = {
  company_name: '会社名',
  industry: '業種',
  service_name: 'サービス名',
  target_customer: 'ターゲット顧客',
  price_range: '価格帯',
  strengths: '強み',
  pain_points: '課題・悩み',
  current_marketing: '現在の集客方法',
  desired_outcome: '希望する成果',
  contact_info: '連絡先',
  tone_keywords: 'トーン・キーワード',
  upsell_signals: 'アップセル兆候',
} as const;

/** confidence 閾値 */
export const CONFIDENCE_THRESHOLD = 0.6;

/** 制作物ごとの必須フィールド */
export const REQUIRED_FIELDS: Record<DeliverableType, readonly string[]> = {
  lp: ['company_name', 'service_name', 'industry', 'target_customer', 'strengths'],
  ad_creative: ['company_name', 'service_name', 'target_customer', 'strengths'],
  flyer: ['company_name', 'service_name', 'target_customer', 'strengths'],
  hearing_form: ['industry', 'service_name'],
  line_design: ['company_name', 'service_name', 'target_customer'],
  minutes: ['company_name'],
  profile: ['company_name', 'service_name', 'strengths', 'target_customer'],
  system_proposal: ['company_name', 'service_name', 'target_customer', 'pain_points'],
} as const;

/** 制作物の表示順 */
export const DELIVERABLE_ORDER: readonly DeliverableType[] = [
  'lp',
  'ad_creative',
  'flyer',
  'hearing_form',
  'line_design',
  'minutes',
  'profile',
  'system_proposal',
] as const;

/** 制作物ラベル */
export const DELIVERABLE_LABELS: Record<DeliverableType, string> = {
  lp: 'LP',
  ad_creative: '広告',
  flyer: 'チラシ',
  hearing_form: 'フォーム',
  line_design: 'LINE設計',
  minutes: '議事録',
  profile: 'プロフィール',
  system_proposal: 'システム提案',
} as const;
