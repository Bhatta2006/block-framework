import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFileSync, existsSync, writeFileSync, mkdirSync, unlinkSync } from 'node:fs';
import { join, dirname, resolve, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { compileProject, compileWebProject } from '@blockfw/compiler';
import {
  loadDefaultRegistry,
  loadSampleConfig,
  unwrapSampleConfig,
  canonicalJson,
} from '@blockfw/blocks';
import { validateProjectGraph } from '@blockfw/manifest';
import {
  applyCascade,
  emptyProject,
  generateAllCards,
  markTouched,
  validateProfile,
  type BuilderProfile,
  type BuilderProject,
} from './index.js';
import { AgentGateway, RecordedProvider, providerFromEnv, type AgentPlan } from '@blockfw/agent';

import { AppLibrary } from './apps.js';

const here = dirname(fileURLToPath(import.meta.url));

/** Resolve the built SPA directory (vite outDir) with a dev fallback. */
function uiDir(): string {
  const candidates = [
    resolve(here, '../dist-ui'), // vite build output (production)
    resolve(here, '../../packages/builder/dist-ui'),
    resolve(here, '../ui/dist'), // vite dev output relative to src
  ];
  for (const c of candidates) {
    if (existsSync(join(c, 'index.html'))) return c;
  }
  return candidates[0] as string;
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function send(res: ServerResponse, status: number, body: string, type = 'application/json'): void {
  res.writeHead(status, { 'Content-Type': `${type}; charset=utf-8` });
  res.end(body);
}

function json(res: ServerResponse, status: number, data: unknown): void {
  send(res, status, JSON.stringify(data), 'application/json');
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolveBody, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c as Buffer));
    req.on('end', () => resolveBody(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

export interface CanvasOptions {
  port: number;
  projectPath?: string;
  host?: string;
}

function loadProjectFile(path: string): BuilderProject {
  const raw = JSON.parse(readFileSync(path, 'utf8')) as BuilderProject;
  if (raw.version !== 1 || !raw.graph) throw new Error(`Not a builder project file: ${path}`);
  return raw;
}

/** Start the builder server. Returns the base URL. */
export async function startCanvasServer(opts: CanvasOptions): Promise<string> {
  const registry = loadDefaultRegistry();
  let project: BuilderProject;
  if (opts.projectPath && existsSync(opts.projectPath)) {
    project = loadProjectFile(opts.projectPath);
  } else {
    // Default: the composed web/mobile studio example.
    const example = resolve(here, '../../../examples/studio/graph.json');
    const graph = JSON.parse(readFileSync(example, 'utf8'));
    project = emptyProject(graph);
  }
  validateProjectGraph(project.graph);

  const apps = new AppLibrary(
    project,
    opts.projectPath ? resolve(opts.projectPath) + '.apps.json' : undefined,
  );
  project = structuredClone(apps.project);
  validateProjectGraph(project.graph);
  const saveProject = () => {
    apps.update(project);
    if (opts.projectPath) {
      mkdirSync(dirname(resolve(opts.projectPath)), { recursive: true });
      writeFileSync(resolve(opts.projectPath), JSON.stringify(project, null, 2) + '\n');
    }
  };

  saveProject();
  const fingerprint = () => createHash('sha256').update(canonicalJson(project)).digest('hex');
  let lastAgentFingerprint: string | null = null;

  // --- Agent Gateway -----------------------------------------------------
  // Provider: recorded demo responses unless a real LLM is configured via
  // BLOCKFW_LLM_* env vars. The UI labels which one answered.
  let demoRecorded: RecordedProvider;
  try {
    demoRecorded = RecordedProvider.fromJson(
      readFileSync(resolve(here, '../../agent/recorded/demo.json'), 'utf8'),
    );
  } catch {
    demoRecorded = new RecordedProvider([]);
  }
  const provider = providerFromEnv(process.env, demoRecorded);
  let gateway = new AgentGateway<BuilderProject>(provider);
  const usingLiveModel = provider.name !== 'recorded';
  // Pending plans awaiting human review: planId -> { plan, projectHash }.
  const pendingPlans = new Map<
    string,
    {
      plan: AgentPlan;
      projectHash: string;
      appId: string;
      scope: { focusInstanceIds?: string[]; allowTouched?: boolean };
    }
  >();
  let planSeq = 0;

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      const path = url.pathname;

      // --- App library --------------------------------------------------------
      const appMatch = path.match(/^\/api\/apps\/([a-zA-Z0-9-]+)(?:\/(activate|restore))?$/);
      if (path === '/api/apps' && req.method === 'GET') {
        json(res, 200, apps.list());
        return;
      }
      const activateProject = () => {
        project = structuredClone(apps.project);
        gateway = new AgentGateway<BuilderProject>(provider);
        pendingPlans.clear();
        lastAgentFingerprint = null;
        saveProject();
      };
      if (path === '/api/apps' && req.method === 'POST') {
        try {
          const body = JSON.parse(await readBody(req)) as { project: BuilderProject };
          if (body.project?.version !== 1 || !Array.isArray(body.project.touched))
            throw new Error('Invalid app project.');
          validateProjectGraph(body.project.graph);
          compileWebProject(body.project.graph, registry);
          compileProject(body.project.graph, registry);
          apps.create(body.project);
          activateProject();
          json(res, 201, { ...apps.list(), project });
        } catch (e) {
          json(res, 400, { error: e instanceof Error ? e.message : String(e) });
        }
        return;
      }
      if (appMatch && (req.method === 'POST' || req.method === 'DELETE')) {
        try {
          const old = apps.activeId;
          if (req.method === 'DELETE') apps.remove(appMatch[1]!);
          else if (appMatch[2] === 'activate') apps.activate(appMatch[1]!);
          else if (appMatch[2] === 'restore') apps.restore(appMatch[1]!);
          else throw new Error('Unknown app action.');
          if (old !== apps.activeId) activateProject();
          json(res, 200, { ...apps.list(), project });
        } catch (e) {
          json(res, 400, { error: e instanceof Error ? e.message : String(e) });
        }
        return;
      }
      const requestedApp = req.headers['x-block-app-id'];
      if (path.startsWith('/api/') && requestedApp && requestedApp !== apps.activeId) {
        json(res, 409, { error: 'The active app changed. Reload the workspace before saving.' });
        return;
      }
      // --- API ---------------------------------------------------------------
      if (path === '/api/project' && req.method === 'GET') {
        json(res, 200, project);
        return;
      }
      if (path === '/api/project' && req.method === 'PUT') {
        const body = JSON.parse(await readBody(req)) as BuilderProject;
        try {
          if (body.version !== 1 || !Array.isArray(body.touched))
            throw new Error('Invalid builder project contract.');
          validateProjectGraph(body.graph);
          compileWebProject(body.graph, registry);
          compileProject(body.graph, registry);
        } catch (e) {
          json(res, 400, { ok: false, error: e instanceof Error ? e.message : String(e) });
          return;
        }
        project = {
          version: 1,
          profile: body.profile ?? null,
          touched: [...(body.touched ?? [])].sort(),
          graph: body.graph,
        };
        saveProject();
        json(res, 200, { ok: true });
        return;
      }
      if (path === '/api/profile' && req.method === 'PUT') {
        const body = JSON.parse(await readBody(req)) as { profile: BuilderProfile };
        const errors = validateProfile(body.profile ?? {});
        if (errors.length > 0) {
          json(res, 400, { ok: false, errors });
          return;
        }
        project.profile = body.profile;
        saveProject();
        json(res, 200, { ok: true });
        return;
      }
      if (path === '/api/cascade' && req.method === 'POST') {
        const result = applyCascade(project);
        saveProject();
        json(res, 200, { ok: true, ...result, project });
        return;
      }
      if (path === '/api/touch' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req)) as { path: string };
        if (typeof body.path !== 'string' || !body.path) {
          json(res, 400, { ok: false, error: 'path is required' });
          return;
        }
        markTouched(project, body.path);
        saveProject();
        json(res, 200, { ok: true, touched: project.touched });
        return;
      }
      if (path === '/api/compile' && req.method === 'POST') {
        const result =
          url.searchParams.get('target') === 'web'
            ? compileWebProject(project.graph, registry)
            : compileProject(project.graph, registry);
        json(res, 200, {
          ok: true,
          projectHash: result.projectHash,
          files: result.files.map((f) => f.path),
          wiring: result.wiring.report,
        });
        return;
      }
      if (path === '/api/export/zip' && req.method === 'POST') {
        // M4: One-click ZIP export. Compiles the current project, audits, zips.
        const { exportZip } = await import('@blockfw/compiler');
        const tmpZip = join(tmpdir(), `bf-export-${Date.now()}.zip`);
        const result = await exportZip(
          project.graph,
          tmpZip,
          url.searchParams.get('target') === 'web' ? 'web' : 'mobile',
        );
        if (!result.audit.ok) {
          json(res, 500, { ok: false, violations: result.audit.violations });
          return;
        }
        const zipData = readFileSync(tmpZip);
        unlinkSync(tmpZip);
        res.writeHead(200, {
          'Content-Type': 'application/zip',
          'Content-Disposition': `attachment; filename="${project.graph.app.slug || 'app'}.zip"`,
          'Content-Length': zipData.length,
        });
        res.end(zipData);
        return;
      }
      if (path === '/api/cards' && req.method === 'GET') {
        json(res, 200, generateAllCards());
        return;
      }
      if (path === '/api/blocks' && req.method === 'GET') {
        json(
          res,
          200,
          registry.entries().map((e) => ({
            id: `${e.manifest.id}@${e.manifest.version}`,
            category: e.manifest.category,
            variants: e.manifest.variants,
            defaultVariant: e.manifest.defaultVariant,
            configSchema: e.manifest.config,
            defaultConfig: {
              ...e.manifest.defaultConfig,
              ...unwrapSampleConfig(loadSampleConfig(e.manifest.id)),
            },
            ports: e.manifest.ports,
          })),
        );
        return;
      }
      // --- Agent Gateway API -------------------------------------------
      if (path === '/api/agent/edit' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req)) as {
          instruction?: string;
          focusInstanceIds?: string[];
          allowTouched?: boolean;
        };
        const instruction = (body.instruction ?? '').toString().slice(0, 500);
        if (!instruction.trim()) {
          json(res, 400, { ok: false, errors: ['instruction is required'] });
          return;
        }
        const scope = {
          focusInstanceIds: body.focusInstanceIds?.filter((id) =>
            project.graph.blocks.some((b) => b.id === id),
          ),
          allowTouched: body.allowTouched === true,
        };
        const planAppId = apps.activeId;
        const planHash = fingerprint();
        const planProject = structuredClone(project);
        let result;
        let activeProvider = provider;
        let activeLiveModel = usingLiveModel;
        try {
          result = await gateway.plan(planProject, instruction, scope);
        } catch (e) {
          // Live provider failed (network down, etc.) — fall back to recorded.
          // The UI will show the recorded badge, no visible error.
          if (usingLiveModel) {
            const fallbackGateway = new AgentGateway(demoRecorded, { maxAttempts: 2 });
            result = await fallbackGateway.plan(planProject, instruction, scope);
            activeProvider = demoRecorded;
            activeLiveModel = false;
          } else {
            throw e;
          }
        }
        if (apps.activeId !== planAppId || fingerprint() !== planHash) {
          json(res, 409, { error: 'App changed while planning. Plan again.' });
          return;
        }
        if (!result.ok || !result.plan) {
          json(res, 200, {
            ok: false,
            errors: result.errors,
            attempts: result.attempts,
            usage: result.usage,
            provider: activeProvider.name,
            liveModel: activeLiveModel,
          });
          return;
        }
        const planId = `plan-${++planSeq}`;
        const projectHash = fingerprint();
        pendingPlans.set(planId, { plan: result.plan, projectHash, appId: apps.activeId, scope });
        json(res, 200, {
          ok: true,
          planId,
          plan: result.plan,
          diff: result.diff,
          warnings: result.warnings,
          attempts: result.attempts,
          usage: result.usage,
          provider: activeProvider.name,
          liveModel: activeLiveModel,
        });
        return;
      }
      if (path === '/api/agent/apply' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req)) as { planId?: string };
        const pending = body.planId ? pendingPlans.get(body.planId) : undefined;
        if (!pending) {
          json(res, 400, { ok: false, errors: ['unknown or expired planId'] });
          return;
        }
        pendingPlans.delete(body.planId as string);
        // Reject stale plans: the project changed since planning.
        const projectHash = fingerprint();
        if (projectHash !== pending.projectHash || pending.appId !== apps.activeId) {
          json(res, 409, {
            ok: false,
            errors: ['project changed since the plan was made; re-plan the edit'],
          });
          return;
        }
        try {
          const { project: next, applied } = gateway.apply(project, pending.plan, pending.scope);
          project = next;
          lastAgentFingerprint = fingerprint();
          saveProject();
          json(res, 200, { ok: true, applied, usage: gateway.usageLog.slice(-1) });
        } catch (e) {
          json(res, 400, { ok: false, errors: [e instanceof Error ? e.message : String(e)] });
        }
        return;
      }
      if (path === '/api/agent/undo' && req.method === 'POST') {
        if (gateway.undoDepth > 0 && lastAgentFingerprint !== fingerprint()) {
          json(res, 409, {
            ok: false,
            errors: ['Project changed after the AI edit. Undo the newer workspace changes first.'],
          });
          return;
        }
        const undone = gateway.undo();
        if (!undone) {
          json(res, 400, { ok: false, errors: ['nothing to undo'] });
          return;
        }
        project = undone as BuilderProject;
        lastAgentFingerprint = fingerprint();
        saveProject();
        json(res, 200, { ok: true });
        return;
      }
      if (path === '/api/agent/usage' && req.method === 'GET') {
        json(res, 200, {
          log: gateway.usageLog,
          undoDepth: gateway.undoDepth,
          total: gateway.totalUsage,
          provider: provider.name,
          liveModel: usingLiveModel,
        });
        return;
      }
      if (path === '/api/run' || path === '/api/run.js') {
        const compiled = compileWebProject(project.graph, registry);
        const bundle = await webPreviewBundle(compiled);
        if (path === '/api/run.js') send(res, 200, bundle, 'text/javascript');
        else {
          const css = compiled.files.find((f) => f.path === 'src/styles.css')!.content;
          send(
            res,
            200,
            '<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Live app preview</title><style>' +
              css +
              '</style></head><body><div id="root"></div><script src="/api/run.js"></script></body></html>',
            'text/html',
          );
        }
        return;
      }
      const previewMatch = path.match(/^\/api\/preview\/([A-Za-z0-9_-]+)$/);
      if (previewMatch && req.method === 'GET') {
        const html = await renderPreview(previewMatch[1] as string, project, registry);
        send(res, 200, html, 'text/html');
        return;
      }

      // --- SPA ---------------------------------------------------------------
      const dir = uiDir();
      let file = join(
        dir,
        path === '/' ? 'index.html' : decodeURIComponent(path).replace(/^\/+/, ''),
      );
      if (!file.startsWith(dir)) {
        send(res, 403, 'forbidden', 'text/plain');
        return;
      }
      if (!existsSync(file)) file = join(dir, 'index.html'); // SPA fallback
      send(res, 200, readFileSync(file, 'utf8'), MIME[extname(file)] ?? 'application/octet-stream');
    } catch (err) {
      json(res, err instanceof SyntaxError ? 400 : 500, {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  const host = opts.host ?? '127.0.0.1';
  await new Promise<void>((resolveListen) => server.listen(opts.port, host, resolveListen));
  const address = server.address();
  const actualPort = typeof address === 'object' && address !== null ? address.port : opts.port;
  return `http://${host}:${actualPort}`;
}

// --- static block previews ---------------------------------------------------

const previewCache = new Map<string, string>();
const webCache = new Map<string, string>();

async function webPreviewBundle(compiled: ReturnType<typeof compileWebProject>): Promise<string> {
  const cached = webCache.get(compiled.projectHash);
  if (cached) return cached;
  const { buildSync } = await import('esbuild');
  const cacheDir = resolve(here, '../../../.builder-cache/web');
  mkdirSync(cacheDir, { recursive: true });
  const runtime = compiled.files.find((f) => f.path === 'src/runtime.tsx')!.content;
  writeFileSync(join(cacheDir, 'runtime.tsx'), runtime);
  const graph = compiled.files.find((f) => f.path === 'src/project.json')!.content;
  const wires = compiled.files.find((f) => f.path === 'src/wires.json')!.content;
  const contents =
    "import React from 'react'; import { createRoot } from 'react-dom/client'; import { Application } from './runtime'; const q = new URLSearchParams(location.search); createRoot(document.getElementById('root')!).render(<Application graph={" +
    graph +
    '} wires={' +
    wires +
    "} initialPage={q.get('page') || undefined} previewBlock={q.get('block') || undefined} embedded={q.get('embedded') === '1'} />);";
  const result = buildSync({
    stdin: { contents, resolveDir: cacheDir, loader: 'tsx' },
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    jsx: 'automatic',
    minify: true,
    define: { 'process.env.NODE_ENV': '"production"' },
    logLevel: 'silent',
  });
  const bundle = result.outputFiles[0]!.text;
  webCache.set(compiled.projectHash, bundle);
  if (webCache.size > 8) webCache.delete(webCache.keys().next().value!);
  return bundle;
}

/**
 * Render a block instance to static HTML (no browser, no device).
 * Bundles the generated block with esbuild (react-native → DOM mock),
 * then renders with react-dom/server. Cached by project hash + instance.
 */
async function renderPreview(
  instanceId: string,
  project: BuilderProject,
  registry: ReturnType<typeof loadDefaultRegistry>,
): Promise<string> {
  const compiled = compileProject(project.graph, registry);
  const cacheKey = `${compiled.projectHash}:${instanceId}`;
  const cached = previewCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const { buildSync } = await import('esbuild');

  const cacheDir = resolve(here, '../../../.builder-cache');
  mkdirSync(cacheDir, { recursive: true });
  // IMPORTANT: the bundled preview's internal require("react") resolves
  // relative to the CACHE DIR (repo root), not server.js. If the renderer
  // uses a different React copy (ESM/CJS resolution can diverge when nested
  // node_modules disagree), hooks break with "Invalid hook call" / null
  // useState. Resolve React, react-dom/server, AND the bundle itself from
  // the cache dir so all three share one React instance.
  const cacheRequire = createRequire(join(cacheDir, 'preview.cjs'));
  const React = cacheRequire('react') as typeof import('react');
  const { renderToStaticMarkup } = cacheRequire(
    'react-dom/server',
  ) as typeof import('react-dom/server');

  for (const f of compiled.files) {
    if (!f.path.startsWith('src/')) continue;
    const full = join(cacheDir, f.path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, f.content);
  }
  const entry = join(cacheDir, 'src', 'blocks', `${instanceId}.tsx`);
  if (!existsSync(entry)) throw new Error(`Unknown block instance: ${instanceId}`);
  const rnMock = resolve(here, '../../../packages/compiler/test/rn-mock.tsx');
  const outFile = join(cacheDir, `${instanceId}.preview.cjs`);
  buildSync({
    entryPoints: [entry],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile: outFile,
    alias: { 'react-native': rnMock },
    external: ['react', 'react-dom'],
    logLevel: 'silent',
  });
  delete cacheRequire.cache[outFile];
  const mod = cacheRequire(outFile) as Record<string, unknown>;
  const componentName = Object.keys(mod).find((k) => /Block$/.test(k));
  if (!componentName) throw new Error(`No block component exported for ${instanceId}`);
  const Component = mod[componentName] as (props: Record<string, unknown>) => unknown;
  // Blocks with input props render their fallback content without input.
  const html = renderToStaticMarkup(
    React.createElement(Component as never, {
      onComplete: () => undefined,
    }),
  );
  const doc = `<!DOCTYPE html><html><body>${html}</body></html>`;
  previewCache.set(cacheKey, doc);
  if (previewCache.size > 50) {
    const first = previewCache.keys().next().value;
    if (first !== undefined) previewCache.delete(first);
  }
  return doc;
}
