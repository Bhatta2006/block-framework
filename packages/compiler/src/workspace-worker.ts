import { runAsWorker } from 'synckit';
import { format } from 'prettier';
import { Project, SyntaxKind, ts } from 'ts-morph';
import type { CompiledFile } from './files.js';

runAsWorker(async (files: CompiledFile[]) => {
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
});
