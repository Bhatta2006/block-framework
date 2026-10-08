import { test, expect } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const graph = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '../../../examples/notes/graph.json'), 'utf8'),
);
const proof = resolve(import.meta.dirname, '../../../.builder-cache/proof');
mkdirSync(proof, { recursive: true });
test.beforeEach(async ({ request }) => {
  const response = await request.post('/api/apps', {
    data: { project: { version: 1, profile: null, touched: [], graph } },
  });
  expect(response.ok()).toBe(true);
});

test('builds the notes template entirely through Studio and exposes its shared collection controls', async ({
  page,
  request,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Switch apps', exact: true }).click();
  await page.getByRole('button', { name: 'Create app', exact: true }).click();
  await page.getByLabel('App template').selectOption('notes');
  await page.getByLabel('New app name').fill('Paper');
  await page.getByRole('button', { name: 'Create notes app', exact: true }).click();
  await expect(page.getByLabel('Page title')).toHaveValue('All notes');
  await expect(
    page.getByRole('button', { name: 'Add Record collection', exact: true }),
  ).toBeVisible();
  await page.locator('.react-flow__node[data-id="collection"] .node-head').click();
  await expect(page.locator('#root_collectionKey')).toHaveValue('notes');
  const saved = await (await request.get('/api/project')).json();
  expect(saved.graph.screens).toHaveLength(5);
  expect(saved.graph.app.dataId).toBeTruthy();
  expect(saved.graph.screens.find((p: { id: string }) => p.id === 'editor').navigation).toBe(false);
  await page.getByRole('button', { name: '05 Edit note', exact: true }).click();
  await expect(page.getByLabel('Show page in app navigation')).not.toBeChecked();
  await page.getByLabel('Show page in app navigation').check();
  await expect
    .poll(
      async () =>
        (await (await request.get('/api/project')).json()).graph.screens.find(
          (p: { id: string }) => p.id === 'editor',
        ).navigation,
    )
    .toBe(true);
});

test('creates, edits, previews a checklist, and reloads the same note without losing data', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/api/run');
  await page.getByRole('button', { name: '＋ New note', exact: true }).click();
  await page.getByLabel('Note title').fill('Build something worth keeping');
  await page
    .getByLabel('Note body')
    .fill(
      '# A small beginning\n\n**One useful idea**, made with care.\n\n- [ ] Test the complete flow\n- [ ] Make room for what comes next',
    );
  await page.getByLabel('Note folder').selectOption('Work');
  await page.getByLabel('Note tags').fill('studio, ideas');
  await page.getByRole('button', { name: '☆ Favorite', exact: true }).click();
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'A small beginning' })).toBeVisible();
  await expect(page.locator('strong')).toHaveText('One useful idea');
  await page.getByRole('checkbox', { name: 'Test the complete flow' }).check();
  await page.screenshot({ path: resolve(proof, 'notes-editor.png'), fullPage: true });
  await page.reload();
  await expect(page.getByLabel('Note title')).toHaveValue('Build something worth keeping');
  await expect(page.getByLabel('Note body')).toHaveValue(/- \[x\] Test the complete flow/);
  await expect(page.getByLabel('Note folder')).toHaveValue('Work');
  await expect(page.getByRole('button', { name: '★ Favorited', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Build something worth keeping' })).toBeVisible();
  await page.screenshot({ path: resolve(proof, 'notes-app.png'), fullPage: true });
  expect(errors).toEqual([]);
});

test('search, favorites, pin, archive, trash, restore, and permanent delete operate on real records', async ({
  page,
}) => {
  await page.goto('/api/run');
  await page.getByLabel('Search notes').fill('planning');
  await expect(page.locator('.note-card')).toHaveCount(1);
  await page.getByLabel('Search notes').fill('');
  await page
    .getByRole('button', { name: 'Favorite A little structure for the week', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Pin A little structure for the week', exact: true })
    .click();
  await expect(page.locator('.note-card').first()).toContainText('A little structure for the week');
  await page.getByRole('button', { name: 'Favorites', exact: true }).click();
  await expect(page.locator('.note-card')).toHaveCount(1);
  await page
    .getByRole('button', { name: 'Archive A little structure for the week', exact: true })
    .click();
  await expect(page.locator('.note-card')).toHaveCount(0);
  await page.getByRole('button', { name: 'Archive', exact: true }).click();
  await expect(page.locator('.note-card')).toHaveCount(1);
  await page
    .getByRole('button', { name: 'Unarchive A little structure for the week', exact: true })
    .click();
  await page.getByRole('button', { name: 'All notes', exact: true }).click();
  await page
    .getByRole('button', { name: 'Move to trash A little structure for the week', exact: true })
    .click();
  await expect(page.locator('.note-card')).toHaveCount(2);
  await page.getByRole('button', { name: 'Trash', exact: true }).click();
  await page
    .getByRole('button', { name: 'Restore A little structure for the week', exact: true })
    .click();
  await page.getByRole('button', { name: 'All notes', exact: true }).click();
  await expect(page.locator('.note-card')).toHaveCount(3);
  await page
    .getByRole('button', { name: 'Move to trash A little structure for the week', exact: true })
    .click();
  await page.getByRole('button', { name: 'Trash', exact: true }).click();
  page.once('dialog', (d) => d.accept());
  await page
    .getByRole('button', {
      name: 'Delete permanently A little structure for the week',
      exact: true,
    })
    .click();
  await page.reload();
  await expect(page.locator('.note-card')).toHaveCount(0);
});

test('folder create, rename, and removal preserve note contents; backups merge and reject invalid files', async ({
  page,
}) => {
  await page.goto('/api/run');
  page.once('dialog', (d) => d.accept('Projects'));
  await page.getByRole('button', { name: '＋ Folder', exact: true }).click();
  await page.getByRole('button', { name: 'Projects', exact: true }).click();
  page.once('dialog', (d) => d.accept('Ideas'));
  await page.getByRole('button', { name: 'Rename folder', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Ideas', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Remove folder', exact: true }).click();
  await expect(page.locator('.note-card')).toHaveCount(3);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export backup', exact: true }).click();
  const download = await downloadPromise;
  const raw = readFileSync((await download.path())!, 'utf8');
  const backup = JSON.parse(raw);
  expect(backup.records).toHaveLength(3);
  const bad = resolve(proof, 'invalid-backup.json');
  writeFileSync(bad, '{"version":2}');
  await page.getByLabel('Import notes backup').setInputFiles(bad);
  await expect(page.getByRole('status')).toContainText('not a supported');
  await expect(page.locator('.note-card')).toHaveCount(3);
  backup.records.push({ ...backup.records[0], id: 'imported-note', title: 'Imported thought' });
  const good = resolve(proof, 'valid-backup.json');
  writeFileSync(good, JSON.stringify(backup));
  await page.getByLabel('Import notes backup').setInputFiles(good);
  await expect(page.getByRole('status')).toContainText('Backup imported');
  await expect(page.locator('.note-card')).toHaveCount(4);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Imported thought' })).toBeVisible();
});

test('app copies with identical slugs have independent records and designer previews do not persist edits', async ({
  page,
  request,
}) => {
  await page.goto('/api/run');
  await page.getByRole('button', { name: '＋ New note', exact: true }).click();
  await page.getByLabel('Note title').fill('Only in first app');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await request.post('/api/apps', {
    data: { project: { version: 1, profile: null, touched: [], graph } },
  });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Only in first app' })).toHaveCount(0);
  await expect(page.locator('.note-card')).toHaveCount(3);
  await page.goto('/api/run?block=collection&embedded=1');
  await page.getByRole('button', { name: 'Favorite Ideas worth exploring', exact: true }).click();
  await page.goto('/api/run#favorites');
  await expect(page.locator('.note-card')).toHaveCount(0);
});

test('notes UI fits phone width and editor record links handle missing records', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/api/run');
  await expect(page.locator('.note-card')).toHaveCount(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: resolve(proof, 'notes-phone.png'), fullPage: true });
  await page.goto('/api/run#editor?record=missing&collection=notes');
  await expect(page.getByRole('heading', { name: 'This note is not available' })).toBeVisible();
  await page.getByRole('button', { name: 'Back to notes', exact: true }).click();
  await expect(page.locator('.note-card')).toHaveCount(3);
});

test('composed collection and editor blocks can create several independent notes on one page', async ({
  page,
  request,
}) => {
  const composed = structuredClone(graph);
  composed.screens = [
    { id: 'notes', title: 'Notes', block: 'collection', blocks: ['collection', 'editor'] },
  ];
  composed.blocks = composed.blocks.filter((b: { id: string }) =>
    ['collection', 'editor'].includes(b.id),
  );
  composed.wires = [
    {
      from: { instance: 'collection', event: 'data.recordSelected' },
      to: { screen: 'notes', instance: 'editor', port: 'data.recordSelected' },
    },
    { from: { instance: 'editor', event: 'data.closed' }, to: { screen: 'notes' } },
  ];
  await request.put('/api/project', {
    data: { version: 1, profile: null, touched: [], graph: composed },
  });
  await page.goto('/api/run');
  for (const title of ['First independent note', 'Second independent note']) {
    await page.getByRole('button', { name: '＋ New note', exact: true }).click();
    await expect(page.getByLabel('Note title')).toHaveValue('');
    await page.getByLabel('Note title').fill(title);
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  }
  await page.reload();
  await expect(page.getByLabel('Note title')).toHaveValue('Second independent note');
  await expect(
    page.getByRole('heading', { name: 'First independent note', exact: true }),
  ).toBeVisible();
});

test('a disconnected record action explains the missing connection instead of silently doing nothing', async ({
  page,
  request,
}) => {
  const disconnected = structuredClone(graph);
  disconnected.blocks.find((b: { id: string }) => b.id === 'collection').design = {
    disconnectedEvents: ['data.recordSelected'],
  };
  disconnected.wires = disconnected.wires.filter(
    (w: { from: { instance: string } }) => w.from.instance !== 'collection',
  );
  await request.put('/api/project', {
    data: { version: 1, profile: null, touched: [], graph: disconnected },
  });
  await page.goto('/api/run');
  await page.getByRole('button', { name: '＋ New note', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Connect data.recordSelected');
  await expect(page.getByRole('heading', { name: 'All notes', exact: true })).toBeVisible();
});

test('asynchronously loaded editor fields support live and persisted element customization', async ({
  page,
  request,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: '05 Edit note', exact: true }).click();
  await page.locator('.react-flow__node[data-id="editor"] .node-head').click();
  await page.locator('#root_title').fill('Write with intention');
  await page.locator('#root_subtitle').fill('Your private draft');
  await page.getByRole('button', { name: 'Apply changes', exact: true }).click();
  await expect
    .poll(
      async () =>
        (await (await request.get('/api/project')).json()).graph.blocks.find(
          (b: { id: string }) => b.id === 'editor',
        ).config.title,
    )
    .toBe('Write with intention');
  await page.getByRole('button', { name: 'Customize inside this block', exact: true }).click();
  await expect(page.getByLabel('Design element').locator('option[value="input"]')).toHaveCount(1);
  await page.getByLabel('Design element').selectOption('input');
  await page.getByLabel('Font size', { exact: true }).fill('36');
  const canvas = page.frameLocator('iframe[title="Block design canvas"]');
  await expect(canvas.getByText('Write with intention', { exact: true })).toBeVisible();
  await expect(canvas.getByText('Your private draft', { exact: true })).toBeVisible();
  await expect
    .poll(async () =>
      canvas.getByLabel('Note title').evaluate((el) => getComputedStyle(el).fontSize),
    )
    .toBe('36px');
  await page.getByRole('button', { name: 'Apply design', exact: true }).click();
  await expect
    .poll(
      async () =>
        (await (await request.get('/api/project')).json()).graph.blocks.find(
          (b: { id: string }) => b.id === 'editor',
        ).design?.elements?.input?.fontSize,
    )
    .toBe(36);
  await page.goto('/api/run');
  await expect(page.locator('.note-card')).toHaveCount(3);
});
