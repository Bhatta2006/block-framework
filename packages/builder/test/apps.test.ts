import { describe, it, expect } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AppLibrary, replaceCatalogFile } from '../src/apps.js';
import { emptyProject } from '../src/cascade.js';

const project = (name: string) =>
  emptyProject({
    schemaVersion: '0',
    app: { name, slug: 'test', version: '1.0.0' },
    screens: [{ id: 'home', block: 'intro', title: 'Home' }],
    blocks: [{ id: 'intro', type: 'content.text@1.0.0', config: { title: name, body: 'Hello' } }],
  });
describe('app library', () => {
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
