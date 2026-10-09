import { readFileSync } from 'node:fs';
import {
  argbFromHex,
  hexFromArgb,
  themeFromSourceColor,
  TonalPalette,
  Contrast,
  lstarFromArgb,
} from '@material/material-color-utilities';
import { canonicalJson } from '@blockfw/manifest';
import type { BlockTheme } from '@blockfw/blocks';
import type { CompiledFile } from './files.js';

/** Build-time color science and token conversion; exports contain only resolved values. */
export async function workspaceTheme(theme: Required<BlockTheme>): Promise<CompiledFile[]> {
  for (const value of Object.values(theme))
    if (!/^#[0-9a-f]{6}$/i.test(value))
      throw new Error('Theme colors must be six-digit hex colors');
  const color = (hex: string) => ({
    $type: 'color',
    $value: {
      colorSpace: 'srgb',
      components: [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16) / 255),
      alpha: 1,
    },
  });
  const dimension = (value: number) => ({ $type: 'dimension', $value: { value, unit: 'px' } });
  const material = themeFromSourceColor(argbFromHex(theme.primaryColor));
  const palettes = {
    primary: material.palettes.primary,
    neutral: material.palettes.neutral,
    success: TonalPalette.fromInt(argbFromHex('#15803d')),
    warning: TonalPalette.fromInt(argbFromHex('#a16207')),
    danger: material.palettes.error,
  };
  const tones = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 99, 100];
  const semantic = (dark: boolean) => {
    const scheme = material.schemes[dark ? 'dark' : 'light'];
    return {
      primary: color(dark ? hexFromArgb(scheme.primary) : theme.primaryColor),
      onPrimary: color(
        dark
          ? hexFromArgb(scheme.onPrimary)
          : Contrast.ratioOfTones(lstarFromArgb(argbFromHex(theme.primaryColor)), 100) >= 4.5
            ? '#ffffff'
            : '#000000',
      ),
      background: color(dark ? hexFromArgb(scheme.background) : theme.backgroundColor),
      text: color(dark ? hexFromArgb(scheme.onBackground) : theme.textColor),
      surface: color(hexFromArgb(scheme.surface)),
      muted: color(hexFromArgb(scheme.onSurfaceVariant)),
      border: color(hexFromArgb(scheme.outlineVariant)),
      ...Object.fromEntries(
        ['success', 'warning', 'danger'].map((name) => [
          name,
          { $type: 'color', $value: `{palette.${name}.${dark ? 80 : 40}}` },
        ]),
      ),
    };
  };
  const tokens = {
    palette: Object.fromEntries(
      Object.entries(palettes).map(([name, palette]) => [
        name,
        Object.fromEntries(tones.map((tone) => [tone, color(hexFromArgb(palette.tone(tone)))])),
      ]),
    ),
    color: { light: semantic(false), dark: semantic(true) },
    font: {
      body: { $type: 'fontFamily', $value: ['system-ui', 'sans-serif'] },
      weight: {
        regular: { $type: 'fontWeight', $value: 400 },
        medium: { $type: 'fontWeight', $value: 500 },
        bold: { $type: 'fontWeight', $value: 700 },
      },
      size: Object.fromEntries(
        Object.entries({
          xs: 12,
          sm: 14,
          base: 16,
          lg: 18,
          xl: 20,
          '2xl': 24,
          '3xl': 30,
          '4xl': 36,
        }).map(([name, value]) => [name, dimension(value)]),
      ),
    },
    space: Object.fromEntries(
      [0, 1, 2, 3, 4, 6, 8, 12, 16, 24].map((step) => [step, dimension(step * 4)]),
    ),
    radius: Object.fromEntries(
      Object.entries({ none: 0, sm: 4, md: 8, lg: 16, full: 9999 }).map(([name, value]) => [
        name,
        dimension(value),
      ]),
    ),
    motion: {
      fast: { $type: 'duration', $value: { value: 120, unit: 'ms' } },
      normal: { $type: 'duration', $value: { value: 200, unit: 'ms' } },
      slow: { $type: 'duration', $value: { value: 320, unit: 'ms' } },
    },
    shadow: {
      card: {
        $type: 'shadow',
        $value: {
          color: { colorSpace: 'srgb', components: [0, 0, 0], alpha: 0.12 },
          offsetX: { value: 0, unit: 'px' },
          offsetY: { value: 2, unit: 'px' },
          blur: { value: 8, unit: 'px' },
          spread: { value: 0, unit: 'px' },
        },
      },
    },
    elevation: { card: { $type: 'number', $value: 2 } },
  };
  const { buildTheme }: typeof import('./theme-build.js') = await import(
    new URL(
      import.meta.url.endsWith('.ts') ? './theme-build.ts' : './theme-build.js',
      import.meta.url,
    ).href
  );
  const generated = await buildTheme(JSON.parse(canonicalJson(tokens)));
  const files: CompiledFile[] = [
    {
      path: 'package.json',
      content:
        canonicalJson({
          name: '@app/theme',
          version: '1.0.0',
          private: true,
          type: 'module',
          scripts: { build: 'node build.mjs', typecheck: 'tsc --noEmit' },
          devDependencies: {
            'style-dictionary': '5.6.0',
            prettier: '3.9.9',
            typescript: '5.9.3',
            '@types/node': '26.6.4',
          },
          exports: {
            '.': './index.ts',
            './web.css': './web.css',
            './tokens.json': './tokens.json',
          },
        }) + '\n',
    },
    { path: 'tokens.json', content: canonicalJson(tokens) + '\n' },
    {
      path: 'tsconfig.json',
      content:
        canonicalJson({
          compilerOptions: {
            target: 'ES2022',
            module: 'ESNext',
            moduleResolution: 'Bundler',
            strict: true,
            noEmit: true,
            skipLibCheck: true,
            types: ['node'],
          },
          include: ['*.ts'],
        }) + '\n',
    },
    ...generated,
    {
      path: 'theme-build.ts',
      content: readFileSync(new URL('../src/theme-build.ts', import.meta.url), 'utf8').replace(
        /\r\n/g,
        '\n',
      ),
    },
    {
      path: 'build.mjs',
      content:
        "import { readFileSync, writeFileSync } from 'node:fs';\nimport { URL } from 'node:url';\nimport { buildTheme } from './theme-build.ts';\nconst tokens = JSON.parse(readFileSync(new URL('./tokens.json', import.meta.url), 'utf8'));\nfor (const file of await buildTheme(tokens)) writeFileSync(new URL(file.path, import.meta.url), file.content);\n",
    },
  ];
  return files.map((file) => ({ ...file, path: 'packages/theme/' + file.path }));
}
