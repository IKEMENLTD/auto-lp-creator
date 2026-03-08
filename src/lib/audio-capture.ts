/**
 * ブラウザ側 音声キャプチャ
 *
 * MediaRecorder APIを使い、30秒ごとに音声blobをサーバーに送信する。
 * transcribe-chunk エンドポイントと連携。
 */

// ============================================================
// 定数
// ============================================================

/** チャンクサイズ (ms) = 30秒 */
const CHUNK_INTERVAL_MS = 30_000;

/** サーバーエンドポイント */
const TRANSCRIBE_ENDPOINT = "/api/transcribe-chunk";

/** 送信タイムアウト (ms) */
const UPLOAD_TIMEOUT_MS = 60_000;

/** MediaRecorder で使用する MIME type */
const PREFERRED_MIME_TYPES: readonly string[] = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/mp4",
];

// ============================================================
// 型定義
// ============================================================

/** 送信結果コールバック */
interface TranscribeResult {
  readonly text: string;
  readonly extracted_fields_updated: readonly string[];
}

/** AudioCapture イベントハンドラ */
interface AudioCaptureCallbacks {
  readonly onTranscribed?: (result: TranscribeResult, chunkIndex: number) => void;
  readonly onError?: (error: Error, chunkIndex: number) => void;
  readonly onStateChange?: (state: "recording" | "stopped" | "error") => void;
}

// ============================================================
// AudioCapture クラス
// ============================================================

/**
 * ブラウザの音声をキャプチャし、30秒ごとにサーバーへ送信する。
 *
 * 使い方:
 * ```ts
 * const capture = new AudioCapture({ onTranscribed: (r) => console.log(r) });
 * await capture.start("session-123");
 * // ... 録音中 ...
 * capture.stop();
 * ```
 */
export class AudioCapture {
  private mediaRecorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private chunkIndex = 0;
  private sessionId = "";
  private callbacks: AudioCaptureCallbacks;
  private pendingUploads: AbortController[] = [];

  constructor(callbacks: AudioCaptureCallbacks = {}) {
    this.callbacks = callbacks;
  }

  /**
   * 音声キャプチャを開始する。
   * マイクアクセス許可をリクエストし、30秒ごとにチャンクを送信する。
   */
  async start(sessionId: string): Promise<void> {
    if (this.mediaRecorder !== null) {
      throw new Error("既に録音中です。stop() を先に呼んでください。");
    }

    this.sessionId = sessionId;
    this.chunkIndex = 0;

    // マイクアクセス
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        sampleRate: 16000,
      },
    });

    // サポートされるMIME typeを選択
    const mimeType = this.selectMimeType();

    this.mediaRecorder = new MediaRecorder(this.stream, {
      mimeType,
      audioBitsPerSecond: 32000,
    });

    // 30秒ごとのチャンク送信
    this.mediaRecorder.ondataavailable = (event: BlobEvent): void => {
      if (event.data.size > 0) {
        const currentIndex = this.chunkIndex;
        this.chunkIndex += 1;
        void this.uploadChunk(event.data, currentIndex);
      }
    };

    this.mediaRecorder.onerror = (): void => {
      this.callbacks.onStateChange?.("error");
      this.callbacks.onError?.(
        new Error("MediaRecorderでエラーが発生しました"),
        this.chunkIndex,
      );
    };

    this.mediaRecorder.onstop = (): void => {
      this.callbacks.onStateChange?.("stopped");
    };

    // 30秒インターバルで録音開始
    this.mediaRecorder.start(CHUNK_INTERVAL_MS);
    this.callbacks.onStateChange?.("recording");
  }

  /**
   * 音声キャプチャを停止する。
   * 進行中のアップロードもキャンセルする。
   */
  stop(): void {
    if (this.mediaRecorder !== null && this.mediaRecorder.state !== "inactive") {
      this.mediaRecorder.stop();
    }
    this.mediaRecorder = null;

    // ストリームのトラックを停止
    if (this.stream !== null) {
      for (const track of this.stream.getTracks()) {
        track.stop();
      }
      this.stream = null;
    }

    // 進行中のアップロードをキャンセル
    for (const controller of this.pendingUploads) {
      controller.abort();
    }
    this.pendingUploads = [];
  }

  /**
   * 現在録音中かどうか。
   */
  get isRecording(): boolean {
    return this.mediaRecorder !== null && this.mediaRecorder.state === "recording";
  }

  // ============================================================
  // Private
  // ============================================================

  /**
   * サポートされるMIME typeを選択する。
   */
  private selectMimeType(): string {
    for (const mimeType of PREFERRED_MIME_TYPES) {
      if (MediaRecorder.isTypeSupported(mimeType)) {
        return mimeType;
      }
    }
    // フォールバック: ブラウザのデフォルト
    return "";
  }

  /**
   * 音声チャンクをサーバーに送信する。
   */
  private async uploadChunk(blob: Blob, chunkIndex: number): Promise<void> {
    const controller = new AbortController();
    this.pendingUploads.push(controller);
    const timeoutId = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);

    try {
      const formData = new FormData();
      formData.append("session_id", this.sessionId);
      formData.append("chunk_index", String(chunkIndex));
      formData.append("audio", blob, "audio.webm");

      const response = await fetch(TRANSCRIBE_ENDPOINT, {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => "レスポンス読み取り不可");
        throw new Error(`サーバーエラー (${String(response.status)}): ${errorBody}`);
      }

      const result = (await response.json()) as TranscribeResult;
      this.callbacks.onTranscribed?.(result, chunkIndex);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        this.callbacks.onError?.(
          new Error(`チャンク ${String(chunkIndex)} のアップロードがタイムアウトしました`),
          chunkIndex,
        );
      } else {
        this.callbacks.onError?.(
          error instanceof Error ? error : new Error("不明なエラー"),
          chunkIndex,
        );
      }
    } finally {
      clearTimeout(timeoutId);
      const idx = this.pendingUploads.indexOf(controller);
      if (idx !== -1) {
        this.pendingUploads.splice(idx, 1);
      }
    }
  }
}
