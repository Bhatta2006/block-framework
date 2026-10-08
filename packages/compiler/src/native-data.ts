export const NATIVE_DATA_RUNTIME = String.raw`
import React, { useContext, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { RecordStore, makeNote, selectNotes, type DataConfig, type Note } from './data-core';
const Context = React.createContext<{ get(key: string): RecordStore } | null>(null);
export function DataProvider({
  namespace,
  seeds,
  children,
}: {
  namespace: string;
  seeds: Record<string, Partial<Note>[]>;
  children: React.ReactNode;
}) {
  const stores = useRef(new Map<string, RecordStore>());
  return (
    <Context.Provider
      value={{
        get(key) {
          let store = stores.current.get(key);
          if (!store) {
            const storageKey = 'blockfw.records.' + namespace + '.' + key;
            store = new RecordStore({
              read: () => AsyncStorage.getItem(storageKey),
              write: (value) => AsyncStorage.setItem(storageKey, value),
            });
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
  if (!context) throw new Error('Missing DataProvider');
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
  input?: { recordId?: string; collection?: string };
  onComplete?: (output: { recordId: string; collection: string }) => void;
};
function Button({ title, onPress }: { title: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      style={s.button}
      onPress={onPress}
    >
      <Text style={s.buttonText}>{title}</Text>
    </Pressable>
  );
}
function status(store: RecordStore) {
  return store.error
    ? 'Could not save: ' + store.error
    : !store.ready
      ? 'Loading…'
      : store.pending
        ? 'Saving…'
        : 'Saved on this device';
}
export function DataSummary({ config }: Props) {
  const store = useRecords(config);
  return (
    <Text style={s.muted}>
      {config.title ?? 'Your notes'}{config.subtitle ? ' · '+config.subtitle : ''}{'\n'}
      {selectNotes(store.data).length} notes · {store.data.folders.length} folders
    </Text>
  );
}
export function DataCollection({ config, onComplete }: Props) {
  const store = useRecords(config);
  const [query, setQuery] = useState('');
  const [folder, setFolder] = useState('');
  const [newFolder, setNewFolder] = useState('');
  const [backup, setBackup] = useState('');
  const [importing, setImporting] = useState(false);
  const [sort, setSort] = useState('updated');
  const view = config.view ?? 'all';
  const notes = selectNotes(store.data, view, query, folder, sort);
  const act = (p: Promise<void>) => {
    void p.catch((e) => Alert.alert('Storage error', e.message));
  };
  const open = (recordId: string) => {
    if (onComplete) onComplete({ recordId, collection: config.collectionKey ?? 'notes' });
    else Alert.alert('Connect your editor', 'Connect data.recordSelected to a Record editor in Studio.');
  };
  return (
    <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
      <Text style={s.kicker}>A PLACE FOR EVERY THOUGHT</Text>
      <Text style={s.heading}>{config.title ?? 'All notes'}</Text>
      <Text style={s.muted}>{config.subtitle}</Text>
      {view !== 'trash' && view !== 'archive' && (
        <Button
          title={config.createLabel ?? 'New note'}
          onPress={() => {
            if (store.ready && !store.error) open('');
          }}
        />
      )}
      {config.enableSearch !== false && (
        <TextInput
          accessibilityLabel="Search notes"
          placeholder="Search notes, content, or tags"
          value={query}
          onChangeText={setQuery}
          style={s.input}
        />
      )}
      <View style={s.row}>
        {['updated', 'created', 'title'].map((v) => (
          <Button key={v} title={sort === v ? '✓ ' + v : v} onPress={() => setSort(v)} />
        ))}
      </View>
      {config.enableFolders !== false && (
        <>
          <ScrollView horizontal>
            <Button title="All folders" onPress={() => setFolder('')} />
            {store.data.folders.map((f) => (
              <Button key={f} title={(folder === f ? '✓ ' : '') + f} onPress={() => setFolder(f)} />
            ))}
          </ScrollView>
          <View style={s.row}>
            <TextInput
              accessibilityLabel="New folder name"
              placeholder="New folder"
              value={newFolder}
              onChangeText={setNewFolder}
              style={[s.input, { flex: 1 }]}
            />
            <Button
              title="Add folder"
              onPress={() => {
                if (newFolder.trim()) {
                  act(store.folder(newFolder.trim()));
                  setNewFolder('');
                }
              }}
            />
          </View>
          {folder && folder !== 'Inbox' && (
            <Button
              title="Move folder notes to Inbox"
              onPress={() => {
                act(store.folder(folder, 'Inbox'));
                setFolder('');
              }}
            />
          )}
        </>
      )}
      <Text accessibilityRole="text" style={s.muted}>
        {status(store)}
      </Text>
      {notes.map((n) => (
        <View style={s.card} key={n.id}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={'Open ' + (n.title || 'Untitled note')}
            onPress={() => open(n.id)}
          >
            <Text style={s.muted}>
              {n.folder}
              {n.pinned ? ' · Pinned' : ''}
            </Text>
            <Text style={s.title}>{n.title || 'Untitled note'}</Text>
            <Text numberOfLines={4} style={s.body}>
              {n.body || 'An empty page. A new possibility.'}
            </Text>
            <Text style={s.muted}>
              {n.tags
                .filter(Boolean)
                .map((t) => '#' + t)
                .join(' ')}
            </Text>
          </Pressable>
          <View style={s.row}>
            {view === 'trash' ? (
              <>
                <Button title="Restore" onPress={() => act(store.save({ ...n, trashed: false }))} />
                <Button
                  title="Delete permanently"
                  onPress={() =>
                    Alert.alert('Delete permanently?', 'This cannot be undone.', [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Delete',
                        style: 'destructive',
                        onPress: () => act(store.remove(n.id)),
                      },
                    ])
                  }
                />
              </>
            ) : (
              <>
                <Button
                  title={n.favorite ? '★' : '☆'}
                  onPress={() => act(store.save({ ...n, favorite: !n.favorite }))}
                />
                <Button
                  title={n.pinned ? 'Unpin' : 'Pin'}
                  onPress={() => act(store.save({ ...n, pinned: !n.pinned }))}
                />
                <Button
                  title={n.archived ? 'Unarchive' : 'Archive'}
                  onPress={() => act(store.save({ ...n, archived: !n.archived }))}
                />
                <Button title="Trash" onPress={() => act(store.save({ ...n, trashed: true }))} />
              </>
            )}
          </View>
        </View>
      ))}
      {store.ready && !notes.length && <Text style={s.empty}>No notes here yet.</Text>}
      {config.enableBackup !== false && (
        <>
          <View style={s.row}>
            <Button
              title="Export backup"
              onPress={() => {
                void Share.share({ message: store.exportBackup() }).catch((e) =>
                  Alert.alert('Export failed', e.message),
                );
              }}
            />
            <Button title="Import backup" onPress={() => setImporting(!importing)} />
          </View>
          {importing && (
            <>
              <TextInput
                accessibilityLabel="Backup JSON"
                placeholder="Paste a notes backup JSON"
                multiline
                value={backup}
                onChangeText={setBackup}
                style={s.input}
              />
              <Button
                title="Merge backup"
                onPress={() => {
                  void store
                    .importBackup(backup)
                    .then(() => {
                      setBackup('');
                      setImporting(false);
                      Alert.alert('Backup imported');
                    })
                    .catch((e) => Alert.alert('Import failed', e.message));
                }}
              />
            </>
          )}
        </>
      )}
    </ScrollView>
  );
}
export function DataEditor({ config, input, onComplete }: Props) {
  const store = useRecords(config);
  const [draft, setDraft] = useState<Note | null>(null);
  const [preview, setPreview] = useState(false);
  useEffect(() => {
    if (store.ready)
      setDraft(
        input?.recordId
          ? (store.data.records.find((n) => n.id === input.recordId) ?? null)
          : makeNote(),
      );
  }, [store.ready, input?.recordId, input?.recordId ? undefined : input]);
  const change = (patch: Partial<Note>) => {
    if (!draft) return;
    const next = { ...draft, ...patch };
    setDraft(next);
    void store.save(next).catch((e) => Alert.alert('Could not save', e.message));
  };
  const done = () => {
    void store
      .flush()
      .then(() =>
        onComplete?.({ recordId: draft?.id ?? '', collection: config.collectionKey ?? 'notes' }),
      )
      .catch((e) => Alert.alert('Could not save', e.message));
  };
  if (!store.ready) return <Text>Loading note…</Text>;
  if (!draft)
    return (
      <View>
        <Text>This note is not available.</Text>
        <Button title="Back to notes" onPress={done} />
      </View>
    );
  return (
    <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
      <Button title="Back to notes" onPress={done} />
      <Text style={s.muted}>{status(store)}</Text>
      {draft.trashed && <Text>This note is in Trash. Restore it to edit.</Text>}
      <TextInput
        accessibilityLabel="Note title"
        editable={!draft.trashed && !store.error}
        value={draft.title}
        onChangeText={(title) => change({ title })}
        placeholder="Untitled note"
        style={s.heading}
      />
      <Text style={s.kicker}>{config.title ?? 'Edit note'}</Text>
      {config.subtitle ? <Text style={s.muted}>{config.subtitle}</Text> : null}
      <Text style={s.muted}>Folder</Text>
      <ScrollView horizontal>
        {store.data.folders.map((f) => (
          <Button
            key={f}
            title={(draft.folder === f ? '✓ ' : '') + f}
            onPress={() => {
              if (!draft.trashed) change({ folder: f });
            }}
          />
        ))}
      </ScrollView>
      <TextInput
        accessibilityLabel="Note tags"
        editable={!draft.trashed && !store.error}
        placeholder="Tags, separated by commas"
        value={draft.tags.join(', ')}
        onChangeText={(value) => change({ tags: value.split(',').map((t) => t.trim()) })}
        style={s.input}
      />
      <View style={s.row}>
        <Button
          title={draft.favorite ? '★ Favorite' : '☆ Favorite'}
          onPress={() => {
            if (!draft.trashed) change({ favorite: !draft.favorite });
          }}
        />
        <Button
          title="Heading"
          onPress={() => {
            if (!draft.trashed) change({ body: draft.body + '\n# ' });
          }}
        />
        <Button
          title="Bold"
          onPress={() => {
            if (!draft.trashed) change({ body: draft.body + '**text**' });
          }}
        />
        <Button
          title="Checklist"
          onPress={() => {
            if (!draft.trashed) change({ body: draft.body + '\n- [ ] ' });
          }}
        />
        <Button title={preview ? 'Edit' : 'Preview'} onPress={() => setPreview(!preview)} />
      </View>
      {preview ? (
        <View>
          {draft.body.split('\n').map((line, i) => {
            const task = /^- \[([ xX])\] (.*)/.exec(line);
            return task ? (
              <Button
                key={i}
                title={(task[1] === ' ' ? '☐ ' : '☑ ') + task[2]}
                onPress={() => {
                  if (draft.trashed) return;
                  const lines = draft.body.split('\n');
                  lines[i] = '- [' + (task[1] === ' ' ? 'x' : ' ') + '] ' + task[2];
                  change({ body: lines.join('\n') });
                }}
              />
            ) : (
              <Text key={i} style={line.startsWith('# ') ? s.title : s.body}>
                {line.replace(/^#{1,3} /, '').replace(/\*\*/g, '')}
              </Text>
            );
          })}
        </View>
      ) : (
        <TextInput
          accessibilityLabel="Note body"
          editable={!draft.trashed && !store.error}
          placeholder="Let your thoughts unfold…"
          multiline
          textAlignVertical="top"
          value={draft.body}
          onChangeText={(body) => change({ body })}
          style={[s.input, { minHeight: 320, lineHeight: 26 }]}
        />
      )}
      <Text style={s.muted}>
        {draft.body.trim() ? draft.body.trim().split(/\s+/).length : 0} words · {draft.body.length}{' '}
        characters
      </Text>
      <Button title="Done" onPress={done} />
    </ScrollView>
  );
}
const s = StyleSheet.create({
  scroll: { gap: 16, paddingBottom: 30 },
  heading: { fontSize: 32, fontWeight: '600', color: '#111', padding: 0 },
  kicker: { fontSize: 10, letterSpacing: 2, color: '#777' },
  muted: { fontSize: 11, color: '#888' },
  row: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', alignItems: 'center' },
  button: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#fff',
  },
  buttonText: { color: '#111', fontSize: 12 },
  input: {
    padding: 12,
    borderWidth: 1,
    borderColor: '#e5e5e5',
    borderRadius: 8,
    color: '#111',
    backgroundColor: '#fafafa',
  },
  card: { padding: 20, borderWidth: 1, borderColor: '#e5e5e5', borderRadius: 12, gap: 14 },
  title: { fontSize: 20, fontWeight: '600', marginVertical: 12, color: '#111' },
  body: { fontSize: 14, lineHeight: 24, color: '#555' },
  empty: { padding: 40, textAlign: 'center', color: '#888' },
});
`;
