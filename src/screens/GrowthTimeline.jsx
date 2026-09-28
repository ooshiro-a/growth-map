import { useMemo } from 'react';
import { useApp } from '../app-context.js';
import { CHART, TIMELINE_YEARS, chartLayout, deltaText, growthYears } from '../lib/timeline.js';

const ORANGE = '#f07a1a';
const ORANGE_TEXT = '#a34a0b';

// 年表＞アイスバーグ成長年表（直近5年。年を押すと、その年の記録を見るだけで開く）
export function GrowthTimeline({ onOpen }) {
  const { model } = useApp();
  const years = useMemo(() => growthYears(model), [model]);
  const L = useMemo(() => chartLayout(years), [years]);
  const c = CHART;
  const last = L.length - 1;
  const open = (y) => onOpen && onOpen(y);
  const key = (y) => (ev) => {
    if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault();
      open(y);
    }
  };
  const label = L.map((p) => `${p.year}年${p.size}点`).join('、');

  return (
    <div className="growth-screen">
      <div className="growth-fig">
        <svg viewBox={`0 0 ${c.W} ${c.H}`} width="100%" role="group" aria-label={`アイスバーグ成長年表。${label}`}>
          {Array.from({ length: TIMELINE_YEARS }, (_, i) => (
            <line key={i} x1={c.x0 + i * c.step} y1={c.base} x2={c.x0 + i * c.step} y2={16} stroke="#c9c3b8" strokeDasharray="2 3" />
          ))}
          <line x1={c.left} y1={c.base} x2={c.W - 8} y2={c.base} stroke="#2a2722" strokeWidth="1.5" />
          <path d={`M${c.W - 13} ${c.base - 5} L${c.W - 6} ${c.base} L${c.W - 13} ${c.base + 5}`} fill="none" stroke="#2a2722" strokeWidth="1.5" />
          <line x1={c.left} y1={c.base} x2={c.left} y2={10} stroke="#2a2722" strokeWidth="1.5" />
          <path d={`M${c.left - 5} 15 L${c.left} 8 L${c.left + 5} 15`} fill="none" stroke="#2a2722" strokeWidth="1.5" />
          <text x={c.left + 7} y="16" fontSize="9" fill="#6b665d">
            大きさ
          </text>

          {L.map((p) =>
            p.berg ? (
              <g key={`b${p.year}`} aria-hidden="true">
                {p.berg.bands.map((pts, i) => (
                  <polygon key={i} points={pts} fill={['var(--berg-navy)', 'var(--berg-1)', 'var(--berg-2)', 'var(--berg-3)'][i]} />
                ))}
                <polygon points={p.berg.outline} fill="none" stroke="var(--berg-navy)" strokeWidth="0.8" strokeLinejoin="round" />
                <line x1={p.berg.water.x1} y1={p.berg.water.y} x2={p.berg.water.x2} y2={p.berg.water.y} stroke="var(--berg-navy)" strokeWidth="1.2" />
              </g>
            ) : null,
          )}

          {L.length > 1 && (
            <polyline points={L.map((p) => `${p.x},${p.dotY}`).join(' ')} fill="none" stroke={ORANGE} strokeWidth="2" strokeLinejoin="round" />
          )}
          {L.map((p, i) => (
            <g
              key={p.year}
              className="growth-year"
              role="button"
              tabIndex={0}
              aria-label={`${p.year}年 ${p.size}点。この年の記録を開く`}
              onClick={() => open(p.year)}
              onKeyDown={key(p.year)}
            >
              <rect x={p.x - c.step / 2} y={8} width={c.step} height={c.H - 8} fill="transparent" />
              <circle cx={p.x} cy={p.dotY} r="3.5" fill={ORANGE} />
              <text x={p.x + 6} y={p.dotY + 14} fontSize="10" fill={ORANGE_TEXT} fontWeight="700">
                {p.size}
              </text>
              <text x={p.x} y={c.base + 17} fontSize="10" textAnchor="middle" fill="#2a2722" fontWeight={i === last ? 700 : 400}>
                {p.year}
              </text>
            </g>
          ))}
        </svg>
      </div>

      <table className="yt">
        <thead>
          <tr>
            <th>年</th>
            <th className="n">大きさ</th>
            <th className="n">増減</th>
            <th>成果</th>
          </tr>
        </thead>
        <tbody>
          {L.map((p) => (
            <tr key={p.year} onClick={() => open(p.year)}>
              <td>
                <button type="button" className="yt-year" aria-label={`${p.year}年の記録を開く`} onClick={(ev) => {
                    ev.stopPropagation();
                    open(p.year);
                  }}
                >
                  {p.year}
                </button>
              </td>
              <td className="n">{p.size}点</td>
              <td className="n">{deltaText(p.delta)}</td>
              <td>
                {p.achieved.length === 0 ? (
                  '—'
                ) : (
                  <ul className="yt-goals">
                    {p.achieved.map((g) => (
                      <li key={g.id}>{g.text}</li>
                    ))}
                  </ul>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="note">
        大きさ＝アイスバーグの点数（その年の最後の姿。今年は今の姿）。成果＝振り返りで「達成」にした目標
        <br />
        {TIMELINE_YEARS + 1}年目からは古い年が左から外れます（「年ごとの記録」でいつでも見られます）
        <br />
        年を押すと、その年の記録を見るだけで開きます
      </p>
    </div>
  );
}
