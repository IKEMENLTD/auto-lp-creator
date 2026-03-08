/**
 * モックAPIサーバー v2
 *
 * 正しいフロー:
 * 1. セッション開始
 * 2. 音声録音 → 文字起こしチャンクがサーバーに届く → 蓄積
 * 3. /api/transcript でフロントが文字起こしテキストを取得（画面に表示）
 * 4. /api/extract-preview で一定間隔のプレビュー抽出（フィールドカード更新）
 * 5. /api/generate-lp で操作者が生成タップ → 蓄積テキスト全文から抽出+生成
 */

import http from 'node:http';
import crypto from 'node:crypto';

// ============================================================
// インメモリDB
// ============================================================
const sessions = new Map();
const jobs = new Map();

// 会話シミュレーション（音声録音なしでもデモできるように）
const SIMULATED_CONVERSATION = [
  { text: 'はじめまして、山田製作所の山田と申します。従業員30名ほどの製造業です。', speaker: '相手' },
  { text: 'よろしくお願いします。今日はどんなお悩みがあってお声がけいただいたんですか？', speaker: '自分' },
  { text: '実は営業がうまくいかなくて。今はテレアポ中心なんですが、アポ率が2%くらいで...', speaker: '相手' },
  { text: 'なるほど、テレアポのアポ率2%だと苦しいですね。他に集客はされてますか？', speaker: '自分' },
  { text: 'ホームページはあるんですが、問い合わせがほとんど来ないんです。月1件あるかないか。', speaker: '相手' },
  { text: '御社の強みって、どんなところだと思いますか？', speaker: '自分' },
  { text: '金属加工の精度には自信があります。大手の下請けも20年やってますし。あとは短納期対応ですかね。', speaker: '相手' },
  { text: '精度と納期、いいですね。ターゲットは中小製造業ですか？', speaker: '自分' },
  { text: 'そうですね。あとは試作品を作りたいスタートアップとか。最近そういう問い合わせが増えてて。', speaker: '相手' },
  { text: '予算感としては、月にどのくらい集客にかけられそうですか？', speaker: '自分' },
  { text: '月5万から10万くらいなら。ただ効果が見えないとなかなか...', speaker: '相手' },
  { text: 'わかりました。実はここまでの話を聞いて、もうLPの原案ができてるんですが...見ます？', speaker: '自分' },
];

function extractFromTranscript(chunks) {
  const fullText = chunks.map(c => c.text).join(' ');
  const data = {};

  // テキストから情報を疑似抽出
  if (fullText.includes('山田製作所')) {
    data.company_name = { value: '山田製作所', confidence: 1.0 };
  }
  if (fullText.includes('製造業')) {
    data.industry = { value: 'BtoBサービス', confidence: 1.0 };
  }
  if (fullText.includes('金属加工')) {
    data.service_name = { value: '金属加工サービス', confidence: 0.6 };
  }
  if (fullText.includes('中小製造業') || fullText.includes('スタートアップ')) {
    data.target_customer = { value: '中小製造業・スタートアップ', confidence: 0.6 };
  }
  if (fullText.includes('精度') || fullText.includes('短納期')) {
    const strengths = [];
    if (fullText.includes('精度')) strengths.push('金属加工の高精度');
    if (fullText.includes('20年')) strengths.push('大手下請け20年の実績');
    if (fullText.includes('短納期')) strengths.push('短納期対応');
    data.strengths = { value: strengths, confidence: 1.0 };
  }
  if (fullText.includes('テレアポ') || fullText.includes('問い合わせが')) {
    const pains = [];
    if (fullText.includes('テレアポ')) pains.push('テレアポのアポ率が低い');
    if (fullText.includes('問い合わせがほとんど来ない')) pains.push('HPからの問い合わせがほぼゼロ');
    data.pain_points = { value: pains, confidence: 1.0 };
  }
  if (fullText.includes('5万') || fullText.includes('10万')) {
    data.price_range = { value: '月額5-10万円', confidence: 1.0 };
  }
  if (fullText.includes('テレアポ中心')) {
    data.current_marketing = { value: 'テレアポ + HP（効果薄）', confidence: 1.0 };
  }

  return data;
}

function checkReadiness(data) {
  const required = {
    lp: ['company_name', 'service_name', 'industry', 'target_customer', 'strengths'],
    ad_creative: ['service_name', 'target_customer', 'pain_points', 'strengths', 'industry'],
    flyer: ['company_name', 'service_name', 'industry', 'strengths', 'price_range'],
    hearing_form: ['industry', 'service_name', 'company_name'],
    line_design: ['service_name', 'target_customer', 'strengths', 'industry'],
    minutes: [],
    profile: ['company_name', 'service_name', 'industry', 'strengths'],
  };
  const result = {};
  for (const [type, fields] of Object.entries(required)) {
    const missing = fields.filter(f => !data[f]);
    result[type] = { ready: missing.length === 0, missing };
  }
  return result;
}

// ============================================================
// リクエストハンドラ
// ============================================================
function parseBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(body)); } catch { resolve({}); }
    });
  });
}

function json(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') { json(res, 204, null); return; }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname;

  try {
    // --- セッション開始 ---
    if (path === '/api/session/start' && req.method === 'POST') {
      const id = crypto.randomUUID();
      const session = {
        id,
        status: 'active',
        started_at: new Date().toISOString(),
        transcript_chunks: [],
        extracted_data: {},
        sim_index: 0,
      };
      sessions.set(id, session);
      console.log(`[SESSION] 新規作成: ${id}`);

      json(res, 200, { session_id: id });
      return;
    }

    // --- 文字起こし取得 (フロントがポーリング) ---
    if (path === '/api/transcript' && req.method === 'GET') {
      const sessionId = url.searchParams.get('session_id');
      const since = parseInt(url.searchParams.get('since') || '0', 10);
      const session = sessions.get(sessionId);
      if (!session) { json(res, 404, { error: 'セッションが見つかりません' }); return; }

      const newChunks = session.transcript_chunks.slice(since);
      json(res, 200, { chunks: newChunks, total: session.transcript_chunks.length });
      return;
    }

    // --- プレビュー抽出 (フロントが一定間隔で呼ぶ) ---
    if (path === '/api/extract-preview' && req.method === 'POST') {
      const body = await parseBody(req);
      const sessionId = body.session_id;
      const session = sessions.get(sessionId);
      if (!session) { json(res, 404, { error: 'セッションが見つかりません' }); return; }

      // 蓄積テキストから抽出
      const extracted = extractFromTranscript(session.transcript_chunks);
      session.extracted_data = extracted;
      console.log(`[EXTRACT] ${sessionId} プレビュー抽出: ${Object.keys(extracted).length}フィールド`);

      json(res, 200, { extracted_data: extracted });
      return;
    }

    // --- セッション状態 ---
    if (path === '/api/session-status' && req.method === 'GET') {
      const sessionId = url.searchParams.get('session_id');
      const session = sessions.get(sessionId);
      if (!session) { json(res, 404, { error: 'セッションが見つかりません' }); return; }

      const readiness = checkReadiness(session.extracted_data);
      const jobList = [...jobs.values()].filter(j => j.session_id === sessionId);

      json(res, 200, {
        session_id: sessionId,
        status: session.status,
        started_at: session.started_at,
        transcript_count: session.transcript_chunks.length,
        extracted_data: session.extracted_data,
        extracted_field_count: Object.keys(session.extracted_data).length,
        total_fields: 12,
        readiness,
        jobs: jobList,
      });
      return;
    }

    // --- 制作物生成 (蓄積テキスト全文で抽出→生成) ---
    if (path === '/api/generate-lp' && req.method === 'POST') {
      const body = await parseBody(req);
      const { session_id, type, transcript } = body;
      const session = sessions.get(session_id);
      if (!session) { json(res, 404, { error: 'セッションが見つかりません' }); return; }

      const deliverableType = type || 'lp';
      const jobId = crypto.randomUUID();

      // 生成時に最新の抽出を実行
      const extracted = extractFromTranscript(session.transcript_chunks);
      session.extracted_data = extracted;

      console.log(`[GENERATE] ${deliverableType} 開始 (テキスト${session.transcript_chunks.length}チャンク, ${Object.keys(extracted).length}フィールド抽出済み)`);

      const job = {
        id: jobId,
        session_id,
        type: deliverableType,
        status: 'processing',
        result_url: null,
        error: null,
        started_at: new Date().toISOString(),
        completed_at: null,
        created_at: new Date().toISOString(),
      };
      jobs.set(jobId, job);

      // 3-8秒後に完了
      const delay = 3000 + Math.random() * 5000;
      setTimeout(() => {
        job.status = 'completed';
        job.completed_at = new Date().toISOString();
        job.result_url = `https://mock-${session_id.slice(0, 8)}.lp.techstars.jp`;
        console.log(`[GENERATE] ${deliverableType} 完了 (${(delay/1000).toFixed(1)}秒)`);
      }, delay);

      json(res, 200, { success: true, job_id: jobId, type: deliverableType, status: 'processing' });
      return;
    }

    // --- 文字起こしテキスト受信 (transcribe-chunk) ---
    if (path === '/api/transcribe-chunk' && req.method === 'POST') {
      const body = await parseBody(req);
      const sessionId = body.session_id;
      const session = sessions.get(sessionId);
      if (!session) { json(res, 404, { error: 'セッションが見つかりません' }); return; }

      const text = body.text || '';
      const speaker = body.speaker || '自分';

      if (text.length > 0) {
        session.transcript_chunks.push({
          text,
          speaker,
          timestamp: new Date().toISOString(),
        });
        console.log(`[TRANSCRIBE] ${sessionId} [${speaker}] ${text.substring(0, 60)}`);
      }

      json(res, 200, { success: true, text, speaker });
      return;
    }

    // --- フィールド手動更新 ---
    const fieldMatch = path.match(/^\/api\/session\/([^/]+)\/data$/);
    if (fieldMatch && req.method === 'PATCH') {
      const sessionId = fieldMatch[1];
      const session = sessions.get(sessionId);
      if (!session) { json(res, 404, { error: 'セッションが見つかりません' }); return; }
      const body = await parseBody(req);
      for (const [key, value] of Object.entries(body)) {
        session.extracted_data[key] = { value, confidence: 1.0 };
      }
      json(res, 200, { success: true });
      return;
    }

    // --- セッション終了 ---
    const endMatch = path.match(/^\/api\/session\/([^/]+)\/end$/);
    if (endMatch && req.method === 'POST') {
      const sessionId = endMatch[1];
      const session = sessions.get(sessionId);
      if (!session) { json(res, 404, { error: 'セッションが見つかりません' }); return; }
      session.status = 'ended';
      json(res, 200, { success: true });
      return;
    }

    // --- 一括共有 ---
    const shareMatch = path.match(/^\/api\/session\/([^/]+)\/share$/);
    if (shareMatch && req.method === 'POST') {
      const body = await parseBody(req);
      json(res, 200, { success: true, shared_count: [...jobs.values()].filter(j => j.status === 'completed').length, method: body.method });
      return;
    }

    json(res, 404, { error: `Not found: ${path}` });
  } catch (err) {
    console.error('[ERROR]', err);
    json(res, 500, { error: 'サーバーエラー' });
  }
});

const PORT = 8888;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`
====================================
  Mock API Server v2
  http://localhost:${PORT}
====================================

正しいフロー:
  1. セッション開始 → 5秒ごとに会話テキストが蓄積
  2. /api/transcript → フロントが文字起こしを取得して表示
  3. /api/extract-preview → 15秒ごとにプレビュー抽出
  4. /api/generate-lp → タップ時に全文で生成開始

====================================
`);
});
