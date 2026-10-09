import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  legacyGraph,
  migrateGraph,
  validateAppGraphV1,
  type ProjectGraph,
} from '@blockfw/manifest';

const example = (name = 'studio'): ProjectGraph =>
  JSON.parse(
    readFileSync(new URL(`../../../examples/${name}/graph.json`, import.meta.url), 'utf8'),
  );

describe('graph schema v1 migration', () => {
  for (const name of ['studio', 'notes', 'paper-cloud', 'subscription-app', 'full-app']) {
    it(`migrates ${name} losslessly, deterministically, and idempotently`, () => {
      const old = example(name);
      const before = structuredClone(old);
      const migrated = migrateGraph(old);
      expect(migrated.schemaVersion).toBe('1');
      expect(migrateGraph(old)).toEqual(migrated);
      expect(migrateGraph(migrated)).toEqual(migrated);
      expect(legacyGraph(migrated)).toEqual(before);
      expect(old).toEqual(before);
      migrated.app.name = 'Changed';
      expect(old).toEqual(before);
    });
  }
  it('retains empty themes, explicit one-block compositions, wires, and omitted defaults', () => {
    const old = example('notes');
    old.app.theme = {};
    old.wires = [];
    for (const page of old.screens) page.blocks = page.blocks ?? [page.block];
    expect(legacyGraph(migrateGraph(old))).toEqual(old);
    delete old.app.theme;
    delete old.wires;
    expect(legacyGraph(migrateGraph(old))).toEqual(old);
  });
  it('rejects unknown versions and malformed v0 without mutating them', () => {
    expect(() => migrateGraph({ ...example(), schemaVersion: '2' })).toThrow('schema validation');
    const old = example();
    old.app.slug = 'BAD';
    const before = structuredClone(old);
    expect(() => migrateGraph(old)).toThrow('schema validation');
    expect(old).toEqual(before);
  });
  it('rejects duplicate IDs, missing references, placements, and cycles including unplaced nodes', () => {
    const graph = migrateGraph(example());
    graph.components.push(structuredClone(graph.components[0]!));
    expect(() => validateAppGraphV1(graph)).toThrow('Duplicate component');
    graph.components.pop();
    graph.pages[0]!.components.push('missing');
    expect(() => validateAppGraphV1(graph)).toThrow('Unknown component');
    graph.pages[0]!.components.pop();
    graph.pages.push({ ...graph.pages[0]!, id: 'duplicatePlacement' });
    expect(() => validateAppGraphV1(graph)).toThrow('Duplicate component placement');
    graph.pages.pop();
    graph.components.push({ id: 'cycle', kind: 'layout', layout: 'Stack', children: ['cycle'] });
    expect(() => validateAppGraphV1(graph)).toThrow('Component cycle');
  });
  it('declares environment names but never values and checks service references', () => {
    const graph = migrateGraph(example());
    graph.env.push({ name: 'AUTH_SECRET', scope: 'server', required: true });
    validateAppGraphV1(graph);
    expect(() =>
      validateAppGraphV1({ ...graph, env: [{ ...graph.env[0], value: 'secret' }] }),
    ).toThrow('schema validation');
    graph.services.push({ id: 'auth', provider: 'better-auth', env: { secret: 'UNDECLARED' } });
    expect(() => validateAppGraphV1(graph)).toThrow('Unknown environment declaration');
  });
  it('validates future contracts but rejects unsupported execution instead of discarding declarations', () => {
    const graph = migrateGraph(example());
    graph.data.entities.push({ id: 'Post', fields: { title: { type: 'string' } } });
    validateAppGraphV1(graph);
    expect(() => legacyGraph(graph)).toThrow('Data model execution is not implemented');
    graph.data.entities = [];
    graph.flows.push({ id: 'publish', trigger: { type: 'manual' }, steps: [], edges: [] });
    expect(() => legacyGraph(graph)).toThrow('Flows is not implemented');
    graph.flows = [];
    graph.pages[0]!.guards = ['requiresAuth'];
    expect(() => legacyGraph(graph)).toThrow('Advanced routing is not implemented');
  });
});
