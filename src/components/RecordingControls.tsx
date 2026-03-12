/**
 * 録音コントロール
 *
 * 3つの録音状態に応じたボタンを表示:
 * - idle: 録音開始
 * - recording: 一時停止 + 完全停止
 * - paused: 再開 + 完全停止
 * - ended: 新規録音 + 共有
 */

import React, { useState } from 'react';
import { Mic, Pause, Play, Square, Plus, Share } from 'lucide-react';
import type { ShareMethod } from '../types/dashboard';

type RecordingState = 'idle' | 'recording' | 'paused' | 'ended';

interface RecordingControlsProps {
  readonly state: RecordingState;
  readonly onStart: () => void;
  readonly onPause: () => void;
  readonly onResume: () => void;
  readonly onStop: () => void;
  readonly onNew: () => void;
  readonly hasCompletedDeliverables?: boolean;
  readonly onShareAll?: (method: ShareMethod) => Promise<void>;
}

export const RecordingControls: React.FC<RecordingControlsProps> = ({
  state,
  onStart,
  onPause,
  onResume,
  onStop,
  onNew,
  hasCompletedDeliverables = false,
  onShareAll,
}) => {
  const [showShareMenu, setShowShareMenu] = useState(false);

  if (state === 'idle') {
    return (
      <button
        type="button"
        className="flex items-center justify-center gap-3 w-full max-w-xs py-5 rounded-lg font-semibold text-lg transition-all min-h-[64px] bg-red-600 text-white active:scale-95 hover:bg-red-500"
        onClick={onStart}
      >
        <Mic className="w-6 h-6" />
        録音開始
      </button>
    );
  }

  if (state === 'ended') {
    return (
      <div className="flex gap-3">
        <button
          type="button"
          className="flex items-center justify-center gap-2 px-4 py-3 rounded font-medium text-sm transition-all min-h-[48px] flex-1 bg-blue-600 text-white active:scale-95 hover:bg-blue-500"
          onClick={onNew}
        >
          <Plus className="w-4 h-4" />
          新規録音
        </button>

        {onShareAll && (
          <div className="relative flex-1">
            <button
              type="button"
              disabled={!hasCompletedDeliverables}
              className={[
                'flex items-center justify-center gap-2 px-4 py-3 rounded font-medium text-sm transition-all min-h-[48px] w-full',
                hasCompletedDeliverables
                  ? 'bg-blue-500/10 border border-blue-500/40 text-blue-400 active:scale-95'
                  : 'bg-gray-800 border border-gray-700 text-gray-600 cursor-not-allowed',
              ].join(' ')}
              onClick={() => setShowShareMenu(!showShareMenu)}
            >
              <Share className="w-4 h-4" />
              一括共有
            </button>

            {showShareMenu && hasCompletedDeliverables && (
              <div className="absolute bottom-full left-0 right-0 mb-2 bg-gray-800 border border-gray-700 rounded shadow-lg overflow-hidden">
                {(['line', 'email', 'qr'] as const).map((method) => (
                  <button
                    key={method}
                    type="button"
                    className="w-full px-4 py-3 text-left text-sm text-gray-200 hover:bg-gray-700 active:bg-gray-600 transition-colors min-h-[44px] border-t border-gray-700 first:border-t-0"
                    onClick={() => {
                      setShowShareMenu(false);
                      void onShareAll(method);
                    }}
                  >
                    {method === 'line' ? 'LINEで共有' : method === 'email' ? 'メールで共有' : 'QRコードで共有'}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // recording or paused
  return (
    <div className="flex gap-3">
      {state === 'recording' ? (
        <button
          type="button"
          className="flex items-center justify-center gap-2 px-4 py-3 rounded font-medium text-sm transition-all min-h-[48px] flex-1 bg-yellow-500/10 border border-yellow-500/40 text-yellow-400 active:scale-95"
          onClick={onPause}
        >
          <Pause className="w-4 h-4" />
          一時停止
        </button>
      ) : (
        <button
          type="button"
          className="flex items-center justify-center gap-2 px-4 py-3 rounded font-medium text-sm transition-all min-h-[48px] flex-1 bg-green-500/10 border border-green-500/40 text-green-400 active:scale-95"
          onClick={onResume}
        >
          <Play className="w-4 h-4" />
          再開
        </button>
      )}

      <button
        type="button"
        className="flex items-center justify-center gap-2 px-4 py-3 rounded font-medium text-sm transition-all min-h-[48px] flex-1 bg-red-500/10 border border-red-500/40 text-red-400 active:scale-95"
        onClick={onStop}
      >
        <Square className="w-4 h-4" />
        完全停止
      </button>
    </div>
  );
};
