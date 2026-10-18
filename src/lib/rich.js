// 文言の太字：**で囲んだ所（例：**冷凍機の仕組み**（本業スキル））。記録はそのまま、画面で太字にする
// 閉じていない ** や中身のない **** は、そのまま文字として出す
const BOLD = /\*\*(.+?)\*\*/g;

// [{ text, bold }]
export function richParts(s) {
  const str = s == null ? '' : String(s);
  const out = [];
  let last = 0;
  for (const m of str.matchAll(BOLD)) {
    if (m.index > last) out.push({ text: str.slice(last, m.index), bold: false });
    out.push({ text: m[1], bold: true });
    last = m.index + m[0].length;
  }
  if (last < str.length || out.length === 0) out.push({ text: str.slice(last), bold: false });
  return out;
}

// ** を外した文言（確認の文・読み上げ・図の中の短い言葉など）
export const plainText = (s) => (s == null ? '' : String(s).replace(BOLD, '$1'));
