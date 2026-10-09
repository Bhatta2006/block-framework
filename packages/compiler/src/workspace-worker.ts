import { runAsWorker } from 'synckit';
import { format } from 'prettier';
import { Project, SyntaxKind, ts } from 'ts-morph';
import type { CompiledFile } from './files.js';
import type { BlockTheme } from '@blockfw/blocks';

runAsWorker(
  async (input: CompiledFile[], platform?: 'web' | 'mobile', theme?: Required<BlockTheme>) => {
    const modules: typeof import('./workspace-modules.js') = await import(
      new URL(
        import.meta.url.endsWith('.ts') ? './workspace-modules.ts' : './workspace-modules.js',
        import.meta.url,
      ).href
    );
    const files = platform ? modules.splitWorkspaceModules(input, platform) : input;
    if (theme) {
      const { workspaceTheme }: typeof import('./workspace-theme.js') = await import(
        new URL(
          import.meta.url.endsWith('.ts') ? './workspace-theme.ts' : './workspace-theme.js',
          import.meta.url,
        ).href
      );
      files.push(...(await workspaceTheme(theme)));
    }
    const project = new Project({
      useInMemoryFileSystem: true,
      compilerOptions: {
        jsx: ts.JsxEmit.ReactJSX,
        noUnusedLocals: true,
        noUnusedParameters: true,
      },
    });
    for (const file of files.filter((file) => /\.(ts|tsx)$/.test(file.path)))
      project.createSourceFile(file.path, file.content);
    for (const source of project.getSourceFiles()) {
      // Legacy templates describe empty event payloads with {}, which also accepts primitives.
      for (const type of source.getDescendantsOfKind(SyntaxKind.TypeLiteral).reverse())
        if (!type.getMembers().length) type.replaceWithText('object');
      source.fixUnusedIdentifiers();
      source.organizeImports();
    }
    return Promise.all(
      files.map(async (file) => {
        if (!/\.(ts|tsx|js|mjs|css|html|md|yaml|yml)$/.test(file.path)) return file;
        return {
          ...file,
          content: await format(project.getSourceFile(file.path)?.getFullText() ?? file.content, {
            filepath: file.path,
            singleQuote: true,
            printWidth: 100,
            endOfLine: 'lf',
          }),
        };
      }),
    );
  },
);
