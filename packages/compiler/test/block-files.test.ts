import { describe, expect, it } from 'vitest';
import { loadDefaultRegistry } from '@blockfw/blocks';
import { vendoredBlockFiles, blockComposition } from '../src/block-files.js';

describe('v2 source composition', () => {
  it('emits real implementations and formats deterministic typed composition', () => {
    const registry = loadDefaultRegistry();
    const files = vendoredBlockFiles(registry, true);
    expect(
      files.find((file) => file.path === 'src/blocks/content.hero/Hero.tsx')!.content,
    ).toContain('export function Hero');
    expect(files.find((file) => file.path === 'src/data-runtime.tsx')!.content).toContain(
      'export function DataCollection',
    );
    expect(files.find((file) => file.path === 'src/data-runtime.tsx')!.content).toContain(
      "from './data-core.js'",
    );
    expect(blockComposition(true)).toContain('Record<string, unknown>');
    expect(blockComposition(false)).not.toContain('CloudAuth');
    expect(vendoredBlockFiles(registry, true)).toEqual(files);
  });
  it('rejects undeclared imports and dependencies before vendoring', () => {
    for (const source of [
      "import missing from '../escape';",
      "import missing from 'unapproved';",
      "const missing = import('unapproved');",
    ]) {
      const registry = loadDefaultRegistry();
      registry.get('content.hero@1.0.0').package!.sources[0]!.content = source;
      expect(() => vendoredBlockFiles(registry, false)).toThrow(/(Undeclared|Dynamic)/);
    }
  });
});
