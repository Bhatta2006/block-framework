import { posix } from 'node:path';
import { Node, Project, SyntaxKind, type Statement } from 'ts-morph';
import postcss from 'postcss';
import type { CompiledFile } from './files.js';

function names(statement: Statement): string[] {
  if (Node.isVariableStatement(statement))
    return statement.getDeclarations().map((declaration) => declaration.getName());
  if (
    Node.isFunctionDeclaration(statement) ||
    Node.isClassDeclaration(statement) ||
    Node.isTypeAliasDeclaration(statement) ||
    Node.isInterfaceDeclaration(statement)
  )
    return statement.getName() ? [statement.getName()!] : [];
  return [];
}

/** Split authored declarations, retaining a compatibility barrel and exact function bodies. */
export function splitWorkspaceModules(
  files: CompiledFile[],
  platform: 'web' | 'mobile',
): CompiledFile[] {
  const output = files.map((file) => ({ ...file }));
  const split = (path: string, groups: Record<string, string[]>) => {
    const input = output.find((file) => file.path === path);
    if (!input) return;
    const project = new Project({ useInMemoryFileSystem: true });
    const source = project.createSourceFile(path, input.content);
    const imports = source.getImportDeclarations();
    const statements = source
      .getStatements()
      .filter((statement) => !Node.isImportDeclaration(statement));
    const originalExports = statements.filter(
      (statement) => Node.isExportable(statement) && statement.isExported(),
    );
    const owner = new Map<string, string>();
    for (const [module, declarations] of Object.entries(groups))
      for (const declaration of declarations) {
        if (owner.has(declaration)) throw new Error(`Duplicate module declaration: ${declaration}`);
        owner.set(declaration, module);
      }
    for (const statement of statements) {
      const declared = names(statement);
      if (!declared.length || declared.some((name) => !owner.has(name)))
        throw new Error(`Unassigned export declaration in ${path}: ${declared.join(', ')}`);
    }
    const directory = path.replace(/\.(ts|tsx)$/, '');
    for (const [module, declarations] of Object.entries(groups)) {
      const destination = posix.join(directory, module + '.tsx');
      const file = project.createSourceFile(
        destination,
        '// Generated from graph blocks; shared runtime implementation.\n',
      );
      for (const declaration of imports) {
        const structure = declaration.getStructure();
        if (structure.moduleSpecifier.startsWith('.')) {
          const target = posix.join(posix.dirname(path), structure.moduleSpecifier);
          const relative = posix.relative(posix.dirname(destination), target);
          structure.moduleSpecifier = relative.startsWith('.') ? relative : './' + relative;
        }
        file.addImportDeclaration(structure);
      }
      for (const [other, exported] of Object.entries(groups))
        if (other !== module)
          file.addImportDeclaration({ moduleSpecifier: './' + other, namedImports: exported });
      for (const statement of statements.filter((item) =>
        names(item).some((name) => declarations.includes(name)),
      )) {
        const added = file.addStatements(statement.getText())[0]!;
        if (
          Node.isVariableStatement(added) ||
          Node.isFunctionDeclaration(added) ||
          Node.isClassDeclaration(added) ||
          Node.isInterfaceDeclaration(added) ||
          Node.isTypeAliasDeclaration(added)
        )
          added.setIsExported(true);
      }
      file.organizeImports();
      output.push({ path: destination, content: file.getFullText() });
    }
    input.content =
      '// Public runtime entry points for the generated app.\n' +
      originalExports
        .map((statement) => {
          const exported = names(statement);
          const type =
            Node.isTypeAliasDeclaration(statement) || Node.isInterfaceDeclaration(statement)
              ? 'type '
              : '';
          return `export ${type}{ ${exported.join(', ')} } from './${posix.basename(directory)}/${owner.get(exported[0]!)}';`;
        })
        .join('\n') +
      '\n';
  };

  if (platform === 'web') {
    const style = output.find((file) => file.path === 'src/styles.css')!;
    const boundaries: Record<string, string> = {
      '.auth': 'auth-and-onboarding',
      '.section-heading': 'content',
      '.stats-grid': 'stats-and-profile',
      '.settings-section': 'settings',
      '.hero': 'hero',
      'body:has(.embedded)': 'preview',
      '.generated-app.notes-shell': 'notes-shell',
      '.notes-grid': 'notes-collection',
      '.note-editor': 'notes-editor',
    };
    let section = 'base';
    const styles = new Map<string, string[]>([[section, []]]);
    for (const node of postcss.parse(style.content).nodes) {
      if (node.type === 'rule' && boundaries[node.selector]) {
        section = boundaries[node.selector]!;
        if (styles.has(section)) throw new Error(`Repeated stylesheet boundary: ${section}`);
        styles.set(section, []);
      }
      styles
        .get(section)!
        .push(node.toString() + (node.type === 'atrule' && !node.nodes ? ';' : ''));
    }
    style.content =
      "@import '@app/theme/web.css';\n" +
      [...styles.keys()].map((name) => `@import './styles/${name}.css';`).join('\n') +
      '\n';
    for (const [name, rules] of styles)
      output.push({ path: `src/styles/${name}.css`, content: rules.join('\n') });
    const runtime = output.find((file) => file.path === 'src/runtime.tsx')!;
    const project = new Project({ useInMemoryFileSystem: true });
    const source = project.createSourceFile('runtime.tsx', runtime.content);
    const application = source.getFunctionOrThrow('ApplicationView');
    const appStyle = application
      .getDescendantsOfKind(SyntaxKind.VariableDeclaration)
      .find((declaration) => declaration.getName() === 'style')!
      .getFirstDescendantByKindOrThrow(SyntaxKind.ObjectLiteralExpression);
    for (const [property, token] of Object.entries({
      '--brand': 'primary',
      '--page-bg': 'background',
      '--ink': 'text',
    }))
      appStyle
        .getPropertyOrThrow(`'${property}'`)
        .asKindOrThrow(SyntaxKind.PropertyAssignment)
        .setInitializer(JSON.stringify(`var(--color-${token})`));
    const body = application.getBodyOrThrow().asKindOrThrow(SyntaxKind.Block);
    const statements = body.getStatements();
    const start = statements.findIndex(
      (statement) =>
        Node.isVariableStatement(statement) &&
        statement.getDeclarations().some((declaration) => declaration.getName() === 'readPage'),
    );
    if (start < 0) throw new Error('Application navigation boundary is missing');
    source.addFunction({
      name: 'useDesignPreview',
      parameters: [
        { name: 'graph', type: 'Graph' },
        { name: 'previewBlock', type: 'string | undefined' },
      ],
      statements: [
        ...statements.slice(0, start).map((statement) => statement.getText()),
        'return draftDesign;',
      ],
    });
    body.removeStatements([0, start - 1]);
    body.insertStatements(0, 'const draftDesign = useDesignPreview(graph, previewBlock);');
    runtime.content = source.getFullText();
    split('src/runtime.tsx', {
      types: [
        'Item',
        'Question',
        'Stat',
        'Row',
        'Config',
        'ElementDesign',
        'Action',
        'AddedElement',
        'Design',
        'Block',
        'Page',
        'Graph',
        'Wire',
        'Emit',
        'Props',
      ],
      design: ['ActionContext', 'elementStyle', 'customize', 'applyDesign'],
      'design-preview': ['useDesignPreview'],
      Auth: ['Auth'],
      Quiz: ['Quiz'],
      Paywall: ['Paywall'],
      Home: ['Home'],
      Detail: ['Detail'],
      Stats: ['Stats'],
      Profile: ['Profile'],
      Settings: ['Settings'],
      BlockView: ['BlockView'],
      ApplicationView: ['ApplicationView'],
      Application: ['Application'],
    });
    split('src/data-runtime.tsx', {
      provider: ['Context', 'DataProvider', 'useRecords', 'Props', 'status'],
      DataSummary: ['DataSummary'],
      DataCollection: ['DataCollection'],
      Markdown: ['Markdown'],
      DataEditor: ['DataEditor'],
    });
  } else {
    output.find((file) => file.path === 'src/theme.ts')!.content =
      "import { light } from '@app/theme';\nexport const theme = { colors: light } as const;\nexport type AppTheme = typeof theme;\n";
    split('src/data-runtime.tsx', {
      provider: ['Context', 'DataProvider', 'useRecords', 'Props', 'status'],
      Button: ['Button'],
      DataSummary: ['DataSummary'],
      DataCollection: ['DataCollection'],
      DataEditor: ['DataEditor'],
      styles: ['s'],
    });
  }
  return output;
}
