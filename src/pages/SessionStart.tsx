/**
 * セッション開始画面
 *
 * 大きなタップしやすいボタンで新規セッションを開始する。
 * POST /api/session/start -> session_id 取得 -> /session/:id にリダイレクト。
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, Loader2, AlertCircle } from 'lucide-react';
import { api } from '../lib/api';

// ============================================================
// コンポーネント
// ============================================================

export const SessionStart: React.FC = () => {
  const navigate = useNavigate();
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleStart = async () => {
    if (isStarting) return;
    setIsStarting(true);
    setError(null);

    try {
      const result = await api.startSession();
      navigate(`/session/${result.session_id}`);
    } catch (err) {
      const msg = err instanceof Error
        ? err.message
        : (err && typeof err === 'object' && 'message' in err)
          ? String((err as { message: string }).message)
          : 'セッションの開始に失敗しました';
      setError(msg);
    } finally {
      setIsStarting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-950 text-white px-6">
      {/* タイトル */}
      <div className="text-center mb-12">
        <h1 className="text-2xl font-bold mb-2 text-gray-100">
          リアルタイムアポ制作物生成
        </h1>
        <p className="text-sm text-gray-400">
          商談中にリアルタイムで制作物を自動生成します
        </p>
      </div>

      {/* 開始ボタン */}
      <button
        type="button"
        disabled={isStarting}
        className={[
          'flex items-center justify-center gap-3 w-full max-w-xs py-5 rounded-lg font-semibold text-lg transition-all',
          'min-h-[64px]',
          isStarting
            ? 'bg-blue-600/50 text-blue-300 cursor-not-allowed'
            : 'bg-blue-600 text-white active:scale-95 hover:bg-blue-500',
        ].join(' ')}
        onClick={() => void handleStart()}
      >
        {isStarting ? (
          <>
            <Loader2 className="w-6 h-6 animate-spin" />
            開始中...
          </>
        ) : (
          <>
            <Play className="w-6 h-6" />
            セッション開始
          </>
        )}
      </button>

      {/* エラー表示 */}
      {error && (
        <div className="flex items-start gap-2 mt-6 p-3 bg-red-500/10 border border-red-500/30 rounded max-w-xs w-full">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-300">{error}</p>
        </div>
      )}

      {/* フッター */}
      <p className="mt-12 text-xs text-gray-600">
        音声解析 + AI制作物自動生成
      </p>
    </div>
  );
};
