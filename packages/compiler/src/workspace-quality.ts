import { createSyncFn } from 'synckit';
import type { CompiledFile } from './files.js';

let format: ((files: CompiledFile[]) => CompiledFile[]) | undefined;
const cache = new Map<string, CompiledFile[]>();

export function formatWorkspace(files: CompiledFile[]): CompiledFile[] {
  const key = JSON.stringify(files);
  let result = cache.get(key);
  if (!result) {
    format ??= createSyncFn<(files: CompiledFile[]) => CompiledFile[]>(
      new URL(
        import.meta.url.endsWith('.ts') ? './workspace-worker.ts' : './workspace-worker.js',
        import.meta.url,
      ),
      { tsRunner: 'node', timeout: 30_000 },
    );
    result = format(files);
    if (cache.size >= 8) cache.delete(cache.keys().next().value!);
    cache.set(key, result);
  }
  return result.map((file) => ({ ...file }));
}

export const QUALITY_DEPS = {
  eslint: '10.12.0',
  '@eslint/js': '10.0.1',
  'typescript-eslint': '8.71.1',
  prettier: '3.9.9',
};
const formatPaths =
  '"apps/**/*.{ts,tsx,js,mjs,css,html}" "*.mjs" pnpm-workspace.yaml ".github/workflows/*.yml" "docs/**/*.md" README.md';
export const QUALITY_SCRIPTS = {
  lint: 'eslint . --max-warnings 0',
  'format:check': `prettier --check ${formatPaths}`,
  format: `prettier --write ${formatPaths}`,
};
export const QUALITY_FILES: CompiledFile[] = [
  {
    path: 'eslint.config.mjs',
    content: `import js from '@eslint/js';
import tseslint from 'typescript-eslint';
export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/dist/**', '**/.expo/**', '**/.turbo/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { files: ['**/babel.config.js'], languageOptions: { sourceType: 'commonjs' } },
);
`,
  },
  { path: '.prettierrc.json', content: '{"endOfLine":"lf","printWidth":100,"singleQuote":true}\n' },
  { path: '.prettierignore', content: '**/node_modules/\n**/dist/\n**/.expo/\n**/.turbo/\n' },
];
