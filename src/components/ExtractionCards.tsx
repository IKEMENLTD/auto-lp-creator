/**
 * 抽出情報カード
 *
 * LP生成に必要な5つの必須フィールドを常に表示。
 * - 抽出済み + 高confidence → 緑チェック + 値
 * - 抽出済み + 低confidence → 黄色警告 + 「タップで修正」
 * - 未抽出 → 赤エラー + 「この情報が必要です」
 *
 * タップで手動編集モーダルを開く。
 */

import React, { useMemo } from 'react';
import { AlertTriangle, CheckCircle, Pencil, XCircle } from 'lucide-react';
import type { ExtractedDataMap, ConfidenceFieldValue } from '../types/dashboard';
import { FIELD_LABELS, CONFIDENCE_THRESHOLD } from '../lib/constants';

// ============================================================
// Props
// ============================================================

interface ExtractionCardsProps {
  readonly extractedData: ExtractedDataMap;
  readonly onEditField: (field: string, currentValue: string) => void;
}

// ============================================================
// LP必須フィールド定義
// ============================================================

const REQUIRED_FIELD_KEYS = [
  'company_name',
  'service_name',
  'industry',
  'target_customer',
  'strengths',
] as const;

// ============================================================
// ヘルパー
// ============================================================

type FieldStatus = 'filled' | 'low_confidence' | 'missing';

interface FieldDisplayInfo {
  readonly key: string;
  readonly label: string;
  readonly status: FieldStatus;
  readonly displayValue: string;
}

function getFieldStatus(field: ConfidenceFieldValue | undefined): FieldStatus {
  if (!field) return 'missing';
  const val = field.value;
  if (val === null || val === undefined) return 'missing';
  if (typeof val === 'string' && val.length === 0) return 'missing';
  if (Array.isArray(val) && val.length === 0) return 'missing';
  if (field.confidence < CONFIDENCE_THRESHOLD) return 'low_confidence';
  return 'filled';
}

function formatValue(value: string | readonly string[] | null | undefined): string {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) {
    return value.length > 0 ? (value as string[]).join(', ') : '';
  }
  return value as string;
}

function buildFieldDisplayList(data: ExtractedDataMap): readonly FieldDisplayInfo[] {
  return REQUIRED_FIELD_KEYS.map((key) => {
    const field = data[key] as ConfidenceFieldValue | undefined;
    const status = getFieldStatus(field);
    const label = FIELD_LABELS[key] ?? key;
    const displayValue = field ? formatValue(field.value) : '';

    return { key, label, status, displayValue };
  });
}

// ============================================================
// 追加フィールド（必須以外で抽出済みのもの）
// ============================================================

interface ExtraFieldInfo {
  readonly key: string;
  readonly label: string;
  readonly displayValue: string;
  readonly isLowConfidence: boolean;
}

function buildExtraFields(data: ExtractedDataMap): readonly ExtraFieldInfo[] {
  const requiredSet = new Set<string>(REQUIRED_FIELD_KEYS);
  const extras: ExtraFieldInfo[] = [];

  for (const [key, raw] of Object.entries(data)) {
    if (requiredSet.has(key)) continue;
    if (key === 'contact_info') continue;

    const field = raw as ConfidenceFieldValue | undefined;
    if (!field) continue;
    const val = field.value;
    if (val === null || val === undefined) continue;
    if (typeof val === 'string' && val.length === 0) continue;
    if (Array.isArray(val) && val.length === 0) continue;

    extras.push({
      key,
      label: FIELD_LABELS[key] ?? key,
      displayValue: formatValue(val),
      isLowConfidence: field.confidence < CONFIDENCE_THRESHOLD,
    });
  }

  return extras;
}

// ============================================================
// スタイル定義
// ============================================================

const STATUS_CONFIG: Record<FieldStatus, {
  border: string;
  bg: string;
  icon: typeof CheckCircle;
  iconColor: string;
  badge: string | null;
  badgeBg: string;
  badgeText: string;
  hint: string;
}> = {
  filled: {
    border: 'border-green-500/40',
    bg: 'bg-green-500/5',
    icon: CheckCircle,
    iconColor: 'text-green-500',
    badge: null,
    badgeBg: '',
    badgeText: '',
    hint: '',
  },
  low_confidence: {
    border: 'border-yellow-500/60',
    bg: 'bg-yellow-500/5',
    icon: AlertTriangle,
    iconColor: 'text-yellow-400',
    badge: '未確定',
    badgeBg: 'bg-yellow-500/20',
    badgeText: 'text-yellow-400',
    hint: 'タップして修正できます',
  },
  missing: {
    border: 'border-red-500/40',
    bg: 'bg-red-500/5',
    icon: XCircle,
    iconColor: 'text-red-400',
    badge: '未取得',
    badgeBg: 'bg-red-500/20',
    badgeText: 'text-red-400',
    hint: 'この情報が必要です',
  },
};

// ============================================================
// コンポーネント
// ============================================================

export const ExtractionCards: React.FC<ExtractionCardsProps> = ({
  extractedData,
  onEditField,
}) => {
  const requiredFields = useMemo(() => buildFieldDisplayList(extractedData), [extractedData]);
  const extraFields = useMemo(() => buildExtraFields(extractedData), [extractedData]);

  const filledCount = requiredFields.filter((f) => f.status === 'filled').length;
  const totalCount = requiredFields.length;

  return (
    <section className="px-4 pt-4 pb-2">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
          必須情報
        </h2>
        <span className={`text-xs font-medium ${filledCount === totalCount ? 'text-green-400' : 'text-gray-500'}`}>
          {filledCount} / {totalCount} 完了
        </span>
      </div>

      {/* プログレスバー */}
      <div className="w-full h-1.5 bg-gray-800 rounded-full mb-4 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            filledCount === totalCount ? 'bg-green-500' : filledCount > 0 ? 'bg-blue-500' : 'bg-gray-700'
          }`}
          style={{ width: `${(filledCount / totalCount) * 100}%` }}
        />
      </div>

      {/* 必須フィールド一覧 */}
      <div className="space-y-2">
        {requiredFields.map((field) => {
          const config = STATUS_CONFIG[field.status];
          const StatusIcon = config.icon;

          return (
            <button
              key={field.key}
              type="button"
              className={[
                'w-full text-left p-3 rounded border transition-all',
                'active:scale-[0.98]',
                config.border,
                config.bg,
              ].join(' ')}
              onClick={() => {
                onEditField(field.key, field.displayValue);
              }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-1">
                    <StatusIcon className={`w-3.5 h-3.5 ${config.iconColor}`} />
                    <span className="text-xs font-medium text-gray-400">
                      {field.label}
                    </span>
                    {config.badge && (
                      <span className={`inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded ${config.badgeBg} ${config.badgeText}`}>
                        {config.badge}
                      </span>
                    )}
                  </div>
                  {field.status === 'missing' ? (
                    <p className="text-xs text-red-400/70">{config.hint}</p>
                  ) : (
                    <p className="text-sm text-gray-100 truncate">
                      {field.displayValue || '-'}
                    </p>
                  )}
                  {field.status === 'low_confidence' && (
                    <p className="text-[10px] text-yellow-500/70 mt-0.5">{config.hint}</p>
                  )}
                </div>
                <Pencil className="w-4 h-4 text-gray-600 flex-shrink-0 mt-1" />
              </div>
            </button>
          );
        })}
      </div>

      {/* 追加抽出フィールド（必須以外） */}
      {extraFields.length > 0 && (
        <>
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mt-5 mb-3">
            その他の抽出情報
          </h2>
          <div className="space-y-2">
            {extraFields.map((field) => (
              <button
                key={field.key}
                type="button"
                className={[
                  'w-full text-left p-3 rounded border transition-all',
                  'active:scale-[0.98]',
                  field.isLowConfidence
                    ? 'border-yellow-500/60 bg-yellow-500/5'
                    : 'border-gray-700 bg-gray-900/50',
                ].join(' ')}
                onClick={() => onEditField(field.key, field.displayValue)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-xs font-medium text-gray-400">
                        {field.label}
                      </span>
                      {field.isLowConfidence ? (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium bg-yellow-500/20 text-yellow-400 rounded">
                          <AlertTriangle className="w-3 h-3" />
                          未確定
                        </span>
                      ) : (
                        <CheckCircle className="w-3 h-3 text-green-500/70" />
                      )}
                    </div>
                    <p className="text-sm text-gray-100 truncate">
                      {field.displayValue || '-'}
                    </p>
                  </div>
                  <Pencil className="w-4 h-4 text-gray-600 flex-shrink-0 mt-1" />
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
};
