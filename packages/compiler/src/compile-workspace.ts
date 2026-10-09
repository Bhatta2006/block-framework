import { canonicalJson, type GraphInput } from '@blockfw/manifest';
import type { BlockRegistry } from '@blockfw/blocks';
import { prepareProject } from './frontend.js';
import { emitWebIR } from './backends/web.js';
import { emitNativeIR } from './backends/native.js';
import { hashFiles, type CompileResult, type CompiledFile } from './files.js';
import { workspaceCheckFiles, WEB_TEST_DEPS } from './workspace-checks.js';
import {
  formatWorkspace,
  QUALITY_DEPS,
  QUALITY_FILES,
  QUALITY_SCRIPTS,
} from './workspace-quality.js';

const PNPM = '12.10.1';
const TURBO = '2.11.7';
const jsonFile = (path: string, value: unknown): CompiledFile => ({
  path,
  content: canonicalJson(value) + '\n',
});

/** Package all declared platforms; retain the small layout when only one app is needed. */
export function compileWorkspace(graph: GraphInput, registry: BlockRegistry): CompileResult {
  const ir = prepareProject(graph, registry);
  const web = ir.capabilities.targets.includes('web');
  const native = ir.capabilities.targets.filter((target) => target !== 'web').sort();
  if (!native.length) return emitWebIR(ir, registry);
  if (!web) return emitNativeIR(ir, registry);

  // Resolve every target before exposing files; never ship a partial workspace on failure.
  const apps = [
    { name: 'web', result: emitWebIR(ir, registry) },
    { name: 'mobile', result: emitNativeIR(ir, registry) },
  ];
  const files: CompiledFile[] = [];
  const checks = workspaceCheckFiles(PNPM);
  for (const { name, result } of apps) {
    const prefix = `apps/${name}/`;
    let appFiles = [
      ...result.files.map((file) => ({ ...file })),
      ...checks
        .filter((file) => file.path.startsWith(prefix))
        .map((file) => ({ ...file, path: file.path.slice(prefix.length) })),
    ];
    const pkgFile = appFiles.find((file) => file.path === 'package.json')!;
    const pkg = JSON.parse(pkgFile.content);
    pkg.dependencies['@app/theme'] = 'workspace:*';
    pkg.name = `app-${name}`;
    pkg.scripts.typecheck = 'tsc --noEmit';
    if (name === 'web') {
      pkg.scripts.test = 'vitest run';
      Object.assign(pkg.devDependencies, WEB_TEST_DEPS);
      const tsFile = appFiles.find((file) => file.path === 'tsconfig.json')!;
      const tsconfig = JSON.parse(tsFile.content);
      tsconfig.include.push('tests', 'vitest.config.ts');
      tsFile.content = canonicalJson(tsconfig) + '\n';
    }
    if (name === 'mobile') {
      pkg.scripts.dev = 'expo start';
      pkg.scripts.build = 'expo export --platform all --max-workers 2';
      const appFile = appFiles.find((file) => file.path === 'app.json')!;
      const app = JSON.parse(appFile.content);
      app.expo.platforms = native;
      appFile.content = canonicalJson(app) + '\n';
    }
    pkgFile.content = canonicalJson(pkg) + '\n';
    appFiles = formatWorkspace(appFiles, name as 'web' | 'mobile');
    const report = appFiles.find((file) => file.path === 'src/wiring-report.json')!;
    report.content =
      canonicalJson({
        ...JSON.parse(report.content),
        projectHash: hashFiles(appFiles.filter((file) => file !== report)),
      }) + '\n';
    files.push(...appFiles.map((file) => ({ ...file, path: `apps/${name}/${file.path}` })));
  }
  const appFileCount = files.length;
  files.push(
    jsonFile('package.json', {
      name: ir.compatibilityGraph.app.slug + '-workspace',
      version: ir.compatibilityGraph.app.version,
      private: true,
      packageManager: `pnpm@${PNPM}`,
      engines: { node: '^24.15.0 || >=26.0.0' },
      scripts: {
        build: 'turbo run build',
        typecheck: 'turbo run typecheck',
        test: 'turbo run test',
        ...QUALITY_SCRIPTS,
        'dev:web': 'pnpm --filter app-web dev',
        'dev:mobile': 'pnpm --filter app-mobile dev',
      },
      devDependencies: { turbo: TURBO, ...QUALITY_DEPS },
    }),
    { path: 'pnpm-workspace.yaml', content: "packages:\n  - 'apps/*'\n  - 'packages/*'\n" },
    jsonFile('turbo.json', {
      $schema: 'https://turborepo.dev/schema.json',
      tasks: {
        build: { dependsOn: ['^build'], outputs: ['dist/**'] },
        typecheck: { dependsOn: ['^typecheck'], outputs: [] },
        test: { outputs: [] },
        '@app/theme#build': {
          inputs: ['tokens.json', 'theme-build.ts', 'build.mjs', 'package.json'],
          outputs: ['index.ts', 'tokens.css', 'web.css'],
        },
      },
    }),
    {
      path: '.gitignore',
      content: 'node_modules/\ndist/\n.expo/\n.turbo/\n*.log\n.env\n.env.*\n!.env.example\n',
    },
    {
      path: 'README.md',
      content: `# ${ir.compatibilityGraph.app.name}\n\nWeb and native source compiled from one Block Studio graph.\n\nUse Node 24.15+ (24.x) or 26+ and pnpm ${PNPM}. Run \`pnpm install\`, then \`pnpm typecheck\`, \`pnpm test\` and \`pnpm build\`. Start web with \`pnpm dev:web\` or Expo with \`pnpm dev:mobile\`. Commit the generated pnpm-lock.yaml after the first install and use \`pnpm install --frozen-lockfile\` thereafter.\n\nSee [setup](docs/SETUP.md) and [architecture](docs/ARCHITECTURE.md). Native builds emit JavaScript/Hermes bundles, not signed store binaries. Existing demo auth/billing remain demonstrations.\n`,
    },
    {
      path: 'docs/SETUP.md',
      content: `# Setup and verification\n\nInstall Node 24.15+ (24.x) or 26+ and pnpm ${PNPM} (\`npm install --global pnpm@${PNPM}\`), then run the root README commands. Install from the workspace root so both apps share one lockfile. The compiler does not contact package registries; the first install resolves transitive dependencies. Review and commit that lockfile before CI or deployment.\n\n- Web: Vite development server; host apps/web/dist after building.\n- Tests: \`pnpm test\` renders each web page and checks header navigation using Vitest/Testing Library in jsdom. Extend these smoke tests with application-specific interactions. They do not verify visual design, external services or native behavior.\n- CI: .github/workflows/verify.yml runs typecheck, tests and builds on pushes/pull requests. It requires pnpm-lock.yaml; no deployment or credentials are configured. Run \`pnpm lint\` and \`pnpm format:check\` before committing. ESLint/Prettier configuration is editable; JSON graph/report files use canonical serialization.\n- Theme: packages/theme/tokens.json is the portable source. Root pnpm build regenerates CSS/native values before application builds; run pnpm --filter @app/theme build after editing tokens. Native dimensions require px; durations accept ms or s. Light/dark semantic tokens are emitted; existing legacy blocks still contain their original fixed styles.\n- Mobile: Expo development server; compatible native device/emulator needed for runtime verification. Build bundles only the native platforms declared by the graph. Store signing/submission is a separate step.\n- \`pnpm exec turbo run build --dry=json\` inspects the build tasks.\n\nThe current export uses the existing native modules and routes. Native auth/cloud is rejected until supported. Review dependency advisories and native SDK compatibility before publication. Never commit environment secrets. No connection to Studio is required to run this source.\n`,
    },
    {
      path: 'docs/ARCHITECTURE.md',
      content:
        '# Architecture\n\napps/web contains the React/Vite application; apps/mobile contains the Expo/React Native application. Each has its own entry point, package manifest, block source lock and wiring report. Source/configuration is copied from the existing validated target emitters. pnpm manages dependencies and Turbo schedules the build/typecheck scripts.\n\nWeb and native currently retain their own data runtimes and storage. They do not synchronize data. packages/theme contains portable tokens.json plus resolved CSS and native TypeScript values. Both applications consume it through @app/theme. Style Dictionary and color generation run in the compiler; they are not runtime dependencies. Theme JSON uses canonical serialization; source styles honor reduced motion. No backend or unused shared package is generated.\n\nThe root wiring-report.json hashes every emitted file except itself, including the nested reports. Each nested report separately hashes its application files, excluding that report. blockfw.lock.json inside each app records its block contracts and source digests.\n',
    },
  );
  files.push(...QUALITY_FILES, ...checks.filter((file) => !file.path.startsWith('apps/')));
  const formatted = formatWorkspace(files.slice(appFileCount), undefined, ir.theme);
  files.splice(appFileCount, files.length - appFileCount, ...formatted);
  const projectHash = hashFiles(files);
  files.push(
    jsonFile('wiring-report.json', { projectHash, target: 'workspace', ...ir.wiring.report }),
  );
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return { files, wiring: ir.wiring, projectHash };
}
