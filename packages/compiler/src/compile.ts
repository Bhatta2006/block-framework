import { DATA_CORE } from './data-core.js';
import { NATIVE_DATA_RUNTIME } from './native-data.js';
import { createHash } from 'node:crypto';
import { customizeNative } from './customization.js';
import {
  canonicalJson,
  componentNameFor,
  screenComponentNameFor,
  type BlockRegistry,
  type BlockTheme,
  type RenderContext,
} from '@blockfw/blocks';
import {
  pageBlockIds,
  parseBlockType,
  normalizeConsumes,
  legacyGraph,
  type GraphInput,
  type ProjectGraph,
} from '@blockfw/manifest';
import { navigationTargets, resolveWiring, type WiringResult } from '@blockfw/wiring';
import { spineToSql, spineToTypes, type SpineFile } from '@blockfw/spine';

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
  // Required by the emitted babel.config.js. Babel resolves presets from the
  // project root, so it must be a direct devDependency even though expo
  // also bundles it (nested). Missing it breaks `expo export` with
  // "Cannot find module 'babel-preset-expo'".
  'babel-preset-expo': '57.0.14',
} as const;

const DEFAULT_THEME: Required<BlockTheme> = {
  primaryColor: '#345E4F',
  backgroundColor: '#FAFAF7',
  textColor: '#202A25',
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

function renderPackageJson(graph: ProjectGraph, spine?: SpineFile): string {
  const dependencies: Record<string, string> = { ...PINNED_DEPS };
  if (graph.blocks.some((b) => b.type.startsWith('data.')))
    dependencies['@react-native-async-storage/async-storage'] = '2.2.0';
  if (spine) {
    // The generated src/supabase.ts imports the Supabase client.
    dependencies['@supabase/supabase-js'] = '2.117.3';
  }
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
    dependencies,
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

function renderApp(graph: ProjectGraph): string {
  const hasData = graph.blocks.some((b) => b.type.startsWith('data.'));
  const seeds: Record<string, unknown> = {};
  for (const b of graph.blocks)
    if (b.config?.seedRecords)
      seeds[String(b.config.collectionKey ?? 'notes')] = b.config.seedRecords;
  return `import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppNavigator } from './src/navigation';
${hasData ? "import { DataProvider } from './src/data-runtime';" : ''}

export default function App() {
  return (
    <SafeAreaProvider>
      ${hasData ? '<DataProvider namespace=' + JSON.stringify(graph.app.dataId ?? graph.app.slug) + ' seeds={' + JSON.stringify(seeds) + '}><AppNavigator /></DataProvider>' : '<AppNavigator />'}
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

function renderNavigation(graph: ProjectGraph, paramsByScreen: Map<string, string>): string {
  const screenIds = graph.screens.map((s) => s.id);
  const imports = screenIds
    .map((id) => `import { ${screenComponentNameFor(id)} } from './screens/${id}';`)
    .join('\n');
  const paramList = screenIds
    .map((id) => `  '${id}': ${paramsByScreen.get(id) ?? 'undefined'};`)
    .join('\n');
  const screens = graph.screens
    .map(
      (s) =>
        `        <Stack.Screen name="${s.id}" component={${screenComponentNameFor(s.id)}} options={{ title: ${JSON.stringify(s.title)} }} />`,
    )
    .join('\n');
  const first = screenIds[0] ?? '';
  const tabButtons = graph.screens
    .filter((s) => s.lane === 'tabs' && s.navigation !== false)
    .map(
      (s) =>
        `<Pressable accessibilityRole="button" onPress={() => navigationRef.navigate(...(['${s.id}', undefined] as never))} style={{ padding: 12 }}><Text style={{ color: '${graph.app.theme?.primaryColor ?? '#345E4F'}', fontWeight: '600' }}>{${JSON.stringify(s.title)}}</Text></Pressable>`,
    )
    .join('\n');
  return `import React from 'react';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { Pressable, ScrollView, Text } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
${imports}

export type RootStackParamList = {
${paramList}
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const navigationRef = createNavigationContainerRef<RootStackParamList>();

export function AppNavigator() {
  return (
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator initialRouteName="${first}">
${screens}
      </Stack.Navigator>
      ${tabButtons ? `<ScrollView horizontal style={{ flexGrow: 0, backgroundColor: '#FAFAF7' }} contentContainerStyle={{ paddingBottom: 12 }}>${tabButtons}</ScrollView>` : ''}
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

function renderAuthMock(): string {
  return `/**
 * MOCK AUTH SERVICE - M1 ONLY. DO NOT SHIP.
 *
 * The auth.email block calls these functions so the sign-in flow can be
 * exercised end to end without a real backend. Before shipping, replace
 * with Supabase Auth (@supabase/supabase-js) and delete this file.
 * The wiring report flags this substitution as a warning on every build.
 */
export interface MockUser {
  id: string;
  email: string;
}

export interface MockAuthResult {
  user: MockUser;
  mocked: true;
}

function fakeUser(email: string): MockUser {
  let hash = 0;
  for (let i = 0; i < email.length; i++) {
    hash = (hash * 31 + email.charCodeAt(i)) | 0;
  }
  return { id: \`mock-user-\${Math.abs(hash).toString(36)}\`, email };
}

export async function signIn(email: string, _password: string): Promise<MockAuthResult> {
  void _password;
  await new Promise((resolve) => setTimeout(resolve, 800));
  if (!email.includes('@')) throw new Error('Invalid email address.');
  return { user: fakeUser(email), mocked: true };
}

export async function signUp(email: string, password: string): Promise<MockAuthResult> {
  return signIn(email, password);
}
`;
}

function renderReadme(graph: ProjectGraph): string {
  return `# ${graph.app.name}

Generated by Block Studio for mobile (deterministic compiler).

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
 * Supabase client bootstrap. Reads the project URL and anon key from
 * environment variables (EXPO_PUBLIC_SUPABASE_URL,
 * EXPO_PUBLIC_SUPABASE_ANON_KEY). The Database type is generated from
 * the spine, so every query is typechecked.
 */
function renderSupabaseClient(): string {
  return `import { createClient } from '@supabase/supabase-js';
import type { Database } from './spine-types';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    '[supabase] EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY are not set. ' +
      'Backend calls will fail until they are configured.',
  );
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);
`;
}

/**
 * Convert a JSON Schema to a TypeScript type literal.
 * Handles the subset our block manifests use (objects, arrays, primitives).
 * Anything else becomes `unknown`. Property keys are sorted for determinism.
 */
export function schemaToTs(schema: unknown): string {
  if (schema === null || typeof schema !== 'object') return 'unknown';
  const s = schema as {
    type?: string;
    properties?: Record<string, unknown>;
    required?: string[];
    items?: unknown;
  };
  switch (s.type) {
    case 'string':
      return 'string';
    case 'number':
    case 'integer':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'null':
      return 'null';
    case 'array':
      return `Array<${schemaToTs(s.items ?? 'unknown')}>`;
    case 'object':
    default: {
      const props = s.properties ?? {};
      const entries = Object.entries(props).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
      if (s.type === undefined && entries.length === 0) return 'unknown';
      const required = new Set(s.required ?? []);
      const fields = entries.map(([k, v]) => {
        const opt = required.has(k) ? '' : '?';
        return `${JSON.stringify(k)}${opt}: ${schemaToTs(v)};`;
      });
      return `{ ${fields.join(' ')} }`;
    }
  }
}

/**
 * Compile a project graph into a complete Expo project.
 * Pure function: same graph + same registry (+ same spine) = byte-identical files.
 */
export function compileProject(
  input: GraphInput,
  registry: BlockRegistry,
  spine?: SpineFile,
): CompileResult {
  const graph = legacyGraph(input);
  if (
    graph.app.cloud ||
    graph.blocks.some((b) =>
      /^(auth.account|onboarding.profile|billing.plans|account.settings|billing.review)@/.test(
        b.type,
      ),
    )
  )
    throw new CompileError(
      'Cloud account and payment integrations currently support responsive web export. Native integration is not implemented; export the web app with its backend.',
    );
  if (
    input.schemaVersion === '1' &&
    !input.app.targets.some((target) => target === 'ios' || target === 'android')
  )
    throw new CompileError('Native target is not declared');
  const wiring = resolveWiring(graph, registry);
  const screenNames = new Map<string, string>();
  for (const screen of graph.screens) {
    const name = screenComponentNameFor(screen.id);
    const previous = screenNames.get(name);
    if (previous)
      throw new CompileError(`Screen component name collision: "${previous}" and "${screen.id}".`);
    screenNames.set(name, screen.id);
  }
  const theme = themeFor(graph);
  const targets = navigationTargets(wiring);

  // --- input types: for semantic wires, the consumer's accepted payload ----
  // becomes the TypeScript type of the screen's route params and the block's
  // `input` prop. Keyed by consumer instance id.
  const inputByInstance = new Map<string, { type: string; event: string }>();
  const manifestByInstance = new Map<
    string,
    { manifest: ReturnType<BlockRegistry['get']>['manifest']; screenId: string }
  >();
  {
    const screenOfBlock = new Map(
      graph.screens.flatMap((s) => pageBlockIds(s).map((id) => [id, s.id] as const)),
    );
    for (const b of graph.blocks) {
      const screenId = screenOfBlock.get(b.id);
      if (screenId === undefined) continue;
      manifestByInstance.set(b.id, { manifest: registry.get(b.type).manifest, screenId });
    }
    for (const w of wiring.wires) {
      if (w.to.instance === undefined || w.to.port === undefined) continue;
      const entry = manifestByInstance.get(w.to.instance);
      if (!entry) continue;
      const port = normalizeConsumes(entry.manifest.ports.consumes).find(
        (c) => c.port === w.to.port,
      );
      if (!port?.accepts) continue;
      // First wire wins (deterministic: wires are in instance/event order).
      if (!inputByInstance.has(w.to.instance)) {
        inputByInstance.set(w.to.instance, { type: schemaToTs(port.accepts), event: w.from.event });
      }
    }
  }
  // Screen -> route params type. Screens with an incoming payload wire get
  // `{ input: <type> }`; all others get `undefined`.
  const paramsByScreen = new Map<string, string>();
  for (const [instanceId, input] of inputByInstance) {
    const screenId = manifestByInstance.get(instanceId)?.screenId;
    if (screenId && !paramsByScreen.has(screenId)) {
      paramsByScreen.set(screenId, `{ input: ${input.type} } | undefined`);
    }
  }
  // Composed pages address incoming payloads by their consumer instance.
  for (const screen of graph.screens) {
    if (pageBlockIds(screen).length < 2) continue;
    const fields = pageBlockIds(screen).flatMap((id) => {
      const input = inputByInstance.get(id);
      return input ? [JSON.stringify(id) + '?: ' + input.type + ';'] : [];
    });
    if (fields.length)
      paramsByScreen.set(screen.id, '{ inputs?: { ' + fields.join(' ') + ' } } | undefined');
  }
  // Wire -> whether the navigate call carries params (semantic wire with a
  // payload type). Keyed by emitter instance id (first wire wins).
  const paramWireByEmitter = new Map<string, string>();
  for (const w of wiring.wires) {
    if (w.to.instance !== undefined && inputByInstance.has(w.to.instance)) {
      if (!paramWireByEmitter.has(w.from.instance)) {
        paramWireByEmitter.set(w.from.instance, w.to.screen);
      }
    }
  }

  const files: CompiledFile[] = [];
  const add = (path: string, content: string) => files.push({ path, content });

  // --- static project files --------------------------------------------------
  add('package.json', renderPackageJson(graph, spine));
  add('app.json', renderAppJson(graph));
  add('tsconfig.json', renderTsConfig());
  add('babel.config.js', renderBabelConfig());
  add('index.ts', renderIndex());
  add('App.tsx', renderApp(graph));
  if (graph.blocks.some((b) => b.type.startsWith('data.'))) {
    add('src/data-core.ts', DATA_CORE);
    add('src/data-runtime.tsx', NATIVE_DATA_RUNTIME);
  }
  add('src/theme.ts', renderTheme(theme));
  add('src/navigation.tsx', renderNavigation(graph, paramsByScreen));
  add('src/services/billing.mock.ts', renderBillingMock());
  add('src/services/auth.mock.ts', renderAuthMock());
  add('.gitignore', renderGitignore());

  // --- entity spine (optional) -----------------------------------------------
  if (spine) {
    add('supabase/migrations/0001_spine.sql', spineToSql(spine));
    add('src/spine-types.ts', spineToTypes(spine));
    add('src/supabase.ts', renderSupabaseClient());
  }

  // --- block instances -------------------------------------------------------
  const seenComponents = new Map<string, string>();
  const blockById = new Map(graph.blocks.map((b) => [b.id, b]));

  for (const screen of graph.screens) {
    for (const blockId of pageBlockIds(screen)) {
      const inst = blockById.get(blockId);
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
      const input = inputByInstance.get(inst.id) ?? null;
      const ctx: RenderContext = {
        instanceId: inst.id,
        componentName,
        screenId: screen.id,
        variant: variant ?? manifest.variants[0] ?? '',
        config: { ...(manifest.defaultConfig ?? {}), ...(inst.config ?? {}) },
        theme,
        onCompleteTarget: targets.get(inst.id) ?? null,
        inputType: input?.type ?? null,
        inputEvent: input?.event ?? null,
        composed: pageBlockIds(screen).length > 1,
      };
      const rendered = render(ctx);
      if (ctx.composed)
        rendered.content = rendered.content
          .replace('flex: 1,', 'flexGrow: 0,')
          .replace(/<ScrollView style/g, '<ScrollView scrollEnabled={false} style');
      add(
        `src/blocks/${rendered.fileName}`,
        customizeNative(
          rendered.content,
          inst.design,
          Object.fromEntries(
            wiring.wires
              .filter((w) => w.from.instance === inst.id)
              .map((w) => [w.from.event, w.to.screen]),
          ),
        ),
      );

      if (blockId !== screen.block) continue;

      // --- screen wrapper ------------------------------------------------------
      // Four cases: the block may accept onComplete (outgoing wire) and/or
      // input (incoming payload wire). Navigation params carry the payload;
      // the block's `input` prop receives route.params.input.
      const screenComp = screenComponentNameFor(screen.id);
      const target = targets.get(inst.id);
      const paramTarget = paramWireByEmitter.get(inst.id);
      const hasInput = input !== null && rendered.acceptsInput;
      const needsNav = rendered.acceptsOnComplete || hasInput;

      let body: string;
      if (rendered.acceptsOnComplete && target !== undefined) {
        const restoredTarget = wiring.wires.find(
          (w) => w.from.instance === inst.id && w.from.event === 'paywall.restored',
        )?.to.screen;
        const consumer = wiring.wires.find(
          (w) => w.from.instance === inst.id && w.to.screen === target,
        )?.to.instance;
        const composedTarget = graph.screens.some(
          (s) => s.id === target && pageBlockIds(s).length > 1,
        );
        const payloadParams =
          composedTarget && consumer
            ? `{ inputs: { ${JSON.stringify(consumer)}: output } }`
            : '{ input: output }';
        const onComplete =
          restoredTarget && restoredTarget !== target
            ? `onComplete={(output) => output.restored ? navigation.navigate('${restoredTarget}') : navigation.navigate('${target}')}`
            : paramTarget !== undefined && paramTarget === target
              ? `onComplete={(output) => navigation.navigate('${target}', ${payloadParams})}`
              : `onComplete={() => navigation.navigate('${target}')}`;
        body = hasInput
          ? `  const input = route.params?.input;\n  return <${componentName} input={input} ${onComplete} />;`
          : `  return <${componentName} ${onComplete} />;`;
      } else if (hasInput) {
        body = `  const input = route.params?.input;\n  return <${componentName} input={input} />;`;
      } else {
        body = `  return <${componentName} />;`;
      }

      const destructured = [
        rendered.acceptsOnComplete && target !== undefined ? 'navigation' : null,
        hasInput ? 'route' : null,
      ]
        .filter(Boolean)
        .join(', ');
      const navProp = needsNav
        ? `type ${screenComp}Props = NativeStackScreenProps<RootStackParamList, '${screen.id}'>;\n\nexport function ${screenComp}({ ${destructured} }: ${screenComp}Props) {\n`
        : `export function ${screenComp}() {\n`;
      const navImport = needsNav
        ? `import type { NativeStackScreenProps } from '@react-navigation/native-stack';\nimport type { RootStackParamList } from '../navigation';\n`
        : '';
      add(
        `src/screens/${screen.id}.tsx`,
        `import React from 'react';\n${navImport}import { ${componentName} } from '../blocks/${inst.id}';\n\n${navProp}${body}\n}\n`,
      );
    }
  }

  // Composed pages need one wrapper containing all their blocks.
  for (const screen of graph.screens) {
    if (pageBlockIds(screen).length > 1) {
      addComposedScreen(files, graph, screen.id, registry, wiring, inputByInstance);
    }
  }

  // --- wiring report + readme (hash covers everything except the report) -----
  add('README.md', renderReadme(graph));
  const projectHash = hashFiles(files);
  const reportJson = canonicalJson({
    app: graph.app.slug,
    projectHash,
    generatedBy: 'block-studio',
    wires: wiring.report.resolved,
    warnings: wiring.report.warnings,
    notes: wiring.report.notes,
    flow: wiring.report.flow,
  });
  add('src/wiring-report.json', `${reportJson}\n`);

  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return { files, wiring, projectHash };
}

function addComposedScreen(
  files: CompiledFile[],
  graph: ProjectGraph,
  screenId: string,
  registry: BlockRegistry,
  wiring: WiringResult,
  inputs: Map<string, { type: string; event: string }>,
): void {
  const screen = graph.screens.find((s) => s.id === screenId)!;
  const ids = pageBlockIds(screen);
  const imports: string[] = [];
  const state: string[] = [];
  const children: string[] = [];
  for (const id of ids) {
    const inst = graph.blocks.find((b) => b.id === id)!;
    const name = componentNameFor(id);
    const input = inputs.get(id);
    const rendered = registry.get(inst.type).render({
      instanceId: id,
      componentName: name,
      screenId,
      variant: inst.variant ?? registry.get(inst.type).manifest.defaultVariant ?? '',
      config: { ...registry.get(inst.type).manifest.defaultConfig, ...inst.config },
      theme: themeFor(graph),
      onCompleteTarget: null,
      inputType: input?.type ?? null,
      inputEvent: input?.event ?? null,
    });
    imports.push(`import { ${name} } from '../blocks/${id}';`);
    if (input && rendered.acceptsInput) {
      state.push(
        `  const [input_${name}, set_${name}] = useState<${input.type} | undefined>(route.params?.inputs?.[${JSON.stringify(id)}]);
  useEffect(() => { const incoming = route.params?.inputs?.[${JSON.stringify(id)}]; if (incoming !== undefined) set_${name}(incoming); }, [route.params]);`,
      );
    }
    const wires = wiring.wires.filter(
      (w) => w.from.instance === id && !w.from.event.startsWith('element.'),
    );
    const actions = wires.map((w) => {
      if (w.to.screen === screenId && w.to.instance && inputs.has(w.to.instance)) {
        return `set_${componentNameFor(w.to.instance)}(output as ${inputs.get(w.to.instance)!.type});`;
      }
      if (w.to.screen === screenId) return '';
      const params =
        w.to.instance && inputs.has(w.to.instance)
          ? graph.screens.some((s) => s.id === w.to.screen && pageBlockIds(s).length > 1)
            ? `, { inputs: { ${JSON.stringify(w.to.instance)}: output } } as never`
            : ', { input: output } as never'
          : '';
      return `navigation.navigate('${w.to.screen}'${params});`;
    });
    let callback = actions[0] ?? '';
    if (inst.type.startsWith('paywall.basic@')) {
      const completed = wires.findIndex((w) => w.from.event === 'paywall.completed');
      const restored = wires.findIndex((w) => w.from.event === 'paywall.restored');
      callback = `if (output.restored) { ${actions[restored] ?? ''} } else { ${actions[completed] ?? ''} }`;
    }
    const props = [
      input && rendered.acceptsInput ? `input={input_${name}}` : '',
      rendered.acceptsOnComplete ? `onComplete={(output) => { void output; ${callback} }}` : '',
    ]
      .filter(Boolean)
      .join(' ');
    children.push(
      `      <View style={{ width: width >= 700 ? '${screen.layout === 'grid' || screen.layout === 'split' ? '50%' : '100%'}' : '100%' }}><${name} ${props} /></View>`,
    );
  }
  const content = `import React, { useState, useEffect } from 'react';\nimport { ScrollView, View, useWindowDimensions } from 'react-native';\nimport type { NativeStackScreenProps } from '@react-navigation/native-stack';\nimport type { RootStackParamList } from '../navigation';\n${imports.join('\n')}\ntype Props = NativeStackScreenProps<RootStackParamList, '${screenId}'>;\nexport function ${screenComponentNameFor(screenId)}({ navigation, route }: Props) {\n  const { width } = useWindowDimensions();\n  void navigation; void route; void useState; void useEffect;\n${state.join('\n')}\n  return <ScrollView contentContainerStyle={{ flexGrow: 1 }}><View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>\n${children.join('\n')}\n  </View></ScrollView>;\n}\n`;
  const existing = files.find((f) => f.path === `src/screens/${screenId}.tsx`);
  if (existing) existing.content = content;
}
