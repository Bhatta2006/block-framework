export const WEB_DATA_RUNTIME = String.raw`
import React, { useContext, useEffect, useRef, useState } from 'react';
import { RecordStore, makeNote, selectNotes, type DataConfig, type Note } from './data-core';
const Context = React.createContext<{ get(key: string): RecordStore } | null>(null);
export function DataProvider({
  namespace,
  seeds,
  transient,
  cloud,
  children,
}: {
  namespace: string;
  seeds: Record<string, Partial<Note>[]>;
  transient?: boolean;
  cloud?: { read(key: string): Promise<string | null>; write(key: string, value: string): Promise<void> };
  children: React.ReactNode;
}) {
  const stores = useRef(new Map<string, RecordStore>());
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (cloud) return;
      stores.current.forEach((store, key) => {
        if (event.key === 'blockfw.records.' + namespace + '.' + key && !store.pending)
          void store.load();
      });
    };
    window.addEventListener('storage', sync);
    const focus = () => {
      if (cloud) stores.current.forEach((store) => { if (!store.pending && !store.error && !store.editing) void store.load(); });
    };
    window.addEventListener('focus', focus);
    const leaving = (event: BeforeUnloadEvent) => {
      if ([...stores.current.values()].some(store => store.pending || store.error)) {
        event.preventDefault(); event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', leaving);
    return () => { window.removeEventListener('storage', sync); window.removeEventListener('focus', focus); window.removeEventListener('beforeunload', leaving); };
  }, [namespace, cloud]);
  return (
    <Context.Provider
      value={{
        get(key) {
          let store = stores.current.get(key);
          if (!store) {
            const storageKey = 'blockfw.records.' + namespace + '.' + key;
            let memory: string | null = null;
            store = new RecordStore({
              read: async () => cloud ? cloud.read(key) : (transient ? memory : localStorage.getItem(storageKey)),
              write: async (value) => {
                if (cloud) await cloud.write(key, value);
                else if (transient) memory = value;
                else localStorage.setItem(storageKey, value);
              },
            }, cloud ? 'Saved to your cloud account' : 'Saved on this device', cloud ? 250 : 0);
            stores.current.set(key, store);
            void store.load(seeds[key] ?? []);
          }
          return store;
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}
function useRecords(config: DataConfig) {
  const context = useContext(Context);
  if (!context) throw new Error('Data blocks require a DataProvider.');
  const store = context.get(config.collectionKey ?? 'notes');
  const [, redraw] = useState(0);
  useEffect(() => {
    const stop = store.subscribe(() => redraw((n) => n + 1));
    redraw((n) => n + 1);
    return stop;
  }, [store]);
  return store;
}
type Props = {
  config: DataConfig;
  input?: unknown;
  emit: (event: string, payload?: unknown) => boolean | void;
  decorate?: (tree: React.ReactElement) => React.ReactNode;
};
function status(store: RecordStore) {
  return store.error
    ? 'Could not save: ' + store.error
    : !store.ready
      ? 'Loading records…'
      : store.pending
        ? 'Saving…'
        : store.storageLabel;
}
export function DataSummary({ config, decorate }: Props) {
  const store = useRecords(config);
  const active = selectNotes(store.data);
  const tree = (
    <section data-element="container" className="notes-summary" aria-label="Collection summary">
      <span>{config.title ?? 'Your personal space'}{config.subtitle && <small style={{display:'block',marginTop:6,letterSpacing:0}}>{config.subtitle}</small>}</span>
      <div>
        <b>{active.length}</b> notes <i> / </i>
        <b>{active.filter((n) => n.favorite).length}</b> favorites <i> / </i>
        <b>{store.data.folders.length}</b> folders
      </div>
    </section>
  );
  return decorate ? decorate(tree) : tree;
}
export function DataCollection({ config, emit, decorate }: Props) {
  const store = useRecords(config);
  const [query, setQuery] = useState('');
  const [folder, setFolder] = useState('');
  const [sort, setSort] = useState('updated');
  const [grid, setGrid] = useState(true);
  const [message, setMessage] = useState('');
  const file = useRef<HTMLInputElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const view = config.view ?? 'all';
  const notes = selectNotes(store.data, view, query, folder, sort);
  const act = (operation: Promise<void>, success = '') => {
    void operation.then(() => setMessage(success)).catch((e) => setMessage(e.message));
  };
  const open = (id: string) => {
    if (
      emit('data.recordSelected', { collection: config.collectionKey ?? 'notes', recordId: id }) ===
      false
    )
      setMessage('Connect data.recordSelected to a Record editor in Studio to open notes.');
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k' && config.enableSearch !== false) {
        e.preventDefault();
        search.current?.focus();
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [config.enableSearch]);
  const tree = (
    <section data-element="container" className="notes-library">
      <div className="notes-heading">
        <div>
          <span className="notes-kicker">A PLACE FOR EVERY THOUGHT</span>
          <h1>{config.title ?? 'All notes'}</h1>
          <p>{config.subtitle ?? 'Clear your mind. Keep what matters.'}</p>
        </div>
        {view !== 'trash' && view !== 'archive' && (
          <button
            className="notes-primary"
            disabled={!store.ready || !!store.error}
            onClick={() => open('')}
          >
            ＋ {config.createLabel ?? 'New note'}
          </button>
        )}
      </div>
      <div className="notes-tools">
        {config.enableSearch !== false && (
          <input
            ref={search}
            aria-label="Search notes"
            placeholder="Search notes, content, or tags…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        )}
        <select aria-label="Sort notes" value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="updated">Last edited</option>
          <option value="created">Date created</option>
          <option value="title">Title A–Z</option>
        </select>
        <button aria-label="Toggle note layout" aria-pressed={!grid} onClick={() => setGrid(!grid)}>
          {grid ? '☷ List' : '▦ Grid'}
        </button>
      </div>
      {config.enableFolders !== false && (
        <div className="notes-folders">
          <button className={!folder ? 'selected' : ''} onClick={() => setFolder('')}>
            All folders
          </button>
          {store.data.folders.map((f) => (
            <button key={f} className={folder === f ? 'selected' : ''} onClick={() => setFolder(f)}>
              {f}
            </button>
          ))}
          <button
            disabled={!store.ready || !!store.error}
            onClick={() => {
              const name = window.prompt('Folder name')?.trim();
              if (name) act(store.folder(name), 'Folder created.');
            }}
          >
            ＋ Folder
          </button>
          {folder && folder !== 'Inbox' && (
            <>
              <button
                onClick={() => {
                  const name = window.prompt('Rename folder', folder)?.trim();
                  if (name) {
                    act(store.folder(folder, name), 'Folder renamed.');
                    setFolder(name);
                  }
                }}
              >
                Rename folder
              </button>
              <button
                onClick={() => {
                  act(store.folder(folder, 'Inbox'), 'Notes moved to Inbox.');
                  setFolder('');
                }}
              >
                Remove folder
              </button>
            </>
          )}
        </div>
      )}
      <p className="notes-status" role="status">
        {message || status(store)}
      </p>
      <div className={grid ? 'notes-grid' : 'notes-grid notes-list'}>
        {notes.map((n) => (
          <article className="note-card" key={n.id}>
            <button className="note-open" onClick={() => open(n.id)}>
              <span className="note-meta">
                {n.folder} {n.pinned && ' · Pinned'}
              </span>
              <h2>{n.title || 'Untitled note'}</h2>
              <p>{n.body.replace(/^#{1,3} /gm, '').replace(/\*\*/g, '').replace(/^- \[ \] /gm, '☐ ').replace(/^- \[[xX]\] /gm, '☑ ').slice(0, 180) || 'An empty page. A new possibility.'}</p>
              <span className="note-tags">{n.tags.map((t) => '#' + t).join(' ')}</span>
            </button>
            <div className="note-bottom">
              <time>
                {new Date(n.updatedAt).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                })}
              </time>
              <div>
                {view === 'trash' ? (
                  <>
                    <button
                      aria-label={'Restore ' + (n.title || 'Untitled note')}
                      onClick={() => act(store.save({ ...n, trashed: false }), 'Note restored.')}
                    >
                      Restore
                    </button>
                    <button
                      aria-label={'Delete permanently ' + (n.title || 'Untitled note')}
                      onClick={() => {
                        if (window.confirm('Permanently delete this note? This cannot be undone.'))
                          act(store.remove(n.id), 'Note deleted permanently.');
                      }}
                    >
                      Delete
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      aria-label={'Favorite ' + (n.title || 'Untitled note')}
                      aria-pressed={n.favorite}
                      onClick={() => act(store.save({ ...n, favorite: !n.favorite }))}
                    >
                      {n.favorite ? '★' : '☆'}
                    </button>
                    <button
                      aria-label={'Pin ' + (n.title || 'Untitled note')}
                      aria-pressed={n.pinned}
                      onClick={() => act(store.save({ ...n, pinned: !n.pinned }))}
                    >
                      ↟
                    </button>
                    <button
                      aria-label={
                        (n.archived ? 'Unarchive ' : 'Archive ') + (n.title || 'Untitled note')
                      }
                      onClick={() =>
                        act(
                          store.save({ ...n, archived: !n.archived }),
                          n.archived ? 'Note unarchived.' : 'Note archived.',
                        )
                      }
                    >
                      ▣
                    </button>
                    <button
                      aria-label={'Move to trash ' + (n.title || 'Untitled note')}
                      onClick={() =>
                        act(
                          store.save({ ...n, trashed: true }),
                          'Note moved to Trash. Restore it there anytime.',
                        )
                      }
                    >
                      ×
                    </button>
                  </>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>
      {store.ready && !notes.length && (
        <div className="notes-empty">
          <span>↗</span>
          <h2>
            {query || folder
              ? 'No matching notes'
              : view === 'trash'
                ? 'Nothing in the trash'
                : 'Room for your next idea'}
          </h2>
          <p>
            {query || folder ? 'Try another search or folder.' : 'Your notes will appear here.'}
          </p>
        </div>
      )}
      {config.enableBackup !== false && (
        <div className="notes-backup">
          <span>{store.storageLabel === 'Saved to your cloud account' ? 'Private. Synced. Yours.' : 'Private. Local. Yours.'}</span>
          <button
            onClick={() => {
              const url = URL.createObjectURL(
                new Blob([store.exportBackup()], { type: 'application/json' }),
              );
              const a = document.createElement('a');
              a.href = url;
              a.download = 'notes-backup.json';
              a.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            }}
          >
            Export backup
          </button>
          <button onClick={() => file.current?.click()}>Import backup</button>
          <input
            ref={file}
            type="file"
            aria-label="Import notes backup"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) {
                if (f.size > 10000000) setMessage('Backup must be smaller than 10 MB.');
                else
                  void f
                    .text()
                    .then((raw) => store.importBackup(raw))
                    .then(() => setMessage('Backup imported. Existing notes were preserved.'))
                    .catch((err) => setMessage(err.message));
              }
              e.target.value = '';
            }}
          />
        </div>
      )}
    </section>
  );
  return decorate ? decorate(tree) : tree;
}
function Markdown({ body, update }: { body: string; update: (body: string) => void }) {
  return (
    <div className="note-markdown">
      {body.split('\n').map((line, i) => {
        const task = /^- \[([ xX])\] (.*)/.exec(line);
        if (task)
          return (
            <label key={i}>
              <input
                type="checkbox"
                checked={task[1].toLowerCase() === 'x'}
                onChange={() => {
                  const lines = body.split('\n');
                  lines[i] = '- [' + (task[1] === ' ' ? 'x' : ' ') + '] ' + task[2];
                  update(lines.join('\n'));
                }}
              />
              {task[2]}
            </label>
          );
        const text = line.replace(/^#{1,3} /, '');
        const content = text
          .split(/(\*\*.*?\*\*)/g)
          .map((part, j) =>
            part.startsWith('**') ? <strong key={j}>{part.slice(2, -2)}</strong> : part,
          );
        return line.startsWith('# ') ? (
          <h2 key={i}>{content}</h2>
        ) : line.startsWith('## ') ? (
          <h3 key={i}>{content}</h3>
        ) : (
          <p key={i}>{content.length ? content : '\u00a0'}</p>
        );
      })}
    </div>
  );
}
export function DataEditor({ config, input, emit, decorate }: Props) {
  const store = useRecords(config);
  useEffect(() => { store.editing++; return () => { store.editing--; }; }, [store]);
  const selection = input as { recordId?: string; collection?: string } | undefined;
  const id = selection?.recordId ?? '';
  const [draft, setDraft] = useState<Note | null>(null);
  const [preview, setPreview] = useState(false);
  const [error, setError] = useState('');
  const body = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (store.ready)
      setDraft(id ? (store.data.records.find((n) => n.id === id) ?? null) : makeNote());
  }, [store.ready, id, id ? undefined : input]);
  const change = (patch: Partial<Note>) => {
    if (!draft) return;
    const next = { ...draft, ...patch };
    setDraft(next);
    void store.save(next).catch((e) => setError(e.message));
    const page =
      location.hash.split('?')[0] || '#' + new URLSearchParams(location.search).get('page');
    if (page)
      history.replaceState(
        null,
        '',
        page +
          '?record=' +
          encodeURIComponent(next.id) +
          '&collection=' +
          encodeURIComponent(config.collectionKey ?? 'notes'),
      );
  };
  const done = () => {
    void store
      .flush()
      .then(() => {
        if (emit('data.closed', {}) === false)
          setError('Connect data.closed to your collection page in Studio.');
      })
      .catch((e) => setError(e.message));
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        void store.flush().catch((err) => setError(err.message));
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [store]);
  if (!store.ready) return <p role="status">Loading note…</p>;
  if (
    !draft ||
    (selection?.collection && selection.collection !== (config.collectionKey ?? 'notes'))
  )
    return (
      <section className="notes-empty">
        <h2>This note is not available</h2>
        <button onClick={done}>Back to notes</button>
      </section>
    );
  const insert = (prefix: string, suffix = '') => {
    const start = body.current?.selectionStart ?? draft.body.length;
    const end = body.current?.selectionEnd ?? start;
    change({
      body:
        draft.body.slice(0, start) +
        prefix +
        draft.body.slice(start, end) +
        suffix +
        draft.body.slice(end),
    });
    body.current?.focus();
  };
  const tree = (
    <section data-element="container" className="note-editor">
      <div className="notes-editor-top">
        <button onClick={done}>← Back to notes</button>
        <span role="status">{error || status(store)}</span>
        {(error || store.error) && <button onClick={() => {
          const link = document.createElement('a'); const url = URL.createObjectURL(new Blob([store.exportBackup()], { type: 'application/json' }));
          link.href = url; link.download = 'paper-unsaved-notes.json'; link.click(); URL.revokeObjectURL(url);
        }}>Export unsaved notes</button>}
      </div>
      {draft.trashed && <p>This note is in Trash. Restore it to edit.</p>}
      <fieldset disabled={draft.trashed || !!store.error}>
        <span className="notes-kicker">{config.title ?? 'Edit note'}</span>
        {config.subtitle && <p className="notes-status">{config.subtitle}</p>}
        <input
          className="note-title-input"
          aria-label="Note title"
          placeholder="Untitled note"
          value={draft.title}
          onChange={(e) => change({ title: e.target.value })}
        />
        <div className="note-properties">
          <label>
            Folder
            <select
              aria-label="Note folder"
              value={draft.folder}
              onChange={(e) => change({ folder: e.target.value })}
            >
              {store.data.folders.map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>
          </label>
          <label>
            Tags
            <input
              aria-label="Note tags"
              placeholder="ideas, personal"
              value={draft.tags.join(', ')}
              onChange={(e) => change({ tags: e.target.value.split(',').map((s) => s.trim()) })}
            />
          </label>
          <button
            aria-pressed={draft.favorite}
            onClick={() => change({ favorite: !draft.favorite })}
          >
            {draft.favorite ? '★ Favorited' : '☆ Favorite'}
          </button>
        </div>
        <div className="note-format">
          <button aria-label="Insert heading" onClick={() => insert('# ')}>
            H1
          </button>
          <button aria-label="Insert bold" onClick={() => insert('**', '**')}>
            <b>B</b>
          </button>
          <button aria-label="Insert checklist" onClick={() => insert('\n- [ ] ')}>
            ☑ Checklist
          </button>
          <button aria-pressed={preview} onClick={() => setPreview(!preview)}>
            {preview ? 'Edit text' : 'Preview'}
          </button>
        </div>
        {preview ? (
          <Markdown body={draft.body} update={(value) => change({ body: value })} />
        ) : (
          <textarea
            ref={body}
            aria-label="Note body"
            placeholder="Let your thoughts unfold…"
            value={draft.body}
            onChange={(e) => change({ body: e.target.value })}
          />
        )}
      </fieldset>
      <div className="notes-editor-bottom">
        <span>
          {draft.body.trim() ? draft.body.trim().split(/\s+/).length : 0} words ·{' '}
          {draft.body.length} characters
        </span>
        <button className="notes-primary" onClick={done}>
          Done
        </button>
      </div>
    </section>
  );
  return decorate ? decorate(tree) : tree;
}
`;

export const DATA_STYLES = String.raw`
.generated-app.notes-shell {
  background: #fff;
  color: #141414;
  font-family: Inter, system-ui, sans-serif;
  min-height: 100vh;
}
.notes-shell .app-header {
  background: #fff;
  border-bottom: 1px solid #e9e9e9;
  padding: 22px 5%;
}
.notes-shell .app-brand {
  color: #111;
}
.notes-shell .app-header-note,
.notes-shell .app-footer {
  display: none;
}
.notes-shell .app-header nav button.active {
  background: #111;
  color: white;
}
.notes-shell .page-content {
  max-width: 1180px;
  padding: 40px 40px 70px;
  gap: 24px;
}
.notes-shell .block-container {
  min-width: 0;
}
.notes-summary {
  display: flex;
  justify-content: space-between;
  gap: 20px;
  font-size: 12px;
  color: #777;
  padding-bottom: 18px;
  border-bottom: 1px solid #eee;
}
.notes-summary > span {
  letter-spacing: 2px;
  font-size: 10px;
}
.notes-summary b {
  color: #111;
}
.notes-summary i {
  margin: 0 12px;
  font-style: normal;
  color: #ccc;
}
.notes-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin: 14px 0 30px;
}
.notes-kicker {
  font-size: 10px;
  letter-spacing: 2px;
  color: #777;
}
.notes-heading h1 {
  font-size: 42px;
  line-height: 1.2;
  letter-spacing: -1.7px;
  margin: 12px 0;
}
.notes-heading p {
  color: #888;
  font-size: 14px;
  margin: 0;
}
.notes-library button,
.note-editor button {
  cursor: pointer;
  border: 1px solid #e5e5e5;
  background: white;
  color: #222;
  border-radius: 8px;
  padding: 9px 12px;
  font-size: 12px;
}
.notes-library button:hover,
.note-editor button:hover {
  background: #f3f3f3;
}
.notes-library button:disabled {
  opacity: 0.5;
  cursor: default;
}
.notes-library .notes-primary,
.note-editor .notes-primary {
  background: #111;
  color: white;
  border-color: #111;
  padding: 13px 20px;
  font-weight: 600;
  white-space: nowrap;
}
.notes-tools {
  display: flex;
  gap: 10px;
}
.notes-tools input {
  flex: 1;
  min-width: 0;
  padding: 13px 16px;
  border: 1px solid #e5e5e5;
  border-radius: 9px;
  background: #fafafa;
  font-size: 13px;
}
.notes-tools select {
  border: 1px solid #e5e5e5;
  background: white;
  border-radius: 8px;
  font-size: 12px;
  padding: 8px;
  color: #444;
}
.notes-folders {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin: 16px 0 8px;
}
.notes-folders button {
  border: none;
  color: #777;
}
.notes-folders .selected {
  color: #111;
  background: #eee;
  font-weight: 600;
}
.notes-status {
  min-height: 18px;
  font-size: 11px;
  color: #888;
  margin: 12px 0 22px;
}
.notes-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 18px;
}
.note-card {
  border: 1px solid #e5e5e5;
  border-radius: 12px;
  overflow: hidden;
  background: white;
  box-shadow: 0 2px 4px #00000002;
  transition:
    border-color 0.15s,
    transform 0.15s;
}
.note-card:hover {
  border-color: #aaa;
  transform: translateY(-2px);
}
.note-card .note-open {
  text-align: left;
  width: 100%;
  border: 0;
  border-radius: 0;
  padding: 22px;
  display: block;
  min-height: 190px;
}
.note-card .note-open:hover {
  background: white;
}
.note-meta {
  font-size: 10px;
  color: #888;
  letter-spacing: 0.5px;
}
.note-card h2 {
  font-size: 18px;
  line-height: 1.4;
  font-weight: 600;
  margin: 13px 0 10px;
  overflow-wrap: anywhere;
}
.note-card p {
  display: -webkit-box;
  -webkit-line-clamp: 4;
  -webkit-box-orient: vertical;
  overflow: hidden;
  font-size: 12px;
  color: #777;
  line-height: 1.8;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  margin: 0;
}
.note-tags {
  display: block;
  font-size: 10px;
  color: #888;
  margin-top: 14px;
}
.note-bottom {
  border-top: 1px solid #f0f0f0;
  margin: 0 18px;
  padding: 10px 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 4px;
}
.note-bottom time {
  font-size: 10px;
  color: #999;
}
.note-bottom button {
  border: 0;
  padding: 5px 7px;
  font-size: 14px;
}
.note-bottom button[aria-pressed='true'] {
  color: #000;
  background: #eee;
}
.notes-list {
  grid-template-columns: 1fr;
}
.notes-list .note-open {
  min-height: 0;
}
.notes-list .note-card {
  display: grid;
  grid-template-columns: 1fr auto;
}
.notes-list .note-bottom {
  border: 0;
  flex-direction: column;
  justify-content: center;
}
.notes-empty {
  text-align: center;
  padding: 65px 20px;
  color: #777;
}
.notes-empty > span {
  font-size: 40px;
  color: #ccc;
}
.notes-empty h2 {
  font-size: 20px;
  color: #222;
  font-weight: 500;
}
.notes-empty p {
  font-size: 13px;
}
.notes-backup {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 11px;
  color: #999;
  margin-top: 40px;
  padding-top: 20px;
  border-top: 1px solid #eee;
}
.notes-backup > span {
  margin-right: auto;
}
.notes-backup button {
  font-size: 11px;
  border: none;
  color: #777;
}
.note-editor {
  max-width: 820px;
  margin: auto;
}
.notes-editor-top,
.notes-editor-bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 11px;
  color: #888;
}
.notes-editor-top button {
  border: 0;
  padding-left: 0;
}
.note-editor fieldset {
  border: 0;
  padding: 0;
  margin: 32px 0;
  min-width: 0;
}
.note-title-input {
  font-size: 38px;
  font-weight: 600;
  letter-spacing: -1px;
  border: none;
  width: 100%;
  padding: 12px 0;
  background: transparent;
  outline: none;
}
.note-properties {
  display: flex;
  gap: 18px;
  align-items: end;
  margin: 20px 0;
  flex-wrap: wrap;
}
.note-properties label {
  font-size: 10px;
  color: #777;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.note-properties input,
.note-properties select {
  background: #fafafa;
  border: 1px solid #eee;
  border-radius: 6px;
  padding: 8px;
  font-size: 12px;
  color: #444;
}
.note-format {
  border-top: 1px solid #eee;
  border-bottom: 1px solid #eee;
  padding: 10px 0;
  display: flex;
  gap: 8px;
}
.note-format button {
  border: 0;
}
.note-format button:last-child {
  margin-left: auto;
}
.note-editor textarea {
  width: 100%;
  min-height: 360px;
  border: 0;
  resize: vertical;
  padding: 28px 0;
  font:
    15px/1.9 system-ui,
    sans-serif;
  outline: none;
  background: transparent;
}
.note-markdown {
  min-height: 360px;
  padding: 12px 0;
  font-size: 15px;
  line-height: 1.9;
  overflow-wrap: anywhere;
}
.note-markdown label {
  display: flex;
  gap: 12px;
  margin: 10px 0;
}
.note-markdown h2 {
  font-size: 27px;
}
.note-markdown h3 {
  font-size: 21px;
}
.note-markdown input {
  accent-color: #111;
}
@media (max-width: 800px) {
  .notes-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .notes-shell .page-content {
    padding: 25px 22px 50px;
  }
  .notes-shell .app-header {
    flex-wrap: wrap;
    gap: 15px;
  }
  .notes-shell .app-header nav {
    flex-wrap: wrap;
  }
}
@media (max-width: 480px) {
  .notes-grid {
    grid-template-columns: 1fr;
  }
  .notes-heading h1 {
    font-size: 32px;
  }
  .notes-kicker {
    font-size: 8px;
  }
  .notes-heading {
    align-items: flex-start;
  }
  .notes-tools {
    flex-wrap: wrap;
  }
  .notes-tools input {
    flex-basis: 100%;
  }
  .notes-summary {
    flex-direction: column;
    gap: 8px;
  }
  .notes-backup {
    flex-wrap: wrap;
  }
  .notes-backup > span {
    flex-basis: 100%;
  }
  .note-title-input {
    font-size: 30px;
  }
  .notes-shell .app-header nav button {
    padding: 7px 9px;
    font-size: 11px;
  }
}
`;
