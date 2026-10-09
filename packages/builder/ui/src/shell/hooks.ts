import { useCallback, useEffect, useRef, useState } from 'react';

export type ThemePreference = 'system' | 'dark' | 'light';
const THEME_KEY = 'blockstudio.theme';

function readPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === 'dark' || stored === 'light' || stored === 'system') return stored;
  } catch {
    /* storage can be unavailable; fall back to the system theme */
  }
  return 'system';
}

/** Studio chrome theme: a stored preference resolved against the OS setting. */
export function useTheme() {
  const [preference, setPreference] = useState<ThemePreference>(readPreference);
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true,
  );
  useEffect(() => {
    const query = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!query) return;
    const update = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  const resolved: 'dark' | 'light' =
    preference === 'system' ? (systemDark ? 'dark' : 'light') : preference;
  useEffect(() => {
    document.documentElement.dataset.theme = resolved;
  }, [resolved]);
  const choose = useCallback((next: ThemePreference) => {
    setPreference(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      /* preference lasts for this session only */
    }
  }, []);
  return { preference, resolved, choose };
}

export interface Toast {
  id: number;
  message: string;
  tone: 'info' | 'error';
  action?: { label: string; run: () => void };
}

/** A small stack of auto-dismissing notifications. Errors stay until dismissed. */
export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(1);
  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);
  const push = useCallback(
    (message: string, tone: Toast['tone'] = 'info', action?: Toast['action']) => {
      const id = next.current++;
      setToasts((list) =>
        [...list.filter((t) => t.message !== message), { id, message, tone, action }].slice(-3),
      );
      if (tone !== 'error') setTimeout(() => dismiss(id), 4500);
      return id;
    },
    [dismiss],
  );
  return { toasts, push, dismiss };
}

export const isTyping = (target: EventTarget | null) => {
  const el = target as HTMLElement | null;
  return Boolean(
    el &&
    (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) ||
      el.isContentEditable ||
      el.closest('[cmdk-root]')),
  );
};

export const modKey = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';
