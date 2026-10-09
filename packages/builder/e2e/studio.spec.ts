import { test, expect } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { BuilderProject } from '../ui/src/api';

const root = resolve(import.meta.dirname, '../../..');
const proof = join(root, '.builder-cache/proof');
mkdirSync(proof, { recursive: true });
const initial: BuilderProject = {
  version: 1,
  profile: null,
  touched: [],
  graph: JSON.parse(readFileSync(join(root, 'examples/studio/graph.json'), 'utf8')),
};
test.beforeEach(async ({ request }) => {
  const apps = await (await request.get('/api/apps')).json();
  await request.post('/api/apps/' + apps.apps[0].id + '/activate');
  const response = await request.put('/api/project', { data: initial });
  expect(response.ok()).toBe(true);
});

test('variant, route, and page layout selections persist and update the preview', async ({
  page,
  request,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: '01 Sign in', exact: true }).click();
  await page.locator('.react-flow__node[data-id="b1"] .node-head').click();
  await page.getByLabel('Appearance', { exact: true }).selectOption('signup');
  await expect
    .poll(
      async () =>
        (await (await request.get('/api/project')).json()).graph.blocks.find(
          (b: { id: string }) => b.id === 'b1',
        ).variant,
    )
    .toBe('signup');
  await expect(
    page
      .frameLocator('iframe[title="Sign up block preview"]')
      .getByText('CREATE YOUR ACCOUNT', { exact: true }),
  ).toBeVisible();
  await page.getByLabel('Route auth.completed', { exact: true }).selectOption('s4');
  await expect
    .poll(
      async () =>
        (await (await request.get('/api/project')).json()).graph.wires.find(
          (w: { from: { instance: string } }) => w.from.instance === 'b1',
        ).to.screen,
    )
    .toBe('s4');
  await page.getByRole('button', { name: '04 Home', exact: true }).click();
  await page.getByLabel('Page layout', { exact: true }).selectOption('grid');
  await expect
    .poll(
      async () =>
        (await (await request.get('/api/project')).json()).graph.screens.find(
          (s: { id: string }) => s.id === 's4',
        ).layout,
    )
    .toBe('grid');
});

test('app picker creates, switches, deletes, and restores independent apps', async ({
  page,
  request,
}, testInfo) => {
  const appName = `Independent Studio ${testInfo.project.name}`;
  await page.goto('/');
  await page.getByRole('button', { name: 'Switch apps' }).click();
  await page.getByRole('button', { name: 'Create app', exact: true }).click();
  await page.getByLabel('New app name').fill(appName);
  await page.getByRole('button', { name: 'Create starter app', exact: true }).click();
  await expect(page.getByLabel('Page title')).toHaveValue('Welcome');
  await page.getByRole('button', { name: 'Switch apps' }).click();
  await page.getByRole('button', { name: /^H Habitual Pro/ }).click();
  await expect(page.locator('.react-flow__node')).toHaveCount(8);
  await page.getByRole('button', { name: 'Switch apps' }).click();
  await page.getByRole('button', { name: `Delete app ${appName}`, exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Recently deleted' })).toBeVisible();
  const app = (await (await request.get('/api/apps')).json()).apps.find(
    (a: { name: string }) => a.name === appName,
  );
  expect(app.deleted).toBe(true);
  await page
    .locator('.app-row')
    .filter({ hasText: appName })
    .getByRole('button', { name: 'Restore app' })
    .click();
  await page.getByRole('button', { name: `I ${appName}`, exact: true }).click();
  await expect(page.locator('.react-flow__node')).toHaveCount(2);
});

test('element design supports manual offsets, drag, shared styles, resets, and selected AI scope', async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button', { name: '01 Sign in', exact: true }).click();
  await page.locator('.react-flow__node[data-id="b1"] .node-head').click();
  await page.getByRole('button', { name: 'Customize inside this block' }).click();
  const frame = page.frameLocator('iframe[title="Block design canvas"]');
  await expect(frame.locator('[data-element="button"]')).toBeVisible();
  await page.getByLabel('Design element').selectOption('button');
  await page.getByLabel('Horizontal offset', { exact: true }).fill('24');
  await page.getByLabel('Width', { exact: true }).fill('200');
  await page.getByLabel('Element background color').fill('#284C79');
  await page.getByRole('button', { name: 'Apply design', exact: true }).click();
  await expect
    .poll(
      async () =>
        (await (await request.get('/api/project')).json()).graph.blocks.find(
          (b: { id: string }) => b.id === 'b1',
        )?.design?.elements?.button?.x,
    )
    .toBe(24);
  await expect(frame.locator('[data-element="button"]')).toHaveCSS('width', '200px');
  const button = (await frame.locator('[data-element="button"]').boundingBox())!;
  await page.mouse.move(button.x + 70, button.y + 25);
  await page.mouse.down();
  await page.mouse.move(button.x + 95, button.y + 45, { steps: 8 });
  await page.mouse.up();
  await expect
    .poll(
      async () =>
        (await (await request.get('/api/project')).json()).graph.blocks.find(
          (b: { id: string }) => b.id === 'b1',
        )?.design?.elements?.button?.x,
    )
    .toBe(49);
  await page.getByLabel('Apply to matching elements in all blocks').check();
  await page.getByLabel('Corner radius', { exact: true }).fill('8');
  await page.getByRole('button', { name: 'Apply design', exact: true }).click();
  await expect
    .poll(async () =>
      (await (await request.get('/api/project')).json()).graph.blocks.every(
        (b: { design?: { elements?: { button?: { borderRadius?: number } } } }) =>
          b.design?.elements?.button?.borderRadius === 8,
      ),
    )
    .toBe(true);
  await page.screenshot({ path: join(proof, 'studio-element-designer.png') });
  await page.getByLabel('Apply to matching elements in all blocks').uncheck();
  await page.getByRole('button', { name: 'Reset element', exact: true }).click();
  await expect
    .poll(
      async () =>
        (await (await request.get('/api/project')).json()).graph.blocks.find(
          (b: { id: string }) => b.id === 'b1',
        )?.design?.elements?.button,
    )
    .toBeUndefined();
  await page.getByRole('button', { name: 'Ask AI to customize', exact: true }).click();
  await expect(page.getByLabel('AI edit scope')).toHaveValue('b1');
  await page.getByLabel('AI edit scope').selectOption('all');
  expect(errors).toEqual([]);
});

test('content validation, developer apply, and profile cascade report successful changes', async ({
  page,
  request,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: '01 Sign in', exact: true }).click();
  await page.locator('.react-flow__node[data-id="b1"] .node-head').click();
  await page.locator('#root_headline').fill('');
  await page.getByRole('button', { name: 'Apply changes', exact: true }).click();
  await expect(
    page.getByText('Check the highlighted content fields, then apply again.'),
  ).toBeVisible();
  await page.locator('#root_headline').fill('A better welcome');
  await page.getByRole('button', { name: 'Apply changes', exact: true }).click();
  await expect(page.getByText('Changes applied.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Developer tools', exact: true }).click();
  const valid = await (await request.get('/api/project')).json();
  valid.graph.app.name = 'Validated Studio';
  await page.getByLabel('Project JSON').fill(JSON.stringify(valid));
  await page.getByRole('button', { name: 'Validate & apply', exact: true }).click();
  await expect(page.getByText('Project validated and applied.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.getByRole('button', { name: 'Brand & app profile', exact: true }).click();
  await page.getByLabel('What is your app called?').fill('Branded Studio');
  await page.getByLabel('Who is it for?').fill('builders');
  await page.getByLabel('What tone should the copy use?').selectOption('minimal');
  await page.getByLabel('Monthly price (numbers only)').fill('4.99');
  await page.getByLabel('Currency', { exact: true }).selectOption('USD');
  await page.getByLabel('Pick a brand color hex', { exact: true }).fill('#345E4F');
  await page.getByRole('button', { name: 'Save profile & apply cascade' }).click();
  await expect(page.getByText(/Derived/)).toBeVisible();
  expect((await (await request.get('/api/project')).json()).graph.app.name).toBe('Branded Studio');
});

test('page flow renders interactive previews and its automatic connections', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('.react-flow__node')).toHaveCount(8);
  await expect(page.locator('.react-flow__edge')).toHaveCount(6);
  await expect(page.getByText('All changes saved')).toBeVisible();
  await expect(
    page
      .frameLocator('iframe[title="Sign in block preview"]')
      .getByRole('heading', { name: 'Welcome back' }),
  ).toBeVisible();
  await page.screenshot({ path: join(proof, 'studio-flow.png') });
  expect(errors).toEqual([]);
});

test('page composition adds and configures blocks with undo and redo', async ({
  page,
  request,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: '04 Home', exact: true }).click();
  await expect(page.getByTestId('page-canvas')).toBeVisible();
  await expect(page.locator('.react-flow__node')).toHaveCount(3);
  await expect(page.locator('.react-flow__edge')).toHaveCount(2);
  await page.getByRole('button', { name: 'Add Hero section', exact: true }).click();
  await expect(page.locator('.react-flow__node')).toHaveCount(4);
  await page.locator('#root_title').fill('Build something extraordinary.');
  await page.getByRole('button', { name: 'Apply changes', exact: true }).click();
  await expect
    .poll(async () => {
      const p = (await (await request.get('/api/project')).json()) as BuilderProject;
      return p.graph.blocks.find((b) => b.type === 'content.hero@1.0.0')?.config.title;
    })
    .toBe('Build something extraordinary.');
  await expect(page.getByText('All changes saved')).toBeVisible();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect
    .poll(async () => {
      const p = (await (await request.get('/api/project')).json()) as BuilderProject;
      return p.graph.blocks.find((b) => b.type === 'content.hero@1.0.0')?.config.title;
    })
    .toBe('Small steps. Remarkable days.');
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect
    .poll(async () => {
      const p = (await (await request.get('/api/project')).json()) as BuilderProject;
      return p.graph.blocks.find((b) => b.type === 'content.hero@1.0.0')?.config.title;
    })
    .toBe('Build something extraordinary.');
  await page.getByRole('button', { name: 'Close properties' }).click();
  await page.getByRole('button', { name: 'Fit View', exact: true }).click();
  await expect(
    page
      .frameLocator('iframe[title="Hero section block preview"]')
      .getByRole('heading', { name: 'Build something extraordinary.' }),
  ).toBeVisible();
  await page.screenshot({ path: join(proof, 'studio-page-canvas.png') });
});

test('canvas dragging saves positions and port dragging overrides a page route', async ({
  page,
  request,
}) => {
  await page.goto('/');
  await expect(page.locator('.react-flow__edge')).toHaveCount(6);
  const node = page.locator('.react-flow__node[data-id="s1"] .node-head');
  const box = (await node.boundingBox())!;
  await page.mouse.move(box.x + 50, box.y + 25);
  await page.mouse.down();
  await page.mouse.move(box.x + 85, box.y + 60, { steps: 8 });
  await page.mouse.up();
  await expect
    .poll(async () => {
      const p = (await (await request.get('/api/project')).json()) as BuilderProject;
      return p.graph.screens[0]?.position?.x;
    })
    .not.toBeUndefined();
  const source = (await page
    .locator('.react-flow__handle[data-nodeid="s1"][data-handleid="b1:auth.completed"]')
    .boundingBox())!;
  const target = (await page
    .locator('.react-flow__handle[data-nodeid="s4"][data-handleid="page"]')
    .boundingBox())!;
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 20 });
  await page.mouse.up();
  await expect
    .poll(async () => {
      const p = (await (await request.get('/api/project')).json()) as BuilderProject;
      return p.graph.wires?.find((w) => w.from.instance === 'b1')?.to.screen;
    })
    .toBe('s4');
});

test('generated web app runs sign in, quiz, purchase, selection and browser back', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/api/run');
  await page.getByLabel('Email address').fill('demo@example.com');
  await page.getByLabel('Password').fill('demopassword');
  await page.getByRole('button', { name: 'Sign in', exact: false }).last().click();
  await expect(page.getByRole('heading', { name: 'What brings you here?' })).toBeVisible();
  await page.getByRole('button', { name: /Build a habit/ }).click();
  await page.getByRole('button', { name: /Continue/ }).click();
  await page.getByRole('button', { name: /Morning/ }).click();
  await page.getByRole('button', { name: /Finish/ }).click();
  await page.getByRole('button', { name: /Start my free trial/ }).click();
  await expect(page.getByRole('heading', { name: 'A little better, every day.' })).toBeVisible();
  await page.getByRole('button', { name: /Morning hydration/ }).click();
  await expect(page.getByRole('heading', { name: 'Morning hydration' })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'A little better, every day.' })).toBeVisible();
  await page.screenshot({ path: join(proof, 'generated-web-app.png'), fullPage: true });
  expect(errors).toEqual([]);
});

test('local semantic wires deliver payloads without changing the page', async ({
  page,
  request,
}) => {
  const project = structuredClone(initial);
  const home = project.graph.screens.find((s) => s.id === 's4')!;
  home.blocks = [...home.blocks!, 'b5'];
  home.layout = 'grid';
  project.graph.screens = project.graph.screens.filter((s) => s.id !== 's5');
  expect((await request.put('/api/project', { data: project })).ok()).toBe(true);
  await page.goto('/api/run?page=s4');
  await page.getByRole('button', { name: /Morning hydration/ }).click();
  await expect(page.getByRole('heading', { name: 'Morning hydration' })).toBeVisible();
  expect(page.url()).not.toContain('#s5');
});

test('preview has responsive devices, live settings, and downloadable web/mobile exports', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: '08 Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  const frame = page.frameLocator('iframe[title="Interactive app preview"]');
  const toggle = frame.getByRole('switch').first();
  await expect(toggle).toBeVisible();
  const before = await toggle.getAttribute('aria-checked');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', before === 'true' ? 'false' : 'true');
  await page.getByRole('button', { name: 'Phone', exact: true }).click();
  await expect(page.locator('.preview-device.mobile')).toBeVisible();
  await page.screenshot({ path: join(proof, 'studio-phone-preview.png') });
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  for (const target of ['Web application', 'Mobile application']) {
    await page.getByRole('button', { name: 'Export app', exact: true }).click();
    await page.getByRole('button', { name: new RegExp(target) }).click();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: /Download (web|mobile) app/ }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/-(web|mobile)\.zip$/);
  }
});

test('invalid developer edits preserve the saved project', async ({ page, request }) => {
  const before = ((await (await request.get('/api/project')).json()) as BuilderProject).graph;
  await page.goto('/');
  await page.getByRole('button', { name: 'Developer tools', exact: true }).click();
  const invalid = structuredClone(initial);
  invalid.graph.screens[0]!.block = 'missing';
  await page.getByLabel('Project JSON', { exact: true }).fill(JSON.stringify(invalid));
  await page.getByRole('button', { name: 'Validate & apply', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('unknown block');
  const saved = (await (await request.get('/api/project')).json()) as BuilderProject;
  expect(saved.graph).toEqual(before);
});

test('small screen workspace keeps navigation and editing accessible', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Toggle navigation' }).click();
  await page.getByRole('button', { name: '04 Home', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Add Rich content', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Blocks', exact: true }).click();
  await expect(page.getByTestId('page-canvas')).toBeVisible();
  await page.screenshot({ path: join(proof, 'studio-responsive.png') });
});

test('beginners can create a starter app and run its connected pages', async ({
  page,
  request,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New starter app', exact: true }).click();
  await page.getByLabel('New app name', { exact: true }).fill('Good days');
  await page.getByRole('button', { name: 'Create starter app', exact: true }).click();
  await expect(page.getByLabel('Page title', { exact: true })).toHaveValue('Welcome');
  const saved = (await (await request.get('/api/project')).json()) as BuilderProject;
  expect(saved.graph.screens).toHaveLength(2);
  expect(saved.graph.blocks).toHaveLength(4);
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  const preview = page.frameLocator('iframe[title="Interactive app preview"]');
  await expect(preview.getByRole('heading', { name: 'Good days.' })).toBeVisible();
  await preview.getByRole('button', { name: /Explore the next chapter/ }).click();
  await expect(preview.getByRole('heading', { name: 'Your next chapter.' })).toBeVisible();
  await preview.getByRole('button', { name: /Back to the beginning/ }).click();
  await expect(preview.getByRole('heading', { name: 'Good days.' })).toBeVisible();
});

test('designer previews alignment and dimensions before saving and restores defaults', async ({
  page,
  request,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: '01 Sign in', exact: true }).click();
  await page.locator('.react-flow__node[data-id="b1"] .node-head').click();
  await page.getByRole('button', { name: 'Customize inside this block' }).click();
  const frame = page.frameLocator('iframe[title="Block design canvas"]');
  const button = frame.locator('[data-element="button"]');
  await expect(button).toBeVisible();
  await page.getByLabel('Design element').selectOption('button');
  await page.getByLabel('Width', { exact: true }).fill('180');
  await page.getByLabel('Element alignment').selectOption('center');
  await expect(button).toHaveCSS('width', '180px');
  const centerError = () =>
    button.evaluate((el) => {
      const b = el.getBoundingClientRect();
      const p = el.parentElement!.getBoundingClientRect();
      return Math.abs((b.left + b.right - p.left - p.right) / 2);
    });
  await expect.poll(centerError).toBeLessThan(2);
  await page.getByLabel('Element alignment').selectOption('flex-end');
  await expect
    .poll(() =>
      button.evaluate((el) =>
        Math.abs(
          el.getBoundingClientRect().right - el.parentElement!.getBoundingClientRect().right,
        ),
      ),
    )
    .toBeLessThan(2);
  await page.getByLabel('Element alignment').selectOption('center');
  await page.getByLabel('Element alignment').selectOption('stretch');
  await expect(page.getByLabel('Width', { exact: true })).toHaveValue('');
  await expect
    .poll(() =>
      button.evaluate((el) =>
        Math.abs(
          el.getBoundingClientRect().width - el.parentElement!.getBoundingClientRect().width,
        ),
      ),
    )
    .toBeLessThan(2);
  await page.getByLabel('Width', { exact: true }).fill('180');
  await expect(page.getByLabel('Element alignment')).toHaveValue('flex-start');
  await page.getByLabel('Element alignment').selectOption('center');
  await page.getByLabel('Height', { exact: true }).fill('72');
  await page.getByLabel('Font size', { exact: true }).fill('21');
  await page.getByLabel('Opacity', { exact: true }).fill('0.7');
  await page.getByLabel('Text alignment', { exact: true }).selectOption('right');
  await expect(button).toHaveCSS('height', '72px');
  await expect(button).toHaveCSS('font-size', '21px');
  await expect(button).toHaveCSS('opacity', '0.7');
  await expect(button).toHaveCSS('text-align', 'right');
  await expect(button).toHaveCSS('justify-content', 'flex-end');
  await page.getByLabel('Padding', { exact: true }).fill('12');
  await page.getByLabel('Space above', { exact: true }).fill('8');
  await page.getByLabel('Space below', { exact: true }).fill('11');
  await page.getByLabel('Corner radius', { exact: true }).fill('9');
  await page.getByLabel('Element background color').fill('#224466');
  await page.getByLabel('Element text color').fill('#FAFAFA');
  await page.getByLabel('Font weight', { exact: true }).selectOption('700');
  await expect(button).toHaveCSS('padding', '12px');
  await expect(button).toHaveCSS('margin-top', '8px');
  await expect(button).toHaveCSS('margin-bottom', '11px');
  await expect(button).toHaveCSS('border-radius', '9px');
  await expect(button).toHaveCSS('background-color', 'rgb(34, 68, 102)');
  await expect(button).toHaveCSS('color', 'rgb(250, 250, 250)');
  await expect(button).toHaveCSS('font-weight', '700');
  await page.getByLabel('Horizontal offset', { exact: true }).fill('15');
  await page.getByLabel('Vertical offset', { exact: true }).fill('-5');
  await expect(button).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 15, -5)');
  await page.getByLabel('Horizontal offset', { exact: true }).fill('0');
  await page.getByLabel('Vertical offset', { exact: true }).fill('0');
  await page.getByRole('button', { name: 'Show phone width', exact: true }).click();
  await expect(page.locator('iframe[title="Block design canvas"]')).toHaveCSS('width', '375px');
  await expect.poll(centerError).toBeLessThan(2);
  await page.getByRole('button', { name: 'Show desktop width', exact: true }).click();
  expect((await (await request.get('/api/project')).json()).graph.blocks[0].design).toBeUndefined();
  await page.getByRole('button', { name: 'Apply design', exact: true }).click();
  await expect(page.getByText('Design applied to this block.', { exact: true })).toBeVisible();
  await expect.poll(centerError).toBeLessThan(2);
  await page.getByLabel('Hide this element').check();
  await expect(button).toBeHidden();
  await page.getByLabel('Hide this element').uncheck();
  await expect(button).toBeVisible();
  await page.getByRole('button', { name: 'Reset element', exact: true }).click();
  await expect(button).not.toHaveCSS('width', '180px');
});

test('element library adds independent buttons with optional actions and editable placement', async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button', { name: '01 Sign in', exact: true }).click();
  await page.locator('.react-flow__node[data-id="b1"] .node-head').click();
  await page.getByRole('button', { name: 'Customize inside this block' }).click();
  await page.getByRole('button', { name: 'Element library', exact: true }).click();
  const frame = page.frameLocator('iframe[title="Block design canvas"]');
  await page.getByRole('button', { name: '+ Button', exact: true }).click();
  await expect(page.getByLabel('Element text', { exact: true })).toHaveValue('New button');
  await page.getByLabel('Element text', { exact: true }).fill('Open my collection');
  await page.getByLabel('Button action').selectOption('navigate');
  await page.getByLabel('Button destination').selectOption('s4');
  await page.getByRole('button', { name: 'Save element & action' }).click();
  await expect(
    frame.getByRole('button', { name: 'Open my collection', exact: true }),
  ).toBeVisible();
  await page.getByLabel('Insert before element').selectOption('button');
  await expect(
    frame.locator('form').getByRole('button', { name: 'Open my collection', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: '+ Button', exact: true }).click();
  await expect(page.getByLabel('Element text', { exact: true })).toHaveValue('New button');
  await page.getByLabel('Element text', { exact: true }).fill('Open my profile');
  await page.getByLabel('Button action').selectOption('navigate');
  await page.getByLabel('Button destination').selectOption('s7');
  await page.getByRole('button', { name: 'Save element & action' }).click();
  await expect(frame.getByRole('button', { name: 'Open my profile', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '+ Button', exact: true }).click();
  await expect(page.getByLabel('Element text', { exact: true })).toHaveValue('New button');
  await page.getByRole('button', { name: '+ Text', exact: true }).click();
  await expect(page.getByLabel('Element text', { exact: true })).toHaveValue('Your text');
  await page.getByLabel('Element text', { exact: true }).fill('Your own block, your own rules.');
  await page.getByRole('button', { name: 'Save element text' }).click();
  await expect(frame.getByText('Your own block, your own rules.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '+ Divider', exact: true }).click();
  await expect(frame.locator('hr.custom-element')).toHaveCount(1);
  await page.getByRole('button', { name: 'Remove added element', exact: true }).click();
  await expect(frame.locator('hr.custom-element')).toHaveCount(0);
  await page.getByRole('button', { name: 'Element library', exact: true }).click();
  const designed = await (await request.get('/api/project')).json();
  await page
    .getByLabel('Design element')
    .selectOption(designed.graph.blocks[0].design.content[1].id);
  await expect(page.getByLabel('Button destination')).toHaveValue('s7');
  await page.screenshot({ path: join(proof, 'studio-custom-button-actions.png') });
  await page.goto('/api/run');
  await page.getByRole('button', { name: 'New button', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  await page.getByRole('button', { name: 'Open my collection', exact: true }).click();
  await expect(page).toHaveURL(/#s4$/);
  await page.goBack();
  await page.getByRole('button', { name: 'Open my profile', exact: true }).click();
  await expect(page).toHaveURL(/#s7$/);
  await page.goBack();
  const saved = await (await request.get('/api/project')).json();
  const added = saved.graph.blocks[0].design.content;
  expect(added).toHaveLength(4);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Open my collection', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('automatic and manual wires can be cut, undone, restored, and stay cut after reload', async ({
  page,
  request,
}) => {
  await page.goto('/');
  const edges = page.locator('.react-flow__edge');
  await expect(edges).toHaveCount(6);
  // Force clicks bypass overlapping labels while still exercising React Flow's selection handler.
  await edges.first().locator('.react-flow__edge-interaction').click({ force: true });
  await page.getByRole('button', { name: 'Cut connection', exact: true }).click();
  await expect(edges).toHaveCount(5);
  await page.reload();
  await expect(edges).toHaveCount(5);
  await page.getByRole('button', { name: '01 Sign in', exact: true }).click();
  await page.locator('.react-flow__node[data-id="b1"] .node-head').click();
  await expect(page.getByLabel('Route auth.completed')).toHaveValue('none');
  await page.getByLabel('Route auth.completed').selectOption('s4');
  await expect
    .poll(
      async () =>
        (await (await request.post('/api/compile?target=web')).json()).wiring.resolved.find(
          (w: { from: { instance: string }; to: { screen: string } }) => w.from.instance === 'b1',
        )?.to.screen,
    )
    .toBe('s4');
  await page.getByLabel('Route auth.completed').selectOption('none');
  await expect
    .poll(
      async () =>
        (await (await request.get('/api/project')).json()).graph.blocks[0].design
          .disconnectedEvents,
    )
    .toContain('auth.completed');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByLabel('Route auth.completed')).toHaveValue('s4');
  await page.getByLabel('Route auth.completed').selectOption('auto');
  await expect
    .poll(
      async () =>
        (await (await request.post('/api/compile?target=web')).json()).wiring.resolved.find(
          (w: { from: { instance: string }; to: { screen: string } }) => w.from.instance === 'b1',
        )?.to.screen,
    )
    .toBe('s2');
});

test('optional actions override a built-in button, show messages, open links, and go back', async ({
  page,
  request,
  context,
}) => {
  const project = structuredClone(initial);
  project.graph.blocks[0]!.design = {
    content: [
      { id: 'custom-note', type: 'button', text: 'Show a note' },
      { id: 'custom-link', type: 'button', text: 'Open a link' },
      { id: 'custom-back', type: 'button', text: 'Previous page' },
    ],
    actions: {
      button: { type: 'navigate', screen: 's4' },
      'custom-note': { type: 'message', message: 'A message from this button.' },
      'custom-link': { type: 'url', url: 'http://127.0.0.1:5199/api/run#s7' },
      'custom-back': { type: 'back' },
    },
  };
  expect((await request.put('/api/project', { data: project })).ok()).toBe(true);
  await page.goto('/api/run');
  const dialog = page.waitForEvent('dialog').then(async (message) => {
    expect(message.message()).toBe('A message from this button.');
    await message.dismiss();
  });
  await Promise.all([
    dialog,
    page.getByRole('button', { name: 'Show a note', exact: true }).click(),
  ]);
  const opened = context.waitForEvent('page');
  await page.getByRole('button', { name: 'Open a link', exact: true }).click();
  const linked = await opened;
  await expect(linked).toHaveURL(/#s7$/);
  await linked.close();
  await page.locator('[data-element="button"]').click();
  await expect(page).toHaveURL(/#s4$/);
  await page.getByRole('navigation').getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'Previous page', exact: true }).click();
  await expect(page).toHaveURL(/#s4$/);
});

test('selected event wires support the Delete key and undo', async ({ page }) => {
  await page.goto('/');
  const edges = page.locator('.react-flow__edge');
  await expect(edges).toHaveCount(6);
  await edges.first().locator('.react-flow__edge-interaction').click({ force: true });
  await page.keyboard.press('Delete');
  await expect(edges).toHaveCount(5);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(edges).toHaveCount(6);
});

test('layout wires can be cut without deleting content and connected again', async ({
  page,
  request,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: '04 Home', exact: true }).click();
  const link = page.locator('.react-flow__edge[data-id="composition-b4"]');
  await expect(link).toBeVisible();
  await link.locator('.react-flow__edge-interaction').click({ force: true });
  await page.getByRole('button', { name: 'Cut connection', exact: true }).click();
  await expect(link).toHaveCount(0);
  await expect(page.locator('.react-flow__node')).toHaveCount(
    initial.graph.screens.find((s) => s.id === 's4')!.blocks!.length,
  );
  await expect
    .poll(
      async () =>
        (await (await request.get('/api/project')).json()).graph.screens.find(
          (s: { id: string }) => s.id === 's4',
        ).disconnectedLayout,
    )
    .toContain('b4');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(link).toBeVisible();
  await link.locator('.react-flow__edge-interaction').click({ force: true });
  await page.getByRole('button', { name: 'Cut connection', exact: true }).click();
  const source = (await page
    .locator('.react-flow__handle[data-nodeid="intro"][data-handleid="layout-out"]')
    .boundingBox())!;
  const target = (await page
    .locator('.react-flow__handle[data-nodeid="b4"][data-handleid="layout-in"]')
    .boundingBox())!;
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 20 });
  await page.mouse.up();
  await expect(link).toBeVisible();
});
