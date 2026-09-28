import { useApp } from '../app-context.js';
import { HeaderActions } from '../components/HeaderActions.jsx';
import { reviewYears } from '../lib/review.js';
import { AccelScreen } from './AccelScreen.jsx';
import { BrakeScreen } from './BrakeScreen.jsx';
import { IcebergScreen } from './IcebergScreen.jsx';
import { ReviewScreen } from './ReviewScreen.jsx';

export const RECORD_PARTS = [
  { key: 'iceberg', label: 'アイスバーグ' },
  { key: 'brake', label: 'ブレーキ' },
  { key: 'accel', label: 'アクセル' },
  { key: 'review', label: '振り返り' },
];

// 年表＞年ごとの記録：年を選び、その年の成長の地図と振り返りを見るだけで出す
// year・part：場所（#/timeline/years/2026/brake）から。onChange(year, part) で場所を変える
export function YearRecord({ year: asked = null, part: askedPart = null, onChange }) {
  const { model, year: currentYear } = useApp();
  const years = reviewYears(model, currentYear); // 新しい順：記録のある最初の年〜今年
  const year = years.includes(asked) ? asked : currentYear;
  const part = RECORD_PARTS.some((p) => p.key === askedPart) ? askedPart : RECORD_PARTS[0].key;
  const change = (y, p) => onChange && onChange(y, p);

  return (
    <div className="year-record">
      <HeaderActions>
        <select className="year-pick" aria-label="どの年の記録か" value={year} onChange={(ev) => change(Number(ev.target.value), part)}>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}年
            </option>
          ))}
        </select>
      </HeaderActions>

      <div className="seg" role="tablist" aria-label={`${year}年の記録の中`}>
        {RECORD_PARTS.map((p) => (
          <button type="button" key={p.key} role="tab" aria-selected={part === p.key} className={part === p.key ? 'on' : ''} onClick={() => change(year, p.key)}>
            {p.label}
          </button>
        ))}
      </div>
      <p className="note">{year}年の記録（見るだけ）</p>

      <div key={`${year}/${part}`}>
        {part === 'iceberg' && <IcebergScreen year={year} viewOnly />}
        {part === 'brake' && <BrakeScreen year={year} viewOnly />}
        {part === 'accel' && <AccelScreen year={year} viewOnly />}
        {part === 'review' && <ReviewScreen fixedYear={year} viewOnly />}
      </div>
    </div>
  );
}
