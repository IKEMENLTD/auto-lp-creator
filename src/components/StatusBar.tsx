/**
 * ステータスバー (エリアA)
 *
 * 画面上部固定。経過時間、抽出項目数、パルスアニメーション。
 */

import React from 'react';
import { Activity, Clock, ArrowLeft } from 'lucide-react';
import type { SessionStatus } from '../types/dashboard';

// ============================================================
// Props
// ============================================================

interface StatusBarProps {
  readonly elapsed: number;
  readonly filledFields: number;
  readonly totalFields: number;
  readonly status: SessionStatus;
  readonly isRecording: boolean;
  readonly onBack?: () => void;
}

// ============================================================
// ヘルパー
// ============================================================

function formatElapsed(seconds: number): string {
  const mm = Math.floor(seconds / 60);
  const ss = seconds % 60;
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

function getStatusText(
  status: SessionStatus,
  filledFields: number,
  totalFields: number,
): string {
  if (status === 'ended') return '終了';
  if (status === 'paused') return '一時停止';
  if (filledFields === 0) return '解析待機中...';
  if (filledFields < totalFields) return `${filledFields}/${totalFields}項目抽出済`;
  return '全項目抽出完了';
}

// ============================================================
// コンポーネント
// ============================================================

export const StatusBar: React.FC<StatusBarProps> = ({
  elapsed,
  filledFields,
  totalFields,
  status,
  isRecording,
  onBack,
}) => {
  const isAnalyzing = status === 'active' && isRecording;

  return (
    <header className="sticky top-0 z-50 flex items-center justify-between px-4 py-3 bg-gray-900 border-b border-gray-800">
      {/* 左: 戻るボタン + ステータス + パルス */}
      <div className="flex items-center gap-2">
        {onBack && (
          <button
            type="button"
            className="p-1.5 -ml-1 text-gray-400 hover:text-white transition-colors"
            onClick={onBack}
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
        )}
        <div className="relative flex items-center justify-center w-8 h-8">
          <Activity className="w-5 h-5 text-blue-500" />
          {isAnalyzing && (
            <span className="absolute inset-0 rounded-full bg-blue-500 opacity-30 animate-ping" />
          )}
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-medium text-gray-100">
            {getStatusText(status, filledFields, totalFields)}
          </span>
          {isAnalyzing && (
            <span className="text-xs text-blue-400">解析中...</span>
          )}
        </div>
      </div>

      {/* 右: 経過時間 */}
      <div className="flex items-center gap-1.5 text-gray-400">
        <Clock className="w-4 h-4" />
        <span className="text-sm font-mono tabular-nums">
          {formatElapsed(elapsed)}
        </span>
      </div>
    </header>
  );
};
