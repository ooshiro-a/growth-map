import { richParts } from '../lib/rich.js';

// 文言を出す：**で囲んだ所を太字に（src/lib/rich.js）
export function Rich({ text }) {
  const parts = richParts(text);
  if (parts.length === 1 && !parts[0].bold) return parts[0].text;
  return parts.map((p, i) => (p.bold ? <strong key={i}>{p.text}</strong> : p.text));
}
