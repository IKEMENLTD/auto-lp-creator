/**
 * 抽出情報カード (エリアB上半分)
 *
 * Supabase Realtime で受信した extracted_data をカード形式で表示。
 * 新規抽出時にフェードインアニメーション。
 * confidence < 0.6 -> 黄色ボーダー + 「未確定」バッジ。
 * タップで手動編集モーダルを開く。
 */

import React, { useMemo } from 'react';
import { AlertTriangle, CheckCircle, Pencil } from 'lucide-react';
import type { ExtractedDataMap, ExtractionField, ConfidenceFieldValue } from '../types/dashboard';
import { FIELD_LABELS, CONFIDENCE_THRESHOLD } from '../lib/constants';

// ============================================================
// Props
// ============================================================

interface ExtractionCardsProps {
  readonly extractedData: ExtractedDataMap;
  readonly onEditField: (field: string, currentValue: string) => void;
}

// ============================================================
// ヘルパー
// ============================================================

function formatValue(value: string | readonly string[] | null): string {
  if (value === null || value === undefined) return '-';
  if (Array.isArray(value)) {
    return value.length > 0 ? (value as string[]).join(', ') : '-';
  }
  const strValue = value as string;
  return strValue.length > 0 ? strValue : '-';
}

function extractFields(data: ExtractedDataMap): readonly ExtractionField[] {
  const fields: ExtractionField[] = [];

  for (const [key, raw] of Object.entries(data)) {
    const field = raw as ConfidenceFieldValue | undefined;
    if (!field) continue;

    // contact_info は複合型なのでスキップ (将来対応)
    if (key === 'contact_info') continue;

    const label = FIELD_LABELS[key] ?? key;
    const val = field.value;

    // 値が空でないフィールドのみ表示
    if (val === null || val === undefined) continue;
    if (typeof val === 'string' && val.length === 0) continue;
    if (Array.isArray(val) && val.length === 0) continue;

    fields.push({
      key,
      label,
      value: val,
      confidence: field.confidence,
    });
  }

  return fields;
}

// ============================================================
// コンポーネント
// ============================================================

export const ExtractionCards: React.FC<ExtractionCardsProps> = ({
  extractedData,
  onEditField,
}) => {
  const fields = useMemo(() => extractFields(extractedData), [extractedData]);

  if (fields.length === 0) {
    return (
      <div className="px-4 py-8 text-center">
        <p className="text-sm text-gray-500">
          会話が開始されると、ここに抽出情報が表示されます
        </p>
      </div>
    );
  }

  return (
    <section className="px-4 pt-4 pb-2">
      <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
        抽出情報
      </h2>
      <div className="space-y-2">
        {fields.map((field) => {
          const isLowConfidence = field.confidence < CONFIDENCE_THRESHOLD;
          const displayValue = formatValue(field.value);

          return (
            <button
              key={field.key}
              type="button"
              className={[
                'w-full text-left p-3 rounded border transition-all animate-fade-in',
                'active:scale-[0.98]',
                isLowConfidence
                  ? 'border-yellow-500/60 bg-yellow-500/5'
                  : 'border-gray-700 bg-gray-900/50',
              ].join(' ')}
              onClick={() => {
                const currentVal = typeof field.value === 'string'
                  ? field.value
                  : Array.isArray(field.value) ? field.value.join(', ') : '';
                onEditField(field.key, currentVal);
              }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-xs font-medium text-gray-400">
                      {field.label}
                    </span>
                    {isLowConfidence ? (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium bg-yellow-500/20 text-yellow-400 rounded">
                        <AlertTriangle className="w-3 h-3" />
                        未確定
                      </span>
                    ) : (
                      <CheckCircle className="w-3 h-3 text-green-500/70" />
                    )}
                  </div>
                  <p className="text-sm text-gray-100 truncate">
                    {displayValue}
                  </p>
                </div>
                <Pencil className="w-4 h-4 text-gray-600 flex-shrink-0 mt-1" />
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
};
