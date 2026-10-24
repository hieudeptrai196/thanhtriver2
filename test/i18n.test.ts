import { describe, expect, it } from 'vitest';
import { en } from '../src/i18n/en';
import { vi } from '../src/i18n/vi';

describe('i18n', () => {
  it('vi has every en key and no extras', () => {
    expect(Object.keys(vi).sort()).toEqual(Object.keys(en).sort());
  });

  it('no empty strings and matching placeholders', () => {
    for (const k of Object.keys(en) as (keyof typeof en)[]) {
      expect(vi[k].length).toBeGreaterThan(0);
      const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();
      expect(ph(vi[k])).toEqual(ph(en[k]));
    }
  });
});
