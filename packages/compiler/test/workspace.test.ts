import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { loadDefaultRegistry } from '@blockfw/blocks';
import { migrateGraph } from '@blockfw/manifest';
import {
  compileWorkspace,
  compileWebProject,
  compileProject,
  exportZip,
  hashFiles,
} from '@blockfw/compiler';

const graph = (name = 'notes') =>
  migrateGraph(JSON.parse(readFileSync(`examples/${name}/graph.json`, 'utf8')));
const registry = loadDefaultRegistry();

describe('workspace export', () => {
  it('packages both runtimes with honest build commands, stable files and valid nested hashes', () => {
    const input = graph();
    const compiled = compileWorkspace(input, registry);
    expect(compileWorkspace(input, registry)).toEqual(compiled);
    expect(new Set(compiled.files.map((file) => file.path)).size).toBe(compiled.files.length);
    const content = (path: string) => compiled.files.find((file) => file.path === path)!.content;
    const root = JSON.parse(content('package.json'));
    const web = JSON.parse(content('apps/web/package.json'));
    const mobile = JSON.parse(content('apps/mobile/package.json'));
    expect(new Set([root.name, web.name, mobile.name]).size).toBe(3);
    expect(root.packageManager).toBe('pnpm@12.10.1');
    expect(mobile.scripts.build).toContain('expo export');
    expect(web.scripts.typecheck).toBe('tsc --noEmit');
    expect(JSON.parse(content('apps/mobile/app.json')).expo.platforms).toEqual(['android', 'ios']);
    expect(content('apps/web/src/main.tsx')).toBe(
      compileWebProject(input, registry).files.find((f) => f.path === 'src/main.tsx')!.content,
    );
    for (const name of ['web', 'mobile']) {
      const prefix = `apps/${name}/`;
      const files = compiled.files
        .filter((file) => file.path.startsWith(prefix))
        .map((file) => ({ ...file, path: file.path.slice(prefix.length) }));
      expect(JSON.parse(content(prefix + 'src/wiring-report.json')).projectHash).toBe(
        hashFiles(files.filter((file) => file.path !== 'src/wiring-report.json')),
      );
    }
    expect(compiled.projectHash).toBe(
      hashFiles(compiled.files.filter((file) => file.path !== 'wiring-report.json')),
    );
    expect(JSON.parse(content('wiring-report.json')).projectHash).toBe(compiled.projectHash);
    expect(compiled.files.some((file) => /^(packages|apps\/api)\//.test(file.path))).toBe(false);
    input.app.targets = ['web', 'android'];
    const android = compileWorkspace(input, registry);
    expect(
      JSON.parse(android.files.find((file) => file.path === 'apps/mobile/app.json')!.content).expo
        .platforms,
    ).toEqual(['android']);
  });

  it('retains exact standalone output for single-target graphs, including real cloud web', () => {
    const web = graph();
    web.app.targets = ['web'];
    expect(compileWorkspace(web, registry)).toEqual(compileWebProject(web, registry));
    const mobile = graph();
    mobile.app.targets = ['ios', 'android'];
    expect(compileWorkspace(mobile, registry)).toEqual(compileProject(mobile, registry));
    const cloud = graph('paper-cloud');
    expect(compileWorkspace(cloud, registry)).toEqual(compileWebProject(cloud, registry));
  });

  it('rejects native cloud before producing a partial workspace', () => {
    const cloud = graph('paper-cloud');
    cloud.app.targets = ['web', 'android'];
    expect(() => compileWorkspace(cloud, registry)).toThrow(/cloud.*native|native.*cloud/i);
  });

  it('exports byte-identical audited workspace ZIPs', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'blockfw-workspace-'));
    try {
      const first = join(directory, 'first.zip');
      const second = join(directory, 'second.zip');
      const result = await exportZip(graph(), first, 'workspace');
      expect(result.audit).toEqual({ ok: true, violations: [] });
      expect(result.fileCount).toBe(compileWorkspace(graph(), registry).files.length);
      await exportZip(graph(), second, 'workspace');
      expect(readFileSync(first)).toEqual(readFileSync(second));
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('CLI compiles a runnable workspace and rejects unsupported targets without creating output', () => {
    const directory = mkdtempSync(join(tmpdir(), 'blockc-workspace-'));
    try {
      const output = join(directory, 'app');
      const args = [
        resolve('packages/compiler/dist/cli.js'),
        'compile',
        resolve('examples/notes/graph.json'),
        '--target',
        'workspace',
        '--out',
        output,
      ];
      execFileSync(process.execPath, args, { stdio: 'pipe' });
      expect(existsSync(join(output, 'apps/web/src/main.tsx'))).toBe(true);
      expect(existsSync(join(output, 'apps/mobile/App.tsx'))).toBe(true);
      const invalid = join(directory, 'invalid');
      expect(() =>
        execFileSync(
          process.execPath,
          [...args.slice(0, 3), '--target', 'unknown', '--out', invalid],
          { stdio: 'pipe' },
        ),
      ).toThrow('web, mobile or workspace');
      expect(existsSync(invalid)).toBe(false);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
