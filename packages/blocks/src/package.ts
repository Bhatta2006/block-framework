import { readFileSync, realpathSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { validateBlockPackage, type BlockPackage } from '@blockfw/manifest';

export interface BlockSource {
  path: string;
  target: string;
  platforms: BlockPackage['targets'];
  content: string;
}

export function loadPackageSources(
  value: unknown,
  root: string,
): { contract: BlockPackage; sources: BlockSource[] } {
  validateBlockPackage(value);
  if (
    ![
      'MIT',
      'Apache-2.0',
      'BSD-2-Clause',
      'BSD-3-Clause',
      'ISC',
      'MPL-2.0',
      '0BSD',
      'Unlicense',
      'LicenseRef-Project',
    ].includes(value.license)
  )
    throw new Error(`Block license is outside the allowlist: ${value.license}`);
  const base = realpathSync(root);
  const sources = value.files.map((file) => {
    const path = realpathSync(resolve(base, file.path));
    if (!path.startsWith(base + sep)) throw new Error(`Block source escapes package: ${file.path}`);
    return { ...file, content: readFileSync(path, 'utf8').replace(/\r\n/g, '\n') };
  });
  return { contract: structuredClone(value), sources };
}

/** shadcn's public registry:item shape; Block Studio metadata lives in meta. */
export function blockRegistryItem(pack: ReturnType<typeof loadPackageSources>) {
  return {
    $schema: 'https://ui.shadcn.com/schema/registry-item.json',
    name: pack.contract.id.replaceAll('.', '-'),
    type: 'registry:block',
    dependencies: Object.entries(pack.contract.dependencies)
      .map(([name, version]) => `${name}@${version}`)
      .sort(),
    files: pack.sources
      .filter((file) => file.platforms.includes('web'))
      .map((file) => ({
        path: file.path,
        target: file.target.slice(4),
        type: file.path.endsWith('.tsx') ? 'registry:component' : 'registry:lib',
        content: file.content,
      })),
    meta: { block: pack.contract },
  };
}
