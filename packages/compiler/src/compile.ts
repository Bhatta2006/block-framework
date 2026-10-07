import { createHash } from 'node:crypto';
import {
  canonicalJson,
  componentNameFor,
  screenComponentNameFor,
  type BlockRegistry,
  type BlockTheme,
  type RenderContext,
} from '@blockfw/blocks';
import { parseBlockType, type ProjectGraph } from '@blockfw/manifest';
import { navigationTargets, resolveWiring, type WiringResult } from '@blockfw/wiring';

export interface CompiledFile {
  path: string;
  content: string;
}

export interface CompileResult {
  files: CompiledFile[];
  wiring: WiringResult;
  /** SHA-256 over every emitted file except the wiring report itself. */
  projectHash: string;
}

/**
 * Pinned dependency versions for emitted Expo projects.
 * Sourced from expo-template-blank-typescript@57.0.29 (0BSD) for the
 * expo/react/react-native trio; navigation packages pinned to latest 7.x
 * at time of writing and verified by installing + typechecking.
 */
export const PINNED_DEPS = {
  expo: '57.0.27',
  'expo-status-bar': '57.0.1',
  react: '19.2.3',
  'react-native': '0.86.3',
  '@react-navigation/native': '7.5.0',
  '@react-navigation/native-stack': '7.20.0',
  'react-native-screens': '4.28.0',
  'react-native-safe-area-context': '5.10.1',
} as const;

export const PINNED_DEV_DEPS = {
  typescript: '5.9.3',
  '@types/react': '19.2.3',
} as const;

const DEFAULT_THEME: Required<BlockTheme> = {
  primaryColor: '#6C5CE7',
  backgroundColor: '#FFFFFF',
  textColor: '#1A1A2E',
};

export class CompileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CompileError';
  }
}

/** Deterministic SHA-256 over sorted path+content pairs. */
export function hashFiles(files: CompiledFile[]): string {
  const sorted = [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const hash = createHash('sha256');
  for (const f of sorted) {
    hash.update(f.path);
    hash.update('\0');
    hash.update(f.content);
    hash.update('\0');
  }
  return hash.digest('hex');
}

function themeFor(graph: ProjectGraph): Required<BlockTheme> {
  const t = graph.app.theme ?? {};
  return {
    primaryColor: t.primaryColor ?? DEFAULT_THEME.primaryColor,
    backgroundColor: t.backgroundColor ?? DEFAULT_THEME.backgroundColor,
    textColor: t.textColor ?? DEFAULT_THEME.textColor,
  };
}

function renderPackageJson(graph: ProjectGraph): string {
  const pkg = {
    name: graph.app.slug,
    version: graph.app.version,
    private: true,
    main: 'index.ts',
    scripts: {
      start: 'expo start',
      android: 'expo start --android',
      ios: 'expo start --ios',
      typecheck: 'tsc --noEmit',
    },
    dependencies: { ...PINNED_DEPS },
    devDependencies: { ...PINNED_DEV_DEPS },
  };
  return `${canonicalJson(pkg)}\n`;
}

function renderAppJson(graph: ProjectGraph): string {
  return `${canonicalJson({
    expo: {
      name: graph.app.name,
      slug: graph.app.slug,
      version: graph.app.version,
      orientation: 'portrait',
      userInterfaceStyle: 'automatic',
      newArchEnabled: true,
      assetBundlePatterns: ['**/*'],
    },
  })}\n`;
}

function renderTsConfig(): string {
  return `${canonicalJson({
    extends: 'expo/tsconfig.base',
    compilerOptions: { strict: true },
    include: ['**/*.ts', '**/*.tsx'],
  })}\n`;
}

function renderBabelConfig(): string {
  return `module.exports = function (api) {
  api.cache(true);
  return { presets: ['babel-preset-expo'] };
};
`;
}

function renderIndex(): string {
  return `import { registerRootComponent } from 'expo';
import App from './App';

registerRootComponent(App);
`;
}

function renderApp(): string {
  return `import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppNavigator } from './src/navigation';

export default function App() {
  return (
    <SafeAreaProvider>
      <AppNavigator />
      <StatusBar style="auto" />
    </SafeAreaProvider>
  );
}
`;
}

function renderTheme(theme: Required<BlockTheme>): string {
  return `export const theme = {
  colors: {
    primary: '${theme.primaryColor}',
    background: '${theme.backgroundColor}',
    text: '${theme.textColor}',
  },
} as const;

export type AppTheme = typeof theme;
`;
}

function renderNavigation(graph: ProjectGraph): string {
  const screenIds = graph.screens.map((s) => s.id);
  const imports = screenIds
    .map((id) => `import { ${screenComponentNameFor(id)} } from './screens/${id}';`)
    .join('\n');
  const paramList = screenIds.map((id) => `  '${id}': undefined;`).join('\n');
  const screens = graph.screens
    .map(
      (s) =>
        `        <Stack.Screen name="${s.id}" component={${screenComponentNameFor(s.id)}} options={{ title: ${JSON.stringify(s.title)} }} />`,
    )
    .join('\n');
  const first = screenIds[0] ?? '';
  return `import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
${imports}

export type RootStackParamList = {
${paramList}
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="${first}">
${screens}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
`;
}

function renderBillingMock(): string {
  return `/**
 * MOCK BILLING SERVICE - M0 ONLY. DO NOT SHIP.
 *
 * The paywall block calls these functions so the purchase flow can be
 * exercised end to end without a real billing provider. Before shipping,
 * replace with RevenueCat (react-native-purchases) and delete this file.
 * The wiring report flags this substitution as a warning on every build.
 */
export interface MockPurchase {
  productId: string;
  mocked: true;
}

export async function purchaseProduct(productId: string): Promise<MockPurchase> {
  await new Promise((resolve) => setTimeout(resolve, 800));
  return { productId, mocked: true };
}

export async function restorePurchases(): Promise<{ restored: boolean; mocked: true }> {
  await new Promise((resolve) => setTimeout(resolve, 500));
  return { restored: true, mocked: true };
}
`;
}

function renderReadme(graph: ProjectGraph): string {
  return `# ${graph.app.name}

Generated by Block Framework M0 (deterministic compiler, zero AI involved).

## Run

\`\`\`bash
npm install
npm run typecheck   # verify the generated code
npx expo start      # scan the QR code with Expo Go
\`\`\`

## Notes

- The paywall uses a **mock** billing service (\`src/services/billing.mock.ts\`).
  Wire up RevenueCat before shipping.
- Screen order, wiring, and block configs all come from the project graph.
  Recompiling the same graph produces byte-identical output.
`;
}

function renderGitignore(): string {
  return `node_modules/
.expo/
dist/
*.log
`;
}

/**
 * Compile a project graph into a complete Expo project.
 * Pure function: same graph + same registry = byte-identical files.
 */
export function compileProject(graph: ProjectGraph, registry: BlockRegistry): CompileResult {
  const wiring = resolveWiring(graph, registry);
  const theme = themeFor(graph);
  const targets = navigationTargets(wiring);

  const files: CompiledFile[] = [];
  const add = (path: string, content: string) => files.push({ path, content });

  // --- static project files --------------------------------------------------
  add('package.json', renderPackageJson(graph));
  add('app.json', renderAppJson(graph));
  add('tsconfig.json', renderTsConfig());
  add('babel.config.js', renderBabelConfig());
  add('index.ts', renderIndex());
  add('App.tsx', renderApp());
  add('src/theme.ts', renderTheme(theme));
  add('src/navigation.tsx', renderNavigation(graph));
  add('src/services/billing.mock.ts', renderBillingMock());
  add('.gitignore', renderGitignore());

  // --- block instances -------------------------------------------------------
  const seenComponents = new Map<string, string>();
  const blockById = new Map(graph.blocks.map((b) => [b.id, b]));

  for (const screen of graph.screens) {
    const inst = blockById.get(screen.block);
    if (!inst) {
      // resolveWiring already throws for this; defensive only.
      throw new CompileError(
        `Screen "${screen.id}" references unknown instance "${screen.block}".`,
      );
    }
    const { manifest, render } = registry.get(inst.type);
    void parseBlockType(inst.type);

    const componentName = componentNameFor(inst.id);
    const clash = seenComponents.get(componentName);
    if (clash !== undefined && clash !== inst.id) {
      throw new CompileError(
        `Component name collision: instances "${clash}" and "${inst.id}" both map to "${componentName}". ` +
          `Rename one of the instances.`,
      );
    }
    seenComponents.set(componentName, inst.id);

    const variant = inst.variant ?? manifest.defaultVariant ?? manifest.variants[0];
    const ctx: RenderContext = {
      instanceId: inst.id,
      componentName,
      screenId: screen.id,
      variant: variant ?? manifest.variants[0] ?? '',
      config: { ...(manifest.defaultConfig ?? {}), ...(inst.config ?? {}) },
      theme,
      onCompleteTarget: targets.get(inst.id) ?? null,
    };
    const rendered = render(ctx);
    add(`src/blocks/${rendered.fileName}`, rendered.content);

    // --- screen wrapper ------------------------------------------------------
    const screenComp = screenComponentNameFor(screen.id);
    const target = targets.get(inst.id);
    const body =
      rendered.acceptsOnComplete && target !== undefined
        ? `  return <${componentName} onComplete={() => navigation.navigate('${target}')} />;`
        : `  return <${componentName} />;`;
    const navProp =
      rendered.acceptsOnComplete && target !== undefined
        ? `type ${screenComp}Props = NativeStackScreenProps<RootStackParamList, '${screen.id}'>;\n\nexport function ${screenComp}({ navigation }: ${screenComp}Props) {\n`
        : `export function ${screenComp}() {\n`;
    const navImport =
      rendered.acceptsOnComplete && target !== undefined
        ? `import type { NativeStackScreenProps } from '@react-navigation/native-stack';\nimport type { RootStackParamList } from '../navigation';\n`
        : '';
    add(
      `src/screens/${screen.id}.tsx`,
      `import React from 'react';\n${navImport}import { ${componentName} } from '../blocks/${inst.id}';\n\n${navProp}${body}\n}\n`,
    );
  }

  // --- wiring report + readme (hash covers everything except the report) -----
  const projectHash = hashFiles(files);
  const reportJson = canonicalJson({
    app: graph.app.slug,
    projectHash,
    generatedBy: 'block-framework-m0',
    wires: wiring.report.resolved,
    warnings: wiring.report.warnings,
    notes: wiring.report.notes,
  });
  add('src/wiring-report.json', `${reportJson}\n`);
  add('README.md', renderReadme(graph));

  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return { files, wiring, projectHash };
}
