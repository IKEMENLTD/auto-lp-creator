/**
 * メインダッシュボード (1画面完結)
 *
 * 開始画面: 「録音開始」or「テキスト貼り付け」の2分岐
 *
 * 録音フロー: idle → recording ↔ paused → selecting → ended
 * 貼り付けフロー: idle → pasting → selecting → ended
 *
 * selecting: 企業選択ステップ（対象企業を選んでからフォーカス抽出→生成）
 */

import React, { useState, useCallback, useEffect } from 'react';
import { AlertCircle, Mic, ClipboardPaste, ArrowLeft, Send, Monitor } from 'lucide-react';
import { StatusBar } from '../components/StatusBar';
import { TranscriptView } from '../components/TranscriptView';
import { ExtractionCards } from '../components/ExtractionCards';
import { DeliverableGrid } from '../components/DeliverableGrid';
import { RecordingControls } from '../components/RecordingControls';
import { EditFieldModal } from '../components/EditFieldModal';
import { CompanySelector, type DetectedCompany } from '../components/CompanySelector';
import { useSession } from '../hooks/useSession';
import { useAudioCapture, setOnTranscript } from '../hooks/useAudioCapture';
import { api } from '../lib/api';
import type { DeliverableType, ShareMethod, PollStatusResponse } from '../types/dashboard';

type RecordingState = 'idle' | 'recording' | 'paused' | 'ended' | 'pasting' | 'analyzing' | 'selecting';

interface EditModalState {
  readonly isOpen: boolean;
  readonly fieldKey: string;
  readonly currentValue: string;
}

const INITIAL_EDIT_STATE: EditModalState = {
  isOpen: false,
  fieldKey: '',
  currentValue: '',
};

export const Dashboard: React.FC = () => {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [pasteText, setPasteText] = useState('');
  const [isPasteSubmitting, setIsPasteSubmitting] = useState(false);
  const [pendingPasteText, setPendingPasteText] = useState<string | null>(null);

  // 企業選択関連
  const [detectedCompanies, setDetectedCompanies] = useState<DetectedCompany[]>([]);
  const [isDetecting, setIsDetecting] = useState(false);

  // 録音前の説明ダイアログ
  const [showRecordingGuide, setShowRecordingGuide] = useState(false);

  // sessionId がない場合は仮IDで初期化（セッション開始後に差し替え）
  const activeSessionId = sessionId ?? '__none__';
  const session = useSession(activeSessionId);
  const audio = useAudioCapture(activeSessionId);
  const [editModal, setEditModal] = useState<EditModalState>(INITIAL_EDIT_STATE);

  // ================================================================
  // 企業検出
  // ================================================================

  const detectCompanies = useCallback(async (transcript: string) => {
    try {
      setIsDetecting(true);
      setGlobalError(null);

      // Background Function起動（即座に202が返る）
      await fetch('/api/detect-companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript, session_id: sessionId ?? 'detect' }),
      });

      // ポーリングで結果を待つ
      // Background Function側で古いステータスを削除済みなので、シンプルに待つ
      await new Promise(r => setTimeout(r, 2000));

      const detectSessionId = sessionId ?? 'detect';
      const startTime = Date.now();
      const POLL_TIMEOUT_MS = 180_000;

      const poll = async (): Promise<void> => {
        let pollRetries = 0;
        while (Date.now() - startTime < POLL_TIMEOUT_MS) {
          try {
            const pollResult = await api.pollJobStatus(detectSessionId, 'detect') as PollStatusResponse;

            if (pollResult.status === 'completed') {
              const resultData = pollResult.data as { companies?: DetectedCompany[] } | undefined;
              const companies = resultData?.companies || [];

              if (companies.length === 0) {
                setGlobalError('商談内容から企業を検出できませんでした。テキスト量が少ないか、企業名が含まれていない可能性があります。');
                setRecordingState('ended');
                return;
              }

              if (companies.length === 1) {
                await handleCompanySelected(companies[0]!);
                return;
              }

              setDetectedCompanies(companies);
              setRecordingState('selecting');
              return;
            }

            if (pollResult.status === 'failed') {
              throw new Error(pollResult.error ?? '企業検出に失敗しました');
            }
            // unknown → 待って続行
            await new Promise(r => setTimeout(r, 2000));
          } catch (err) {
            // ポーリングエラーは最大5回までリトライ、超えたらエラー表示
            const isKnownError = err instanceof Error && err.message === '企業検出に失敗しました';
            if (isKnownError) throw err;

            pollRetries += 1;
            console.warn(`[detectCompanies] ポーリングエラー (${pollRetries}回目):`, err);
            if (pollRetries >= 5) {
              throw new Error('企業検出中に通信エラーが繰り返し発生しました。ネットワーク接続を確認してください。');
            }
            await new Promise(r => setTimeout(r, 2000));
            continue;
          }
        }
        throw new Error('企業検出がタイムアウトしました');
      };

      await poll();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '企業検出に失敗しました';
      setGlobalError(msg);
      setRecordingState('ended');
    } finally {
      setIsDetecting(false);
    }
  }, [sessionId]);

  const handleCompanySelected = useCallback(async (company: DetectedCompany) => {
    session.setTargetCompany(company.name);
    setRecordingState('analyzing');

    // 選択した企業にフォーカスして抽出完了を待つ
    const fullTranscript = session.getFullTranscript();
    if (fullTranscript.length > 0) {
      await session.extractForCompany(company.name, fullTranscript);
    }
    setRecordingState('ended');
  }, [session]);

  // ================================================================
  // 録音制御
  // ================================================================

  const handleStartRecording = useCallback(async () => {
    try {
      setGlobalError(null);
      const result = await api.startSession();
      setSessionId(result.session_id);
      setRecordingState('recording');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'セッションの開始に失敗しました';
      setGlobalError(msg);
    }
  }, []);

  // 録音開始: recording状態かつ未録音かつ一時停止中でもない場合のみstart()
  useEffect(() => {
    if (recordingState === 'recording' && sessionId && !audio.isRecording && !audio.isPaused) {
      void audio.start();
    }
  }, [recordingState, sessionId, audio.isRecording, audio.isPaused, audio.start]);

  // Fix 3: pause/resumeでストリームを破棄せず、MediaRecorderのpause/resumeを使用
  const handlePauseRecording = useCallback(() => {
    audio.pause();
    setRecordingState('paused');
  }, [audio]);

  const handleResumeRecording = useCallback(() => {
    audio.resume();
    setRecordingState('recording');
  }, [audio]);

  const handleStopRecording = useCallback(async () => {
    try {
      audio.stop();
      if (sessionId) {
        await session.endSession();
      }
      // 録音停止 → 企業検出 → 選択ステップ
      const transcript = session.getFullTranscript();
      if (transcript.length > 0) {
        void detectCompanies(transcript);
      } else {
        setRecordingState('ended');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'セッションの終了に失敗しました';
      setGlobalError(msg);
    }
  }, [audio, session, sessionId, detectCompanies]);

  const handleNewRecording = useCallback(() => {
    setSessionId(null);
    setRecordingState('idle');
    setGlobalError(null);
    setPasteText('');
    setDetectedCompanies([]);
  }, []);

  const handleBackToHome = useCallback(() => {
    if (audio.isRecording) {
      audio.stop();
    }
    setSessionId(null);
    setRecordingState('idle');
    setGlobalError(null);
    setPasteText('');
    setDetectedCompanies([]);
  }, [audio]);

  // ================================================================
  // テキスト貼り付けフロー
  // ================================================================

  const handleStartPaste = useCallback(() => {
    setRecordingState('pasting');
    setGlobalError(null);
    setPasteText('');
  }, []);

  const handleSubmitPaste = useCallback(async () => {
    const trimmed = pasteText.trim();
    if (trimmed.length === 0) {
      setGlobalError('テキストを入力してください');
      return;
    }

    try {
      setIsPasteSubmitting(true);
      setGlobalError(null);
      setRecordingState('analyzing');

      // セッション作成
      const result = await api.startSession();
      setSessionId(result.session_id);

      // テキストを保留 → sessionIdが反映された後のuseEffectでチャンク追加
      setPendingPasteText(trimmed);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'セッションの開始に失敗しました';
      setGlobalError(msg);
      setRecordingState('pasting');
    } finally {
      setIsPasteSubmitting(false);
    }
  }, [pasteText]);

  // sessionId確定後にペーストテキストをチャンクとして追加 → 企業検出
  useEffect(() => {
    if (pendingPasteText && sessionId && sessionId !== '__none__') {
      const lines = pendingPasteText.split(/\n+/).filter(line => line.trim().length > 0);
      for (const line of lines) {
        session.addTranscriptChunk(line.trim());
      }

      const fullText = pendingPasteText;
      setPendingPasteText(null);

      // 企業検出 → 選択ステップへ
      void detectCompanies(fullText);
    }
  }, [pendingPasteText, sessionId, session.addTranscriptChunk, detectCompanies]);

  const handleBackToIdle = useCallback(() => {
    setRecordingState('idle');
    setGlobalError(null);
    setPasteText('');
  }, []);

  // ================================================================
  // コールバック登録
  // ================================================================
  useEffect(() => {
    if (recordingState === 'recording' || recordingState === 'paused') {
      setOnTranscript((text: string, speaker?: string) => {
        session.addTranscriptChunk(text, speaker);
      });
    } else {
      setOnTranscript(null);
    }
    return () => setOnTranscript(null);
  }, [recordingState, session.addTranscriptChunk]);

  // ================================================================
  // その他ハンドラ
  // ================================================================

  const handleOpenEdit = useCallback((fieldKey: string, currentValue: string) => {
    setEditModal({ isOpen: true, fieldKey, currentValue });
  }, []);

  const handleCloseEdit = useCallback(() => {
    setEditModal(INITIAL_EDIT_STATE);
  }, []);

  const handleSaveField = useCallback(async (field: string, value: string) => {
    await session.updateField(field, value);
  }, [session]);

  const handleGenerate = useCallback(async (type: DeliverableType) => {
    try {
      await session.generateDeliverable(type);
    } catch {
      // エラーは useSession 内で管理
    }
  }, [session]);

  const handleShareDeliverable = useCallback((type: DeliverableType) => {
    const job = session.getJobForType(type);
    if (!job?.result_url) return;

    const url = job.result_url;
    const title = `${session.targetCompany ?? ''} - ${type}`;

    // Web Share API対応（モバイル/LINE共有向け）
    if (navigator.share) {
      void navigator.share({ title, url }).catch(() => {
        // ユーザーがキャンセルした場合は無視
      });
    } else {
      // フォールバック: クリップボードにコピー
      void navigator.clipboard.writeText(url).then(() => {
        alert('URLをコピーしました');
      }).catch(() => {
        // clipboard API非対応 — window.prompt で表示
        window.prompt('URLをコピーしてください:', url);
      });
    }
  }, [session]);

  const handleShareAll = useCallback(async (method: ShareMethod) => {
    if (!sessionId) return;

    // 完了済み制作物のURLを収集
    const completedUrls: string[] = [];
    const types: DeliverableType[] = ['lp', 'ad_creative', 'flyer', 'hearing_form', 'line_design', 'minutes', 'profile', 'system_proposal', 'proposal'];
    for (const t of types) {
      const job = session.getJobForType(t);
      if (job?.status === 'completed' && job.result_url) {
        completedUrls.push(job.result_url);
      }
    }
    if (completedUrls.length === 0) return;

    const text = `${session.targetCompany ?? '制作物'}\n${completedUrls.join('\n')}`;

    if (method === 'line') {
      // LINEシェア
      const lineUrl = `https://line.me/R/share?text=${encodeURIComponent(text)}`;
      window.open(lineUrl, '_blank', 'noopener');
    } else if (method === 'email') {
      const subject = encodeURIComponent(`${session.targetCompany ?? ''} 制作物`);
      const body = encodeURIComponent(text);
      window.location.href = `mailto:?subject=${subject}&body=${body}`;
    } else {
      // QR — クリップボードコピーにフォールバック
      void navigator.clipboard.writeText(completedUrls.join('\n')).then(() => {
        alert('全URLをコピーしました');
      }).catch(() => {
        window.prompt('URLをコピーしてください:', completedUrls.join('\n'));
      });
    }
  }, [sessionId, session]);

  // ================================================================
  // 表示判定
  // ================================================================

  const hasCompleted = session.jobs.some(
    (j) => j.status === 'completed' && j.result_url !== null,
  );

  // Fix 2: audio.errorもUI表示対象に追加
  const error = globalError ?? audio.error ?? session.error;

  // ================================================================
  // idle 状態: 開始画面（2分岐）
  // ================================================================
  if (recordingState === 'idle') {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-gray-950 text-white px-6">
        <div className="text-center mb-12">
          <h1 className="text-2xl font-bold mb-2 text-gray-100">
            リアルタイムアポ制作物生成
          </h1>
          <p className="text-sm text-gray-400">
            録音またはテキスト貼り付けから制作物を自動生成
          </p>
        </div>

        <div className="flex flex-col gap-4 w-full max-w-xs">
          <button
            type="button"
            className="flex items-center justify-center gap-3 w-full py-4 px-6 bg-red-500/10 border border-red-500/40 rounded-lg text-red-400 font-medium transition-all active:scale-95 hover:bg-red-500/20"
            onClick={() => setShowRecordingGuide(true)}
          >
            <Mic className="w-5 h-5" />
            録音開始
          </button>

          <button
            type="button"
            className="flex items-center justify-center gap-3 w-full py-4 px-6 bg-blue-500/10 border border-blue-500/40 rounded-lg text-blue-400 font-medium transition-all active:scale-95 hover:bg-blue-500/20"
            onClick={handleStartPaste}
          >
            <ClipboardPaste className="w-5 h-5" />
            テキスト貼り付け
          </button>
        </div>

        {/* 事前ガイド: 必要な情報 */}
        <div className="mt-8 w-full max-w-xs">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
            制作物生成に必要な情報
          </p>
          <p className="text-xs text-gray-500 mb-3">
            以下の情報が含まれる会話を録音・貼り付けしてください
          </p>
          <div className="space-y-2">
            {['会社名', 'サービス名', '業種', 'ターゲット顧客', '強み'].map((label) => (
              <div
                key={label}
                className="flex items-center gap-2 px-3 py-2 rounded border border-gray-700/50 bg-gray-900/30"
              >
                <div className="w-4 h-4 rounded-full border border-gray-600 flex-shrink-0" />
                <span className="text-sm text-gray-400">{label}</span>
              </div>
            ))}
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2 mt-6 p-3 bg-red-500/10 border border-red-500/30 rounded max-w-xs w-full">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-300">{error}</p>
          </div>
        )}

        <p className="mt-8 text-xs text-gray-600">
          音声解析 + AI制作物自動生成
        </p>

        {/* 録音開始前の説明ダイアログ */}
        {showRecordingGuide && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setShowRecordingGuide(false)}>
            <div className="bg-gray-900 border border-gray-700 rounded-xl max-w-sm w-full p-6" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-bold text-gray-100 mb-4">録音を開始します</h3>
              <div className="space-y-3 text-sm text-gray-300">
                <div className="flex items-start gap-3">
                  <Mic className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-gray-100">マイクの許可</p>
                    <p className="text-gray-400 text-xs mt-0.5">あなたの声を文字起こしするために使用します</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Monitor className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-gray-100">画面共有の許可（任意）</p>
                    <p className="text-gray-400 text-xs mt-0.5">オンライン会議の相手の声を取得するために、会議中のタブの共有が必要です。「タブの音声も共有する」をONにしてください</p>
                    <p className="text-gray-500 text-xs mt-1">※ 対面の場合はキャンセルでOK。マイクだけで録音します</p>
                  </div>
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  type="button"
                  className="flex-1 py-2.5 px-4 rounded-lg border border-gray-600 text-gray-400 text-sm hover:bg-gray-800 transition-colors"
                  onClick={() => setShowRecordingGuide(false)}
                >
                  戻る
                </button>
                <button
                  type="button"
                  className="flex-1 py-2.5 px-4 rounded-lg bg-red-500 text-white font-medium text-sm hover:bg-red-600 transition-colors"
                  onClick={() => {
                    setShowRecordingGuide(false);
                    void handleStartRecording();
                  }}
                >
                  OK・録音開始
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ================================================================
  // pasting 状態: テキスト貼り付け画面
  // ================================================================
  if (recordingState === 'pasting') {
    return (
      <div className="h-screen flex flex-col bg-gray-950 text-white">
        <header className="flex items-center gap-3 px-4 py-3 border-b border-gray-800">
          <button
            type="button"
            className="p-2 text-gray-400 hover:text-white transition-colors"
            onClick={handleBackToIdle}
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-base font-semibold text-gray-200">
            テキスト貼り付け
          </h1>
        </header>

        <main className="flex-1 flex flex-col p-4 gap-4 overflow-hidden">
          <p className="text-sm text-gray-400">
            録音済みの文字起こしや商談メモを貼り付けてください。AIが内容を分析して制作物を生成します。
          </p>

          <textarea
            className="flex-1 w-full bg-gray-900/50 border border-gray-700 rounded-lg p-4 text-sm text-gray-200 leading-relaxed resize-none focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/25 placeholder:text-gray-600"
            placeholder={`例:\n営業: 本日はお時間いただきありがとうございます。御社のマーケティング課題についてお伺いしたいのですが。\n先方: はい、現在はリスティング広告を中心に集客しているのですが、CPAが高騰していて...\n営業: なるほど、CPAの高騰ですね。現在の月間予算はどのくらいですか？\n先方: 月50万円ほどです。以前は1件3000円だったのが、今は8000円くらいまで上がっています。`}
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value.slice(0, 50000))}
            autoFocus
          />

          <div className="flex items-center justify-between">
            <span className={`text-xs ${pasteText.length > 45000 ? 'text-yellow-400' : 'text-gray-500'}`}>
              {pasteText.length > 0 ? `${pasteText.length.toLocaleString()} / 50,000文字` : ''}
            </span>

            <button
              type="button"
              className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg font-medium text-sm transition-all active:scale-95"
              onClick={() => void handleSubmitPaste()}
              disabled={pasteText.trim().length === 0 || isPasteSubmitting}
            >
              <Send className="w-4 h-4" />
              {isPasteSubmitting ? '処理中...' : '分析開始'}
            </button>
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-300">{error}</p>
            </div>
          )}
        </main>
      </div>
    );
  }

  // ================================================================
  // analyzing 状態: 分析中ローディング画面
  // ================================================================
  if (recordingState === 'analyzing') {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-gray-950 text-white gap-4">
        <div className="w-10 h-10 border-4 border-gray-700 border-t-blue-500 rounded-full animate-spin" />
        <p className="text-lg font-medium text-gray-200">商談内容を分析しています...</p>
        <p className="text-sm text-gray-500">企業情報の抽出には数秒〜数十秒かかる場合があります</p>
      </div>
    );
  }

  // ================================================================
  // selecting 状態: 企業選択画面
  // ================================================================
  if (recordingState === 'selecting') {
    return (
      <div className="h-screen flex flex-col bg-gray-950 text-white">
        <header className="flex items-center gap-3 px-4 py-3 border-b border-gray-800">
          <button
            type="button"
            className="p-2 text-gray-400 hover:text-white transition-colors"
            onClick={() => setRecordingState('ended')}
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-base font-semibold text-gray-200">
            企業分析結果
          </h1>
        </header>

        <main className="flex-1 overflow-y-auto">
          {error && (
            <div className="mx-4 mt-4 flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-300">{error}</p>
            </div>
          )}

          <CompanySelector
            companies={detectedCompanies}
            isLoading={isDetecting}
            onSelect={handleCompanySelected}
          />
        </main>
      </div>
    );
  }

  // ================================================================
  // recording / paused / ended 状態: ダッシュボード
  // ================================================================
  return (
    <div className="h-screen flex flex-col bg-gray-950 text-white">
      {/* ステータスバー */}
      <StatusBar
        elapsed={session.elapsed}
        filledFields={session.filledFields}
        totalFields={session.totalFields}
        status={recordingState === 'ended' ? 'ended' : recordingState === 'paused' ? 'paused' : session.status}
        isRecording={audio.isRecording}
        onBack={handleBackToHome}
      />

      {/* 中央スクロールエリア */}
      <main className="flex-1 overflow-y-auto">
        {error && (
          <div className="mx-4 mt-4 flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-300">{error}</p>
          </div>
        )}

        {/* 対象企業表示 */}
        {session.targetCompany && (
          <div className="mx-4 mt-4 flex items-center gap-2 px-3 py-2 bg-blue-500/10 border border-blue-500/20 rounded-lg">
            <span className="text-xs text-blue-400 font-medium">対象企業:</span>
            <span className="text-sm text-blue-300 font-bold">{session.targetCompany}</span>
            <button
              type="button"
              className="ml-auto text-xs text-gray-500 hover:text-blue-400 transition-colors"
              onClick={() => {
                setDetectedCompanies(prev => prev.length > 0 ? prev : []);
                if (detectedCompanies.length > 1) {
                  setRecordingState('selecting');
                } else {
                  // 再検出
                  const transcript = session.getFullTranscript();
                  if (transcript.length > 0) {
                    void detectCompanies(transcript);
                  }
                }
              }}
            >
              変更
            </button>
          </div>
        )}

        {/* 文字起こしリアルタイム表示 */}
        <TranscriptView
          chunks={session.transcriptChunks}
          isRecording={recordingState === 'recording'}
          interimText={audio.interimText}
        />

        {/* 抽出情報カード（必須フィールドを常に表示） */}
        <ExtractionCards
          extractedData={session.extractedData}
          onEditField={handleOpenEdit}
        />

        {/* 制作物グリッド */}
        <DeliverableGrid
          getDeliverableStatus={session.getDeliverableStatus}
          getMissingFields={session.getMissingFields}
          getJobForType={session.getJobForType}
          onGenerate={(type) => void handleGenerate(type)}
          onShare={handleShareDeliverable}
        />
      </main>

      {/* 録音コントロール + 共有 */}
      <footer className="sticky bottom-0 z-50 px-4 py-3 bg-gray-900 border-t border-gray-800">
        <RecordingControls
          state={(recordingState as string) === 'pasting' || (recordingState as string) === 'selecting' ? 'ended' as const : recordingState}
          onStart={() => void handleStartRecording()}
          onPause={handlePauseRecording}
          onResume={handleResumeRecording}
          onStop={() => void handleStopRecording()}
          onNew={handleNewRecording}
          hasCompletedDeliverables={hasCompleted}
          onShareAll={handleShareAll}
        />
      </footer>

      {editModal.isOpen && (
        <EditFieldModal
          fieldKey={editModal.fieldKey}
          currentValue={editModal.currentValue}
          onSave={handleSaveField}
          onClose={handleCloseEdit}
        />
      )}
    </div>
  );
};
