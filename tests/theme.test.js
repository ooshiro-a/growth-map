// @vitest-environment happy-dom
// 画面の色（この端末だけ。localStorage の gm.theme）
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { THEMES, applyTheme, isDark, loadTheme, setTheme } from '../src/lib/theme.js';

const mem = (init = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m };
};

afterEach(() => {
  document.head.innerHTML = '';
  delete document.documentElement.dataset.theme;
});

describe('画面の色', () => {
  it('選べるのは 端末に合わせる・ライト・ダーク（既定は端末に合わせる）', () => {
    expect(THEMES.map((t) => t.label)).toEqual(['端末に合わせる', 'ライト', 'ダーク']);
    expect(loadTheme(mem())).toBe('auto');
    expect(loadTheme(mem({ 'gm.theme': 'dark' }))).toBe('dark');
    expect(loadTheme(mem({ 'gm.theme': 'light' }))).toBe('light');
    expect(loadTheme(mem({ 'gm.theme': 'へん' }))).toBe('auto');
    expect(loadTheme(null)).toBe('auto');
    expect(
      loadTheme({
        getItem() {
          throw new Error('使えない');
        },
      }),
    ).toBe('auto');
  });

  it('切り替えると記憶し、<html data-theme> と theme-color を変える', () => {
    document.head.innerHTML = '<meta name="theme-color" content="#F5F2EA">';
    const s = mem();
    setTheme('dark', s);
    expect(s.m.get('gm.theme')).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.querySelector('meta[name="theme-color"]').getAttribute('content')).toBe('#0F2B3F');
    setTheme('light', s);
    expect(document.querySelector('meta[name="theme-color"]').getAttribute('content')).toBe('#F5F2EA');
    expect(isDark('dark')).toBe(true);
    expect(isDark('light')).toBe(false);
  });

  it('記憶できない時も、今の画面では切り替わる', () => {
    const broken = {
      setItem() {
        throw new Error('いっぱい');
      },
    };
    setTheme('dark', broken);
    expect(document.documentElement.dataset.theme).toBe('dark');
    applyTheme('auto');
    expect(document.documentElement.dataset.theme).toBe('auto');
  });

  it('index.html は描く前に data-theme を決める（白く光らない）', () => {
    const html = readFileSync('index.html', 'utf8');
    const head = html.slice(0, html.indexOf('</head>'));
    expect(head).toContain("localStorage.getItem('gm.theme') || 'auto'");
    expect(head.indexOf('gm.theme')).toBeLessThan(head.indexOf('<title>'));
  });
});
