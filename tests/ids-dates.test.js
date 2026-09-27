import { describe, expect, it } from 'vitest';
import { formatJpDate, jstYear, toJstIso } from '../src/lib/dates.js';
import { decodeIdTime, newId, newRecordNo } from '../src/lib/ids.js';

describe('番号', () => {
  it('新しい番号は旧マップと同じ形で、時刻を読み戻せる', () => {
    const ms = Date.UTC(2026, 8, 27, 2, 30, 0, 123);
    const id = newId(ms);
    expect(id).toMatch(/^n[0-9a-z]{8}[0-9a-z]{1,2}[0-9a-z]{4}$/);
    expect(decodeIdTime(id, ms + 1000)).toBe(ms);
    expect(newRecordNo(ms)).toMatch(/^r[0-9a-z]{8}/);
  });

  it('旧マップの番号（作り物）から追加日時を戻す。読めない番号は null', () => {
    const ms = Date.UTC(2026, 6, 11, 5, 53, 35, 777); // 26年7月11日 14:53 JST
    const fake = 'n' + ms.toString(36) + '1g' + 'abcd';
    expect(decodeIdTime(fake, Date.UTC(2026, 9, 1))).toBe(ms);
    expect(formatJpDate(decodeIdTime(fake, Date.UTC(2026, 9, 1)))).toBe('26年7月11日');
    expect(decodeIdTime('root')).toBeNull();
    expect(decodeIdTime('n' + '00000001' + 'x')).toBeNull(); // 2020年より前
    expect(decodeIdTime('n' + (Date.UTC(2030, 0, 1)).toString(36) + 'xx', Date.UTC(2026, 0, 1))).toBeNull(); // 未来
    expect(decodeIdTime('nZZZZZZZZ')).toBeNull();
  });
});

describe('日本時間', () => {
  it('年月日の表示は日本時間（UTC の大みそか 15:30 は日本の元日）', () => {
    const ms = Date.UTC(2026, 11, 31, 15, 30);
    expect(formatJpDate(ms)).toBe('27年1月1日');
    expect(jstYear(ms)).toBe(2027);
    expect(jstYear(Date.UTC(2026, 11, 31, 14, 59))).toBe(2026);
  });

  it('シートに書く形', () => {
    expect(toJstIso(Date.UTC(2026, 11, 31, 15, 30, 1, 5))).toBe('2027-01-01T00:30:01.005+09:00');
    expect(formatJpDate('2027-01-10T08:00:00.000+09:00')).toBe('27年1月10日');
    expect(formatJpDate('')).toBe('');
  });
});
