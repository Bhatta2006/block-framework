import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import {
  readFileSync,
  existsSync,
  writeFileSync,
  mkdirSync,
  mkdtempSync,
  unlinkSync,
} from 'node:fs';
import { join, dirname, resolve, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import {
  compileProject,
  compileWebProject,
  compileWorkspace,
  type ExportTarget,
} from '@blockfw/compiler';
import {
  generateCard,
  loadDefaultRegistry,
  loadSampleConfig,
  unwrapSampleConfig,
  canonicalJson,
} from '@blockfw/blocks';
import {
  validateProjectGraph,
  legacyGraph,
  ProjectOperationLog,
  diffProjectOperations,
  type ProjectOperation,
  type GraphInput,
} from '@blockfw/manifest';
import {
  applyCascade,
  emptyProject,
  markTouched,
  validateProfile,
  type BuilderProfile,
  type BuilderProject,
} from './index.js';
import {
  AgentGateway,
  AppBuilder,
  BlockAuthor,
  RecipeBook,
  RecordedProvider,
  providerFromEnv,
  type AgentPlan,
  type AppBlueprint,
  type BlockContract,
  type BuildMode,
  type Recipe,
} from '@blockfw/agent';

import { AppLibrary, type StoredBuilderProject } from './apps.js';
import { ChatGPTConnection } from './chatgpt.js';

const here = dirname(fileURLToPath(import.meta.url));
class ActiveAppChangedError extends Error {}

function exportTarget(url: URL): ExportTarget {
  const target = url.searchParams.get('target') ?? 'mobile';
  if (target !== 'web' && target !== 'mobile' && target !== 'workspace')
    throw new SyntaxError('Export target must be web, mobile or workspace');
  return target;
}

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
  chatgpt?: ChatGPTConnection;
  /** Workspace block registry for agent-authored blocks. Default: `<project>.blocks`. */
  blocksDir?: string;
}

function loadProjectFile(path: string): StoredBuilderProject {
  const raw = JSON.parse(readFileSync(path, 'utf8')) as StoredBuilderProject;
  if (raw.version !== 1 || !raw.graph) throw new Error(`Not a builder project file: ${path}`);
  legacyGraph(raw.graph);
  return raw;
}

/** Start the builder server. Returns the base URL. */
export async function startCanvasServer(opts: CanvasOptions): Promise<string> {
  const registry = loadDefaultRegistry();
  let project: BuilderProject;
  let initial: StoredBuilderProject;
  if (opts.projectPath && existsSync(opts.projectPath)) {
    initial = loadProjectFile(opts.projectPath);
  } else {
    // Default: the composed web/mobile studio example.
    const example = resolve(here, '../../../examples/studio/graph.json');
    const graph = JSON.parse(readFileSync(example, 'utf8'));
    initial = emptyProject(graph);
  }
  validateProjectGraph(legacyGraph(initial.graph));

  const apps = new AppLibrary(
    initial,
    opts.projectPath ? resolve(opts.projectPath) + '.apps.json' : undefined,
  );
  project = structuredClone(apps.project);
  validateProjectGraph(project.graph);
  const saveProject = (inputGraph?: GraphInput) => {
    project.graph.app.dataId = apps.activeId;
    apps.update(inputGraph ? { ...project, graph: inputGraph } : project);
    if (opts.projectPath) {
      mkdirSync(dirname(resolve(opts.projectPath)), { recursive: true });
      writeFileSync(resolve(opts.projectPath), JSON.stringify(apps.storedProject, null, 2) + '\n');
    }
  };

  saveProject();
  /** Dry-run compile every target the graph can export; throws with the compiler's reason. */
  const verifyGraph = (graph: GraphInput, cloud: boolean) => {
    compileWebProject(graph, registry);
    if (
      !cloud &&
      (graph.schemaVersion === '0' || graph.app.targets.some((target) => target !== 'web'))
    )
      compileProject(graph, registry);
  };
  const fingerprint = () => createHash('sha256').update(canonicalJson(project)).digest('hex');
  let lastAgentFingerprint: string | null = null;
  const operationLogs = new Map<string, ProjectOperationLog<BuilderProject>>();
  const operationLog = () => {
    let log = operationLogs.get(apps.activeId);
    if (!log) {
      log = new ProjectOperationLog<BuilderProject>(
        (next, graph) => {
          if (next.graph.app.dataId !== apps.activeId)
            throw new Error('The app record namespace is immutable');
          if (next.profile) {
            const errors = validateProfile(next.profile);
            if (errors.length) throw new Error(errors.join('; '));
          }
          verifyGraph(graph, Boolean(next.graph.app.cloud));
          const before = project;
          project = next;
          try {
            saveProject(graph);
          } catch (error) {
            project = before;
            throw error;
          }
        },
        () => apps.storedProject.graph,
      );
      operationLogs.set(apps.activeId, log);
    }
    return log;
  };

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
  const environmentProvider = providerFromEnv(process.env, demoRecorded);
  const localHost = ['127.0.0.1', 'localhost', '::1'].includes(opts.host ?? '127.0.0.1');
  let provider = environmentProvider;
  let gateway = new AgentGateway<BuilderProject>(provider, { registry }, operationLog());
  let usingLiveModel = provider.name !== 'recorded';
  let connectionRevision = 0;
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

  // Builder agent: assembles apps from library blocks. Approved builds are
  // kept as recipes next to the app library so repeats cost zero tokens.
  const recipesPath = opts.projectPath ? resolve(opts.projectPath) + '.recipes.json' : undefined;
  let storedRecipes: Record<string, Recipe> = {};
  try {
    if (recipesPath && existsSync(recipesPath))
      storedRecipes = JSON.parse(readFileSync(recipesPath, 'utf8')) as Record<string, Recipe>;
  } catch {
    storedRecipes = {};
  }
  const appBuilder = new AppBuilder(provider, new RecipeBook(storedRecipes), {
    registry,
    verify: (graph) => verifyGraph(graph, Boolean(graph.app.cloud)),
  });
  const pendingBuilds = new Map<
    string,
    {
      request: string;
      mode: BuildMode;
      key: string;
      blueprint: AppBlueprint;
      graph: BuilderProject['graph'];
      operations: ProjectOperation[];
      projectHash: string;
      appId: string;
    }
  >();

  // Block author: turns a "Needs a new block" capability into an experimental
  // block (contract review → scaffold + template → SDK and compile gates).
  // Experimental blocks live next to the project file, or in a temp dir.
  const blocksRoot = opts.blocksDir
    ? resolve(opts.blocksDir)
    : opts.projectPath
      ? resolve(opts.projectPath) + '.blocks'
      : mkdtempSync(join(tmpdir(), 'blockfw-blocks-'));
  const blockAuthor = new BlockAuthor(provider, {
    root: blocksRoot,
    registry,
    verify: (graph, candidate) => {
      compileWebProject(graph, candidate);
      compileProject(graph, candidate);
    },
  });
  const reloaded = blockAuthor.loadExperimental();
  for (const error of reloaded.errors) console.warn(`experimental block skipped: ${error}`);
  const pendingContracts = new Map<string, BlockContract>();

  const connection = opts.chatgpt ?? new ChatGPTConnection();
  const syncConnection = () => {
    connectionRevision++;
    try {
      provider = localHost ? connection.provider(environmentProvider) : environmentProvider;
    } catch {
      provider = environmentProvider;
    }
    usingLiveModel = provider.name !== 'recorded';
    gateway.setProvider(provider);
    appBuilder.setProvider(provider);
    blockAuthor.setProvider(provider);
    pendingPlans.clear();
    pendingBuilds.clear();
    pendingContracts.clear();
  };
  connection.setOnChange(syncConnection);
  syncConnection();

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      const path = url.pathname;
      const requestAppId = apps.activeId;
      const readActiveBody = async () => {
        const body = await readBody(req);
        if (requestAppId !== apps.activeId)
          throw new ActiveAppChangedError('The active app changed. Reload before saving.');
        return body;
      };

      if (path.startsWith('/api/agent/chatgpt/') && !localHost) {
        json(res, 403, { error: 'ChatGPT connections are available only from this local Studio.' });
        return;
      }
      if (path.startsWith('/api/agent/') && localHost) {
        res.setHeader('Cache-Control', 'no-store');
        const expectedHost = server.address();
        const port =
          typeof expectedHost === 'object' && expectedHost ? expectedHost.port : opts.port;
        const hosts = [`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`];
        const origin = req.headers.origin;
        if (
          !hosts.includes(req.headers.host ?? '') ||
          (origin && !hosts.some((host) => origin === `http://${host}`)) ||
          req.headers['sec-fetch-site'] === 'cross-site'
        ) {
          json(res, 403, {
            error: 'ChatGPT connections are available only from this local Studio.',
          });
          return;
        }
        if (req.method !== 'GET' && !req.headers['content-type']?.startsWith('application/json')) {
          json(res, 415, { error: 'Use a JSON request for AI actions.' });
          return;
        }
      }
      if (path.startsWith('/api/agent/chatgpt/')) {
        if (req.method === 'GET' && path.endsWith('/status')) {
          json(res, 200, connection.status());
          return;
        }
        if (req.method === 'GET' && path.endsWith('/models')) {
          json(res, 200, await connection.models());
          return;
        }
        if (req.method !== 'POST' || !req.headers['content-type']?.startsWith('application/json')) {
          json(res, 405, { error: 'Use a JSON POST for connection changes.' });
          return;
        }
        const body = JSON.parse((await readBody(req)) || '{}') as { id?: string; model?: string };
        if (path.endsWith('/login')) {
          json(res, 200, await connection.start(body.id));
          return;
        }
        if (path.endsWith('/cancel')) connection.cancel();
        else if (path.endsWith('/select') && typeof body.id === 'string')
          await connection.select(body.id);
        else if (path.endsWith('/model') && typeof body.model === 'string')
          await connection.selectModel(body.model);
        else if (path.endsWith('/signout') && typeof body.id === 'string')
          await connection.signOut(body.id);
        else if (path.endsWith('/welcome')) await connection.acknowledgeWelcome();
        else {
          json(res, 400, { error: 'Unknown ChatGPT connection action.' });
          return;
        }
        syncConnection();
        json(res, 200, connection.status());
        return;
      }

      // --- App library --------------------------------------------------------
      const appMatch = path.match(/^\/api\/apps\/([a-zA-Z0-9-]+)(?:\/(activate|restore))?$/);
      if (path === '/api/apps' && req.method === 'GET') {
        json(res, 200, apps.list());
        return;
      }
      const activateProject = () => {
        project = structuredClone(apps.project);
        gateway = new AgentGateway<BuilderProject>(provider, { registry }, operationLog());
        pendingPlans.clear();
        pendingBuilds.clear();
        lastAgentFingerprint = null;
        saveProject();
      };
      if (path === '/api/apps' && req.method === 'POST') {
        try {
          const body = JSON.parse(await readBody(req)) as { project: StoredBuilderProject };
          if (body.project?.version !== 1 || !Array.isArray(body.project.touched))
            throw new Error('Invalid app project.');
          const inputGraph = structuredClone(body.project.graph);
          body.project.graph = legacyGraph(body.project.graph);
          validateProjectGraph(body.project.graph);
          verifyGraph(inputGraph, Boolean(body.project.graph.app.cloud));
          apps.create({ ...body.project, graph: inputGraph });
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
      if (path === '/api/operations' && req.method === 'GET') {
        json(res, 200, { project, ...operationLog().state, entries: operationLog().entries });
        return;
      }
      if (path === '/api/operations' && req.method === 'POST') {
        const body = JSON.parse(await readActiveBody()) as {
          revision: number;
          operations: ProjectOperation[];
        };
        if (body.revision !== operationLog().state.revision) {
          json(res, 409, { error: 'Project changed. Reload before applying operations.' });
          return;
        }
        try {
          if (!Array.isArray(body.operations)) throw new Error('Operations must be an array');
          operationLog().apply(project, body.operations, 'ui');
          json(res, 200, { project, history: operationLog().state });
        } catch (error) {
          json(res, 400, { error: error instanceof Error ? error.message : String(error) });
        }
        return;
      }
      if (
        (path === '/api/operations/undo' || path === '/api/operations/redo') &&
        req.method === 'POST'
      ) {
        const body = JSON.parse(await readActiveBody()) as { revision: number };
        if (body.revision !== operationLog().state.revision) {
          json(res, 409, { error: 'Project changed. Reload before undo or redo.' });
          return;
        }
        const next = operationLog().travel(path.endsWith('/undo') ? 'undo' : 'redo', project);
        if (!next) {
          json(res, 400, { error: 'Nothing to undo or redo' });
          return;
        }
        json(res, 200, { project, history: operationLog().state });
        return;
      }
      if (path === '/api/project' && req.method === 'GET') {
        json(res, 200, project);
        return;
      }
      if (path === '/api/project' && req.method === 'PUT') {
        const body = JSON.parse(await readActiveBody()) as StoredBuilderProject;
        const inputGraph = structuredClone(body.graph);
        try {
          if (body.version !== 1 || !Array.isArray(body.touched))
            throw new Error('Invalid builder project contract.');
          body.graph = legacyGraph(body.graph);
          validateProjectGraph(body.graph);
          compileWebProject(inputGraph, registry);
          if (
            !body.graph.app.cloud &&
            (inputGraph.schemaVersion === '0' ||
              inputGraph.app.targets.some((target) => target !== 'web'))
          )
            compileProject(inputGraph, registry);
        } catch (e) {
          json(res, 400, { ok: false, error: e instanceof Error ? e.message : String(e) });
          return;
        }
        const next: BuilderProject = {
          version: 1,
          profile: body.profile ?? null,
          touched: [...(body.touched ?? [])].sort(),
          graph: legacyGraph(body.graph),
        };
        next.graph.app.dataId = apps.activeId;
        const operations =
          inputGraph.schemaVersion === '1'
            ? diffProjectOperations(apps.storedProject, {
                ...next,
                graph: { ...inputGraph, app: { ...inputGraph.app, dataId: apps.activeId } },
              })
            : diffProjectOperations(project, next);
        operationLog().apply(project, operations, 'import');
        json(res, 200, { ok: true });
        return;
      }
      if (path === '/api/profile' && req.method === 'PUT') {
        const body = JSON.parse(await readActiveBody()) as { profile: BuilderProfile };
        const errors = validateProfile(body.profile ?? {});
        if (errors.length > 0) {
          json(res, 400, { ok: false, errors });
          return;
        }
        operationLog().apply(project, [{ type: 'setProfile', profile: body.profile }], 'profile');
        json(res, 200, { ok: true });
        return;
      }
      if (path === '/api/cascade' && req.method === 'POST') {
        const next = structuredClone(project);
        const result = applyCascade(next);
        operationLog().apply(project, diffProjectOperations(project, next), 'profile');
        json(res, 200, { ok: true, ...result, project });
        return;
      }
      if (path === '/api/touch' && req.method === 'POST') {
        const body = JSON.parse(await readActiveBody()) as { path: string };
        if (typeof body.path !== 'string' || !body.path) {
          json(res, 400, { ok: false, error: 'path is required' });
          return;
        }
        const next = structuredClone(project);
        markTouched(next, body.path);
        operationLog().apply(project, diffProjectOperations(project, next), 'ui');
        json(res, 200, { ok: true, touched: project.touched });
        return;
      }
      if (path === '/api/compile' && req.method === 'POST') {
        const target = exportTarget(url);
        const result =
          target === 'workspace'
            ? compileWorkspace(apps.storedProject.graph, registry)
            : target === 'web'
              ? compileWebProject(apps.storedProject.graph, registry)
              : compileProject(apps.storedProject.graph, registry);
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
          apps.storedProject.graph,
          tmpZip,
          exportTarget(url),
          registry,
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
        json(
          res,
          200,
          registry
            .entries()
            .map((e) => generateCard(e.manifest, e.experimental?.summary))
            .sort((a, b) => (a.block < b.block ? -1 : 1)),
        );
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
              ...unwrapSampleConfig(
                e.experimental?.sampleConfig ?? loadSampleConfig(e.manifest.id),
              ),
            },
            ports: e.manifest.ports,
            ...(e.experimental ? { experimental: true } : {}),
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
        const revision = connectionRevision;
        const activeProvider = provider;
        const activeLiveModel = usingLiveModel;
        const result = await gateway.plan(planProject, instruction, scope);
        if (
          apps.activeId !== planAppId ||
          fingerprint() !== planHash ||
          revision !== connectionRevision
        ) {
          json(res, 409, { error: 'App or AI connection changed while planning. Plan again.' });
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
        const body = JSON.parse(await readActiveBody()) as { planId?: string };
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
          json(res, 200, { ok: true, applied, usage: gateway.usageLog.slice(-1) });
        } catch (e) {
          json(res, 400, { ok: false, errors: [e instanceof Error ? e.message : String(e)] });
        }
        return;
      }
      if (path === '/api/agent/build' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req)) as { request?: string; mode?: string };
        const request = (body.request ?? '').toString().slice(0, 2000);
        const mode: BuildMode = body.mode === 'extend' ? 'extend' : 'new';
        if (!request.trim()) {
          json(res, 400, { ok: false, errors: ['request is required'] });
          return;
        }
        const planAppId = apps.activeId;
        const planHash = fingerprint();
        const revision = connectionRevision;
        const activeProvider = provider;
        const result = await appBuilder.build(structuredClone(project), request, mode);
        if (
          apps.activeId !== planAppId ||
          fingerprint() !== planHash ||
          revision !== connectionRevision
        ) {
          json(res, 409, { error: 'App or AI connection changed while planning. Plan again.' });
          return;
        }
        const reply = {
          ok: result.ok,
          source: result.source,
          errors: result.errors,
          warnings: result.warnings,
          missing: result.missing,
          coverage: result.coverage,
          rationale: result.blueprint?.rationale,
          attempts: result.attempts,
          usage: result.usage,
          provider: activeProvider.name,
          liveModel: activeProvider.name !== 'recorded',
        };
        const { graph, operations, blueprint } = result;
        if (!result.ok || !graph || !operations || !blueprint) {
          json(res, 200, reply);
          return;
        }
        const planId = `build-${++planSeq}`;
        pendingBuilds.set(planId, {
          request,
          mode,
          key: result.recipeKey!,
          blueprint,
          graph,
          operations,
          projectHash: planHash,
          appId: planAppId,
        });
        json(res, 200, {
          ...reply,
          planId,
          mode,
          appName: graph.app.name,
          pages: graph.screens.map((screen) => ({
            id: screen.id,
            title: screen.title,
            blocks: (screen.blocks ?? [screen.block]).map(
              (id) => graph.blocks.find((block) => block.id === id)?.type ?? id,
            ),
          })),
          operations: operations.length,
        });
        return;
      }
      if (path === '/api/agent/build/apply' && req.method === 'POST') {
        const body = JSON.parse(await readActiveBody()) as { planId?: string };
        const pending = body.planId ? pendingBuilds.get(body.planId) : undefined;
        if (!pending) {
          json(res, 400, { ok: false, errors: ['unknown or expired planId'] });
          return;
        }
        pendingBuilds.delete(body.planId as string);
        if (fingerprint() !== pending.projectHash || pending.appId !== apps.activeId) {
          json(res, 409, {
            ok: false,
            errors: ['project changed since the build was planned; plan it again'],
          });
          return;
        }
        try {
          if (pending.mode === 'extend') {
            project = gateway.applyOperations(project, pending.operations);
            lastAgentFingerprint = fingerprint();
          } else {
            // A new app goes into the library like "Create app"; the current app is untouched.
            verifyGraph(pending.graph, false);
            apps.create(emptyProject(pending.graph));
            activateProject();
          }
          appBuilder.remember(pending.key, pending.request, pending.mode, pending.blueprint);
          if (recipesPath) {
            mkdirSync(dirname(recipesPath), { recursive: true });
            writeFileSync(recipesPath, JSON.stringify(appBuilder.recipes, null, 2) + '\n');
          }
          json(res, 200, { ok: true, mode: pending.mode, ...apps.list(), project });
        } catch (e) {
          json(res, 400, { ok: false, errors: [e instanceof Error ? e.message : String(e)] });
        }
        return;
      }
      if (path.startsWith('/api/agent/blocks') && !localHost) {
        // Authoring runs generated template code in this process (no sandbox yet; ADR 0014).
        json(res, 403, { error: 'Block authoring is available only from this local Studio.' });
        return;
      }
      if (path === '/api/agent/blocks' && req.method === 'GET') {
        json(res, 200, { blocks: blockAuthor.list() });
        return;
      }
      if (path === '/api/agent/blocks/draft' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req)) as {
          capability?: string;
          proposedBlock?: string;
          reason?: string;
        };
        const capability = (body.capability ?? '').toString().slice(0, 300);
        if (!capability.trim()) {
          json(res, 400, { ok: false, errors: ['capability is required'] });
          return;
        }
        const revision = connectionRevision;
        const activeProvider = provider;
        const result = await blockAuthor.draftContract({
          capability,
          ...(body.proposedBlock ? { proposedBlock: String(body.proposedBlock).slice(0, 80) } : {}),
          ...(body.reason ? { reason: String(body.reason).slice(0, 500) } : {}),
        });
        if (revision !== connectionRevision) {
          json(res, 409, { error: 'AI connection changed while drafting. Draft again.' });
          return;
        }
        const reply = {
          ok: result.ok,
          errors: result.errors,
          attempts: result.attempts,
          usage: result.usage,
          provider: activeProvider.name,
          liveModel: activeProvider.name !== 'recorded',
        };
        if (!result.ok || !result.contract) {
          json(res, 200, reply);
          return;
        }
        const contractId = `block-${++planSeq}`;
        pendingContracts.set(contractId, result.contract);
        json(res, 200, { ...reply, contractId, contract: result.contract, card: result.card });
        return;
      }
      if (path === '/api/agent/blocks/implement' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req)) as { contractId?: string };
        const pending = body.contractId ? pendingContracts.get(body.contractId) : undefined;
        if (!pending) {
          json(res, 400, { ok: false, errors: ['unknown or expired contractId'] });
          return;
        }
        pendingContracts.delete(body.contractId as string);
        const activeProvider = provider;
        const result = await blockAuthor.implement(pending);
        json(res, 200, {
          ok: result.ok,
          block: result.block,
          checks: result.checks,
          errors: result.errors,
          attempts: result.attempts,
          usage: result.usage,
          provider: activeProvider.name,
          liveModel: activeProvider.name !== 'recorded',
        });
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
        const compiled = compileWebProject(apps.storedProject.graph, registry);
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
      json(
        res,
        err instanceof ActiveAppChangedError ? 409 : err instanceof SyntaxError ? 400 : 500,
        {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        },
      );
    }
  });
  server.on('close', () => connection.close());
  process.once('exit', () => connection.close());

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
  for (const file of compiled.files.filter((f) => f.path.startsWith('src/'))) {
    const destination = join(cacheDir, file.path.slice(4));
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, file.content);
  }
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
