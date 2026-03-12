/**
 * 文字起こしリアルタイム表示
 *
 * アポ中の会話がリアルタイムで流れてくるエリア。
 * 確定テキスト + 入力中テキスト（interim）を表示。
 */

import React, { useEffect, useRef } from 'react';
import { Mic, MicOff } from 'lucide-react';

interface TranscriptChunk {
  readonly text: string;
  readonly timestamp: string;
  readonly speaker?: string;
}

interface TranscriptViewProps {
  readonly chunks: readonly TranscriptChunk[];
  readonly isRecording: boolean;
  readonly interimText?: string;
}

export const TranscriptView: React.FC<TranscriptViewProps> = ({
  chunks,
  isRecording,
  interimText,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  // 新しいチャンクまたはinterimが来たら自動スクロール
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chunks.length, interimText]);

  return (
    <div className="px-4 pt-4">
      <div className="flex items-center gap-2 mb-2">
        {isRecording ? (
          <Mic className="w-4 h-4 text-red-400 animate-pulse" />
        ) : (
          <MicOff className="w-4 h-4 text-gray-500" />
        )}
        <span className="text-xs text-gray-400 font-medium">
          文字起こし {isRecording ? '(録音中)' : ''}
        </span>
        <span className="text-xs text-gray-600 ml-auto">
          {chunks.length}チャンク
        </span>
      </div>

      <div
        ref={scrollRef}
        className="bg-gray-900/50 border border-gray-800 rounded-lg p-3 max-h-64 overflow-y-auto text-sm leading-relaxed"
      >
        {chunks.length === 0 && !interimText ? (
          <p className="text-gray-600 text-center py-4">
            {isRecording
              ? '会話を聞き取っています...'
              : '音声録音を開始すると、ここに文字起こしが表示されます'}
          </p>
        ) : (
          <>
            {chunks.map((chunk, i) => (
              <div
                key={`chunk-${i}-${chunk.timestamp}`}
                className="mb-1.5 last:mb-0"
              >
                {chunk.speaker && (
                  <span className="text-xs text-blue-400 mr-1">
                    [{chunk.speaker}]
                  </span>
                )}
                <span className="text-gray-300">{chunk.text}</span>
              </div>
            ))}

            {/* 入力中テキスト（まだ確定していない） */}
            {interimText && interimText.length > 0 && (
              <div className="mb-1.5 opacity-60">
                <span className="text-xs text-yellow-400 mr-1">
                  [入力中]
                </span>
                <span className="text-gray-400 italic">{interimText}</span>
              </div>
            )}
          </>
        )}

        {/* 録音中インジケーター */}
        {isRecording && !interimText && chunks.length > 0 && (
          <div className="flex items-center gap-1 mt-2 pt-2 border-t border-gray-800/50">
            <div className="w-1.5 h-1.5 bg-red-400 rounded-full animate-pulse" />
            <span className="text-xs text-gray-500">聞き取り中...</span>
          </div>
        )}
      </div>
    </div>
  );
};
