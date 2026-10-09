import { createHash } from 'node:crypto';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadDefaultRegistry } from '@blockfw/blocks';
import { compileProject, compileWebProject, exportZip } from '@blockfw/compiler';
import { migrateGraph, type ProjectGraph } from '@blockfw/manifest';
import original from './fixtures/phase0-v2.json' with { type: 'json' };

describe('Phase 0 vendored export baseline (original fixture retained)', () => {
  const registry = loadDefaultRegistry();
  for (const [key, expected] of Object.entries(original)) {
    it(key, async () => {
      const [name, target] = key.split('/');
      const graph = JSON.parse(
        readFileSync(new URL(`../../../examples/${name}/graph.json`, import.meta.url), 'utf8'),
      ) as ProjectGraph;
      const compile = target === 'web' ? compileWebProject : compileProject;
      if ('rejected' in expected) {
        expect(() => compile(graph, registry)).toThrow(expected.rejected);
        expect(() => compile(migrateGraph(graph), registry)).toThrow(expected.rejected);
        return;
      }
      const result = compile(graph, registry);
      expect(compile(migrateGraph(graph), registry)).toEqual(result);
      expect(result.projectHash).toBe(expected.projectHash);
      expect(
        Object.fromEntries(
          result.files.map((file) => [
            file.path,
            createHash('sha256').update(file.content).digest('hex'),
          ]),
        ),
      ).toEqual(expected.files);
      const directory = mkdtempSync(join(tmpdir(), 'blockfw-golden-'));
      try {
        const path = join(directory, 'app.zip');
        const exported = await exportZip(graph, path, target as 'web' | 'mobile');
        expect(exported.audit).toEqual({ ok: true, violations: [] });
        expect(createHash('sha256').update(readFileSync(path)).digest('hex')).toBe(
          expected.zipHash,
        );
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    });
  }
});
