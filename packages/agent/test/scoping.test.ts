/**
 * Adversarial tests for the agent's scoping validator.
 * Each attack the brief names is tried here and must be rejected:
 * locked fields, schema breaks, deleting screens, scope escape.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkScope } from '../src/scoping.js';
import type { AgentProject } from '../src/types.js';

const here = dirname(fileURLToPath(import.meta.url));
const graph = JSON.parse(
  readFileSync(join(here, '..', '..', '..', 'examples', 'full-app', 'graph.json'), 'utf8'),
);

function project(overrides: Partial<AgentProject> = {}): AgentProject {
  return {
    version: 1,
    profile: null,
    touched: [],
    graph: JSON.parse(JSON.stringify(graph)),
    ...overrides,
  };
}

describe('checkScope', () => {
  it('accepts a well-formed edit inside the editSurface', () => {
    const p = project();
    const r = checkScope(p, {
      ops: [{ path: 'block:b1.config.headline', value: 'Hello!' }],
      rationale: 'test',
    });
    expect(r.ok).toBe(true);
    expect(r.accepted).toHaveLength(1);
    expect(r.rejections).toHaveLength(0);
  });

  it('ATTACK: rejects locked fields', () => {
    const p = project();
    const r = checkScope(p, {
      ops: [{ path: 'block:b1.config.ports', value: {} }],
      rationale: 'evil',
    });
    expect(r.ok).toBe(false);
    expect(r.rejections[0]).toMatch(/not in the block's editSurface|locked/);
  });

  it('ATTACK: rejects paths outside block config (scope escape)', () => {
    const p = project();
    for (const path of [
      'block:b1.variant',
      'app.name',
      'graph.screens',
      'block:b1.config.headline; DROP TABLE',
      '../secret',
      'block:b1.config',
    ]) {
      const r = checkScope(p, { ops: [{ path, value: 'x' }], rationale: 'evil' });
      expect(r.ok, path).toBe(false);
    }
  });

  it('ATTACK: rejects unknown block instances', () => {
    const p = project();
    const r = checkScope(p, {
      ops: [{ path: 'block:nope.config.headline', value: 'x' }],
      rationale: 'evil',
    });
    expect(r.ok).toBe(false);
    expect(r.rejections[0]).toMatch(/unknown block instance/);
  });

  it('rejects unknown block types without throwing', () => {
    const p = project();
    p.graph.blocks[0]!.type = 'unknown.block@1.0.0';
    const result = checkScope(p, {
      ops: [{ path: `block:${p.graph.blocks[0]!.id}.config.headline`, value: 'Hello' }],
      rationale: 'test',
    });
    expect(result.ok).toBe(false);
    expect(result.rejections[0]).toMatch(/unknown block type/);
  });

  it('ATTACK: rejects user hand-edited (touched) paths', () => {
    const p = project({ touched: ['block:b1.config.headline'] });
    const r = checkScope(p, {
      ops: [{ path: 'block:b1.config.headline', value: 'overwritten!' }],
      rationale: 'evil',
    });
    expect(r.ok).toBe(false);
    expect(r.rejections[0]).toMatch(/hand-edited/);
  });

  it('ATTACK: rejects values that break the JSON Schema', () => {
    const p = project();
    // headline has minLength 1: empty string must fail.
    const r = checkScope(p, {
      ops: [{ path: 'block:b1.config.headline', value: '' }],
      rationale: 'evil',
    });
    expect(r.ok).toBe(false);
    expect(r.rejections[0]).toMatch(/schema validation/);
  });

  it('ATTACK: rejects wrong value types', () => {
    const p = project();
    const r = checkScope(p, {
      ops: [{ path: 'block:b1.config.headline', value: 12345 }],
      rationale: 'evil',
    });
    expect(r.ok).toBe(false);
    expect(r.rejections[0]).toMatch(/schema validation/);
  });

  it('rejects non-array ops and non-JSON plans', () => {
    const p = project();
    expect(checkScope(p, { ops: 'nope' as never, rationale: '' }).ok).toBe(false);
    expect(checkScope(p, null as never).ok).toBe(false);
  });

  it('accepts empty ops (model declines out-of-scope requests)', () => {
    const p = project();
    const r = checkScope(p, { ops: [], rationale: 'nothing editable matches' });
    expect(r.ok).toBe(true);
    expect(r.accepted).toHaveLength(0);
  });
});
