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
import { authHeaders } from '../lib/api';

// ============================================================
// 型定義
// ============================================================

export interface UseAudioCaptureReturn {
  readonly isRecording: boolean;
  readonly isPaused: boolean;
  readonly chunkCount: number;
  readonly error: string | null;
  readonly interimText: string;
  readonly start: () => Promise<void>;
  readonly pause: () => void;
  readonly resume: () => void;
  readonly stop: () => Promise<void>;
}

// ============================================================
// コールバック
// ============================================================

export type TranscriptCallback = (text: string, speaker?: string) => void;

/**
 * コールバック参照。モジュールレベルではなく useAudioCapture 内の
 * transcriptCallbackRef に委譲する形に変更済み。
 * setOnTranscript は後方互換のためフックからエクスポートする。
 */
let onTranscriptCallback: TranscriptCallback | null = null;

export function setOnTranscript(cb: TranscriptCallback | null): void {
  onTranscriptCallback = cb;
}

// ============================================================
// 定数
// ============================================================

/** 録音チャンク間隔 (ms) - 短いほどリアルタイム性UP＋文脈切れ軽減 */
const CHUNK_INTERVAL_MS = 15_000;

/** 連続エラー回数の閾値（これを超えたらUIにエラーを出す） */
const ERROR_THRESHOLD = 2;

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
  private paused = false;
  private timerId: ReturnType<typeof setTimeout> | null = null;
  private pausedAt: number | null = null;
  private cycleStartedAt: number = 0;
  private remainingMs: number = CHUNK_INTERVAL_MS;
  private readonly opts: RecordingCycleOptions;

  constructor(opts: RecordingCycleOptions) {
    this.opts = opts;
  }

  start(): void {
    this.running = true;
    this.paused = false;
    this.cycle();
  }

  /**
   * 録音を停止し、最終チャンクの onChunk が呼ばれるまで待つ Promise を返す。
   * onstop が非同期で発火するため、呼び出し側は await stopAsync() で
   * 最終チャンクのキュー追加を保証してから Promise.all でキュー完了を待てる。
   */
  stopAsync(): Promise<void> {
    this.running = false;
    this.paused = false;
    this.clearTimer();
    if (!this.recorder || this.recorder.state === 'inactive') {
      this.recorder = null;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      const rec = this.recorder!;
      const origOnStop = rec.onstop;
      rec.onstop = (ev) => {
        if (typeof origOnStop === 'function') {
          origOnStop.call(rec, ev);
        }
        this.recorder = null;
        resolve();
      };
      rec.stop();
    });
  }

  stop(): void {
    this.running = false;
    this.paused = false;
    this.clearTimer();
    if (this.recorder && this.recorder.state !== 'inactive') {
      this.recorder.stop();
    }
    this.recorder = null;
  }

  pause(): void {
    if (!this.running || this.paused) return;
    this.paused = true;

    // タイマーを停止し、残り時間を記録
    if (this.timerId !== null) {
      this.clearTimer();
      const elapsedInCycle = Date.now() - this.cycleStartedAt;
      this.remainingMs = Math.max(CHUNK_INTERVAL_MS - elapsedInCycle, 500);
    }
    this.pausedAt = Date.now();

    if (this.recorder && this.recorder.state === 'recording') {
      this.recorder.pause();
    }
  }

  resume(): void {
    if (!this.running || !this.paused) return;
    this.paused = false;
    this.pausedAt = null;

    if (this.recorder && this.recorder.state === 'paused') {
      this.recorder.resume();

      // pause時に計算済みの残り時間でタイマーを再設定
      this.timerId = setTimeout(() => {
        this.timerId = null;
        if (this.recorder && this.recorder.state === 'recording') {
          this.recorder.stop();
        }
      }, this.remainingMs);
    } else {
      // レコーダーがpausedでない場合は新サイクル開始
      this.cycle();
    }
  }

  private clearTimer(): void {
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
  }

  private cycle(): void {
    if (!this.running || this.paused) return;

    const chunks: Blob[] = [];
    const rec = new MediaRecorder(this.opts.stream, { mimeType: this.opts.mimeType, audioBitsPerSecond: 128_000 });
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
      if (this.running && !this.paused) {
        this.cycle();
      }
    };

    rec.onerror = () => {
      this.opts.onError(`録音エラー (${this.opts.speaker})`);
    };

    rec.start();
    this.remainingMs = CHUNK_INTERVAL_MS;
    this.pausedAt = null; // cycle開始時はnull、pause()で記録する
    this.cycleStartedAt = Date.now();

    this.timerId = setTimeout(() => {
      this.timerId = null;
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
  const [isPaused, setIsPaused] = useState(false);
  const [chunkCount, setChunkCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [interimText, setInterimText] = useState('');

  const micStreamRef = useRef<MediaStream | null>(null);
  const displayStreamRef = useRef<MediaStream | null>(null);
  const micCycleRef = useRef<RecordingCycle | null>(null);
  const displayCycleRef = useRef<RecordingCycle | null>(null);
  const sessionIdRef = useRef(sessionId);
  const chunkIndexRef = useRef(0);
  // Fix 5: ストリームごとの独立キュー
  const micQueueRef = useRef<Promise<void>>(Promise.resolve());
  const displayQueueRef = useRef<Promise<void>>(Promise.resolve());
  const consecutiveErrorsRef = useRef(0);
  const stoppedRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const lastTranscriptRef = useRef<Record<string, string>>({});
  const isInPersonRef = useRef(false);
  sessionIdRef.current = sessionId;

  // クリーンアップ
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, []);

  function cleanup() {
    stoppedRef.current = true;
    isInPersonRef.current = false;
    abortRef.current?.abort();
    abortRef.current = null;
    micCycleRef.current?.stop();
    micCycleRef.current = null;
    displayCycleRef.current?.stop();
    displayCycleRef.current = null;

    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => { t.onended = null; t.stop(); });
      micStreamRef.current = null;
    }
    if (displayStreamRef.current) {
      displayStreamRef.current.getTracks().forEach((t) => { t.onended = null; t.stop(); });
      displayStreamRef.current = null;
    }
  }

  // Whisper APIに音声チャンクを送信（1回リトライ付き）
  async function sendChunkToWhisper(blob: Blob, index: number, speaker: string, isRetry = false): Promise<void> {
    if (blob.size < 1000) return;
    if (stoppedRef.current) return;

    setInterimText(`文字起こし中... (${speaker})`);

    try {
      const formData = new FormData();
      formData.append('audio', blob, `chunk_${index}.webm`);
      formData.append('session_id', sessionIdRef.current);
      formData.append('chunk_index', String(index));
      formData.append('speaker', speaker);
      const prevText = lastTranscriptRef.current[speaker] ?? '';
      if (prevText) {
        formData.append('prev_text', prevText.slice(-200));
      }
      if (isInPersonRef.current) {
        formData.append('diarize', 'true');
      }

      const res = await fetch('/api/transcribe-chunk', {
        method: 'POST',
        headers: { ...authHeaders() },
        body: formData,
        signal: abortRef.current?.signal,
      });

      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        console.error('Whisper API エラー:', res.status, errBody);

        // 初回失敗 → 2秒後にリトライ
        if (!isRetry) {
          console.log(`[audio] チャンク${index} リトライ中...`);
          await new Promise(r => setTimeout(r, 2000));
          return sendChunkToWhisper(blob, index, speaker, true);
        }

        consecutiveErrorsRef.current += 1;
        if (consecutiveErrorsRef.current >= ERROR_THRESHOLD) {
          setError(`文字起こしに失敗しています (${res.status})`);
        }
        setInterimText('');
        return;
      }

      // 成功時はエラーカウントをリセット
      consecutiveErrorsRef.current = 0;
      setError(null);

      const data = await res.json() as { text?: string; speaker?: string; segments?: Array<{ speaker: string; text: string }> };
      setInterimText('');

      // 停止後のコールバック呼び出しを防止
      if (stoppedRef.current) return;

      // Deepgram話者分離モード: セグメントごとにコールバック
      if (data.segments && data.segments.length > 0) {
        for (const seg of data.segments) {
          if (seg.text.trim().length > 0) {
            setChunkCount((prev) => prev + 1);
            if (onTranscriptCallback) {
              onTranscriptCallback(seg.text.trim(), seg.speaker);
            }
          }
        }
        // 全セグメントを結合してprev_text用に保存（話者ごとではなくチャンク全体の文脈）
        lastTranscriptRef.current[speaker] = data.segments.map(s => s.text).join(' ');
      } else if (data.text && data.text.trim().length > 0) {
        lastTranscriptRef.current[speaker] = data.text.trim();
        setChunkCount((prev) => prev + 1);
        if (onTranscriptCallback) {
          onTranscriptCallback(data.text.trim(), data.speaker ?? speaker);
        }
      }
    } catch (err) {
      // AbortErrorは停止時の正常動作なので無視
      if (err instanceof DOMException && err.name === 'AbortError') return;
      console.error('チャンク送信エラー:', err);

      // 初回失敗 → 2秒後にリトライ
      if (!isRetry) {
        console.log(`[audio] チャンク${index} リトライ中... (通信エラー)`);
        await new Promise(r => setTimeout(r, 2000));
        return sendChunkToWhisper(blob, index, speaker, true);
      }

      consecutiveErrorsRef.current += 1;
      if (consecutiveErrorsRef.current >= ERROR_THRESHOLD) {
        setError('文字起こしサーバーに接続できません');
      }
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
      consecutiveErrorsRef.current = 0;
      stoppedRef.current = false;
      abortRef.current = new AbortController();
      setChunkCount(0);

      // Fix 5: ストリームごとのチャンク送信（並列化）
      const handleChunk = (blob: Blob, speaker: string) => {
        const idx = chunkIndexRef.current;
        chunkIndexRef.current += 1;
        const queueRef = speaker === '相手' ? displayQueueRef : micQueueRef;
        queueRef.current = queueRef.current.then(() =>
          sendChunkToWhisper(blob, idx, speaker)
        );
      };

      const handleError = (msg: string) => {
        setError(msg);
        setIsRecording(false);
        setIsPaused(false);
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

      // 2. システム音声取得（任意 - 失敗してもマイクだけで続行）
      try {
        const displayStream = await navigator.mediaDevices.getDisplayMedia({
          audio: true,
          video: true, // Chromeはvideoなしだとaudioを取れない場合がある
        });
        displayStreamRef.current = displayStream;

        // Fix 4: ビデオトラックは停止せず無効化のみ（停止するとChromeで音声も死ぬ）
        displayStream.getVideoTracks().forEach((t) => {
          t.enabled = false;
        });

        const audioTracks = displayStream.getAudioTracks();
        if (audioTracks.length > 0) {
          // 音声トラックのみの新ストリームを作成してRecordingCycleに渡す
          const audioOnlyStream = new MediaStream(audioTracks);

          const displayCycle = new RecordingCycle({
            stream: audioOnlyStream,
            mimeType,
            speaker: '相手',
            onChunk: handleChunk,
            onError: handleError,
          });
          displayCycleRef.current = displayCycle;
          displayCycle.start();

          // 画面共有終了検知（ビデオ or オーディオトラック終了）
          const onTrackEnded = () => {
            console.log('相手音声トラック終了');
            displayCycleRef.current?.stop();
            displayCycleRef.current = null;
          };
          audioTracks[0]!.onended = onTrackEnded;
          // ビデオトラック終了でも検知（ユーザーが「共有を停止」をクリック）
          const videoTracks = displayStream.getVideoTracks();
          if (videoTracks[0]) {
            videoTracks[0].onended = onTrackEnded;
          }
        } else {
          console.log('画面共有に音声トラックなし → マイクのみ');
        }
      } catch {
        console.log('画面共有なし → マイクのみで録音（対面モード・Deepgram話者分離）');
        isInPersonRef.current = true;
      }

      // 3. 全許可完了後にマイク録音サイクル開始
      const micCycle = new RecordingCycle({
        stream: micStream,
        mimeType,
        speaker: '自分',
        onChunk: handleChunk,
        onError: handleError,
      });
      micCycleRef.current = micCycle;
      micCycle.start();

      setIsRecording(true);
      setIsPaused(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '録音の開始に失敗しました';
      setError(msg);
    }
  }, []);

  // Fix 3: pause/resume でストリームを破棄しない
  const pause = useCallback(() => {
    micCycleRef.current?.pause();
    displayCycleRef.current?.pause();
    setIsPaused(true);
    setIsRecording(false);
    setInterimText('');
  }, []);

  const resume = useCallback(() => {
    micCycleRef.current?.resume();
    displayCycleRef.current?.resume();
    setIsPaused(false);
    setIsRecording(true);
  }, []);

  const stop = useCallback(async () => {
    // stopAsync()で最終チャンクの onstop→onChunk→キュー追加 を待つ
    const micStop = micCycleRef.current?.stopAsync() ?? Promise.resolve();
    micCycleRef.current = null;
    const displayStop = displayCycleRef.current?.stopAsync() ?? Promise.resolve();
    displayCycleRef.current = null;

    // onstop コールバック完了を待つ（最終チャンクがキューに追加される）
    await Promise.allSettled([micStop, displayStop]);

    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => { t.onended = null; t.stop(); });
      micStreamRef.current = null;
    }
    if (displayStreamRef.current) {
      displayStreamRef.current.getTracks().forEach((t) => { t.onended = null; t.stop(); });
      displayStreamRef.current = null;
    }
    setIsRecording(false);
    setIsPaused(false);
    setInterimText('');

    // 最終チャンクのWhisper送信完了を待つ
    // (キュー内の処理が完了してからstoppedフラグを立てる)
    try {
      await Promise.all([micQueueRef.current, displayQueueRef.current]);
    } catch {
      // キュー内のエラーは既にsendChunkToWhisper内で処理済み
    } finally {
      stoppedRef.current = true;
      abortRef.current?.abort();
      abortRef.current = null;
    }
  }, []);

  return {
    isRecording,
    isPaused,
    chunkCount,
    error,
    interimText,
    start,
    pause,
    resume,
    stop,
  };
}
