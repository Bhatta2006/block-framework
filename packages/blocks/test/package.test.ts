import { describe, expect, it } from 'vitest';
import { loadDefaultRegistry, loadPackageSources, blockRegistryItem } from '../src/index.js';
import { validateBlockPackage } from '@blockfw/manifest';
import { resolve } from 'node:path';

describe('block package v2', () => {
  const registry = loadDefaultRegistry();
  it('extends three contracts without changing the nineteen existing block references', () => {
    expect(registry.size()).toBe(19);
    const packages = registry.entries().filter((block) => block.package);
    expect(packages.map((block) => block.manifest.id).sort()).toEqual([
      'auth.account',
      'content.hero',
      'data.collection',
    ]);
    for (const block of packages) {
      validateBlockPackage(block.package!.contract);
      const item = blockRegistryItem(block.package!);
      expect(item.type).toBe('registry:block');
      expect(item.files.every((file) => file.content.includes('export'))).toBe(true);
    }
    expect(registry.get('auth.account@1.0.0').package!.contract.targets).toEqual(['web']);
  });
  it('rejects traversal, duplicate destinations and missing target implementations', () => {
    const value = registry.get('content.hero@1.0.0').package!.contract;
    for (const change of [
      { files: [{ ...value.files[0]!, path: '../escape.tsx' }] },
      { files: [{ ...value.files[0]!, target: 'src/../escape.tsx' }] },
      { files: [value.files[0], value.files[0]] },
      { targets: ['web', 'server'] },
      { implementations: { web: { entry: 'missing.tsx', export: 'Missing' } } },
    ])
      expect(() => validateBlockPackage({ ...value, ...change })).toThrow();
  });
  it('rejects missing sources and licenses outside the allowlist', () => {
    const value = registry.get('content.hero@1.0.0').package!.contract;
    const root = resolve('packages/blocks/src/blocks/content.hero');
    expect(() => loadPackageSources({ ...value, license: 'GPL-3.0' }, root)).toThrow(/allowlist/);
    const missing = structuredClone(value);
    missing.files[0]!.path = 'web/Missing.tsx';
    missing.implementations.web = { entry: 'web/Missing.tsx', export: 'Hero' };
    expect(() => loadPackageSources(missing, root)).toThrow(/ENOENT/);
  });
});
