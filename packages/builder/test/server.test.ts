import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startCanvasServer } from '@blockfw/builder';

let base = '';

beforeAll(async () => {
  // Ephemeral port; no project file (uses the bundled example graph).
  base = await startCanvasServer({ port: 0, host: '127.0.0.1' });
});

afterAll(() => {
  // The server keeps the process alive; vitest will tear it down.
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
  it('serves the project', async () => {
    const { status, json } = await api<{ graph: { screens: unknown[] } }>('GET', '/api/project');
    expect(status).toBe(200);
    expect(json.graph.screens.length).toBe(8);
  });

  it('lists blocks and cards', async () => {
    const blocks = await api<Array<{ id: string }>>('GET', '/api/blocks');
    expect(blocks.json).toHaveLength(8);
    const cards = await api<Array<{ block: string; estimatedTokens: number }>>('GET', '/api/cards');
    expect(cards.json).toHaveLength(8);
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
});
