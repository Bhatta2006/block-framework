import { describe, expect, it } from 'vitest';
import {
  SchemaError,
  validateBlockConfig,
  validateManifest,
  validateProjectGraph,
} from '@blockfw/manifest';

const goodManifest = {
  id: 'onboarding.quiz',
  version: '1.0.0',
  category: 'onboarding',
  variants: ['quiz-cards', 'quiz-list'],
  config: { type: 'object', properties: { skippable: { type: 'boolean' } } },
  ports: { emits: ['onboarding.completed'], consumes: ['app.launched'] },
  editSurface: ['src/blocks/*'],
  locked: ['src/services/*'],
};

const goodGraph = {
  schemaVersion: '0',
  app: { name: 'Demo', slug: 'demo', version: '1.0.0' },
  screens: [{ id: 's1', block: 'b1', title: 'Welcome' }],
  blocks: [{ id: 'b1', type: 'onboarding.quiz@1.0.0' }],
};

describe('validateManifest', () => {
  it('accepts a valid manifest', () => {
    expect(() => validateManifest(goodManifest)).not.toThrow();
  });

  it('rejects a bad block id', () => {
    expect(() => validateManifest({ ...goodManifest, id: 'Quiz' })).toThrow(SchemaError);
  });

  it('rejects a non-semver version', () => {
    expect(() => validateManifest({ ...goodManifest, version: 'one' })).toThrow(SchemaError);
  });

  it('rejects missing required fields', () => {
    const { ports: _ports, ...rest } = goodManifest;
    expect(() => validateManifest(rest)).toThrow(SchemaError);
  });

  it('rejects additional properties', () => {
    expect(() => validateManifest({ ...goodManifest, surprise: 1 })).toThrow(SchemaError);
  });
});

describe('validateProjectGraph', () => {
  it('accepts a valid graph', () => {
    expect(() => validateProjectGraph(goodGraph)).not.toThrow();
  });

  it('rejects a bad slug', () => {
    expect(() =>
      validateProjectGraph({ ...goodGraph, app: { ...goodGraph.app, slug: 'Bad Slug!' } }),
    ).toThrow(SchemaError);
  });

  it('rejects a malformed block type reference', () => {
    const bad = {
      ...goodGraph,
      blocks: [{ id: 'b1', type: 'onboarding.quiz' }],
    };
    expect(() => validateProjectGraph(bad)).toThrow(SchemaError);
  });

  it('rejects an empty screens array', () => {
    expect(() => validateProjectGraph({ ...goodGraph, screens: [] })).toThrow(SchemaError);
  });
});

describe('validateBlockConfig', () => {
  it('accepts valid config and rejects invalid config', () => {
    validateManifest(goodManifest);
    expect(validateBlockConfig(goodManifest, { skippable: true })).toEqual([]);
    const issues = validateBlockConfig(goodManifest, { skippable: 'yes' });
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0]!.path).toContain('skippable');
  });
});
