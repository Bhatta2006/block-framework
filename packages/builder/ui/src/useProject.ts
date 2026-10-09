import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type AppCatalog, type BuilderProject } from './api';
import { diffProjectOperations } from '@blockfw/manifest/operations';

/**
 * Loads the project once and exposes mutation helpers that persist to the
 * server. Writes are serialized; the server's typed operation log feeds undo/redo.
 */
export function useProject() {
  const [project, setProject] = useState<BuilderProject | null>(null);
  const [catalog, setCatalog] = useState<AppCatalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [historyState, setHistoryState] = useState({ undo: 0, redo: 0 });
  const current = useRef<BuilderProject | null>(null);
  const revision = useRef(0);
  const queue = useRef(Promise.resolve());

  const refresh = useCallback(async () => {
    await queue.current;
    try {
      setCatalog(await api.getApps());
      const history = await api.getOperations();
      const loaded = history.project;
      revision.current = history.revision;
      setHistoryState({ undo: history.undo, redo: history.redo });
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
        next.graph.app.dataId = before.graph.app.dataId;
        const accepted = await api.applyOperations(
          diffProjectOperations(before, next),
          revision.current,
        );
        const saved = accepted.project;
        setCatalog((prev) =>
          prev
            ? {
                ...prev,
                apps: prev.apps.map((a) =>
                  a.id === prev.activeId ? { ...a, name: saved.graph.app.name } : a,
                ),
              }
            : prev,
        );
        current.current = saved;
        setProject(saved);
        revision.current = accepted.history.revision;
        setError(null);
        setHistoryState({ undo: accepted.history.undo, redo: accepted.history.redo });
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
      if (!current.current) return;
      setSaving(true);
      try {
        const result = await api.travel(direction, revision.current);
        current.current = result.project;
        setProject(result.project);
        revision.current = result.history.revision;
        setError(null);
        setHistoryState({ undo: result.history.undo, redo: result.history.redo });
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
        const history = await api.getOperations();
        revision.current = history.revision;
        setHistoryState({ undo: history.undo, redo: history.redo });
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
