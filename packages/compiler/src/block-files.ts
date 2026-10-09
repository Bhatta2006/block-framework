import { createHash } from 'node:crypto';
import { posix, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { canonicalJson, type BlockRegistry } from '@blockfw/blocks';
import type { BlockTarget } from '@blockfw/manifest';
import type { CompilerIR } from './frontend.js';
import type { CompiledFile } from './files.js';

const sourceDir = import.meta.dirname ?? dirname(fileURLToPath(import.meta.url));
const require = createRequire(resolve(sourceDir, 'block-files.js'));
let formatter: ((source: string) => string) | undefined;
const compositionCache = new Map<boolean, string>();

export function blockComposition(cloud: boolean): string {
  const cached = compositionCache.get(cloud);
  if (cached) return cached;
  const { Project, ScriptKind } = require('ts-morph') as typeof import('ts-morph');
  const { createSyncFn } = require('synckit') as typeof import('synckit');
  formatter ??= createSyncFn<(source: string) => string>(
    resolve(
      sourceDir,
      (import.meta.filename ?? fileURLToPath(import.meta.url)).endsWith('.ts')
        ? 'format-worker.ts'
        : 'format-worker.js',
    ),
    { tsRunner: 'node', timeout: 10_000 },
  );
  const project = new Project({ useInMemoryFileSystem: true });
  const file = project.createSourceFile('composition.tsx', '', { scriptKind: ScriptKind.TSX });
  file.addImportDeclaration({ moduleSpecifier: 'react', defaultImport: 'React' });
  const components = [
    { id: 'content.hero', name: 'Hero', path: './content.hero/Hero.js' },
    { id: 'data.collection', name: 'DataCollection', path: '../data-runtime.js' },
    ...(cloud ? [{ id: 'auth.account', name: 'CloudAuth', path: '../cloud-runtime.js' }] : []),
  ];
  for (const component of components)
    file.addImportDeclaration({ moduleSpecifier: component.path, namedImports: [component.name] });
  file.addInterface({
    name: 'Props',
    isExported: true,
    properties: [
      { name: 'type', type: 'string' },
      { name: 'config', type: 'Record<string, unknown>' },
      { name: 'variant', type: 'string', hasQuestionToken: true },
      { name: 'emit', type: '(event: string, payload?: unknown) => boolean | void' },
      { name: 'decorate', type: '(tree: React.ReactElement) => React.ReactNode' },
    ],
  });
  file.addFunction({
    name: 'VendoredBlock',
    isExported: true,
    parameters: [{ name: 'props', type: 'Props' }],
    statements: (writer) => {
      writer.write('switch (props.type)').block(() => {
        for (const component of components) {
          writer.writeLine(`case '${component.id}':`);
          writer.writeLine(
            `return <${component.name} config={props.config} emit={props.emit} decorate={props.decorate}${component.name === 'Hero' ? ' variant={props.variant}' : ''} />;`,
          );
        }
        writer.writeLine('default: throw new Error(`Unsupported vendored block: ${props.type}`);');
      });
    },
  });
  const source = formatter(file.getFullText());
  compositionCache.set(cloud, source);
  return source;
}

/** Vendoring validates dependency and relative import declarations before copying source. */
export function vendoredBlockFiles(registry: BlockRegistry, cloud: boolean): CompiledFile[] {
  const { Project, SyntaxKind } = require('ts-morph') as typeof import('ts-morph');
  const files: CompiledFile[] = [];
  const project = new Project({ useInMemoryFileSystem: true });
  for (const type of [
    'content.hero@1.0.0',
    'data.collection@1.0.0',
    ...(cloud ? ['auth.account@1.0.0'] : []),
  ]) {
    const pack = registry.get(type).package;
    if (!pack) throw new Error(`Missing v2 block package: ${type}`);
    for (const source of pack.sources.filter((file) => file.platforms.includes('web'))) {
      const ast = project.createSourceFile(`${type}/${source.path}`, source.content, {
        overwrite: true,
      });
      if (
        ast
          .getDescendantsOfKind(SyntaxKind.CallExpression)
          .some((call) => ['import', 'require'].includes(call.getExpression().getText()))
      )
        throw new Error(`Dynamic block imports are not declared: ${source.path}`);
      if (ast.getExportDeclarations().some((declaration) => declaration.getModuleSpecifier()))
        throw new Error(`Block re-exports must be declared as imports: ${source.path}`);
      for (const declaration of ast.getImportDeclarations()) {
        const specifier = declaration.getModuleSpecifierValue();
        if (specifier.startsWith('.')) {
          const reference = posix
            .normalize(posix.join(posix.dirname(source.path), specifier))
            .replace(/\.js$/, '');
          const dependency = pack.sources.find(
            (file) =>
              file.platforms.includes('web') && file.path.replace(/\.(ts|tsx)$/, '') === reference,
          );
          if (!dependency)
            throw new Error(`Undeclared block import: ${type}/${source.path}: ${specifier}`);
          const relative = posix
            .relative(posix.dirname(source.target), dependency.target)
            .replace(/\.(ts|tsx)$/, '.js');
          declaration.setModuleSpecifier(relative.startsWith('.') ? relative : './' + relative);
        } else {
          const dependency = specifier.startsWith('@')
            ? specifier.split('/').slice(0, 2).join('/')
            : specifier.split('/')[0]!;
          if (!pack.contract.dependencies[dependency])
            throw new Error(`Undeclared block dependency: ${specifier}`);
        }
      }
      if (files.some((file) => file.path === source.target))
        throw new Error(`Duplicate vendored destination: ${source.target}`);
      files.push({ path: source.target, content: ast.getFullText() });
    }
  }
  return [...files, { path: 'src/blocks/composition.tsx', content: blockComposition(cloud) }];
}

export function blockLockfile(
  ir: CompilerIR,
  registry: BlockRegistry,
  targets: BlockTarget[],
): CompiledFile {
  const sha = (value: string) => createHash('sha256').update(value).digest('hex');
  const blocks = [
    ...new Set([
      ...ir.blocks.filter((block) => block.registered).map((block) => block.type),
      ...(targets.includes('web')
        ? [
            'content.hero@1.0.0',
            'data.collection@1.0.0',
            ...(ir.capabilities.cloud ? ['auth.account@1.0.0'] : []),
          ]
        : []),
    ]),
  ]
    .sort()
    .map((type) => {
      const block = registry.get(type);
      if (block.package)
        for (const target of targets)
          if (!block.package.contract.targets.includes(target))
            throw new Error(`Block ${type} does not support ${target}`);
      return {
        type,
        manifestHash: sha(canonicalJson(block.package?.contract ?? block.manifest)),
        formatVersion: block.package ? 2 : 0,
        sources: Object.fromEntries(
          (block.package?.sources ?? [])
            .map((file) => [file.path, sha(file.content)])
            .sort(([a], [b]) => a!.localeCompare(b!)),
        ),
      };
    });
  return {
    path: 'blockfw.lock.json',
    content: canonicalJson({ lockVersion: 1, graphSchema: '1', compilerIR: '1', blocks }) + '\n',
  };
}
