import { describe, expect, it } from 'vitest';
import { transformSync } from 'esbuild';
import { DATA_CORE } from '../src/data-core.js';
import { compileProject, compileWebProject } from '../src/index.js';
import { loadDefaultRegistry } from '@blockfw/blocks';
import type { ProjectGraph } from '@blockfw/manifest';
import graphJson from '../../../examples/notes/graph.json' with { type: 'json' };

// Exercise the exact portable module emitted into standalone apps.
const runtime = { exports: {} };
new Function('module', 'exports', transformSync(DATA_CORE, { loader: 'ts', format: 'cjs' }).code)(
  runtime,
  runtime.exports,
);
type Note = {
  id: string;
  title: string;
  body: string;
  folder: string;
  tags: string[];
  favorite: boolean;
  pinned: boolean;
  archived: boolean;
  trashed: boolean;
  createdAt: string;
  updatedAt: string;
};
type Database = { version: 1; records: Note[]; folders: string[] };
interface Store {
  data: Database;
  ready: boolean;
  error: string;
  pending: number;
  load(seeds?: Partial<Note>[]): Promise<void>;
  save(note: Note): Promise<void>;
  remove(id: string): Promise<void>;
  folder(name: string, replacement?: string): Promise<void>;
  importBackup(raw: string): Promise<void>;
  exportBackup(): string;
  flush(): Promise<void>;
}
const { RecordStore, makeNote, selectNotes, parseDatabase } = runtime.exports as {
  RecordStore: new (
    adapter: {
      read(): Promise<string | null>;
      write(value: string): Promise<void>;
    },
    label?: string,
    saveDelay?: number,
  ) => Store;
  makeNote(values?: Partial<Note>): Note;
  selectNotes(
    data: Database,
    view?: string,
    query?: string,
    folder?: string,
    sort?: string,
  ): Note[];
  parseDatabase(raw: string): Database;
};
function fixture(initial: string | null = null) {
  let disk = initial;
  const adapter = {
    read: async () => disk,
    write: async (value: string) => {
      disk = value;
    },
  };
  return { store: new RecordStore(adapter), adapter, disk: () => disk };
}
describe('portable persistent record collections', () => {
  it('coalesces cloud typing into the latest snapshot and flush waits for persistence', async () => {
    const writes: string[] = [];
    const store = new RecordStore(
      {
        read: async () => null,
        write: async (value) => {
          writes.push(value);
        },
      },
      'Cloud',
      5,
    );
    await store.load();
    const note = makeNote();
    await Promise.all(['a', 'ab', 'abc'].map((title) => store.save({ ...note, title })));
    await store.flush();
    expect(writes).toHaveLength(1);
    expect(JSON.parse(writes[0]!).records[0].title).toBe('abc');
    expect(store.pending).toBe(0);
  });
  it('preserves edits when a delayed cloud refresh returns an older snapshot', async () => {
    let complete: (value: string) => void = () => {};
    let refresh = false;
    const store = new RecordStore({
      read: async () =>
        refresh
          ? new Promise<string>((resolve) => {
              complete = resolve;
            })
          : null,
      write: async () => {},
    });
    await store.load();
    refresh = true;
    const loading = store.load();
    await store.save(makeNote({ title: 'New draft' }));
    complete(JSON.stringify({ version: 1, records: [], folders: ['Inbox'] }));
    await loading;
    expect(store.data.records[0]!.title).toBe('New draft');
  });
  it('stops queued writes after a conflict and keeps the latest draft exportable', async () => {
    let writes = 0;
    const store = new RecordStore({
      read: async () => null,
      write: async () => {
        writes++;
        throw new Error('Cloud revision changed');
      },
    });
    await store.load();
    const note = makeNote();
    await Promise.allSettled(['a', 'ab', 'abc'].map((title) => store.save({ ...note, title })));
    await expect(store.flush()).rejects.toThrow('Cloud revision changed');
    expect(writes).toBe(1);
    expect(JSON.parse(store.exportBackup()).records[0].title).toBe('abc');
  });
  it('rejects duplicate seed ids before writing the first database', async () => {
    const f = fixture();
    await f.store.load([{ id: 'duplicate' }, { id: 'duplicate' }]);
    expect(f.store.error).toContain('duplicate');
    expect(f.disk()).toBeNull();
  });
  it('creates, updates, and reloads records without reseeding an existing collection', async () => {
    const f = fixture();
    await f.store.load([{ id: 'seed', title: 'Welcome' }]);
    const note = makeNote({ title: 'A plan', body: 'First draft' });
    await f.store.save(note);
    await f.store.save({ ...note, body: 'Finished draft', favorite: true });
    const reopened = new RecordStore(f.adapter);
    await reopened.load([{ id: 'unwanted', title: 'Do not reseed' }]);
    expect(reopened.data.records).toHaveLength(2);
    expect(reopened.data.records.find((n) => n.id === note.id)?.body).toBe('Finished draft');
    expect(reopened.data.records.find((n) => n.id === note.id)?.favorite).toBe(true);
  });
  it('serializes rapid native writes so an older edit cannot overwrite the latest edit', async () => {
    const writes: string[] = [];
    const store = new RecordStore({
      read: async () => null,
      write: async (value) => {
        await new Promise((resolve) => setTimeout(resolve, 2));
        writes.push(value);
      },
    });
    await store.load();
    const note = makeNote();
    await Promise.all(['a', 'ab', 'abc'].map((title) => store.save({ ...note, title })));
    await store.flush();
    expect(JSON.parse(writes.at(-1)!).records[0].title).toBe('abc');
    expect(store.pending).toBe(0);
  });
  it('keeps empty collections empty after deletion and reload', async () => {
    const f = fixture();
    await f.store.load([{ id: 'seed' }]);
    await f.store.remove('seed');
    const next = new RecordStore(f.adapter);
    await next.load([{ id: 'seed' }]);
    expect(next.data.records).toEqual([]);
  });
  it('searches body and tags, scopes folders, filters trash/archive/favorites, and sorts pinned notes first', async () => {
    const f = fixture();
    await f.store.load();
    await f.store.save(
      makeNote({
        id: 'a',
        title: 'A',
        body: 'Needle',
        folder: 'Work',
        tags: ['design'],
        favorite: true,
      }),
    );
    await f.store.save(makeNote({ id: 'b', title: 'B', pinned: true }));
    await f.store.save(makeNote({ id: 'c', archived: true, favorite: true }));
    await f.store.save(makeNote({ id: 'd', trashed: true, favorite: true }));
    expect(selectNotes(f.store.data).map((n) => n.id)).toEqual(['b', 'a']);
    expect(selectNotes(f.store.data, 'all', 'DESIGN', 'Work').map((n) => n.id)).toEqual(['a']);
    expect(selectNotes(f.store.data, 'all', 'needle').map((n) => n.id)).toEqual(['a']);
    expect(selectNotes(f.store.data, 'favorites').map((n) => n.id)).toEqual(['a']);
    expect(selectNotes(f.store.data, 'archive').map((n) => n.id)).toEqual(['c']);
    expect(selectNotes(f.store.data, 'trash').map((n) => n.id)).toEqual(['d']);
  });
  it('renames folders without losing notes', async () => {
    const f = fixture();
    await f.store.load();
    await f.store.save(makeNote({ folder: 'Work' }));
    await f.store.folder('Work', 'Projects');
    expect(f.store.data.records[0]?.folder).toBe('Projects');
    expect(f.store.data.folders).toContain('Projects');
    expect(f.store.data.folders).not.toContain('Work');
  });
  it('merges backups and keeps newer local edits', async () => {
    const f = fixture();
    await f.store.load();
    const note = makeNote({ id: 'existing', title: 'New local' });
    await f.store.save(note);
    const backup = {
      version: 1,
      folders: ['Inbox', 'Travel'],
      records: [
        { ...note, title: 'Older backup', updatedAt: '2020-01-01T00:00:00.000Z' },
        makeNote({ id: 'imported', folder: 'Travel' }),
      ],
    };
    await f.store.importBackup(JSON.stringify(backup));
    expect(f.store.data.records).toHaveLength(2);
    expect(f.store.data.records.find((n) => n.id === 'existing')?.title).toBe('New local');
    expect(f.store.data.folders).toContain('Travel');
    expect(parseDatabase(f.store.exportBackup()).records).toHaveLength(2);
  });
  it('rejects malformed and duplicate records without changing local data', async () => {
    const f = fixture();
    await f.store.load();
    const n = makeNote();
    await f.store.save(n);
    const before = f.disk();
    await expect(f.store.importBackup('{"version":2}')).rejects.toThrow();
    await expect(
      f.store.importBackup(JSON.stringify({ version: 1, folders: ['Inbox'], records: [n, n] })),
    ).rejects.toThrow();
    expect(f.disk()).toBe(before);
  });
  it('does not overwrite corrupt storage and permits explicit recovery from a valid backup', async () => {
    const f = fixture('corrupt');
    await f.store.load([{ id: 'seed' }]);
    expect(f.store.error).toBeTruthy();
    expect(f.disk()).toBe('corrupt');
    await expect(f.store.save(makeNote())).rejects.toThrow();
    await f.store.importBackup(
      JSON.stringify({ version: 1, folders: ['Inbox'], records: [makeNote({ id: 'restored' })] }),
    );
    expect(f.store.error).toBe('');
    expect(f.store.data.records[0]?.id).toBe('restored');
  });
  it('reports write failures rather than claiming the note is saved', async () => {
    const store = new RecordStore({
      read: async () => null,
      write: async () => {
        throw new Error('Quota exceeded');
      },
    });
    await store.load();
    await expect(store.save(makeNote())).rejects.toThrow('Quota');
    await expect(store.flush()).rejects.toThrow('Quota');
    expect(store.error).toContain('Quota');
    expect(store.exportBackup()).toContain('records');
  });
  it('isolates records across independent app stores', async () => {
    const a = fixture(),
      b = fixture();
    await a.store.load();
    await b.store.load();
    await a.store.save(makeNote({ title: 'Private to A' }));
    expect(b.store.data.records).toEqual([]);
    expect(b.disk()).toBeNull();
  });
});
describe('notes app exports', () => {
  it('resolves all selection routes and emits persistent storage for web and native', () => {
    const graph = graphJson as ProjectGraph;
    const registry = loadDefaultRegistry();
    const web = compileWebProject(graph, registry),
      native = compileProject(graph, registry);
    expect(web.wiring.report.unmet).toEqual([]);
    expect(native.wiring.report.unmet).toEqual([]);
    expect(web.files.find((f) => f.path === 'src/data-core.ts')?.content).toBe(DATA_CORE);
    expect(native.files.find((f) => f.path === 'src/data-core.ts')?.content).toBe(DATA_CORE);
    expect(native.files.find((f) => f.path === 'package.json')?.content).toContain('async-storage');
    expect(native.files.find((f) => f.path === 'src/blocks/collection.tsx')?.content).toContain(
      'DataCollection',
    );
    expect(compileWebProject(graph, registry).projectHash).toBe(web.projectHash);
    expect(compileProject(graph, registry).projectHash).toBe(native.projectHash);
  });
});
