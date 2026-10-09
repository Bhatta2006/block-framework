import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadDefaultRegistry } from '@blockfw/blocks';
import { compileProject, compileWebProject } from '@blockfw/compiler';
import type { ProjectGraph } from '@blockfw/manifest';
import original from './fixtures/phase0-original.json' with { type: 'json' };

describe('Phase 0 original export baseline', () => {
  const registry = loadDefaultRegistry();
  for (const [key, expected] of Object.entries(original)) {
    it(key, () => {
      const [name, target] = key.split('/');
      const graph = JSON.parse(
        readFileSync(new URL(`../../../examples/${name}/graph.json`, import.meta.url), 'utf8'),
      ) as ProjectGraph;
      const compile = target === 'web' ? compileWebProject : compileProject;
      if ('rejected' in expected) {
        expect(() => compile(graph, registry)).toThrow(expected.rejected);
        return;
      }
      const result = compile(graph, registry);
      expect(result.projectHash).toBe(expected.projectHash);
      expect(
        Object.fromEntries(
          result.files.map((file) => [
            file.path,
            createHash('sha256').update(file.content).digest('hex'),
          ]),
        ),
      ).toEqual(expected.files);
    });
  }
});
