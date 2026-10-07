/**
 * Bundles a generated block entry with esbuild, aliasing react-native to a
 * DOM mock. Runs in a child process because esbuild's JS API cannot run
 * inside vitest's worker threads (Uint8Array realm invariant).
 *
 * Usage: node bundle-block.mjs <entry.tsx> <rn-mock.tsx> <out.cjs>
 */
import { buildSync } from 'esbuild';

const [entry, rnMock, outFile] = process.argv.slice(2);
if (!entry || !rnMock || !outFile) {
  console.error('usage: node bundle-block.mjs <entry.tsx> <rn-mock.tsx> <out.cjs>');
  process.exit(1);
}

buildSync({
  entryPoints: [entry],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: outFile,
  alias: { 'react-native': rnMock },
  external: ['react'],
  logLevel: 'silent',
});
