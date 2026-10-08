/** Portable record storage shared by the web and native exports. */
export const DATA_CORE = String.raw`
export type Note = {
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
export type Database = { version: 1; records: Note[]; folders: string[] };
export type Adapter = { read(): Promise<string | null>; write(value: string): Promise<void> };
export type DataConfig = {
  collectionKey?: string;
  title?: string;
  subtitle?: string;
  view?: string;
  createLabel?: string;
  enableSearch?: boolean;
  enableFolders?: boolean;
  enableBackup?: boolean;
  seedRecords?: Partial<Note>[];
};
export const emptyDatabase = (): Database => ({ version: 1, records: [], folders: ['Inbox'] });
export function parseDatabase(raw: string): Database {
  const d = JSON.parse(raw);
  if (
    d?.version !== 1 ||
    !Array.isArray(d.records) ||
    !Array.isArray(d.folders) ||
    d.records.length > 10000
  )
    throw new Error('This backup is not a supported record collection.');
  const ids = new Set<string>();
  for (const n of d.records) {
    if (
      !n ||
      typeof n.id !== 'string' ||
      !n.id ||
      ids.has(n.id) ||
      typeof n.title !== 'string' ||
      typeof n.body !== 'string' ||
      typeof n.folder !== 'string' ||
      !Array.isArray(n.tags) ||
      !n.tags.every((t: unknown) => typeof t === 'string') ||
      !['favorite', 'pinned', 'archived', 'trashed'].every((k) => typeof n[k] === 'boolean') ||
      !Number.isFinite(Date.parse(n.createdAt)) ||
      !Number.isFinite(Date.parse(n.updatedAt))
    )
      throw new Error('The backup contains an invalid or duplicate record.');
    ids.add(n.id);
  }
  if (!d.folders.every((f: unknown) => typeof f === 'string' && f.trim()))
    throw new Error('The backup contains an invalid folder.');
  return d as Database;
}
export function makeNote(values: Partial<Note> = {}): Note {
  const now = new Date().toISOString();
  return {
    id:
      globalThis.crypto?.randomUUID?.() ??
      String(Date.now()) + '-' + Math.random().toString(36).slice(2),
    title: '',
    body: '',
    folder: 'Inbox',
    tags: [],
    favorite: false,
    pinned: false,
    archived: false,
    trashed: false,
    createdAt: now,
    updatedAt: now,
    ...values,
  };
}
export class RecordStore {
  data: Database = emptyDatabase();
  ready = false;
  error = '';
  pending = 0;
  editing = 0;
  private changes = 0;
  private listeners = new Set<() => void>();
  private queue: Promise<void> = Promise.resolve();
  constructor(private adapter: Adapter, public storageLabel = 'Saved on this device', private saveDelay = 0) {}
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private notify() {
    this.listeners.forEach((f) => f());
  }
  async load(seeds: Partial<Note>[] = []) {
    const atStart = this.changes;
    try {
      const raw = await this.adapter.read();
      if (atStart !== this.changes || this.pending) return;
      this.data =
        raw === null
          ? {
              version: 1,
              records: seeds.map((n) => makeNote(n)),
              folders: [
                'Inbox',
                ...new Set(
                  seeds.map((n) => n.folder).filter((f): f is string => !!f && f !== 'Inbox'),
                ),
              ],
            }
          : parseDatabase(raw);
      this.data = parseDatabase(JSON.stringify(this.data));
      if (raw === null && seeds.length) await this.adapter.write(JSON.stringify(this.data));
      this.error = '';
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'Could not load local records.';
    }
    this.ready = true;
    this.notify();
  }
  commit(change: (data: Database) => Database): Promise<void> {
    if (!this.ready || this.error)
      return Promise.reject(new Error(this.error || 'Records are still loading.'));
    this.data = change(this.data);
    this.changes++;
    const changeId = this.changes;
    const snapshot = JSON.stringify(this.data);
    this.pending++;
    this.notify();
    const write = this.queue.then(async () => {
      if (this.error) throw new Error(this.error);
      if (this.saveDelay) {
        if (changeId !== this.changes) return;
        await new Promise(resolve => setTimeout(resolve, this.saveDelay));
        if (changeId !== this.changes) return;
      }
      return this.adapter.write(snapshot);
    });
    this.queue = write
      .catch((e) => {
        this.error = e instanceof Error ? e.message : 'Local storage is unavailable.';
      })
      .finally(() => {
        this.pending--;
        this.notify();
      });
    return write;
  }
  save(note: Note) {
    return this.commit((d) => ({
      ...d,
      records: d.records.some((n) => n.id === note.id)
        ? d.records.map((n) =>
            n.id === note.id ? { ...note, updatedAt: new Date().toISOString() } : n,
          )
        : [...d.records, note],
      folders: [...new Set([...d.folders, note.folder])],
    }));
  }
  remove(id: string) {
    return this.commit((d) => ({ ...d, records: d.records.filter((n) => n.id !== id) }));
  }
  folder(name: string, replacement?: string) {
    return this.commit((d) => ({
      ...d,
      folders: [
        ...new Set(
          replacement ? d.folders.map((f) => (f === name ? replacement : f)) : [...d.folders, name],
        ),
      ],
      records: replacement
        ? d.records.map((n) => (n.folder === name ? { ...n, folder: replacement } : n))
        : d.records,
    }));
  }
  async importBackup(raw: string) {
    const imported = parseDatabase(raw);
    await this.queue;
    const records = new Map(this.data.records.map((n) => [n.id, n]));
    imported.records.forEach((n) => {
      const old = records.get(n.id);
      if (!old || n.updatedAt >= old.updatedAt) records.set(n.id, n);
    });
    const merged: Database = {
      version: 1,
      records: [...records.values()],
      folders: [...new Set([...this.data.folders, ...imported.folders])],
    };
    await this.adapter.write(JSON.stringify(merged));
    this.data = merged;
    this.error = '';
    this.notify();
  }
  exportBackup() {
    return JSON.stringify(this.data, null, 2);
  }
  async flush() {
    await this.queue;
    if (this.error) throw new Error(this.error);
  }
}
export function selectNotes(
  data: Database,
  view = 'all',
  query = '',
  folder = '',
  sort = 'updated',
): Note[] {
  const q = query.toLocaleLowerCase();
  return data.records
    .filter(
      (n) =>
        (view === 'trash'
          ? n.trashed
          : !n.trashed &&
            (view === 'archive'
              ? n.archived
              : !n.archived && (view !== 'favorites' || n.favorite))) &&
        (!folder || n.folder === folder) &&
        (!q || [n.title, n.body, ...n.tags].join(' ').toLocaleLowerCase().includes(q)),
    )
    .sort(
      (a, b) =>
        Number(b.pinned) - Number(a.pinned) ||
        (sort === 'title'
          ? a.title.localeCompare(b.title)
          : sort === 'created'
            ? b.createdAt.localeCompare(a.createdAt)
            : b.updatedAt.localeCompare(a.updatedAt)),
    );
}
`;
