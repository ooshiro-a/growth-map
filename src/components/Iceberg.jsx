import { useEffect, useMemo, useRef, useState } from 'react';
import { useWidth } from '../hooks.js';
import { FIT, estimateWidth, layoutIceberg, shortLabel } from '../lib/iceberg.js';
import { STAGE } from '../lib/labels.js';
import { LAYER } from '../lib/schema.js';
import { MoreMenu } from './MoreMenu.jsx';

// 文字の幅を画面の書体で測る（測れない時は目安）
function makeMeasure() {
  let ctx = null;
  try {
    ctx = document.createElement('canvas').getContext('2d');
  } catch {
    ctx = null;
  }
  if (!ctx || typeof ctx.measureText !== 'function') return estimateWidth;
  const family = getComputedStyle(document.body).fontFamily || 'sans-serif';
  const cache = new Map();
  return (text, px, bold) => {
    const k = `${bold ? 'b' : ''}${px}|${text}`;
    if (!cache.has(k)) {
      ctx.font = `${bold ? '700 ' : ''}${px}px ${family}`;
      cache.set(k, ctx.measureText(text).width);
    }
    return cache.get(k);
  };
}

const NAVY = '#1b2a6b';

// アイスバーグの図（本の図と同じ三角形。層の中に言葉を書き込む）
// data：lib/iceberg.js の icebergYear の結果
// menuFor(e)：言葉の「…」の選択肢／dateOf(e)：日付の行（配列）
// onTip()：成果を押した時（スマホ）／onChip(layer)：「ほかN語」を押した時
export function Iceberg({ data, wide = false, menuFor, dateOf, onTip, onChip }) {
  const boxRef = useRef(null);
  const figRef = useRef(null);
  const width = useWidth(boxRef);
  const W = wide ? Math.min(width, 520) : width;
  const measure = useMemo(() => makeMeasure(), []);
  const [open, setOpen] = useState(null);

  const spec = useMemo(() => {
    const layers = {};
    for (const [layer, list] of Object.entries(data.layers)) {
      layers[layer] = list.map((e) => ({ id: e.id, label: shortLabel(e.text), stage: e.value, deleted: !!e.deletedRec }));
    }
    const n = data.achieved.length;
    return {
      tip: wide ? '成果（結果）' : `成果 ${n}件`,
      titles: {
        skill: `能力・スキル ${data.points[LAYER.SKILL]}点`,
        beh: `ふるまい・習慣・行動 ${data.points[LAYER.PLUS]}点`,
        mind: `意識・想い・人生哲学 ${data.points[LAYER.MIND]}点`,
      },
      pm: wide ? ['«プラス»のふるまい', '«マイナス»のふるまい'] : ['«プラス»', '«マイナス»'],
      layers,
    };
  }, [data, wide]);

  const L = useMemo(() => layoutIceberg({ width: W, spec, measure, fit: wide ? FIT.wide : FIT.phone }), [W, spec, measure, wide]);

  const byId = useMemo(() => {
    const m = new Map();
    for (const list of Object.values(data.layers)) for (const e of list) m.set(e.id, e);
    return m;
  }, [data]);

  // 外側を押したら閉じる
  useEffect(() => {
    if (!open) return undefined;
    const down = (e) => {
      const fig = figRef.current;
      if (!fig || !fig.contains(e.target) || !e.target.closest('.w')) setOpen(null);
    };
    const key = (e) => {
      if (e.key === 'Escape') setOpen(null);
    };
    document.addEventListener('pointerdown', down);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('pointerdown', down);
      document.removeEventListener('keydown', key);
    };
  }, [open]);

  if (!L) return <div ref={boxRef} className="berg-box" />;

  const { H, hw, water, div1, dashed, colTop, div2, lh, font } = L;
  const cx = W / 2;
  const band = (y1, y2, fill) => (
    <polygon points={`${cx - hw(y1)},${y1} ${cx + hw(y1)},${y1} ${cx + hw(y2)},${y2} ${cx - hw(y2)},${y2}`} fill={fill} />
  );
  const across = (y, props = {}) => <line x1={cx - hw(y)} y1={y} x2={cx + hw(y)} y2={y} stroke={NAVY} strokeWidth="1" {...props} />;
  const ext = W * 0.14;
  const tip = L.labels.find((l) => l.tip);
  const n = data.achieved.length;

  return (
    <div ref={boxRef} className="berg-box">
      <div ref={figRef} className="berg" style={{ width: W, height: H, fontSize: font }}>
        <svg className="berg-bg" width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
          <polygon points={`${cx},0 ${cx + hw(water)},${water} ${cx - hw(water)},${water}`} fill={NAVY} />
          {band(water, div1, 'var(--berg-1)')}
          {band(div1, div2, 'var(--berg-2)')}
          {band(div2, H, 'var(--berg-3)')}
          <polygon points={`${cx},0.8 ${W - 0.8},${H - 0.8} 0.8,${H - 0.8}`} fill="none" stroke={NAVY} strokeWidth="1.3" strokeLinejoin="round" />
          {across(div1)}
          {across(div2)}
          {across(dashed, { strokeDasharray: '3 2' })}
          <line x1={cx} y1={div1} x2={cx} y2={dashed} stroke={NAVY} strokeWidth="1" />
          <line x1={cx} y1={colTop - 1} x2={cx} y2={div2} stroke={NAVY} strokeWidth="1" />
          <line x1={Math.max(0, cx - hw(water) - ext)} y1={water} x2={Math.min(W, cx + hw(water) + ext)} y2={water} stroke={NAVY} strokeWidth="2.5" />
        </svg>
        <span className="wl" style={{ left: Math.max(0, cx - hw(water) - ext), top: water - 13 }}>
          水面
        </span>

        {tip &&
          (onTip && !wide ? (
            <button type="button" className="bl tipx" style={{ left: tip.x - 4, top: tip.y, width: tip.w + 8, height: lh }} onClick={onTip}>
              {tip.text}
            </button>
          ) : (
            <span className="bl tipx" style={{ left: tip.x - 4, top: tip.y, width: tip.w + 8, height: lh }}>
              {tip.text}
            </span>
          ))}
        {wide && (
          <div className="callout" style={{ left: cx + hw(water) + 14, top: Math.max(0, tip ? tip.y - lh * 1.5 : 0), maxWidth: W - (cx + hw(water) + 14) }}>
            <b>成果 {n}件</b>
            {data.achieved.map((g) => (
              <div key={g.id}>{g.text}</div>
            ))}
          </div>
        )}

        {L.labels
          .filter((l) => !l.tip)
          .map((l) => (
            <span key={l.key} className={`bl${l.small ? ' pm' : ''}`} style={{ left: l.x - 4, top: l.y, width: l.w + 8, height: l.h }}>
              {l.text}
            </span>
          ))}

        {L.words.map((b) => {
          const e = byId.get(b.id);
          if (!e) return null;
          const minus = b.layer === LAYER.MINUS;
          const stage = minus ? '' : String(e.value || '');
          const isOpen = open === b.id;
          const center = b.x + b.w / 2;
          const align = center < W * 0.3 ? ' l' : center > W * 0.7 ? ' r' : '';
          const label = b.word.label;
          const dates = dateOf(e);
          const menu = menuFor(e);
          return (
            <span
              key={b.id}
              className={`w${minus ? ' minus' : ` g${stage}`}${e.deletedRec ? ' del' : ''}${isOpen ? ' show' : ''}`}
              style={{ left: b.x, top: b.y, width: b.w, height: b.h }}
            >
              <button
                type="button"
                className="w-btn"
                aria-label={`${e.text}${minus ? '' : `（${STAGE[stage] || '採点なし'}）`}${e.deletedRec ? '（削除済み）' : ''}`}
                aria-expanded={isOpen}
                onClick={() => setOpen((o) => (o === b.id ? null : b.id))}
              >
                {label}
              </button>
              <span className={`pop${align}`}>
                {label !== e.text.trim() && <span className="pop-full">{e.text}</span>}
                {dates.map((d, i) => (
                  <span key={i} className="pop-date">
                    {d}
                  </span>
                ))}
                {menu && <MoreMenu small items={menu} label={`「${e.text}」の操作`} />}
              </span>
            </span>
          );
        })}

        {L.chips.map((c) => (
          <button
            type="button"
            key={`chip-${c.layer}`}
            className="chip-more"
            style={{ left: c.x, top: c.y + 1, width: c.w, height: c.h - 2 }}
            onClick={() => onChip && onChip(c.layer)}
          >
            {c.text}
          </button>
        ))}
      </div>
    </div>
  );
}
