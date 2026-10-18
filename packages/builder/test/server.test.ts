import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { request as httpRequest } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
// Workspace block registry shared by the restart check in the block-author test.
const blocksDir = mkdtempSync(join(tmpdir(), 'blockfw-server-blocks-'));
const connection = new ChatGPTConnection({
  vault: { read: () => undefined, write: () => undefined, close: () => undefined },
  fetch: async () => {
    throw new Error('Server API tests must not call live AI services.');
  },
});

beforeAll(async () => {
  // Ephemeral port; no project file (uses the bundled example graph).
  vi.stubEnv('BLOCKFW_LLM_PROVIDER', 'recorded');
  base = await startCanvasServer({
    port: 0,
    host: '127.0.0.1',
    chatgpt: connection,
    blocksDir,
  });
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

  it(
    'builds a new library app from a prompt and replays the approved build as a recipe',
    { timeout: 30_000 },
    async () => {
      const catalog = (await api<{ activeId: string }>('GET', '/api/apps')).json;
      const original = (await api<BuilderProject>('GET', '/api/project')).json;
      type Planned = {
        ok: boolean;
        planId: string;
        source: string;
        usage: unknown[];
        pages: Array<{ id: string; blocks: string[] }>;
        missing: Array<{ capability: string }>;
      };
      const planned = (
        await api<Planned>('POST', '/api/agent/build', { request: 'A book club app' })
      ).json;
      expect(planned.ok).toBe(true);
      expect(planned.source).toBe('model');
      expect(planned.pages.map((page) => page.id)).toEqual(['welcome', 'books', 'book', 'notes']);
      expect(planned.missing[0]?.capability).toBe('Live discussion chat');
      // Planning changes nothing until the build is approved.
      expect((await api<BuilderProject>('GET', '/api/project')).json).toEqual(original);

      const applied = await api<{ activeId: string; project: BuilderProject }>(
        'POST',
        '/api/agent/build/apply',
        { planId: planned.planId },
      );
      expect(applied.status).toBe(200);
      expect(applied.json.activeId).not.toBe(catalog.activeId);
      expect(applied.json.project.graph.app.name).toBe('Book Club');
      expect((await api<{ ok: boolean }>('POST', '/api/compile?target=web')).json.ok).toBe(true);

      const replay = (
        await api<Planned>('POST', '/api/agent/build', { request: 'a book club app.' })
      ).json;
      expect(replay.source).toBe('recipe');
      expect(replay.usage).toEqual([]);

      await api('POST', '/api/apps/' + catalog.activeId + '/activate');
      await api('DELETE', '/api/apps/' + applied.json.activeId);
      expect((await api<BuilderProject>('GET', '/api/project')).json).toEqual(original);
    },
  );

  it(
    'authors a missing block after contract review and offers it to the next build',
    { timeout: 30_000 },
    async () => {
      const blockIds = async () =>
        (await api<Array<{ id: string }>>('GET', '/api/blocks')).json.map((block) => block.id);
      expect((await api('POST', '/api/agent/blocks/draft', {})).status).toBe(400);
      type Drafted = {
        ok: boolean;
        contractId: string;
        contract: { manifest: { id: string; editSurface: string[] } };
        card: { markdown: string };
      };
      const drafted = (
        await api<Drafted>('POST', '/api/agent/blocks/draft', {
          capability: 'Live discussion chat',
          proposedBlock: 'chat.thread',
          reason: 'No chat or realtime block exists in the library yet.',
        })
      ).json;
      expect(drafted.ok).toBe(true);
      expect(drafted.contract.manifest.id).toBe('chat.thread');
      expect(drafted.contract.manifest.editSurface).toContain('config.messages');
      expect(drafted.card.markdown).toContain('# chat.thread@1.0.0');
      // The contract is only a proposal until it is approved.
      expect(await blockIds()).not.toContain('chat.thread@1.0.0');

      type Implemented = {
        ok: boolean;
        block: string;
        checks: Array<{ name: string; ok: boolean }>;
      };
      const implemented = await api<Implemented>('POST', '/api/agent/blocks/implement', {
        contractId: drafted.contractId,
      });
      expect(implemented.status).toBe(200);
      expect(implemented.json.ok).toBe(true);
      expect(implemented.json.block).toBe('chat.thread@1.0.0');
      expect(implemented.json.checks.map((check) => [check.name, check.ok])).toEqual([
        ['manifest', true],
        ['sdk test', true],
        ['sdk validate', true],
        ['compile', true],
      ]);
      const reused = await api<{ errors: string[] }>('POST', '/api/agent/blocks/implement', {
        contractId: drafted.contractId,
      });
      expect(reused.status).toBe(400);

      const blocks = (
        await api<Array<{ id: string; experimental?: boolean; defaultConfig: object }>>(
          'GET',
          '/api/blocks',
        )
      ).json;
      const thread = blocks.find((block) => block.id === 'chat.thread@1.0.0');
      expect(thread?.experimental).toBe(true);
      expect(thread?.defaultConfig).toHaveProperty('messages');
      const cards = (await api<Array<{ block: string; markdown: string }>>('GET', '/api/cards'))
        .json;
      expect(cards.find((card) => card.block === 'chat.thread@1.0.0')?.markdown).toContain(
        'Message thread',
      );
      expect(
        (await api<{ blocks: Array<{ id: string }> }>('GET', '/api/agent/blocks')).json.blocks,
      ).toEqual([expect.objectContaining({ id: 'chat.thread' })]);

      // Apps can use the block and Studio exports them with it.
      const original = (await api<BuilderProject>('GET', '/api/project')).json;
      const withThread = structuredClone(original);
      withThread.graph.blocks.push({
        id: 'talk',
        type: 'chat.thread@1.0.0',
        config: { messages: [{ author: 'Asha', text: 'Hello' }] },
      });
      withThread.graph.screens.push({
        id: 'discussion',
        title: 'Discussion',
        block: 'talk',
        position: { x: 0, y: 0 },
      });
      expect((await api('PUT', '/api/project', withThread)).status).toBe(200);
      const zip = await fetch(`${base}/api/export/zip?target=web`, { method: 'POST' });
      expect(zip.status).toBe(200);
      expect(zip.headers.get('content-type')).toBe('application/zip');
      expect((await api('PUT', '/api/project', original)).status).toBe(200);

      // Saved blocks load again the next time Studio starts.
      const restarted = await startCanvasServer({
        port: 0,
        host: '127.0.0.1',
        chatgpt: connection,
        blocksDir,
      });
      const reloaded = (await (await fetch(`${restarted}/api/blocks`)).json()) as Array<{
        id: string;
        experimental?: boolean;
      }>;
      expect(reloaded.find((block) => block.id === 'chat.thread@1.0.0')?.experimental).toBe(true);
    },
  );
});
