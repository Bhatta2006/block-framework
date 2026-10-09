import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadDefaultRegistry } from '@blockfw/blocks';
import { compileProject, compileWebProject, exportZip, hashFiles } from '@blockfw/compiler';
import type { ProjectGraph } from '@blockfw/manifest';
import { resolveWiring } from '@blockfw/wiring';

function composed(): ProjectGraph {
  return {
    schemaVersion: '0',
    app: { name: 'Studio test', slug: 'studio-test', version: '1.0.0' },
    screens: [
      {
        id: 'home',
        title: 'Home',
        block: 'hero',
        blocks: ['hero', 'list', 'detail'],
        layout: 'split',
      },
      { id: 'next', title: 'Next', block: 'next' },
    ],
    blocks: [
      { id: 'hero', type: 'content.hero@1.0.0' },
      {
        id: 'list',
        type: 'home.list@1.0.0',
        config: { title: 'Things', items: [{ id: 'item', title: 'A good idea' }] },
      },
      { id: 'detail', type: 'content.detail@1.0.0', config: { showImage: false } },
      { id: 'next', type: 'content.text@1.0.0' },
    ],
  };
}
describe('web and mobile page composition', () => {
  it('omits cloud services and QR dependencies from local web apps', () => {
    const result = compileWebProject(composed(), loadDefaultRegistry());
    const pkg = JSON.parse(result.files.find((f) => f.path === 'package.json')!.content);
    expect(pkg.dependencies).not.toHaveProperty('qrcode');
    expect(pkg.devDependencies).not.toHaveProperty('@types/qrcode');
    expect(result.files.some((f) => f.path === 'src/cloud-runtime.tsx')).toBe(false);
    expect(result.files.find((f) => f.path === 'src/runtime.tsx')!.content).not.toContain(
      'CloudProvider',
    );
    expect(result.files.find((f) => f.path === 'src/styles.css')!.content).not.toContain(
      '.cloud-feedback',
    );
  });

  it('rejects unwritable ZIP destinations instead of hanging or emitting an unhandled error', async () => {
    await expect(
      exportZip(composed(), join(tmpdir(), 'bf-missing-' + crypto.randomUUID(), 'app.zip'), 'web'),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('keeps customized element styles in web and native exports without changing event logic', () => {
    const g = composed();
    g.blocks[0]!.design = {
      elements: {
        button: { x: 42, width: 180, borderRadius: 8, color: '#123456' },
        title: { fontSize: 32 },
      },
    };
    const registry = loadDefaultRegistry();
    const native = compileProject(g, registry);
    const hero = native.files.find((f) => f.path === 'src/blocks/hero.tsx')!.content;
    expect(hero).toContain('translateX: 42');
    expect(hero).toContain('width: 180');
    expect(hero).toContain('fontSize: 32');
    expect(hero).toContain('onComplete');
    expect(hero).toContain('color: "#123456"');
    const web = compileWebProject(g, registry);
    expect(
      JSON.parse(web.files.find((f) => f.path === 'src/project.json')!.content).blocks[0].design,
    ).toEqual(g.blocks[0]!.design);
    expect(compileProject(g, registry).projectHash).toBe(native.projectHash);
  });
  it('addresses cross-page native payloads to a specific composed consumer', () => {
    const g = composed();
    g.screens = [
      { id: 'source', title: 'Source', block: 'list' },
      { id: 'destination', title: 'Destination', block: 'detail', blocks: ['detail', 'hero'] },
    ];
    g.blocks = g.blocks.filter((b) => b.id !== 'next');
    const files = compileProject(g, loadDefaultRegistry()).files;
    expect(files.find((f) => f.path === 'src/screens/source.tsx')!.content).toContain(
      'inputs: { "detail": output }',
    );
    expect(files.find((f) => f.path === 'src/screens/destination.tsx')!.content).toContain(
      'route.params?.inputs?.["detail"]',
    );
  });
  it('rejects native screen component name collisions before exporting', () => {
    const g = composed();
    g.screens[1]!.id = 'ho-me';
    expect(() => compileProject(g, loadDefaultRegistry())).toThrow(
      /Screen component name collision/,
    );
  });
  it('auto-connects a producer and consumer on the same page', () => {
    const result = resolveWiring(composed(), loadDefaultRegistry());
    expect(result.wires.find((w) => w.from.instance === 'list')?.to).toEqual({
      screen: 'home',
      instance: 'detail',
      port: 'home.itemSelected',
    });
  });
  it('prefers a local consumer over consumers elsewhere', () => {
    const g = composed();
    g.blocks.push({ id: 'other', type: 'content.detail@1.0.0' });
    g.screens.push({ id: 'other-page', block: 'other', title: 'Other' });
    expect(
      resolveWiring(g, loadDefaultRegistry()).wires.find((w) => w.from.instance === 'list')?.to
        .instance,
    ).toBe('detail');
  });
  it('renders every composed block once and delivers local native payloads', () => {
    const result = compileProject(composed(), loadDefaultRegistry());
    expect(new Set(result.files.map((f) => f.path)).size).toBe(result.files.length);
    for (const id of ['hero', 'list', 'detail'])
      expect(result.files.some((f) => f.path === 'src/blocks/' + id + '.tsx')).toBe(true);
    const wrapper = result.files.find((f) => f.path === 'src/screens/home.tsx')!.content;
    expect(wrapper).toContain('set_DetailBlock(output');
    expect(wrapper).toContain('input={input_DetailBlock}');
    expect(wrapper).toContain("width >= 700 ? '50%' : '100%'");
    expect(result.files.find((f) => f.path === 'src/blocks/list.tsx')!.content).not.toContain(
      '<FlatList',
    );
    expect(wrapper).not.toContain("navigation.navigate('home'");
  });
  it('rejects duplicate placements, missing primaries, and nonexistent event ports', () => {
    const registry = loadDefaultRegistry();
    const duplicated = composed();
    duplicated.screens[1]!.blocks = ['next', 'hero'];
    expect(() => compileWebProject(duplicated, registry)).toThrow(/placed more than once/);
    const missing = composed();
    missing.screens[0]!.blocks = ['list'];
    expect(() => compileWebProject(missing, registry)).toThrow(/primary block/);
    const bad = composed();
    bad.wires = [{ from: { instance: 'hero', event: 'does.not.exist' }, to: { screen: 'next' } }];
    expect(() => compileWebProject(bad, registry)).toThrow(/does not emit/);
  });
  it('emits runnable, deterministic web source with merged defaults', () => {
    const g = composed();
    const registry = loadDefaultRegistry();
    const a = compileWebProject(g, registry),
      b = compileWebProject(g, registry);
    expect(a).toEqual(b);
    expect(a.projectHash).toBe(
      hashFiles(a.files.filter((f) => f.path !== 'src/wiring-report.json')),
    );
    expect(a.files.find((f) => f.path === 'src/project.json')!.content).toContain(
      'Small steps. Remarkable days.',
    );
    expect(JSON.parse(a.files.find((f) => f.path === 'package.json')!.content).scripts.build).toBe(
      'tsc --noEmit && vite build',
    );
    const moved = composed();
    moved.screens[0]!.position = { x: 700, y: 100 };
    expect(g.screens[0]!.blocks).toEqual(moved.screens[0]!.blocks);
    expect(compileWebProject(moved, registry).wiring).toEqual(a.wiring);
  });
  it('routes purchase and restore to separate native destinations', () => {
    const g = composed();
    g.blocks[0] = {
      id: 'hero',
      type: 'paywall.basic@1.0.0',
      config: {
        headline: 'Go pro',
        products: [{ id: 'pro', title: 'Pro', price: '$5', period: 'month' }],
      },
    };
    g.screens[0]!.blocks = ['hero'];
    g.blocks = g.blocks.filter((b) => !['list', 'detail'].includes(b.id));
    g.wires = [
      { from: { instance: 'hero', event: 'paywall.completed' }, to: { screen: 'next' } },
      { from: { instance: 'hero', event: 'paywall.restored' }, to: { screen: 'home' } },
    ];
    const wrapper = compileProject(g, loadDefaultRegistry()).files.find(
      (f) => f.path === 'src/screens/home.tsx',
    )!.content;
    expect(wrapper).toContain(
      "output.restored ? navigation.navigate('home') : navigation.navigate('next')",
    );
  });
  it('exports identical web ZIP bytes and a clean audit', async () => {
    const pathA = join(tmpdir(), 'bf-web-a-' + process.pid + '.zip');
    const pathB = join(tmpdir(), 'bf-web-b-' + process.pid + '.zip');
    const a = await exportZip(composed(), pathA, 'web');
    const b = await exportZip(composed(), pathB, 'web');
    expect(a.audit.ok).toBe(true);
    expect(b.audit.ok).toBe(true);
    expect(readFileSync(pathA).equals(readFileSync(pathB))).toBe(true);
  });
});

it('cuts automatic routes persistently and restores them when the cut is removed', () => {
  const g = composed();
  const registry = loadDefaultRegistry();
  expect(resolveWiring(g, registry).wires.some((w) => w.from.instance === 'hero')).toBe(true);
  g.blocks[0]!.design = { disconnectedEvents: ['action.pressed'] };
  expect(resolveWiring(g, registry).wires.some((w) => w.from.instance === 'hero')).toBe(false);
  g.blocks[0]!.design.disconnectedEvents = [];
  expect(resolveWiring(g, registry).wires.some((w) => w.from.instance === 'hero')).toBe(true);
});
it('keeps added buttons inert by default and routes each configured button independently', () => {
  const g = composed();
  const registry = loadDefaultRegistry();
  g.blocks[0]!.design = {
    content: [
      { id: 'custom-first', type: 'button', text: 'First' },
      { id: 'custom-second', type: 'button', text: 'Second' },
    ],
  };
  expect(
    resolveWiring(g, registry).wires.filter((w) => w.from.event.startsWith('element.')),
  ).toEqual([]);
  g.blocks[0]!.design.actions = {
    'custom-first': { type: 'navigate', screen: 'next' },
    'custom-second': { type: 'navigate', screen: 'home' },
    button: { type: 'none' },
  };
  const wires = resolveWiring(g, registry).wires.filter((w) => w.from.instance === 'hero');
  expect(wires.map((w) => [w.from.event, w.to.screen])).toEqual([
    ['element.custom-first.pressed', 'next'],
    ['element.custom-second.pressed', 'home'],
  ]);
  g.blocks[0]!.design.elements = {
    'custom-first': { x: 34, y: -5, width: 180, padding: 9, textAlign: 'right' },
  };
  const files = compileProject(g, registry).files;
  const native = files.find((f) => f.path === 'src/blocks/hero.tsx')!.content;
  expect(native).toContain('studioNavigation.navigate("next" as never)');
  expect(native).toContain('studioNavigation.navigate("home" as never)');
  expect(native).toContain('studioAction("button")');
  expect(native).toContain('StudioPressable');
  expect(native.match(/translateX/g)).toHaveLength(1);
  expect(native.match(/translateY/g)).toHaveLength(1);
  expect(files.find((f) => f.path === 'src/screens/home.tsx')!.content).toContain(
    '<HeroBlock onComplete={(output) => { void output;  }} />',
  );
});
it('rejects missing action destinations, duplicate element IDs and unsafe URL schemes', () => {
  const g = composed();
  const registry = loadDefaultRegistry();
  g.blocks[0]!.design = { actions: { button: { type: 'navigate', screen: 'missing' } } };
  expect(() => resolveWiring(g, registry)).toThrow(/unknown page/);
  g.blocks[0]!.design = {
    content: [
      { id: 'custom-same', type: 'button' },
      { id: 'custom-same', type: 'text' },
    ],
  };
  expect(() => resolveWiring(g, registry)).toThrow(/Duplicate added element/);
  g.blocks[0]!.design = { actions: { button: { type: 'url', url: 'javascript:alert(1)' } } };
  expect(() => resolveWiring(g, registry)).toThrow();
});
