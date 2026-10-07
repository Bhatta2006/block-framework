import { useCallback, useEffect, useState } from 'react';
import { api, type BuilderProject } from './api';

/**
 * Loads the project once and exposes mutation helpers that persist to the
 * server. Every mutation re-fetches the project so the UI never drifts from
 * the saved file.
 */
export function useProject() {
  const [project, setProject] = useState<BuilderProject | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setProject(await api.getProject());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const mutate = useCallback(
    async (fn: (p: BuilderProject) => BuilderProject) => {
      if (!project) return;
      const next = fn(structuredClone(project));
      await api.saveProject(next);
      await refresh();
    },
    [project, refresh],
  );

  return { project, error, refresh, mutate };
}
