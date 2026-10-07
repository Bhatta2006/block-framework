import { describe, expect, it } from 'vitest';
import { BlockRegistry, loadDefaultRegistry } from '@blockfw/blocks';
import type { ProjectGraph } from '@blockfw/manifest';
import { navigationTargets, resolveWiring, WiringError } from '@blockfw/wiring';

function block(g: ProjectGraph, id: string) {
  const b = g.blocks.find((x) => x.id === id);
  if (!b) throw new Error(`test fixture broken: no block ${id}`);
  return b;
}

function screen(g: ProjectGraph, id: string) {
  const s = g.screens.find((x) => x.id === id);
  if (!s) throw new Error(`test fixture broken: no screen ${id}`);
  return s;
}

function baseGraph(): ProjectGraph {
  return {
    schemaVersion: '0',
    app: { name: 'Test', slug: 'test', version: '1.0.0' },
    screens: [
      { id: 's1', block: 'b1', title: 'Welcome' },
      { id: 's2', block: 'b2', title: 'Paywall' },
      { id: 's3', block: 'b3', title: 'Home' },
    ],
    blocks: [
      {
        id: 'b1',
        type: 'onboarding.quiz@1.0.0',
        config: { questions: [{ prompt: 'Q?', options: ['A', 'B'] }] },
      },
      {
        id: 'b2',
        type: 'paywall.basic@1.0.0',
        config: {
          headline: 'Go premium',
          products: [{ id: 'm', title: 'Monthly', price: '$1', period: 'month' }],
        },
      },
      {
        id: 'b3',
        type: 'home.list@1.0.0',
        config: { title: 'Home', items: [{ id: '1', title: 'Item' }] },
      },
    ],
    wires: [],
  };
}

describe('resolveWiring', () => {
  it('auto-wires events to the next screen by convention', () => {
    const { wires, report } = resolveWiring(baseGraph(), loadDefaultRegistry());
    expect(report.unmet).toEqual([]);
    expect(report.ambiguous).toEqual([]);
    // b1.onboarding.completed -> s2, b2.paywall.completed -> s3, b2.paywall.restored -> s3
    expect(wires).toHaveLength(3);
    expect(wires.every((w) => w.origin === 'auto')).toBe(true);
    const targets = navigationTargets({ wires, report });
    expect(targets.get('b1')).toBe('s2');
    expect(targets.get('b2')).toBe('s3');
  });

  it('warns when an optional service falls back to the M0 mock', () => {
    const { report } = resolveWiring(baseGraph(), loadDefaultRegistry());
    expect(report.warnings.some((w) => w.includes('BillingService'))).toBe(true);
  });

  it('notes terminal events instead of failing', () => {
    // home.list emits nothing; place a quiz last so its event is terminal.
    const g = baseGraph();
    g.screens = [
      { id: 's1', block: 'b2', title: 'Paywall' },
      { id: 's3', block: 'b1', title: 'Quiz' },
    ];
    const r2 = resolveWiring(g, loadDefaultRegistry());
    expect(r2.report.notes.some((n) => n.includes('terminal'))).toBe(true);
    expect(r2.wires).toHaveLength(2); // b2's two events -> s3
  });

  it('lets explicit wires override the convention', () => {
    const g = baseGraph();
    g.wires = [{ from: { instance: 'b1', event: 'onboarding.completed' }, to: { screen: 's3' } }];
    const { wires } = resolveWiring(g, loadDefaultRegistry());
    const wire = wires.find((w) => w.from.instance === 'b1');
    expect(wire?.to.screen).toBe('s3');
    expect(wire?.origin).toBe('user');
  });

  it('rejects ambiguous wires', () => {
    const g = baseGraph();
    g.wires = [
      { from: { instance: 'b1', event: 'onboarding.completed' }, to: { screen: 's2' } },
      { from: { instance: 'b1', event: 'onboarding.completed' }, to: { screen: 's3' } },
    ];
    expect(() => resolveWiring(g, loadDefaultRegistry())).toThrow(WiringError);
  });

  it('rejects wires to unknown screens', () => {
    const g = baseGraph();
    g.wires = [{ from: { instance: 'b1', event: 'onboarding.completed' }, to: { screen: 's99' } }];
    expect(() => resolveWiring(g, loadDefaultRegistry())).toThrow(/unknown screen/);
  });

  it('rejects unknown block types', () => {
    const g = baseGraph();
    block(g, 'b1').type = 'nope.nope@1.0.0';
    expect(() => resolveWiring(g, loadDefaultRegistry())).toThrow(/Unknown block type/);
  });

  it('rejects invalid block configs with a clear message', () => {
    const g = baseGraph();
    block(g, 'b1').config = { questions: [] };
    expect(() => resolveWiring(g, loadDefaultRegistry())).toThrow(/invalid config/);
  });

  it('rejects unknown variants', () => {
    const g = baseGraph();
    block(g, 'b1').variant = 'quiz-hologram';
    expect(() => resolveWiring(g, loadDefaultRegistry())).toThrow(/unknown variant/);
  });

  it('rejects screens pointing at unknown instances', () => {
    const g = baseGraph();
    screen(g, 's1').block = 'b99';
    expect(() => resolveWiring(g, loadDefaultRegistry())).toThrow(/unknown block instance/);
  });

  it('notes block instances placed on no screen', () => {
    const g = baseGraph();
    g.blocks.push({
      id: 'b4',
      type: 'home.list@1.0.0',
      config: { title: 'Orphan', items: [{ id: '1', title: 'x' }] },
    });
    const { report } = resolveWiring(g, loadDefaultRegistry());
    expect(report.notes.some((n) => n.includes('b4') && n.includes('no screen'))).toBe(true);
  });

  it('rejects duplicate screen ids', () => {
    const g = baseGraph();
    g.screens.push({ id: 's1', block: 'b3', title: 'Dupe' });
    expect(() => resolveWiring(g, loadDefaultRegistry())).toThrow(/Duplicate screen ids/);
  });

  it('rejects duplicate block instance ids', () => {
    const g = baseGraph();
    g.blocks.push(block(g, 'b1'));
    expect(() => resolveWiring(g, loadDefaultRegistry())).toThrow(/Duplicate block instance ids/);
  });
});

describe('semantic routing', () => {
  function manifest(id: string, emits: unknown[], consumes: unknown[]) {
    return {
      id,
      version: '1.0.0',
      category: 'utility',
      variants: ['a'],
      config: { type: 'object', properties: {} },
      ports: { emits, consumes },
      editSurface: ['all'],
      locked: [],
    };
  }

  function semanticGraph(): { graph: ProjectGraph; registry: BlockRegistry } {
    const registry = new BlockRegistry();
    const stub = () => ({
      fileName: 'stub.tsx',
      content: '',
      acceptsOnComplete: false,
      acceptsInput: false,
    });
    registry.register(
      manifest(
        'test.emitter',
        [
          {
            event: 'data.ready',
            payload: {
              type: 'object',
              properties: { id: { type: 'string' } },
              required: ['id'],
            },
          },
        ],
        ['app.launched'],
      ),
      stub,
    );
    registry.register(
      manifest(
        'test.consumer',
        [],
        [
          {
            port: 'data.ready',
            accepts: {
              type: 'object',
              properties: { id: { type: 'string' } },
              required: ['id'],
            },
          },
        ],
      ),
      stub,
    );
    const graph: ProjectGraph = {
      schemaVersion: '0',
      app: { name: 'Test', slug: 'test', version: '1.0.0' },
      screens: [
        { id: 's1', block: 'e1', title: 'Emitter' },
        { id: 's2', block: 'c1', title: 'Consumer' },
      ],
      blocks: [
        { id: 'e1', type: 'test.emitter@1.0.0' },
        { id: 'c1', type: 'test.consumer@1.0.0' },
      ],
      wires: [],
    };
    return { graph, registry };
  }

  it('routes an event to its semantic consumer', () => {
    const { graph, registry } = semanticGraph();
    const { wires } = resolveWiring(graph, registry);
    expect(wires).toHaveLength(1);
    const w = wires[0]!;
    expect(w.to.screen).toBe('s2');
    expect(w.to.instance).toBe('c1');
    expect(w.to.port).toBe('data.ready');
    expect(w.origin).toBe('auto');
    expect(w.reason).toContain('semantic');
  });

  it('fails loudly on multiple consumers', () => {
    const { graph, registry } = semanticGraph();
    graph.screens.push({ id: 's3', block: 'c2', title: 'Consumer 2' });
    graph.blocks.push({ id: 'c2', type: 'test.consumer@1.0.0' });
    expect(() => resolveWiring(graph, registry)).toThrow(/Ambiguous/);
  });

  it('fails loudly on payload mismatch', () => {
    const { graph } = semanticGraph();
    const bad = new BlockRegistry();
    const stub = () => ({
      fileName: 'stub.tsx',
      content: '',
      acceptsOnComplete: false,
      acceptsInput: false,
    });
    bad.register(
      manifest(
        'test.emitter',
        [{ event: 'data.ready', payload: { type: 'object', properties: {}, required: [] } }],
        ['app.launched'],
      ),
      stub,
    );
    bad.register(
      manifest(
        'test.consumer',
        [],
        [
          {
            port: 'data.ready',
            accepts: {
              type: 'object',
              properties: { id: { type: 'string' } },
              required: ['id'],
            },
          },
        ],
      ),
      stub,
    );
    expect(() => resolveWiring(graph, bad)).toThrow(/requires property "id"/);
  });

  it('resolves an explicit wire to a named instance and port', () => {
    const { graph, registry } = semanticGraph();
    graph.wires = [
      {
        from: { instance: 'e1', event: 'data.ready' },
        to: { screen: 's2', instance: 'c1', port: 'data.ready' },
      },
    ];
    const { wires } = resolveWiring(graph, registry);
    expect(wires[0]!.origin).toBe('user');
    expect(wires[0]!.to.instance).toBe('c1');
  });

  it('rejects an explicit wire to a non-consuming instance', () => {
    const { graph, registry } = semanticGraph();
    graph.wires = [
      {
        from: { instance: 'e1', event: 'data.ready' },
        to: { screen: 's1', instance: 'e1', port: 'data.ready' },
      },
    ];
    expect(() => resolveWiring(graph, registry)).toThrow(/does not consume/);
  });
});

describe('flow analysis', () => {
  it('models the flow and marks every screen reachable', () => {
    const { report } = resolveWiring(baseGraph(), loadDefaultRegistry());
    expect(report.flow.entry).toBe('s1');
    expect(report.flow.reachable).toEqual(['s1', 's2', 's3']);
    expect(report.flow.unreachable).toEqual([]);
  });

  it('warns on unreachable screens', () => {
    const g = baseGraph();
    // Skip the paywall: quiz -> home directly.
    g.wires = [{ from: { instance: 'b1', event: 'onboarding.completed' }, to: { screen: 's3' } }];
    const { report } = resolveWiring(g, loadDefaultRegistry());
    expect(report.flow.unreachable).toEqual(['s2']);
    expect(report.warnings.some((w) => w.includes('"s2"') && w.includes('reachable'))).toBe(true);
  });

  it('does not flag tab-lane screens as unreachable', () => {
    const g = baseGraph();
    g.wires = [{ from: { instance: 'b1', event: 'onboarding.completed' }, to: { screen: 's3' } }];
    const s2 = g.screens.find((s) => s.id === 's2');
    if (!s2) throw new Error('test setup: s2 missing');
    s2.lane = 'tabs';
    const { report } = resolveWiring(g, loadDefaultRegistry());
    expect(report.flow.unreachable).toEqual([]);
    expect(report.flow.lanes).toEqual(['main', 'tabs']);
    expect(report.warnings.some((w) => w.includes('"s2"'))).toBe(false);
  });
});
