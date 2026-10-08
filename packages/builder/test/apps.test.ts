import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AppLibrary } from '../src/apps.js';
import { emptyProject } from '../src/cascade.js';

const project = (name: string) =>
  emptyProject({
    schemaVersion: '0',
    app: { name, slug: 'test', version: '1.0.0' },
    screens: [{ id: 'home', block: 'intro', title: 'Home' }],
    blocks: [{ id: 'intro', type: 'content.text@1.0.0', config: { title: name, body: 'Hello' } }],
  });
describe('app library', () => {
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
