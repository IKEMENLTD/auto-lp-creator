/**
 * フィールド手動編集モーダル
 *
 * 抽出フィールドの値を手動で修正する。
 * PATCH /api/session/:id/data で更新。
 */

import React, { useState, useEffect, useRef } from 'react';
import { X, Save, Loader2 } from 'lucide-react';
import { FIELD_LABELS } from '../lib/constants';

// ============================================================
// Props
// ============================================================

interface EditFieldModalProps {
  readonly fieldKey: string;
  readonly currentValue: string;
  readonly onSave: (field: string, value: string) => Promise<void>;
  readonly onClose: () => void;
}

// ============================================================
// コンポーネント
// ============================================================

export const EditFieldModal: React.FC<EditFieldModalProps> = ({
  fieldKey,
  currentValue,
  onSave,
  onClose,
}) => {
  const [value, setValue] = useState(currentValue);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const fieldLabel = FIELD_LABELS[fieldKey] ?? fieldKey;

  // オートフォーカス
  useEffect(() => {
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  // ESCキーで閉じる
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleSave = async () => {
    if (isSaving) return;
    setIsSaving(true);
    setError(null);

    try {
      await onSave(fieldKey, value);
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '保存に失敗しました';
      setError(msg);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center">
      {/* オーバーレイ */}
      <button
        type="button"
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
        aria-label="閉じる"
      />

      {/* モーダル本体 */}
      <div className="relative w-full max-w-md bg-gray-900 border border-gray-700 rounded-t-lg sm:rounded-lg shadow-2xl animate-fade-in">
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
          <h3 className="text-sm font-semibold text-gray-100">
            {fieldLabel}を編集
          </h3>
          <button
            type="button"
            className="p-1.5 text-gray-400 hover:text-gray-200 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
            onClick={onClose}
            aria-label="閉じる"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 入力エリア */}
        <div className="px-4 py-4">
          <label className="block mb-1.5 text-xs text-gray-400" htmlFor="edit-field-input">
            {fieldLabel}
          </label>
          <textarea
            id="edit-field-input"
            ref={inputRef}
            className="w-full h-24 px-3 py-2 text-sm text-gray-100 bg-gray-800 border border-gray-600 rounded resize-none focus:outline-none focus:border-blue-500 transition-colors"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={`${fieldLabel}を入力`}
          />
          {error && (
            <p className="mt-2 text-xs text-red-400">{error}</p>
          )}
        </div>

        {/* フッター */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-gray-700">
          <button
            type="button"
            className="px-4 py-2.5 text-sm text-gray-400 bg-gray-800 border border-gray-600 rounded active:scale-95 transition-all min-h-[44px]"
            onClick={onClose}
            disabled={isSaving}
          >
            キャンセル
          </button>
          <button
            type="button"
            className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 rounded active:scale-95 transition-all min-h-[44px] disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={() => void handleSave()}
            disabled={isSaving || value === currentValue}
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                保存中...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                保存
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
