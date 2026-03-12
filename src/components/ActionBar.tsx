/**
 * 操作バー (エリアC)
 *
 * 画面下部固定。セッション終了 + 一括共有ボタン。
 */

import React, { useState } from 'react';
import { Square, Share } from 'lucide-react';
import type { SessionStatus, ShareMethod } from '../types/dashboard';

// ============================================================
// Props
// ============================================================

interface ActionBarProps {
  readonly status: SessionStatus;
  readonly hasCompletedDeliverables: boolean;
  readonly onEndSession: () => Promise<void>;
  readonly onShareAll: (method: ShareMethod) => Promise<void>;
}

// ============================================================
// コンポーネント
// ============================================================

export const ActionBar: React.FC<ActionBarProps> = ({
  status,
  hasCompletedDeliverables,
  onEndSession,
  onShareAll,
}) => {
  const [isEnding, setIsEnding] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [showShareMenu, setShowShareMenu] = useState(false);

  const handleEndSession = async () => {
    if (isEnding || status === 'ended') return;
    setIsEnding(true);
    try {
      await onEndSession();
    } catch {
      // エラーは useSession で管理
    } finally {
      setIsEnding(false);
    }
  };

  const handleShare = async (method: ShareMethod) => {
    if (isSharing) return;
    setIsSharing(true);
    setShowShareMenu(false);
    try {
      await onShareAll(method);
    } catch {
      // エラーは上位で管理
    } finally {
      setIsSharing(false);
    }
  };

  const isSessionActive = status === 'active' || status === 'paused';

  return (
    <footer className="sticky bottom-0 z-50 flex items-center justify-between px-4 py-3 bg-gray-900 border-t border-gray-800 gap-3">
      {/* セッション終了 */}
      <button
        type="button"
        disabled={!isSessionActive || isEnding}
        className={[
          'flex items-center justify-center gap-2 px-4 py-3 rounded font-medium text-sm transition-all min-h-[48px] flex-1',
          isSessionActive && !isEnding
            ? 'bg-red-500/10 border border-red-500/40 text-red-400 active:scale-95'
            : 'bg-gray-800 border border-gray-700 text-gray-600 cursor-not-allowed',
        ].join(' ')}
        onClick={() => void handleEndSession()}
      >
        <Square className="w-4 h-4" />
        {isEnding ? '終了中...' : status === 'ended' ? '終了済み' : 'セッション終了'}
      </button>

      {/* 一括共有 */}
      <div className="relative flex-1">
        <button
          type="button"
          disabled={!hasCompletedDeliverables || isSharing}
          className={[
            'flex items-center justify-center gap-2 px-4 py-3 rounded font-medium text-sm transition-all min-h-[48px] w-full',
            hasCompletedDeliverables && !isSharing
              ? 'bg-blue-500/10 border border-blue-500/40 text-blue-400 active:scale-95'
              : 'bg-gray-800 border border-gray-700 text-gray-600 cursor-not-allowed',
          ].join(' ')}
          onClick={() => setShowShareMenu(!showShareMenu)}
        >
          <Share className="w-4 h-4" />
          {isSharing ? '共有中...' : '一括共有'}
        </button>

        {/* 共有メニュー */}
        {showShareMenu && hasCompletedDeliverables && (
          <div className="absolute bottom-full left-0 right-0 mb-2 bg-gray-800 border border-gray-700 rounded shadow-lg overflow-hidden">
            <button
              type="button"
              className="w-full px-4 py-3 text-left text-sm text-gray-200 hover:bg-gray-700 active:bg-gray-600 transition-colors min-h-[44px]"
              onClick={() => void handleShare('line')}
            >
              LINEで共有
            </button>
            <button
              type="button"
              className="w-full px-4 py-3 text-left text-sm text-gray-200 hover:bg-gray-700 active:bg-gray-600 transition-colors border-t border-gray-700 min-h-[44px]"
              onClick={() => void handleShare('email')}
            >
              メールで共有
            </button>
            <button
              type="button"
              className="w-full px-4 py-3 text-left text-sm text-gray-200 hover:bg-gray-700 active:bg-gray-600 transition-colors border-t border-gray-700 min-h-[44px]"
              onClick={() => void handleShare('qr')}
            >
              QRコードで共有
            </button>
          </div>
        )}
      </div>
    </footer>
  );
};
