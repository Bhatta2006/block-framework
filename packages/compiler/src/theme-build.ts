import StyleDictionary from 'style-dictionary';
import type { DesignTokens } from 'style-dictionary/types';
import { format } from 'prettier';

/** This file is also vendored so exported applications can rebuild tokens independently. */
export async function buildTheme(
  tokens: DesignTokens,
): Promise<{ path: string; content: string }[]> {
  const dictionary = new StyleDictionary({
    tokens,
    usesDtcg: true,
    log: { verbosity: 'silent', warnings: 'error', errors: { brokenReferences: 'throw' } },
    hooks: {
      transforms: {
        'duration/css': {
          type: 'value',
          filter: (token) => token.$type === 'duration',
          transform: (token) => `${token.$value.value}${token.$value.unit}`,
        },
        'metric/native': {
          type: 'value',
          filter: (token) => ['dimension', 'duration'].includes(token.$type ?? ''),
          transform: (token) => {
            const { value, unit } = token.$value;
            if (token.$type === 'dimension' && unit !== 'px')
              throw new Error(`Native theme dimensions require px, received ${unit}`);
            if (token.$type === 'duration' && !['ms', 's'].includes(unit))
              throw new Error(`Unsupported duration unit: ${unit}`);
            return unit === 's' ? value * 1000 : value;
          },
        },
      },
    },
    platforms: {
      web: {
        transformGroup: 'css',
        transforms: ['duration/css'],
        files: [
          {
            destination: 'tokens.css',
            format: 'css/variables',
            options: { showFileHeader: false },
          },
        ],
      },
      native: {
        transforms: ['name/camel', 'color/hex', 'metric/native'],
        files: [{ destination: 'native.json', format: 'json/flat' }],
      },
    },
  });
  const [web] = await dictionary.formatPlatform('web');
  const [native] = await dictionary.formatPlatform('native');
  const values = JSON.parse(String(native!.output));
  const modeCss = (mode: 'light' | 'dark') =>
    Object.keys((tokens.color as DesignTokens)[mode]!)
      .map((key) => {
        const name = key.replace(/[A-Z]/g, (letter) => '-' + letter.toLowerCase());
        return `--color-${name}: var(--color-${mode}-${name});`;
      })
      .join('\n');
  const files = [
    { path: 'tokens.css', content: String(web!.output) },
    {
      path: 'index.ts',
      content: `// Generated from tokens.json with Style Dictionary.\nexport const tokens = ${JSON.stringify(values)} as const;\nexport const light = { primary: tokens.colorLightPrimary, background: tokens.colorLightBackground, text: tokens.colorLightText } as const;\nexport const dark = { primary: tokens.colorDarkPrimary, background: tokens.colorDarkBackground, text: tokens.colorDarkText } as const;\n`,
    },
    {
      path: 'web.css',
      content: `@import './tokens.css';\n:root { ${modeCss('light')} }\n[data-theme="dark"] { ${modeCss('dark')} }\n@media (prefers-reduced-motion: reduce) { :root { --motion-fast: 0ms; --motion-normal: 0ms; --motion-slow: 0ms; } }\n`,
    },
  ];
  return Promise.all(
    files.map(async (file) => ({
      ...file,
      content: await format(file.content, {
        filepath: file.path,
        singleQuote: true,
        printWidth: 100,
        endOfLine: 'lf',
      }),
    })),
  );
}
