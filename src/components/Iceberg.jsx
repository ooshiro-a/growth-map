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
// 外枠・水面・頂の点線は変数（ダークの地でも形が見える）。図の中の色は同じ
const EDGE = 'var(--berg-edge)';
const WIDE_MAX = 520; // PC の図の幅の上限
const PHONE_MAX = 440; // スマホの形（縦長）の図の幅の上限（広げても下が空くだけ）
const SIDE_GAP = 16;
const SIDE_MIN = 140; // PC の成果の列の幅（これより狭くなる時は図の下に出す）
const SIDE_MAX = 240;
const WIDE_MIN = 360; // 横に列を並べる時の図の幅の下限

// アイスバーグの図（本の図と同じ三角形。層の中に言葉を書き込む）
// data：lib/iceberg.js の icebergYear の結果
// menuFor(e)：言葉の「…」の選択肢／dateOf(e)：日付の行（配列）
// onTip()：成果を押した時（スマホ）／onChip(layer)：「ほかN語」を押した時
// PC は成果の中身を三角形の右の列に出す（図の中には重ねない）
export function Iceberg({ data, wide = false, menuFor, dateOf, onTip, onChip }) {
  const boxRef = useRef(null);
  const figRef = useRef(null);
  const width = useWidth(boxRef);
  const side = wide && width >= WIDE_MIN + SIDE_GAP + SIDE_MIN ? Math.max(SIDE_MIN, Math.min(SIDE_MAX, width - WIDE_MAX - SIDE_GAP)) : 0;
  const W = wide ? Math.min(WIDE_MAX, side ? width - side - SIDE_GAP : width) : Math.min(width, PHONE_MAX);
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

  // 外側を押したら閉じる（「…」の選択肢と、そこから開いた小窓の中は除く。閉じた時に「…」へ戻れるように）
  useEffect(() => {
    if (!open) return undefined;
    const busy = () => !!document.querySelector('[role="menu"], .overlay');
    const down = (e) => {
      const fig = figRef.current;
      if (e.target.closest && e.target.closest('[role="menu"], .overlay')) return;
      if (!fig || !fig.contains(e.target) || !e.target.closest('.w')) setOpen(null);
    };
    const key = (e) => {
      if (e.key !== 'Escape' || busy()) return;
      // 言葉の中（「…」など）にいたら、言葉に戻る
      const fig = figRef.current;
      const btn = fig && fig.querySelector('.w.show .w-btn');
      if (btn && btn.parentElement.contains(document.activeElement)) btn.focus({ preventScroll: true });
      setOpen(null);
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
  const tipMid = tip ? tip.y + lh / 2 : 0;
  const n = data.achieved.length;

  return (
    <div ref={boxRef} className="berg-box">
      <div className="berg-row">
        <div ref={figRef} className="berg" style={{ width: W, height: H, fontSize: font }}>
          <svg className="berg-bg" width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
            <polygon points={`${cx},0 ${cx + hw(water)},${water} ${cx - hw(water)},${water}`} fill={NAVY} />
            {band(water, div1, 'var(--berg-1)')}
            {band(div1, div2, 'var(--berg-2)')}
            {band(div2, H, 'var(--berg-3)')}
            <polygon points={`${cx},0.8 ${W - 0.8},${H - 0.8} 0.8,${H - 0.8}`} fill="none" stroke={EDGE} strokeWidth="1.3" strokeLinejoin="round" />
            {across(div1)}
            {across(div2)}
            {across(dashed, { strokeDasharray: '3 2' })}
            <line x1={cx} y1={div1} x2={cx} y2={dashed} stroke={NAVY} strokeWidth="1" />
            <line x1={cx} y1={colTop - 1} x2={cx} y2={div2} stroke={NAVY} strokeWidth="1" />
            <line x1={Math.max(0, cx - hw(water) - ext)} y1={water} x2={Math.min(W, cx + hw(water) + ext)} y2={water} stroke={EDGE} strokeWidth="2.5" />
            {wide && tip && <line x1={tip.x + tip.w + 8} y1={tipMid} x2={W} y2={tipMid} stroke={EDGE} strokeWidth="0.8" strokeDasharray="2 2" />}
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
        {wide && (
          <div className="berg-side" style={side ? { width: side, marginTop: Math.max(0, tipMid - 9) } : { width: '100%' }}>
            <b>成果 {n}件</b>
            {data.achieved.map((g) => (
              <div key={g.id}>{g.text}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
