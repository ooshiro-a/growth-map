import { describe, expect, it } from 'vitest';
import { plainText, richParts } from '../src/lib/rich.js';

describe('文言の太字（**で囲む）', () => {
  it('**で囲んだ所だけ太字。ほかはそのまま', () => {
    expect(richParts('**作り物の見出し**（作り物の説明）')).toEqual([
      { text: '作り物の見出し', bold: true },
      { text: '（作り物の説明）', bold: false },
    ]);
    expect(richParts('前**中**後**二つ目**')).toEqual([
      { text: '前', bold: false },
      { text: '中', bold: true },
      { text: '後', bold: false },
      { text: '二つ目', bold: true },
    ]);
    expect(richParts('作り物の文言')).toEqual([{ text: '作り物の文言', bold: false }]);
    expect(richParts('')).toEqual([{ text: '', bold: false }]);
    expect(richParts(null)).toEqual([{ text: '', bold: false }]);
  });

  it('閉じていない ** と中身のない **** は文字のまま', () => {
    expect(richParts('作り物**の文言')).toEqual([{ text: '作り物**の文言', bold: false }]);
    expect(richParts('作り物****の文言')).toEqual([{ text: '作り物****の文言', bold: false }]);
    expect(richParts('**太字**と**閉じない')).toEqual([
      { text: '太字', bold: true },
      { text: 'と**閉じない', bold: false },
    ]);
  });

  it('plainText：** を外す（確認の文・読み上げ用）', () => {
    expect(plainText('**作り物の見出し**（作り物の説明）')).toBe('作り物の見出し（作り物の説明）');
    expect(plainText('作り物**の文言')).toBe('作り物**の文言');
    expect(plainText(undefined)).toBe('');
  });
});
