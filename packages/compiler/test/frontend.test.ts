import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadDefaultRegistry } from '@blockfw/blocks';
import { canonicalJson, migrateGraph, type ProjectGraph } from '@blockfw/manifest';
import {
  compileProject,
  compileWebProject,
  emitNativeIR,
  emitWebIR,
  prepareProject,
  type CompilerIR,
} from '@blockfw/compiler';

const graph = (name = 'notes'): ProjectGraph =>
  JSON.parse(
    readFileSync(new URL(`../../../examples/${name}/graph.json`, import.meta.url), 'utf8'),
  );
describe('compiler semantic front-end', () => {
  it('prepares one target-neutral IR consumed by both emitters with unchanged output', () => {
    const registry = loadDefaultRegistry();
    const input = graph();
    const ir = prepareProject(input, registry);
    expect(emitWebIR(ir, registry)).toEqual(compileWebProject(input, registry));
    expect(emitNativeIR(ir, registry)).toEqual(compileProject(input, registry));
    expect(ir.blocks.map((block) => block.id)).toEqual(input.blocks.map((block) => block.id));
    expect(ir.inputs.length).toBeGreaterThan(0);
    expect(ir.inputs[0]!.schema.type).toBe('object');
    expect(ir.blocks.every((block) => block.version === '1.0.0')).toBe(true);
    expect(JSON.parse(canonicalJson(ir))).toEqual(ir);
  });
  it('deep-freezes only owned IR state and leaves source/registry objects independent', () => {
    const registry = loadDefaultRegistry();
    const input = graph();
    const before = structuredClone(input);
    const ir = prepareProject(input, registry);
    expect(() => {
      ir.blocks[0]!.config.title = 'Changed';
    }).toThrow(TypeError);
    expect(() => {
      ir.wiring.wires.push(ir.wiring.wires[0]!);
    }).toThrow(TypeError);
    expect(() => {
      ir.compatibilityGraph.app.name = 'Changed';
    }).toThrow(TypeError);
    const manifest = registry.get(input.blocks[0]!.type).manifest;
    expect(Object.isFrozen(manifest)).toBe(false);
    expect(Object.isFrozen(manifest.defaultConfig)).toBe(false);
    input.app.name = 'Edited after prepare';
    expect(ir.compatibilityGraph.app.name).toBe(before.app.name);
    if (manifest.defaultConfig) manifest.defaultConfig.title = 'Registry changed';
    expect(ir.blocks[0]!.config.title).not.toBe('Registry changed');
  });
  it('rejects forged/deserialized IR and a different implementation registry', () => {
    const registry = loadDefaultRegistry();
    const ir = prepareProject(graph(), registry);
    expect(() => emitWebIR(JSON.parse(JSON.stringify(ir)) as CompilerIR, registry)).toThrow(
      'front-end-validated',
    );
    expect(() => emitNativeIR(ir, loadDefaultRegistry())).toThrow('its registry');
  });
  it('keeps target rejection explicit and rejects unsupported semantics before emission', () => {
    const registry = loadDefaultRegistry();
    const input = migrateGraph(graph());
    input.app.targets = ['web'];
    const ir = prepareProject(input, registry);
    expect(() => emitNativeIR(ir, registry)).toThrow('Native target is not declared');
    const cloud = prepareProject(graph('paper-cloud'), registry);
    expect(() => emitNativeIR(cloud, registry)).toThrow('Native integration is not implemented');
    input.flows.push({ id: 'later', trigger: { type: 'manual' }, steps: [], edges: [] });
    expect(() => prepareProject(input, registry)).toThrow('Flows is not implemented');
  });
});
