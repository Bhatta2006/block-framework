import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { BuilderProject } from './cascade.js';

interface AppRecord {
  id: string;
  project: BuilderProject;
  deleted?: boolean;
}
interface Catalog {
  version: 1;
  activeId: string;
  apps: AppRecord[];
}

/** Local app library. Deleted apps stay recoverable in the library's trash. */
export class AppLibrary {
  private catalog: Catalog;
  constructor(
    initial: BuilderProject,
    private path?: string,
  ) {
    this.catalog =
      path && existsSync(path)
        ? (JSON.parse(readFileSync(path, 'utf8')) as Catalog)
        : { version: 1, activeId: randomUUID(), apps: [] };
    if (!this.catalog.apps.length)
      this.catalog.apps.push({ id: this.catalog.activeId, project: initial });
    if (!this.catalog.apps.some((a) => a.id === this.catalog.activeId && !a.deleted))
      throw new Error('App library has no active app.');
  }
  get activeId() {
    return this.catalog.activeId;
  }
  get project() {
    return this.catalog.apps.find((a) => a.id === this.activeId)!.project;
  }
  update(project: BuilderProject) {
    this.catalog.apps.find((a) => a.id === this.activeId)!.project = structuredClone(project);
    this.persist();
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
  create(project: BuilderProject) {
    const id = randomUUID();
    this.catalog.apps.push({ id, project: structuredClone(project) });
    this.catalog.activeId = id;
    this.persist();
  }
  activate(id: string) {
    if (!this.catalog.apps.some((a) => a.id === id && !a.deleted))
      throw new Error('App not found.');
    this.catalog.activeId = id;
    this.persist();
  }
  remove(id: string) {
    const app = this.catalog.apps.find((a) => a.id === id && !a.deleted);
    if (!app) throw new Error('App not found.');
    const remaining = this.catalog.apps.filter((a) => a.id !== id && !a.deleted);
    if (!remaining.length)
      throw new Error('Keep at least one app. Create another before deleting this app.');
    app.deleted = true;
    if (this.activeId === id) this.catalog.activeId = remaining[0]!.id;
    this.persist();
  }
  restore(id: string) {
    const app = this.catalog.apps.find((a) => a.id === id && a.deleted);
    if (!app) throw new Error('Deleted app not found.');
    delete app.deleted;
    this.persist();
  }
  private persist() {
    if (!this.path) return;
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(this.path + '.tmp', JSON.stringify(this.catalog, null, 2) + '\n');
    renameSync(this.path + '.tmp', this.path);
  }
}
