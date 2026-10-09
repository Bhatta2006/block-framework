import { describe, it, expect } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AppLibrary, replaceCatalogFile } from '../src/apps.js';
import { emptyProject } from '../src/cascade.js';
import { migrateGraph } from '@blockfw/manifest';

const project = (name: string) =>
  emptyProject({
    schemaVersion: '0',
    app: { name, slug: 'test', version: '1.0.0' },
    screens: [{ id: 'home', block: 'intro', title: 'Home' }],
    blocks: [{ id: 'intro', type: 'content.text@1.0.0', config: { title: name, body: 'Hello' } }],
  });
describe('app library', () => {
  it('retains authored v1 targets while editing the compatibility view', () => {
    const initial = project('Web');
    const graph = migrateGraph(initial.graph);
    graph.app.targets = ['web'];
    const apps = new AppLibrary({ ...initial, graph });
    const edited = apps.project;
    edited.graph.app.name = 'Edited';
    apps.update(edited);
    expect(apps.storedProject.graph.app.targets).toEqual(['web']);
    expect(apps.project.graph.app.name).toBe('Edited');
  });
  it('migrates active and deleted v0 catalog records to v1 on successful persistence', () => {
    const dir = mkdtempSync(join(tmpdir(), 'block-studio-migration-'));
    try {
      const path = join(dir, 'apps.json');
      writeFileSync(
        path,
        JSON.stringify({
          version: 1,
          activeId: 'active',
          apps: [
            { id: 'active', project: project('Active') },
            { id: 'deleted', deleted: true, project: project('Deleted') },
          ],
        }),
      );
      const apps = new AppLibrary(project('Unused'), path);
      apps.update(apps.project);
      const stored = JSON.parse(readFileSync(path, 'utf8'));
      expect(
        stored.apps.map(
          (app: { project: { graph: { schemaVersion: string } } }) =>
            app.project.graph.schemaVersion,
        ),
      ).toEqual(['1', '1']);
      const loaded = new AppLibrary(project('Unused'), path);
      loaded.restore('deleted');
      loaded.activate('deleted');
      expect(loaded.project.graph.app.name).toBe('Deleted');
      expect(loaded.project.graph.app.dataId).toBe('deleted');
      stored.apps[0].project.graph.schemaVersion = 'unknown';
      writeFileSync(path, JSON.stringify(stored));
      const before = readFileSync(path, 'utf8');
      expect(() => new AppLibrary(project('Unused'), path)).toThrow('schema validation');
      expect(readFileSync(path, 'utf8')).toBe(before);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it('retries temporary file locks while retaining atomic replacement and propagates permanent failures', () => {
    let attempts = 0;
    const waits: number[] = [];
    replaceCatalogFile(
      'temporary',
      'catalog',
      () => {
        if (++attempts < 3) throw Object.assign(new Error('Locked'), { code: 'EPERM' });
      },
      (ms) => {
        waits.push(ms);
      },
    );
    expect(attempts).toBe(3);
    expect(waits).toEqual([25, 50]);
    attempts = 0;
    expect(() =>
      replaceCatalogFile(
        'temporary',
        'catalog',
        () => {
          attempts++;
          throw Object.assign(new Error('Locked'), { code: 'EPERM' });
        },
        () => {},
      ),
    ).toThrow('Locked');
    expect(attempts).toBe(6);
    expect(() =>
      replaceCatalogFile(
        'temporary',
        'catalog',
        () => {
          throw Object.assign(new Error('Missing'), { code: 'ENOENT' });
        },
        () => {
          throw new Error('Unexpected retry');
        },
      ),
    ).toThrow('Missing');
  });
  it('keeps the active app and records unchanged when a catalog write cannot complete', () => {
    const dir = mkdtempSync(join(tmpdir(), 'block-studio-failed-save-'));
    try {
      const path = join(dir, 'apps.json');
      const apps = new AppLibrary(project('Original'), path);
      apps.update(project('Original'));
      const id = apps.activeId;
      renameSync(path, path + '.backup');
      mkdirSync(path);
      expect(() => apps.create(project('Unwritten'))).toThrow();
      expect(apps.activeId).toBe(id);
      expect(apps.list().apps).toHaveLength(1);
      expect(apps.project.graph.app.name).toBe('Original');
      expect(JSON.parse(readFileSync(path + '.backup', 'utf8')).apps).toHaveLength(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it('persists independent apps, active selection, and recoverable deletion', () => {
    const dir = mkdtempSync(join(tmpdir(), 'block-studio-apps-'));
    try {
      const path = join(dir, 'apps.json');
      const apps = new AppLibrary(project('First'), path);
      const first = apps.activeId;
      apps.update(project('First edited'));
      apps.create(project('Second'));
      const second = apps.activeId;
      expect(second).not.toBe(first);
      apps.activate(first);
      expect(apps.project.graph.app.name).toBe('First edited');
      apps.remove(first);
      expect(apps.activeId).toBe(second);
      const reloaded = new AppLibrary(project('Unused'), path);
      expect(reloaded.activeId).toBe(second);
      expect(reloaded.list().apps.find((a) => a.id === first)?.deleted).toBe(true);
      reloaded.restore(first);
      reloaded.activate(first);
      expect(reloaded.project.graph.app.name).toBe('First edited');
      reloaded.remove(second);
      expect(() => reloaded.remove(first)).toThrow('at least one app');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
