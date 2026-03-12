/**
 * 定数テスト
 *
 * 定数の整合性を検証する。
 */

import {
  FIELD_LABELS,
  CONFIDENCE_THRESHOLD,
  REQUIRED_FIELDS,
  DELIVERABLE_ORDER,
  DELIVERABLE_LABELS,
} from '../../src/lib/constants';

describe('FIELD_LABELS', () => {
  it('必須フィールドすべてにラベルが定義されている', () => {
    const allRequiredFields = new Set<string>();
    for (const fields of Object.values(REQUIRED_FIELDS)) {
      for (const field of fields) {
        allRequiredFields.add(field);
      }
    }

    for (const field of allRequiredFields) {
      expect(FIELD_LABELS[field]).toBeDefined();
      expect(typeof FIELD_LABELS[field]).toBe('string');
      expect((FIELD_LABELS[field] as string).length).toBeGreaterThan(0);
    }
  });
});

describe('CONFIDENCE_THRESHOLD', () => {
  it('0.6である', () => {
    expect(CONFIDENCE_THRESHOLD).toBe(0.6);
  });
});

describe('REQUIRED_FIELDS', () => {
  it('全7制作物タイプに必須フィールドが定義されている', () => {
    expect(Object.keys(REQUIRED_FIELDS)).toHaveLength(7);
    expect(REQUIRED_FIELDS.lp).toBeDefined();
    expect(REQUIRED_FIELDS.ad_creative).toBeDefined();
    expect(REQUIRED_FIELDS.flyer).toBeDefined();
    expect(REQUIRED_FIELDS.hearing_form).toBeDefined();
    expect(REQUIRED_FIELDS.line_design).toBeDefined();
    expect(REQUIRED_FIELDS.minutes).toBeDefined();
    expect(REQUIRED_FIELDS.profile).toBeDefined();
  });

  it('各制作物の必須フィールドは空配列でない', () => {
    for (const [type, fields] of Object.entries(REQUIRED_FIELDS)) {
      expect(fields.length).toBeGreaterThan(0);
      // eslint-disable-next-line no-console
      console.log(`${type}: ${fields.join(', ')}`);
    }
  });
});

describe('DELIVERABLE_ORDER', () => {
  it('7制作物すべてが含まれている', () => {
    expect(DELIVERABLE_ORDER).toHaveLength(7);
    const types = new Set(DELIVERABLE_ORDER);
    expect(types.has('lp')).toBe(true);
    expect(types.has('ad_creative')).toBe(true);
    expect(types.has('flyer')).toBe(true);
    expect(types.has('hearing_form')).toBe(true);
    expect(types.has('line_design')).toBe(true);
    expect(types.has('minutes')).toBe(true);
    expect(types.has('profile')).toBe(true);
  });
});

describe('DELIVERABLE_LABELS', () => {
  it('全制作物タイプにラベルが定義されている', () => {
    for (const type of DELIVERABLE_ORDER) {
      expect(DELIVERABLE_LABELS[type]).toBeDefined();
      expect(typeof DELIVERABLE_LABELS[type]).toBe('string');
      expect(DELIVERABLE_LABELS[type].length).toBeGreaterThan(0);
    }
  });
});
