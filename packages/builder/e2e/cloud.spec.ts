import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const graph = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '../../../examples/paper-cloud/graph.json'), 'utf8'),
);

test.beforeEach(async ({ request }) => {
  const response = await request.post('/api/apps', {
    data: { project: { version: 1, profile: null, touched: [], graph } },
  });
  expect(response.ok()).toBe(true);
});

test('creates a reusable cloud template with all service blocks and guards native export', async ({
  page,
  request,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Switch apps', exact: true }).click();
  await page.getByRole('button', { name: 'Create app', exact: true }).click();
  await page.getByRole('radio', { name: /^Cloud notes/ }).check();
  await page.getByLabel('New app name').fill('Cloud contract test');
  await page.getByRole('button', { name: 'Create cloud notes app', exact: true }).click();
  await expect(page.getByLabel('Page title')).toHaveValue('All notes');
  const project = await (await request.get('/api/project')).json();
  expect(project.graph.app.cloud.provider).toBe('supabase');
  for (const type of [
    'auth.account',
    'onboarding.profile',
    'billing.plans',
    'account.settings',
    'billing.review',
  ]) {
    expect(
      project.graph.blocks.some((block: { type: string }) => block.type.startsWith(type + '@')),
    ).toBe(true);
  }
  await page.getByRole('button', { name: 'Export app', exact: true }).click();
  await expect(page.getByRole('button', { name: /Mobile application/ })).toBeDisabled();
  const exported = await request.post('/api/export/zip?target=web');
  expect(exported.ok()).toBe(true);
  expect(exported.headers()['content-type']).toContain('zip');
});

test('fails closed when its cloud service is unavailable', async ({ page }) => {
  await page.route('http://127.0.0.1:8787/api/cloud/**', (route) => route.abort());
  await page.goto('/api/run');
  await expect(page.getByRole('heading', { name: 'Cloud connection required' })).toBeVisible();
  await expect(page.getByRole('button', { name: '＋ New note', exact: true })).toHaveCount(0);
});

test('lets the designer inspect owner controls without provider access or payment grants', async ({
  page,
}) => {
  let requests = 0;
  await page.route('http://127.0.0.1:8787/api/cloud/**', (route) => {
    requests++;
    return route.abort();
  });
  await page.goto('/api/run?block=owner&embedded=1');
  await expect(page.getByRole('heading', { name: 'Payment verification' })).toBeVisible();
  await expect(page.getByText(/Canvas example only/)).toBeVisible();
  await page
    .getByLabel('I checked the bank receipt and matched the reference, recipient, and amount.')
    .check();
  await page.getByLabel('Review note', { exact: true }).fill('Designer preview');
  await expect(page.getByRole('button', { name: 'Approve verified payment' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Reject claim' })).toBeDisabled();
  expect(requests).toBe(0);
});

test('uses individual block designs on automatic login gates and switches signup mode', async ({
  page,
  request,
}) => {
  const customized = structuredClone(graph);
  customized.blocks.find((block: { id: string }) => block.id === 'auth').design = {
    elements: { button: { x: 12, y: 9, backgroundColor: '#123456' } },
  };
  expect(
    (
      await request.post('/api/apps', {
        data: { project: { version: 1, profile: null, touched: [], graph: customized } },
      })
    ).ok(),
  ).toBe(true);
  // UI contract fixtures only; real provider login/database checks are recorded separately.
  await page.route('http://127.0.0.1:8787/api/cloud/**', async (route) => {
    await route.fulfill({
      json: route.request().url().endsWith('/config')
        ? { upiId: '9480106354@slc', accessDays: 30, plans: [] }
        : { user: null, profile: null, plan: 'free', owner: false },
    });
  });
  await page.goto('/api/run');
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toHaveCSS(
    'transform',
    'matrix(1, 0, 0, 1, 12, 9)',
  );
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toHaveCSS(
    'background-color',
    'rgb(18, 52, 86)',
  );
  await page.getByRole('button', { name: 'Create an account', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Create account', exact: true })).toBeVisible();
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('minlength', '12');
});
