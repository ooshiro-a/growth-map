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
  test: {
    include: ['tests/**/*.test.{js,jsx}'],
    environment: 'node',
  },
});
