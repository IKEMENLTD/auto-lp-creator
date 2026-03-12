/**
 * 音声キャプチャフック（2ストリーム分離版）
 *
 * リモート通話:
 *   - マイク（getUserMedia）→「自分」として送信
 *   - システム音声（getDisplayMedia）→「相手」として送信
 *   - 各ストリームを独立してMediaRecorderで録音→Whisper APIに送信
 *
 * 対面:
 *   - マイクのみ → 全て「自分」（将来Deepgramで話者分離）
 */

import { useState, useCallback, useRef, useEffect } from 'react';

// ============================================================
// 型定義
// ============================================================

export interface UseAudioCaptureReturn {
  readonly isRecording: boolean;
  readonly chunkCount: number;
  readonly error: string | null;
  readonly interimText: string;
  readonly start: () => Promise<void>;
  readonly stop: () => void;
}

// ============================================================
// コールバック
// ============================================================

type TranscriptCallback = (text: string, speaker?: string) => void;

let onTranscriptCallback: TranscriptCallback | null = null;

export function setOnTranscript(cb: TranscriptCallback | null): void {
  onTranscriptCallback = cb;
}

// ============================================================
// 定数
// ============================================================

/** 録音チャンク間隔 (ms) */
const CHUNK_INTERVAL_MS = 7_000;

// ============================================================
// 録音サイクル管理クラス
// ============================================================

interface RecordingCycleOptions {
  stream: MediaStream;
  mimeType: string;
  speaker: string;
  onChunk: (blob: Blob, speaker: string) => void;
  onError: (msg: string) => void;
}

class RecordingCycle {
  private recorder: MediaRecorder | null = null;
  private running = false;
  private readonly opts: RecordingCycleOptions;

  constructor(opts: RecordingCycleOptions) {
    this.opts = opts;
  }

  start(): void {
    this.running = true;
    this.cycle();
  }

  stop(): void {
    this.running = false;
    if (this.recorder && this.recorder.state !== 'inactive') {
      this.recorder.stop();
    }
    this.recorder = null;
  }

  private cycle(): void {
    if (!this.running) return;

    const chunks: Blob[] = [];
    const rec = new MediaRecorder(this.opts.stream, { mimeType: this.opts.mimeType });
    this.recorder = rec;

    rec.ondataavailable = (event: BlobEvent) => {
      if (event.data.size > 0) {
        chunks.push(event.data);
      }
    };

    rec.onstop = () => {
      const blob = new Blob(chunks, { type: this.opts.mimeType });
      if (blob.size > 1000) {
        this.opts.onChunk(blob, this.opts.speaker);
      }
      if (this.running) {
        this.cycle();
      }
    };

    rec.onerror = () => {
      this.opts.onError(`録音エラー (${this.opts.speaker})`);
    };

    rec.start();

    setTimeout(() => {
      if (rec.state === 'recording') {
        rec.stop();
      }
    }, CHUNK_INTERVAL_MS);
  }
}

// ============================================================
// フック本体
// ============================================================

export function useAudioCapture(sessionId: string): UseAudioCaptureReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [chunkCount, setChunkCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [interimText, setInterimText] = useState('');

  const micStreamRef = useRef<MediaStream | null>(null);
  const displayStreamRef = useRef<MediaStream | null>(null);
  const micCycleRef = useRef<RecordingCycle | null>(null);
  const displayCycleRef = useRef<RecordingCycle | null>(null);
  const sessionIdRef = useRef(sessionId);
  const chunkIndexRef = useRef(0);
  const sendQueueRef = useRef<Promise<void>>(Promise.resolve());
  sessionIdRef.current = sessionId;

  // クリーンアップ
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, []);

  function cleanup() {
    micCycleRef.current?.stop();
    micCycleRef.current = null;
    displayCycleRef.current?.stop();
    displayCycleRef.current = null;

    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
    if (displayStreamRef.current) {
      displayStreamRef.current.getTracks().forEach((t) => t.stop());
      displayStreamRef.current = null;
    }
  }

  // Whisper APIに音声チャンクを送信
  async function sendChunkToWhisper(blob: Blob, index: number, speaker: string): Promise<void> {
    if (blob.size < 1000) return;

    setInterimText(`文字起こし中... (${speaker})`);

    try {
      const formData = new FormData();
      formData.append('audio', blob, `chunk_${index}.webm`);
      formData.append('session_id', sessionIdRef.current);
      formData.append('chunk_index', String(index));
      formData.append('speaker', speaker);

      const res = await fetch('/api/transcribe-chunk', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        console.error('Whisper API エラー:', res.status, errBody);
        setInterimText('');
        return;
      }

      const data = await res.json() as { text?: string; speaker?: string };
      setInterimText('');

      if (data.text && data.text.trim().length > 0) {
        setChunkCount((prev) => prev + 1);
        if (onTranscriptCallback) {
          onTranscriptCallback(data.text.trim(), data.speaker ?? speaker);
        }
      }
    } catch (err) {
      console.error('チャンク送信エラー:', err);
      setInterimText('');
    }
  }

  const start = useCallback(async () => {
    try {
      setError(null);
      cleanup();

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';

      chunkIndexRef.current = 0;
      setChunkCount(0);

      // チャンク受信コールバック（キュー制御で順次送信）
      const handleChunk = (blob: Blob, speaker: string) => {
        const idx = chunkIndexRef.current;
        chunkIndexRef.current += 1;
        sendQueueRef.current = sendQueueRef.current.then(() =>
          sendChunkToWhisper(blob, idx, speaker)
        );
      };

      const handleError = (msg: string) => {
        setError(msg);
        setIsRecording(false);
      };

      // 1. マイク取得
      let micStream: MediaStream;
      try {
        micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        micStreamRef.current = micStream;
      } catch {
        setError('マイクへのアクセスが拒否されました');
        return;
      }

      // マイク録音サイクル開始
      const micCycle = new RecordingCycle({
        stream: micStream,
        mimeType,
        speaker: '自分',
        onChunk: handleChunk,
        onError: handleError,
      });
      micCycleRef.current = micCycle;
      micCycle.start();

      // 2. システム音声取得（任意 - 失敗してもマイクだけで続行）
      try {
        const displayStream = await navigator.mediaDevices.getDisplayMedia({
          audio: true,
          video: true, // Chromeはvideoなしだとaudioを取れない場合がある
        });
        displayStreamRef.current = displayStream;

        // ビデオトラックは不要なので停止
        displayStream.getVideoTracks().forEach((t) => t.stop());

        const audioTracks = displayStream.getAudioTracks();
        if (audioTracks.length > 0) {
          // 相手音声の録音サイクル開始
          const displayCycle = new RecordingCycle({
            stream: displayStream,
            mimeType,
            speaker: '相手',
            onChunk: handleChunk,
            onError: handleError,
          });
          displayCycleRef.current = displayCycle;
          displayCycle.start();

          // 画面共有終了検知
          audioTracks[0].onended = () => {
            console.log('相手音声トラック終了');
            displayCycleRef.current?.stop();
            displayCycleRef.current = null;
          };
        } else {
          console.log('画面共有に音声トラックなし → マイクのみ');
        }
      } catch {
        console.log('画面共有なし → マイクのみで録音（対面モード）');
      }

      setIsRecording(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '録音の開始に失敗しました';
      setError(msg);
    }
  }, []);

  const stop = useCallback(() => {
    micCycleRef.current?.stop();
    micCycleRef.current = null;
    displayCycleRef.current?.stop();
    displayCycleRef.current = null;

    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
    if (displayStreamRef.current) {
      displayStreamRef.current.getTracks().forEach((t) => t.stop());
      displayStreamRef.current = null;
    }
    setIsRecording(false);
    setInterimText('');
  }, []);

  return {
    isRecording,
    chunkCount,
    error,
    interimText,
    start,
    stop,
  };
}
