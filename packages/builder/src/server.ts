import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { compileProject } from '@blockfw/compiler';
import { loadDefaultRegistry } from '@blockfw/blocks';
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

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

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
    // Default: the full 8-block example as a project.
    const example = resolve(here, '../../../examples/full-app/graph.json');
    const graph = JSON.parse(readFileSync(example, 'utf8'));
    project = emptyProject(graph);
  }
  validateProjectGraph(project.graph);

  const saveProject = () => {
    if (opts.projectPath) {
      mkdirSync(dirname(resolve(opts.projectPath)), { recursive: true });
      writeFileSync(resolve(opts.projectPath), JSON.stringify(project, null, 2) + '\n');
    }
  };

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      const path = url.pathname;

      // --- API ---------------------------------------------------------------
      if (path === '/api/project' && req.method === 'GET') {
        json(res, 200, project);
        return;
      }
      if (path === '/api/project' && req.method === 'PUT') {
        const body = JSON.parse(await readBody(req)) as BuilderProject;
        validateProjectGraph(body.graph);
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
        const result = compileProject(project.graph, registry);
        json(res, 200, {
          ok: true,
          projectHash: result.projectHash,
          files: result.files.map((f) => f.path),
          wiring: result.wiring.report,
        });
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
          })),
        );
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
      json(res, 500, { ok: false, error: err instanceof Error ? err.message : String(err) });
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
  const React = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');

  const cacheDir = resolve(here, '../../../.builder-cache');
  mkdirSync(cacheDir, { recursive: true });
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
  delete require.cache[outFile];
  const mod = require(outFile) as Record<string, unknown>;
  const componentName = Object.keys(mod).find((k) => /Block$/.test(k));
  if (!componentName) throw new Error(`No block component exported for ${instanceId}`);
  const Component = mod[componentName] as (props: Record<string, unknown>) => unknown;
  // Blocks with input props render their fallback content without input.
  const html = renderToStaticMarkup(
    (React as typeof import('react')).createElement(Component as never, {
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
