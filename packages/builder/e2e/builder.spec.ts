/**
 * End-to-end browser tests for the M2 builder UI.
 *
 * Drives the real UI in headless Chromium: profile wizard, canvas reorder,
 * screen detail (config edit + variant switch), wiring overrides, and
 * compile determinism. Screenshots are captured at each step for human
 * review (e2e/screenshots/).
 *
 * The canvas server is spawned per-test-file on 127.0.0.1:5199 with a fresh
 * temp project copied from the 8-block example.
 */
import { test, expect, type Page } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PORT = 5199;
const SHOTS = join(HERE, 'screenshots');
mkdirSync(SHOTS, { recursive: true });

let server: ChildProcess | null = null;
let initialProject: unknown = null;

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`http://127.0.0.1:${PORT}${path}`, init);
  if (!res.ok) throw new Error(`API ${res.status} ${path}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as T;
}

test.beforeAll(async () => {
  // Point --project at a path that does not exist yet: the server
  // initializes it from the 8-block example.
  const projectFile = join(tmpdir(), `bf-e2e-${process.pid}.blockfw.json`);
  server = spawn('node', ['dist/bin.js', '--port', String(PORT), '--project', projectFile], {
    cwd: join(HERE, '..'),
    stdio: 'pipe',
  });
  // Wait for the server to accept connections.
  const deadline = Date.now() + 20_000;
  for (;;) {
    try {
      initialProject = await api('/api/project');
      break;
    } catch {
      if (Date.now() > deadline) throw new Error('canvas server did not start in 20s');
      await new Promise((r) => setTimeout(r, 250));
    }
  }
});

test.afterAll(async () => {
  server?.kill('SIGTERM');
  server = null;
});

// Reset to the pristine project before each test: tests must not leak
// touched paths or edits into each other (the agent correctly respects
// touched fields, so a leaked touch would shrink its scope).
test.beforeEach(async () => {
  await api('/api/project', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(initialProject),
  });
});

async function shot(page: Page, name: string) {
  await page.screenshot({ path: join(SHOTS, `${name}.png`) });
}

test('loads the canvas with lanes, screen cards and live previews', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.screen-card')).toHaveCount(8, { timeout: 15_000 });
  await expect(page.locator('.topbar')).toContainText('Block Framework');
  await expect(page.locator('.statusbar')).toContainText('zero AI calls');
  // Previews render inside iframes.
  await expect(page.locator('iframe.screen-preview').first()).toBeVisible();
  await shot(page, '01-canvas');
});

test('profile wizard: six questions configure the app', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Profile' }).click();

  await page.getByPlaceholder('HabitFlow').fill('PlayfulHabits');
  await page.getByPlaceholder('busy professionals').fill('students');
  await page.locator('.profile-wizard select').first().selectOption('playful');
  // brand color: text input next to the color picker
  await page.getByPlaceholder('#4F46E5').fill('#10B981');
  await page.getByPlaceholder('4.99').fill('2.99');
  await page.locator('.profile-wizard select').nth(1).selectOption('INR');

  await page.getByRole('button', { name: 'Save profile & apply cascade' }).click();
  await expect(page.locator('.cascade-result')).toContainText('Derived', { timeout: 10_000 });
  await expect(page.locator('.topbar')).toContainText('PlayfulHabits');
  await shot(page, '02-profile');
});

test('canvas: arrow-button reorder persists', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.screen-card')).toHaveCount(8, { timeout: 15_000 });

  const before = await api<{ graph: { screens: Array<{ id: string }> } }>('/api/project');
  const firstId = before.graph.screens[0]!.id;

  // Move the first card later.
  await page.locator('.screen-card').first().locator('button[title="Move later"]').click();
  await expect
    .poll(
      async () =>
        (await api<{ graph: { screens: Array<{ id: string }> } }>('/api/project')).graph.screens[1]!
          .id,
      { timeout: 15_000 },
    )
    .toBe(firstId);

  // Move it back.
  await page.locator('.screen-card').nth(1).locator('button[title="Move earlier"]').click();
  await expect
    .poll(
      async () =>
        (await api<{ graph: { screens: Array<{ id: string }> } }>('/api/project')).graph.screens[0]!
          .id,
      { timeout: 15_000 },
    )
    .toBe(firstId);
  await shot(page, '03-reorder');
});

test('screen detail: edit config field and switch variant', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.screen-card')).toHaveCount(8, { timeout: 15_000 });

  await page.locator('.screen-card').first().click();
  await expect(page.locator('.detail-panel')).toBeVisible({ timeout: 10_000 });
  await shot(page, '04-detail-open');

  // Switch variant via the dropdown (first select in the panel).
  const variantSelect = page.locator('.detail-panel select').first();
  const options = await variantSelect.locator('option').allTextContents();
  expect(options.length).toBeGreaterThanOrEqual(2);
  const current = await variantSelect.inputValue();
  const other = options.find((o) => o !== current)!;
  await variantSelect.selectOption(other);
  await expect
    .poll(async () => {
      const p = await api<{ graph: { blocks: Array<{ variant?: string }> } }>('/api/project');
      return p.graph.blocks[0]!.variant;
    })
    .toBe(other);

  // Edit the first text field of the RJSF config form and save.
  const textInput = page.locator('.detail-panel form input[type="text"]').first();
  await expect(textInput).toBeVisible({ timeout: 10_000 });
  await textInput.fill('E2E headline');
  await page.getByRole('button', { name: 'Save config' }).click();
  await expect(page.getByRole('button', { name: /Saved/ })).toBeVisible({ timeout: 10_000 });
  await shot(page, '05-detail-edited');

  // The edit must be recorded as touched.
  const proj = await api<{ touched: string[] }>('/api/project');
  expect(proj.touched.some((t) => t.includes('.config.'))).toBe(true);
});

test('wiring tab: add and remove a manual override', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Wiring' }).click();
  await expect(page.locator('table.wires')).toBeVisible({ timeout: 15_000 });
  await shot(page, '06-wiring');

  const proj = await api<{
    graph: { screens: Array<{ id: string }>; blocks: Array<{ id: string }> };
  }>('/api/project');
  const event = `${proj.graph.blocks[0]!.id}.done`;
  const target = proj.graph.screens[1]!.id;

  await page.getByPlaceholder('b4.home.itemSelected').fill(event);
  await page.locator('.wire-form select').selectOption(target);
  await page.getByRole('button', { name: 'Add wire' }).click();
  await expect(page.locator('.override-list')).toContainText(event, { timeout: 10_000 });

  // Remove it again.
  await page.locator('.override-list button[title="Remove override"]').click();
  await expect(page.locator('.override-list')).toHaveCount(0, { timeout: 10_000 });
});

test('compile is deterministic across UI-triggered compiles', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.screen-card')).toHaveCount(8, { timeout: 15_000 });

  const h1 = await api<{ projectHash: string }>('/api/compile', { method: 'POST' });
  // Recompile from the UI button too.
  await page.getByRole('button', { name: /Compile/ }).click();
  await expect(page.locator('.hash')).toBeVisible({ timeout: 15_000 });
  const h2 = await api<{ projectHash: string }>('/api/compile', { method: 'POST' });
  expect(h1.projectHash).toBe(h2.projectHash);
  expect(h1.projectHash).toMatch(/^[0-9a-f]{64}$/);
  await shot(page, '07-compiled');
});

test('block cards view renders eight deterministic cards', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Block cards' }).click();
  await expect(page.locator('.cards-view .block-card')).toHaveCount(8, {
    timeout: 15_000,
  });
  await shot(page, '08-cards');
});

test('agent: plan "make it playful", review diff, apply, undo', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Agent/ }).click();
  await expect(page.locator('.agent-view')).toBeVisible({ timeout: 10_000 });

  const before = await api<{
    graph: { blocks: Array<{ id: string; config: Record<string, unknown> }> };
  }>('/api/project');
  const headlineBefore = before.graph.blocks.find((b) => b.id === 'b1')!.config.headline;

  await page.getByPlaceholder('e.g. "make it playful"').fill('make it playful');
  await page.getByRole('button', { name: 'Plan edit' }).click();
  await expect(page.locator('.agent-plan')).toBeVisible({ timeout: 15_000 });
  // Recorded demo badge (no live model in CI).
  await expect(page.locator('.provider-badge.recorded')).toBeVisible();
  await expect(page.locator('.agent-plan tbody tr')).toHaveCount(5);
  await shot(page, '09-agent-plan');

  await page.getByRole('button', { name: /Apply 5 changes/ }).click();
  await expect
    .poll(
      async () => {
        const p = await api<{
          graph: { blocks: Array<{ id: string; config: Record<string, unknown> }> };
        }>('/api/project');
        return p.graph.blocks.find((b) => b.id === 'b1')!.config.headline;
      },
      { timeout: 15_000 },
    )
    .not.toBe(headlineBefore);
  await shot(page, '10-agent-applied');

  // Undo restores.
  await page.getByRole('button', { name: /Undo/ }).click();
  await expect
    .poll(
      async () => {
        const p = await api<{
          graph: { blocks: Array<{ id: string; config: Record<string, unknown> }> };
        }>('/api/project');
        return p.graph.blocks.find((b) => b.id === 'b1')!.config.headline;
      },
      { timeout: 15_000 },
    )
    .toBe(headlineBefore);
});
