/**
 * 制作物カード
 *
 * 4ステータス (情報不足/生成可能/生成中/完了) に応じた表示切替。
 */

import React from 'react';
import { ExternalLink, Share2, Loader2, Download, RotateCcw } from 'lucide-react';
import type { DeliverableStatus, DeliverableType } from '../types/dashboard';
import { FIELD_LABELS, REQUIRED_FIELDS } from '../lib/constants';
import type { LucideIcon } from 'lucide-react';

// ============================================================
// Props
// ============================================================

interface DeliverableCardProps {
  readonly type: DeliverableType;
  readonly label: string;
  readonly icon: LucideIcon;
  readonly status: DeliverableStatus;
  readonly missingFields: readonly string[];
  readonly resultUrl: string | null;
  readonly errorMessage: string | null;
  readonly onGenerate: () => void;
  readonly onShare: () => void;
}

// ============================================================
// PDF対応制作物
// ============================================================

const PDF_TYPES = new Set<DeliverableType>([
  'minutes', 'proposal', 'system_proposal', 'profile',
]);

/** 新しいウィンドウでページを開き、印刷ダイアログ(PDF保存)を表示 */
function printToPdf(url: string): void {
  const w = window.open(url, '_blank');
  if (w) {
    w.addEventListener('load', () => {
      setTimeout(() => w.print(), 500);
    });
  }
}

// ============================================================
// ステータス別スタイル
// ============================================================

interface StatusStyle {
  readonly border: string;
  readonly bg: string;
  readonly iconColor: string;
  readonly labelColor: string;
}

const STATUS_STYLES: Record<DeliverableStatus, StatusStyle> = {
  insufficient: {
    border: 'border-gray-700',
    bg: 'bg-gray-900/30',
    iconColor: 'text-gray-600',
    labelColor: 'text-gray-500',
  },
  ready: {
    border: 'border-blue-500/50',
    bg: 'bg-blue-500/5',
    iconColor: 'text-blue-500',
    labelColor: 'text-blue-400',
  },
  generating: {
    border: 'border-yellow-500/50',
    bg: 'bg-yellow-500/5',
    iconColor: 'text-yellow-400',
    labelColor: 'text-yellow-300',
  },
  completed: {
    border: 'border-green-500/50',
    bg: 'bg-green-500/5',
    iconColor: 'text-green-500',
    labelColor: 'text-green-400',
  },
};

// ============================================================
// コンポーネント
// ============================================================

export const DeliverableCard: React.FC<DeliverableCardProps> = ({
  type,
  label,
  icon: Icon,
  status,
  missingFields,
  resultUrl,
  errorMessage,
  onGenerate,
  onShare,
}) => {
  const style = STATUS_STYLES[status];

  return (
    <div
      className={[
        'relative flex flex-col items-center justify-center p-4 rounded border min-h-[120px] transition-all',
        style.border,
        style.bg,
        status === 'generating' ? 'animate-pulse-slow' : '',
      ].join(' ')}
    >
      {/* アイコン */}
      <Icon className={`w-7 h-7 mb-2 ${style.iconColor}`} />

      {/* ラベル */}
      <span className={`text-sm font-medium mb-1 ${style.labelColor}`}>
        {label}
      </span>

      {/* ステータス別コンテンツ */}
      {status === 'insufficient' && (() => {
        const totalRequired = REQUIRED_FIELDS[type]?.length ?? 0;
        const filledCount = totalRequired - missingFields.length;
        return (
          <div className="flex flex-col items-center gap-1 mt-1 w-full">
            <span className="text-[10px] text-gray-500 text-center leading-tight">
              {filledCount}/{totalRequired} 項目完了
            </span>
            <button
              type="button"
              className="px-3 py-1.5 text-xs font-medium text-gray-500 bg-gray-500/10 border border-gray-600/30 rounded cursor-not-allowed min-w-[88px] min-h-[32px]"
              disabled
            >
              情報不足
            </button>
          </div>
        );
      })()}

      {status === 'ready' && (
        <button
          type="button"
          className="mt-1 px-3 py-1.5 text-xs font-medium text-blue-400 bg-blue-500/10 border border-blue-500/30 rounded active:scale-95 transition-transform min-w-[88px] min-h-[32px]"
          onClick={onGenerate}
        >
          タップで生成
        </button>
      )}

      {status === 'generating' && (
        <div className="flex flex-col items-center gap-1 mt-1 w-full">
          <Loader2 className="w-4 h-4 text-yellow-400 animate-spin" />
          <span className="text-[10px] text-yellow-400">
            {errorMessage?.startsWith('Step') ? errorMessage : '生成中...'}
          </span>
          <div className="w-full h-1 bg-gray-700 rounded overflow-hidden mt-1">
            <div
              className="h-full bg-yellow-400 rounded transition-all duration-500"
              style={{
                width: errorMessage?.includes('1/3') ? '33%'
                  : errorMessage?.includes('2/3') ? '66%'
                  : errorMessage?.includes('3/3') ? '90%'
                  : '50%',
              }}
            />
          </div>
        </div>
      )}

      {status === 'completed' && (
        <div className="flex items-center gap-2 mt-1 flex-wrap justify-center">
          {resultUrl && (
            <a
              href={resultUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 px-2 py-1 text-[10px] text-green-400 bg-green-500/10 border border-green-500/30 rounded active:scale-95 transition-transform min-h-[28px]"
            >
              <ExternalLink className="w-3 h-3" />
              表示
            </a>
          )}
          {resultUrl && (
            <a
              href={resultUrl}
              download={`${type}.html`}
              className="flex items-center gap-1 px-2 py-1 text-[10px] text-blue-400 bg-blue-500/10 border border-blue-500/30 rounded active:scale-95 transition-transform min-h-[28px]"
            >
              <Download className="w-3 h-3" />
              DL
            </a>
          )}
          {resultUrl && PDF_TYPES.has(type) && (
            <button
              type="button"
              className="flex items-center gap-1 px-2 py-1 text-[10px] text-purple-400 bg-purple-500/10 border border-purple-500/30 rounded active:scale-95 transition-transform min-h-[28px]"
              onClick={() => printToPdf(resultUrl)}
            >
              <Download className="w-3 h-3" />
              PDF
            </button>
          )}
          <button
            type="button"
            className="flex items-center gap-1 px-2 py-1 text-[10px] text-gray-400 bg-gray-500/10 border border-gray-500/30 rounded active:scale-95 transition-transform min-h-[28px]"
            onClick={onGenerate}
          >
            <RotateCcw className="w-3 h-3" />
            再生成
          </button>
        </div>
      )}

      {/* 失敗時: エラー表示 + リトライ */}
      {errorMessage && status !== 'generating' && status !== 'completed' && (
        <div className="mt-1 text-center">
          <p className="text-[10px] text-red-400 mb-1 truncate max-w-full">{errorMessage}</p>
          <button
            type="button"
            className="flex items-center gap-1 px-3 py-1.5 text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded active:scale-95 transition-transform mx-auto"
            onClick={onGenerate}
          >
            <RotateCcw className="w-3 h-3" />
            リトライ
          </button>
        </div>
      )}
    </div>
  );
};
