import { defineConfig } from 'vitest/config';
import path from 'node:path';

const dir = import.meta.dirname;
const pkgs = ['manifest', 'blocks', 'wiring', 'compiler', 'benchmark'];

export default defineConfig({
  resolve: {
    alias: Object.fromEntries(
      pkgs.map((p) => [`@blockfw/${p}`, path.resolve(dir, `packages/${p}/src/index.ts`)]),
    ),
  },
  test: {
    include: ['packages/*/test/**/*.test.{ts,tsx}'],
  },
});
