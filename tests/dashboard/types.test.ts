/**
 * 型定義テスト
 *
 * 型の整合性をコンパイル時 + ランタイムで検証する。
 */

import type {
  DeliverableType,
  DeliverableStatus,
  GenerationJob,
  ExtractionField,
  SessionStatus,
  ShareMethod,
} from '../../src/types/dashboard';

describe('DeliverableType', () => {
  it('7種類の制作物タイプが使用可能', () => {
    const types: DeliverableType[] = [
      'lp',
      'ad_creative',
      'flyer',
      'hearing_form',
      'line_design',
      'minutes',
      'profile',
    ];
    expect(types).toHaveLength(7);
  });
});

describe('DeliverableStatus', () => {
  it('4ステータスが使用可能', () => {
    const statuses: DeliverableStatus[] = [
      'insufficient',
      'ready',
      'generating',
      'completed',
    ];
    expect(statuses).toHaveLength(4);
  });
});

describe('SessionStatus', () => {
  it('3ステータスが使用可能', () => {
    const statuses: SessionStatus[] = ['active', 'paused', 'ended'];
    expect(statuses).toHaveLength(3);
  });
});

describe('ShareMethod', () => {
  it('3メソッドが使用可能', () => {
    const methods: ShareMethod[] = ['line', 'email', 'qr'];
    expect(methods).toHaveLength(3);
  });
});

describe('GenerationJob', () => {
  it('ジョブオブジェクトが正しい型を持つ', () => {
    const job: GenerationJob = {
      id: 'job-1',
      session_id: 'sess-1',
      type: 'lp',
      status: 'completed',
      result_url: 'https://example.com',
      error: null,
      started_at: '2026-01-01T00:00:00Z',
      completed_at: '2026-01-01T00:01:00Z',
      created_at: '2026-01-01T00:00:00Z',
    };

    expect(job.id).toBe('job-1');
    expect(job.type).toBe('lp');
    expect(job.status).toBe('completed');
    expect(job.result_url).toBe('https://example.com');
  });
});

describe('ExtractionField', () => {
  it('抽出フィールドが正しい型を持つ', () => {
    const field: ExtractionField = {
      key: 'company_name',
      label: '会社名',
      value: 'テスト株式会社',
      confidence: 0.9,
    };

    expect(field.key).toBe('company_name');
    expect(field.confidence).toBeGreaterThan(0.6);
  });

  it('配列値の抽出フィールドも正しい型を持つ', () => {
    const field: ExtractionField = {
      key: 'strengths',
      label: '強み',
      value: ['高品質', '低価格'],
      confidence: 0.8,
    };

    expect(field.value).toHaveLength(2);
  });

  it('null値の抽出フィールドも正しい型を持つ', () => {
    const field: ExtractionField = {
      key: 'price_range',
      label: '価格帯',
      value: null,
      confidence: 0.3,
    };

    expect(field.value).toBeNull();
    expect(field.confidence).toBeLessThan(0.6);
  });
});
