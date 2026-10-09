import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { BuilderProject } from './cascade.js';
import { legacyGraph, migrateGraph, type AppGraphV1, type GraphInput } from '@blockfw/manifest';

export type StoredBuilderProject = Omit<BuilderProject, 'graph'> & { graph: GraphInput };
type CanonicalProject = Omit<BuilderProject, 'graph'> & { graph: AppGraphV1 };

interface AppRecord {
  id: string;
  project: CanonicalProject;
  deleted?: boolean;
}
interface Catalog {
  version: 1;
  activeId: string;
  apps: AppRecord[];
}

/** Retain atomic replacement when Windows scanners briefly lock the old catalog. */
export function replaceCatalogFile(
  source: string,
  target: string,
  rename: typeof renameSync = renameSync,
  wait: (milliseconds: number) => void = (milliseconds) => {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
  },
) {
  const delays = [25, 50, 100, 200, 300];
  for (let attempt = 0; ; attempt++) {
    try {
      rename(source, target);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (!['EPERM', 'EACCES', 'EBUSY'].includes(code ?? '') || attempt >= delays.length)
        throw error;
      wait(delays[attempt]!);
    }
  }
}

/** Local app library. Deleted apps stay recoverable in the library's trash. */
export class AppLibrary {
  private catalog: Catalog;
  constructor(
    initial: StoredBuilderProject,
    private path?: string,
  ) {
    this.catalog =
      path && existsSync(path)
        ? (JSON.parse(readFileSync(path, 'utf8')) as Catalog)
        : { version: 1, activeId: randomUUID(), apps: [] };
    if (!this.catalog.apps.length)
      this.catalog.apps.push({
        id: this.catalog.activeId,
        project: { ...structuredClone(initial), graph: migrateGraph(initial.graph) },
      });
    this.catalog.apps.forEach((a) => {
      a.project.graph = migrateGraph(a.project.graph);
      legacyGraph(a.project.graph);
      a.project.graph.app.dataId = a.id;
    });
    if (!this.catalog.apps.some((a) => a.id === this.catalog.activeId && !a.deleted))
      throw new Error('App library has no active app.');
  }
  get activeId() {
    return this.catalog.activeId;
  }
  get project() {
    const stored = this.storedProject;
    return { ...stored, graph: legacyGraph(stored.graph) };
  }
  get storedProject(): CanonicalProject {
    return structuredClone(this.catalog.apps.find((a) => a.id === this.activeId)!.project);
  }
  update(project: StoredBuilderProject) {
    const copy = { ...structuredClone(project), graph: migrateGraph(project.graph) };
    if (project.graph.schemaVersion === '0' && !project.graph.app.cloud)
      copy.graph.app.targets = this.storedProject.graph.app.targets;
    copy.graph.app.dataId = this.activeId;
    this.change(() => {
      this.catalog.apps.find((a) => a.id === this.activeId)!.project = copy;
    });
  }
  list() {
    return {
      activeId: this.activeId,
      apps: this.catalog.apps.map((a) => ({
        id: a.id,
        name: a.project.graph.app.name,
        deleted: Boolean(a.deleted),
      })),
    };
  }
  create(project: StoredBuilderProject) {
    const id = randomUUID();
    const copy = { ...structuredClone(project), graph: migrateGraph(project.graph) };
    copy.graph.app.dataId = id;
    this.change(() => {
      this.catalog.apps.push({ id, project: copy });
      this.catalog.activeId = id;
    });
  }
  activate(id: string) {
    if (!this.catalog.apps.some((a) => a.id === id && !a.deleted))
      throw new Error('App not found.');
    this.change(() => {
      this.catalog.activeId = id;
    });
  }
  remove(id: string) {
    const app = this.catalog.apps.find((a) => a.id === id && !a.deleted);
    if (!app) throw new Error('App not found.');
    const remaining = this.catalog.apps.filter((a) => a.id !== id && !a.deleted);
    if (!remaining.length)
      throw new Error('Keep at least one app. Create another before deleting this app.');
    this.change(() => {
      app.deleted = true;
      if (this.activeId === id) this.catalog.activeId = remaining[0]!.id;
    });
  }
  restore(id: string) {
    const app = this.catalog.apps.find((a) => a.id === id && a.deleted);
    if (!app) throw new Error('Deleted app not found.');
    this.change(() => {
      delete app.deleted;
    });
  }
  private change(write: () => void) {
    const before = structuredClone(this.catalog);
    try {
      write();
      this.persist();
    } catch (error) {
      this.catalog = before;
      throw error;
    }
  }
  private persist() {
    if (!this.path) return;
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(this.path + '.tmp', JSON.stringify(this.catalog, null, 2) + '\n');
    replaceCatalogFile(this.path + '.tmp', this.path);
  }
}
