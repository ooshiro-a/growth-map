import { readFileSync } from 'node:fs';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export default defineConfig({
  // GitHub Pages：https://ooshiro-a.github.io/growth-map/
  base: '/growth-map/',
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  server: {
    // 手元の画面（npm run dev:lan は同じ Wi-Fi にも見える）から、個人のデータや設定を出さない
    fs: {
      deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/reference/**', '**/seed*.json', '**/*numbered*.json', '**/*outline-backup*', '**/life-mindmap*', '**/mockup*.html'],
    },
  },
  test: {
    include: ['tests/**/*.test.{js,jsx}'],
    environment: 'node',
  },
});
