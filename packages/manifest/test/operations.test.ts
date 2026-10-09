import { describe, expect, it } from 'vitest';
import {
  applyGraphOperations,
  applyProjectOperations,
  diffProjectOperations,
  legacyGraph,
  migrateGraph,
  ProjectOperationLog,
  type GraphDocument,
  type ProjectGraph,
} from '@blockfw/manifest';

function document(): GraphDocument & { graph: ProjectGraph } {
  return {
    version: 1,
    profile: null,
    touched: [],
    graph: {
      schemaVersion: '0',
      app: { name: 'Demo', slug: 'demo', version: '1.0.0' },
      screens: [{ id: 'home', block: 'hero', title: 'Home' }],
      blocks: [{ id: 'hero', type: 'content.hero@1.0.0', config: { title: 'Hello' } }],
    },
  };
}
describe('typed graph operations', () => {
  it('adds a composed page, inserts a block, and wires stable IDs in one atomic transaction', () => {
    const before = migrateGraph(document().graph);
    const next = applyGraphOperations(before, [
      { type: 'insertBlock', component: { id: 'text', kind: 'block', type: 'content.text@1.0.0' } },
      {
        type: 'addPage',
        page: { id: 'detail', title: 'Detail', primaryComponent: 'text', components: ['text'] },
      },
      {
        type: 'wire',
        wire: { from: { instance: 'hero', event: 'continue' }, to: { screen: 'detail' } },
      },
    ]);
    const view = legacyGraph(next);
    expect(view.screens.map((page) => page.id)).toEqual(['home', 'detail']);
    expect(view.blocks.map((block) => block.id)).toEqual(['hero', 'text']);
    expect(view.wires).toHaveLength(1);
    expect(before.components).toHaveLength(1);
    expect(() => applyGraphOperations(before, [{ type: 'removeComponent', id: 'hero' }])).toThrow();
    expect(before.components).toHaveLength(1);
  });
  it('defines later-phase entities, fields, flows and bindings without executing them', () => {
    const graph = applyGraphOperations(migrateGraph(document().graph), [
      { type: 'createEntity', entity: { id: 'Post', fields: {} } },
      { type: 'addField', entityId: 'Post', name: 'title', schema: { type: 'string' } },
      {
        type: 'createFlow',
        flow: { id: 'publish', trigger: { type: 'manual' }, steps: [], edges: [] },
      },
      { type: 'setBinding', id: 'hero', field: 'title', binding: { bind: 'query:post.title' } },
    ]);
    expect(graph.schemaVersion).toBe('1');
    expect(() => legacyGraph(graph)).toThrow('Data model execution');
  });
  it('rejects prototype paths, non-JSON values, invalid order and duplicate insertion without input mutation', () => {
    const before = document();
    const copy = structuredClone(before);
    for (const path of [['config', '__proto__', 'polluted'], ['constructor'], []]) {
      expect(() =>
        applyProjectOperations(before, [{ type: 'setBlockField', id: 'hero', path, value: true }]),
      ).toThrow();
    }
    expect(() => applyProjectOperations(before, [{ type: 'setProfile', profile: NaN }])).toThrow(
      'finite JSON',
    );
    expect(() => applyGraphOperations(before.graph, [{ type: 'orderPages', ids: [] }])).toThrow(
      'every ID',
    );
    expect(() =>
      applyGraphOperations(before.graph, [
        { type: 'insertBlock', component: { ...before.graph.blocks[0]!, kind: 'block' } },
      ]),
    ).toThrow('Duplicate ID');
    expect(before).toEqual(copy);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
  it('translates existing recipes, including deleted optional values and array order, into reversible operations', () => {
    const before = document();
    before.graph.app.theme = { primaryColor: '#112233' };
    const next = structuredClone(before);
    delete next.graph.app.theme;
    next.graph.blocks[0]!.config = { title: 'Updated' };
    next.graph.screens[0]!.blocks = ['hero'];
    next.touched = ['block:hero.config.title'];
    const ops = diffProjectOperations(before, next);
    expect(ops.some((op) => op.type === 'setComponent')).toBe(true);
    expect(applyProjectOperations(before, ops)).toEqual(next);
    expect(applyProjectOperations(next, diffProjectOperations(next, before))).toEqual(before);
  });
});
describe('operation log', () => {
  it('uses forward/inverse operations for shared manual and AI history, and clears redo after a new edit', () => {
    const log = new ProjectOperationLog<ReturnType<typeof document>>();
    const before = document();
    const ai = log.apply(
      before,
      [{ type: 'setBlockField', id: 'hero', path: ['config', 'title'], value: 'AI' }],
      'agent',
    );
    const manual = log.apply(
      ai,
      [{ type: 'setBlockField', id: 'hero', path: ['config', 'title'], value: 'Manual' }],
      'ui',
    );
    expect(log.agentDepth).toBe(1);
    expect(log.travel('undo', manual)).toEqual(ai);
    expect(log.travel('undo')).toEqual(before);
    expect(log.travel('redo')).toEqual(ai);
    const latest = log.apply(
      ai,
      [{ type: 'setTouched', touched: ['block:hero.config.title'] }],
      'ui',
    );
    expect(latest.touched).toHaveLength(1);
    expect(log.state.redo).toBe(0);
    expect(log.entries[0]!.forward[0]!.type).toBe('setBlockField');
  });
  it('does not advance state when persistence or undo fails', () => {
    let fail = true;
    const log = new ProjectOperationLog<ReturnType<typeof document>>(() => {
      if (fail) throw new Error('Disk full');
    });
    const before = document();
    const ops = [{ type: 'setTouched' as const, touched: ['app.name'] }];
    expect(() => log.apply(before, ops, 'ui')).toThrow('Disk full');
    expect(log.state).toEqual({ undo: 0, redo: 0, revision: 0 });
    fail = false;
    const next = log.apply(before, ops, 'ui');
    fail = true;
    expect(() => log.travel('undo', next)).toThrow('Disk full');
    expect(log.state).toEqual({ undo: 1, redo: 0, revision: 1 });
    expect(before.touched).toEqual([]);
  });
  it('preserves canonical v1 targets through compatibility edits and target undo', () => {
    const before = document();
    let stored = migrateGraph(before.graph);
    stored.app.targets = ['web'];
    const log = new ProjectOperationLog<ReturnType<typeof document>>(
      (_next, graph) => {
        stored = migrateGraph(graph);
      },
      () => stored,
    );
    const renamed = structuredClone(before);
    renamed.graph.app.name = 'Renamed';
    const next = log.apply(before, diffProjectOperations(before, renamed), 'ui');
    expect(stored.app.targets).toEqual(['web']);
    const changed = log.apply(
      next,
      [{ type: 'setApp', app: { ...stored.app, targets: ['web', 'android'] } }],
      'import',
    );
    expect(stored.app.targets).toEqual(['web', 'android']);
    log.travel('undo', changed);
    expect(stored.app.targets).toEqual(['web']);
  });
});
