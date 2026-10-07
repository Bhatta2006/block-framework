import { describe, expect, it } from 'vitest';
import { loadDefaultRegistry } from '@blockfw/blocks';
import { compileProject, hashFiles, PINNED_DEPS, PINNED_DEV_DEPS } from '@blockfw/compiler';
import type { ProjectGraph } from '@blockfw/manifest';
import { diffFiles } from '@blockfw/benchmark';
import baseGraphJson from '../../benchmark/src/base/graph.json' with { type: 'json' };

function baseGraph(): ProjectGraph {
  return JSON.parse(JSON.stringify(baseGraphJson)) as ProjectGraph;
}

function filePaths(result: ReturnType<typeof compileProject>): string[] {
  return result.files.map((f) => f.path).sort();
}

describe('compileProject', () => {
  it('emits a complete Expo project', () => {
    const result = compileProject(baseGraph(), loadDefaultRegistry());
    const paths = filePaths(result);
    for (const expected of [
      'package.json',
      'app.json',
      'tsconfig.json',
      'babel.config.js',
      'index.ts',
      'App.tsx',
      'src/theme.ts',
      'src/navigation.tsx',
      'src/screens/s1.tsx',
      'src/screens/s2.tsx',
      'src/screens/s3.tsx',
      'src/blocks/b1.tsx',
      'src/blocks/b2.tsx',
      'src/blocks/b3.tsx',
      'src/services/billing.mock.ts',
      'src/wiring-report.json',
      'README.md',
      '.gitignore',
    ]) {
      expect(paths).toContain(expected);
    }
  });

  it('is byte-identical across runs', () => {
    const registry = loadDefaultRegistry();
    const a = compileProject(baseGraph(), registry);
    const b = compileProject(baseGraph(), registry);
    expect(a.projectHash).toBe(b.projectHash);
    expect(hashFiles(a.files)).toBe(hashFiles(b.files));
    expect(a.files.map((f) => f.content)).toEqual(b.files.map((f) => f.content));
  });

  it('scopes a config change to the one block file (+ report)', () => {
    const registry = loadDefaultRegistry();
    const before = compileProject(baseGraph(), registry).files;
    const g = baseGraph();
    const b1 = g.blocks.find((x) => x.id === 'b1');
    if (!b1) throw new Error('fixture broken');
    b1.config = {
      skippable: false,
      questions: [{ prompt: 'Changed?', options: ['Yes', 'No'] }],
    };
    const after = compileProject(g, registry).files;
    expect(diffFiles(before, after).sort()).toEqual(
      ['src/blocks/b1.tsx', 'src/wiring-report.json'].sort(),
    );
  });

  it('reorders screens without touching block files', () => {
    const registry = loadDefaultRegistry();
    const before = compileProject(baseGraph(), registry).files;
    const g = baseGraph();
    const [s1, s2, s3] = g.screens;
    if (!s1 || !s2 || !s3) throw new Error('fixture broken');
    g.screens = [s3, s1, s2];
    const after = compileProject(g, registry).files;
    const changed = diffFiles(before, after);
    expect(changed).toContain('src/navigation.tsx');
    for (const p of changed) {
      expect(p.startsWith('src/blocks/')).toBe(false);
    }
  });

  it('wires navigation in screen order', () => {
    const result = compileProject(baseGraph(), loadDefaultRegistry());
    const nav = result.files.find((f) => f.path === 'src/navigation.tsx');
    const s1 = result.files.find((f) => f.path === 'src/screens/s1.tsx');
    expect(nav?.content).toContain('initialRouteName="s1"');
    expect(nav?.content).toContain('<Stack.Screen name="s1"');
    expect(s1?.content).toContain("navigation.navigate('s2')");
  });

  it('pins dependency versions', () => {
    const result = compileProject(baseGraph(), loadDefaultRegistry());
    const pkg = JSON.parse(
      result.files.find((f) => f.path === 'package.json')?.content ?? '{}',
    ) as { dependencies: Record<string, string>; devDependencies: Record<string, string> };
    for (const [name, version] of Object.entries(PINNED_DEPS)) {
      expect(pkg.dependencies[name]).toBe(version);
    }
    for (const [name, version] of Object.entries(PINNED_DEV_DEPS)) {
      expect(pkg.devDependencies[name]).toBe(version);
    }
    // babel-preset-expo must be a direct devDependency: babel resolves
    // presets from the project root, and without it `expo export` fails.
    expect(pkg.devDependencies['babel-preset-expo']).toBeDefined();
  });

  it('rejects component name collisions', () => {
    const g = baseGraph();
    g.blocks.push({
      id: 'b-1',
      type: 'onboarding.quiz@1.0.0',
      config: { questions: [{ prompt: 'Q', options: ['A', 'B'] }] },
    });
    g.screens.push({ id: 's4', block: 'b-1', title: 'Clash' });
    // 'b1' -> 'B1Block' and 'b-1' -> 'B1Block': collision
    expect(() => compileProject(g, loadDefaultRegistry())).toThrow(/collision/);
  });

  it('rejects unknown block types and bad configs', () => {
    const g = baseGraph();
    const b1 = g.blocks.find((x) => x.id === 'b1');
    if (!b1) throw new Error('fixture broken');
    b1.type = 'nope.nope@1.0.0';
    expect(() => compileProject(g, loadDefaultRegistry())).toThrow(/Unknown block type/);
  });

  it('embeds the project hash in the wiring report', () => {
    const result = compileProject(baseGraph(), loadDefaultRegistry());
    const report = JSON.parse(
      result.files.find((f) => f.path === 'src/wiring-report.json')?.content ?? '{}',
    ) as { projectHash: string; wires: unknown[] };
    expect(report.projectHash).toBe(result.projectHash);
    expect(report.wires.length).toBeGreaterThan(0);
  });
});
