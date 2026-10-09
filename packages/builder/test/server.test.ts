import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { request as httpRequest } from 'node:http';
import { startCanvasServer } from '@blockfw/builder';
import type { BuilderProject } from '@blockfw/builder';
import {
  diffProjectOperations,
  migrateGraph,
  type OperationEntry,
  type ProjectOperation,
} from '@blockfw/manifest';
import { ChatGPTConnection } from '../src/chatgpt.js';

let base = '';
const connection = new ChatGPTConnection({
  vault: { read: () => undefined, write: () => undefined, close: () => undefined },
  fetch: async () => {
    throw new Error('Server API tests must not call live AI services.');
  },
});

beforeAll(async () => {
  // Ephemeral port; no project file (uses the bundled example graph).
  vi.stubEnv('BLOCKFW_LLM_PROVIDER', 'recorded');
  base = await startCanvasServer({ port: 0, host: '127.0.0.1', chatgpt: connection });
});

afterAll(() => {
  connection.close();
  vi.unstubAllEnvs();
});

async function api<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; json: T }> {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json()) as T };
}

describe('canvas server API', () => {
  it(
    'compiles declared platforms as a workspace and rejects unknown export targets',
    { timeout: 20_000 },
    async () => {
      const result = await api<{ ok: boolean; files: string[] }>(
        'POST',
        '/api/compile?target=workspace',
      );
      expect(result.json.ok).toBe(true);
      expect(result.json.files).toContain('apps/web/src/main.tsx');
      expect(result.json.files).toContain('apps/mobile/App.tsx');
      expect(result.json.files).toContain('pnpm-workspace.yaml');
      for (const path of ['/api/compile', '/api/export/zip']) {
        const denied = await api<{ error: string }>('POST', path + '?target=unknown');
        expect(denied.status).toBe(400);
        expect(denied.json.error).toContain('Export target must be');
      }
    },
  );
  it('compiles the canonical target declarations rather than the editor compatibility view', async () => {
    const original = (await api<BuilderProject>('GET', '/api/project')).json;
    const originalId = (await api<{ activeId: string }>('GET', '/api/apps')).json.activeId;
    const graph = migrateGraph(original.graph);
    graph.app.targets = ['web'];
    const created = await api<{ activeId: string }>('POST', '/api/apps', {
      project: { ...original, graph },
    });
    expect(created.status).toBe(201);
    try {
      expect((await api('POST', '/api/compile?target=web')).status).toBe(200);
      const native = await api<{ error: string }>('POST', '/api/compile?target=mobile');
      expect(native.status).not.toBe(200);
      expect(native.json.error).toContain('Native target is not declared');
      const exported = await api<{ error: string }>('POST', '/api/export/zip?target=mobile');
      expect(exported.status).not.toBe(200);
      expect(exported.json.error).toContain('Native target is not declared');
    } finally {
      await api('POST', '/api/apps/' + originalId + '/activate');
    }
  });
  it('rejects a partially received operation request when the active app changes while reading its body', async () => {
    const original = (await api<BuilderProject>('GET', '/api/project')).json;
    const originalId = (await api<{ activeId: string }>('GET', '/api/apps')).json.activeId;
    const created = (await api<{ activeId: string }>('POST', '/api/apps', { project: original }))
      .json;
    await api('POST', '/api/apps/' + originalId + '/activate');
    const revision = (await api<{ revision: number }>('GET', '/api/operations')).json.revision;
    const body = JSON.stringify({
      revision,
      operations: [{ type: 'setTouched', touched: ['app.name'] }],
    });
    let pending!: ReturnType<typeof httpRequest>;
    const response = new Promise<number>((resolveResponse, reject) => {
      pending = httpRequest(
        base + '/api/operations',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
            'X-Block-App-Id': originalId,
          },
        },
        (res) => {
          res.resume();
          resolveResponse(res.statusCode!);
        },
      );
      pending.on('error', reject);
      pending.write(body.slice(0, 1));
    });
    try {
      await api('POST', '/api/apps/' + created.activeId + '/activate');
      pending.end(body.slice(1));
      expect(await response).toBe(409);
      expect((await api<BuilderProject>('GET', '/api/project')).json.touched).toEqual(
        original.touched,
      );
    } finally {
      pending.destroy();
      await api('POST', '/api/apps/' + originalId + '/activate');
    }
  });
  it('uses one operation log for accepted writes, rejects stale revisions, and preserves state after failed operations', async () => {
    type History = {
      project: BuilderProject;
      undo: number;
      redo: number;
      revision: number;
      entries: OperationEntry[];
    };
    const before = (await api<History>('GET', '/api/operations')).json;
    const changed = structuredClone(before.project);
    changed.graph.app.name = 'Operation API';
    const operations = diffProjectOperations(before.project, changed);
    expect(
      (await api('POST', '/api/operations', { revision: before.revision, operations })).status,
    ).toBe(200);
    const accepted = (await api<History>('GET', '/api/operations')).json;
    expect(accepted.project.graph.app.name).toBe('Operation API');
    expect(accepted.entries.at(-1)?.source).toBe('ui');
    expect(accepted.undo).toBe(before.undo + 1);
    expect(
      (await api('POST', '/api/operations', { revision: before.revision, operations })).status,
    ).toBe(409);
    const invalid: ProjectOperation[] = [
      { type: 'removeComponent', id: changed.graph.screens[0]!.block },
    ];
    expect(
      (await api('POST', '/api/operations', { revision: accepted.revision, operations: invalid }))
        .status,
    ).toBe(400);
    expect((await api<History>('GET', '/api/operations')).json).toEqual(accepted);
    expect(
      (await api('POST', '/api/operations/undo', { revision: accepted.revision })).status,
    ).toBe(200);
    const undone = (await api<History>('GET', '/api/operations')).json;
    expect(undone.project).toEqual(before.project);
    expect((await api('POST', '/api/operations/redo', { revision: undone.revision })).status).toBe(
      200,
    );
    const redone = (await api<History>('GET', '/api/operations')).json;
    expect(redone.project).toEqual(accepted.project);
    await api('POST', '/api/operations/undo', { revision: redone.revision });
  });
  it('keeps the record namespace stable when a project file supplies another app id', async () => {
    const catalog = (await api<{ activeId: string }>('GET', '/api/apps')).json;
    const original = (await api<BuilderProject>('GET', '/api/project')).json;
    const copied = structuredClone(original);
    copied.graph.app.dataId = 'other-app';
    expect((await api('PUT', '/api/project', copied)).status).toBe(200);
    expect((await api<BuilderProject>('GET', '/api/project')).json.graph.app.dataId).toBe(
      catalog.activeId,
    );
  });
  it('switches apps without mixing queued saves or pending agent plans and restores deleted apps', async () => {
    const catalog = (await api<{ activeId: string }>('GET', '/api/apps')).json;
    const original = (await api<BuilderProject>('GET', '/api/project')).json;
    const planned = (
      await api<{ planId: string }>('POST', '/api/agent/edit', { instruction: 'make it playful' })
    ).json;
    const other = structuredClone(original);
    other.graph.app.name = 'Independent app';
    const created = await api<{ activeId: string }>('POST', '/api/apps', { project: other });
    expect(created.status).toBe(201);
    const stale = await fetch(base + '/api/project', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Block-App-Id': catalog.activeId },
      body: JSON.stringify(original),
    });
    expect(stale.status).toBe(409);
    expect((await api<BuilderProject>('GET', '/api/project')).json.graph.app.name).toBe(
      'Independent app',
    );
    expect((await api('POST', '/api/agent/apply', { planId: planned.planId })).status).toBe(400);
    await api('POST', '/api/apps/' + catalog.activeId + '/activate');
    expect((await api<BuilderProject>('GET', '/api/project')).json).toEqual(original);
    await api('DELETE', '/api/apps/' + created.json.activeId);
    const deleted = (
      await api<{ apps: Array<{ id: string; deleted: boolean }> }>('GET', '/api/apps')
    ).json;
    expect(deleted.apps.find((a) => a.id === created.json.activeId)?.deleted).toBe(true);
    await api('POST', '/api/apps/' + created.json.activeId + '/restore');
  });
  it('serves the project', async () => {
    const { status, json } = await api<{ graph: { screens: unknown[] } }>('GET', '/api/project');
    expect(status).toBe(200);
    expect(json.graph.screens.length).toBe(8);
  });

  it('lists blocks and cards', async () => {
    const blocks = await api<Array<{ id: string }>>('GET', '/api/blocks');
    expect(blocks.status).toBe(200);
    expect(blocks.json).toHaveLength(19);
    const cards = await api<Array<{ block: string; estimatedTokens: number }>>('GET', '/api/cards');
    expect(cards.json).toHaveLength(19);
    for (const c of cards.json) expect(c.estimatedTokens).toBeLessThanOrEqual(300);
  });

  it('rejects an invalid profile', async () => {
    const { status, json } = await api<{ ok: boolean; errors: string[] }>('PUT', '/api/profile', {
      profile: { appName: '', brandColor: 'red', price: 'free' },
    });
    expect(status).toBe(400);
    expect(json.ok).toBe(false);
    expect(json.errors.length).toBeGreaterThan(0);
  });

  it('applies the cascade end to end', async () => {
    const profile = {
      appName: 'TestApp',
      audience: 'testers',
      tone: 'minimal',
      brandColor: '#123456',
      price: '1.99',
      currency: 'EUR',
    };
    const put = await api('PUT', '/api/profile', { profile });
    expect(put.status).toBe(200);
    const cascade = await api<{
      ok: boolean;
      applied: string[];
      project: { graph: { app: { name: string; theme: { primaryColor: string } } } };
    }>('POST', '/api/cascade');
    expect(cascade.json.ok).toBe(true);
    expect(cascade.json.applied.length).toBeGreaterThan(5);
    expect(cascade.json.project.graph.app.name).toBe('TestApp');
    expect(cascade.json.project.graph.app.theme.primaryColor).toBe('#123456');
  });

  it('compiles the project', async () => {
    const { json } = await api<{
      ok: boolean;
      projectHash: string;
      wiring: { resolved: unknown[] };
    }>('POST', '/api/compile');
    expect(json.ok).toBe(true);
    expect(json.projectHash).toMatch(/^[0-9a-f]{64}$/);
    expect(json.wiring.resolved.length).toBeGreaterThan(0);
  });

  it('renders a static preview', async () => {
    const res = await fetch(`${base}/api/preview/b4`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('<!DOCTYPE html>');
    expect(html.length).toBeGreaterThan(500);
  });

  it('renders every block preview without errors', async () => {
    // Regression: previews for hook-using blocks (auth, quiz, paywall,
    // settings) failed with "Cannot read properties of null (reading
    // 'useState')" because the renderer and the bundle resolved different
    // React copies. Every instance must render real HTML, not an error.
    for (const id of ['b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7', 'b8']) {
      const res = await fetch(`${base}/api/preview/${id}`);
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html, `preview ${id}`).toContain('<!DOCTYPE html>');
      expect(html, `preview ${id}`).not.toContain('"ok":false');
      expect(html.length, `preview ${id}`).toBeGreaterThan(500);
    }
  });

  it('returns 404-ish for unknown preview instances', async () => {
    const res = await fetch(`${base}/api/preview/nope`);
    expect(res.status).toBe(500);
  });

  it('only saves valid graph replacements and supplies usable palette configurations', async () => {
    const before = (await api<BuilderProject>('GET', '/api/project')).json;
    const bad = structuredClone(before);
    bad.graph.screens[0]!.block = 'missing';
    expect((await api('PUT', '/api/project', bad)).status).toBe(400);
    expect((await api<BuilderProject>('GET', '/api/project')).json).toEqual(before);
    const blocks = (
      await api<Array<{ id: string; defaultConfig: Record<string, unknown> }>>('GET', '/api/blocks')
    ).json;
    const stats = blocks.find((b) => b.id === 'stats.overview@1.0.0')!;
    expect(Array.isArray(stats.defaultConfig.stats)).toBe(true);
  });

  it('rejects AI plans made before protected-field metadata changes', async () => {
    const planned = await api<{ ok: boolean; planId: string }>('POST', '/api/agent/edit', {
      instruction: 'make it playful',
    });
    expect(planned.json.ok).toBe(true);
    const changed = (await api<BuilderProject>('GET', '/api/project')).json;
    changed.touched.push('block:b8.config.sections');
    expect((await api('PUT', '/api/project', changed)).status).toBe(200);
    expect((await api('POST', '/api/agent/apply', { planId: planned.json.planId })).status).toBe(
      409,
    );
  });

  it('reports persistent AI undo depth and protects newer manual canvas changes', async () => {
    const planned = await api<{ ok: boolean; planId: string }>('POST', '/api/agent/edit', {
      instruction: 'make it playful',
    });
    expect((await api('POST', '/api/agent/apply', { planId: planned.json.planId })).status).toBe(
      200,
    );
    expect((await api<{ undoDepth: number }>('GET', '/api/agent/usage')).json.undoDepth).toBe(1);
    const manual = (await api<BuilderProject>('GET', '/api/project')).json;
    manual.graph.screens[0]!.position = { x: 200, y: 80 };
    expect((await api('PUT', '/api/project', manual)).status).toBe(200);
    expect((await api('POST', '/api/agent/undo')).status).toBe(409);
    expect((await api<BuilderProject>('GET', '/api/project')).json).toEqual(manual);
  });
});
