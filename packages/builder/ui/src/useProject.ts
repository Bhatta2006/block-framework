import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type AppCatalog, type BuilderProject } from './api';

/**
 * Loads the project once and exposes mutation helpers that persist to the
 * server. Writes are serialized and accepted snapshots feed undo/redo.
 */
export function useProject() {
  const [project, setProject] = useState<BuilderProject | null>(null);
  const [catalog, setCatalog] = useState<AppCatalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [historyState, setHistoryState] = useState({ undo: 0, redo: 0 });
  const current = useRef<BuilderProject | null>(null);
  const history = useRef<{ past: BuilderProject[]; future: BuilderProject[] }>({
    past: [],
    future: [],
  });
  const queue = useRef(Promise.resolve());

  const refresh = useCallback(async () => {
    await queue.current;
    try {
      setCatalog(await api.getApps());
      const loaded = await api.getProject();
      if (current.current && JSON.stringify(current.current) !== JSON.stringify(loaded)) {
        history.current = { past: [], future: [] };
        setHistoryState({ undo: 0, redo: 0 });
      }
      current.current = loaded;
      setProject(loaded);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const edit = useCallback((fn: (p: BuilderProject) => void) => {
    const operation = queue.current.then(async () => {
      if (!current.current) return;
      setSaving(true);
      setError(null);
      const before = current.current;
      const next = structuredClone(before);
      try {
        fn(next);
        await api.saveProject(next);
        setCatalog((prev) =>
          prev
            ? {
                ...prev,
                apps: prev.apps.map((a) =>
                  a.id === prev.activeId ? { ...a, name: next.graph.app.name } : a,
                ),
              }
            : prev,
        );
        history.current.past.push(before);
        if (history.current.past.length > 50) history.current.past.shift();
        history.current.future = [];
        current.current = next;
        setProject(next);
        setError(null);
        setHistoryState({ undo: history.current.past.length, redo: 0 });
      } catch (e) {
        setProject(structuredClone(before));
        setError(e instanceof Error ? e.message : String(e));
        throw e;
      } finally {
        setSaving(false);
      }
    });
    queue.current = operation.catch(() => {});
    return operation;
  }, []);
  const travel = useCallback((direction: 'undo' | 'redo') => {
    queue.current = queue.current.then(async () => {
      const { past, future } = history.current;
      const from = direction === 'undo' ? past : future;
      const to = direction === 'undo' ? future : past;
      const next = from.at(-1);
      if (!next || !current.current) return;
      setSaving(true);
      try {
        await api.saveProject(next);
        from.pop();
        to.push(current.current);
        current.current = next;
        setProject(next);
        setError(null);
        setHistoryState({ undo: past.length, redo: future.length });
      } catch (e) {
        setError(String(e));
      } finally {
        setSaving(false);
      }
    });
  }, []);
  const manageApp = (
    action: 'create' | 'activate' | 'delete' | 'restore',
    value: BuilderProject | string,
  ) => {
    const operation = queue.current.then(async () => {
      setSaving(true);
      setError(null);
      try {
        const result =
          action === 'create'
            ? await api.createApp(value as BuilderProject)
            : await api.appAction(value as string, action);
        current.current = result.project;
        setProject(result.project);
        setCatalog(result);
        history.current = { past: [], future: [] };
        setHistoryState({ undo: 0, redo: 0 });
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        throw e;
      } finally {
        setSaving(false);
      }
    });
    queue.current = operation.catch(() => {});
    return operation;
  };
  return {
    catalog,
    manageApp,
    project,
    error,
    refresh,
    edit,
    saving,
    historyState,
    travel,
    clearError: () => setError(null),
  };
}
