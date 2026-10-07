export interface BlockSummary {
  id: string;
  category: string;
  variants: string[];
  defaultVariant: string;
}

export interface BlockCard {
  block: string;
  markdown: string;
  estimatedTokens: number;
}

export interface WireTarget {
  screen: string;
  instance?: string;
  port?: string;
}

export interface Wire {
  from: { instance: string; event: string };
  to: WireTarget;
  origin: 'auto' | 'user' | 'convention';
}

export interface WiringReport {
  resolved: Wire[];
  unmet: Array<{ instance: string; reason: string }>;
  ambiguous: unknown[];
  warnings: string[];
  flow: {
    entry: string;
    reachable: string[];
    unreachable: string[];
    lanes?: string[];
  };
}

export interface BuilderProject {
  version: 1;
  profile: Record<string, string> | null;
  touched: string[];
  graph: {
    schemaVersion: string;
    app: {
      name: string;
      slug: string;
      version: string;
      theme?: { primaryColor?: string; backgroundColor?: string; textColor?: string };
    };
    blocks: Array<{
      id: string;
      type: string;
      variant?: string;
      config: Record<string, unknown>;
    }>;
    screens: Array<{ id: string; block: string; title: string; lane?: string }>;
    wires?: Array<{ from: { instance: string; event: string }; to: { screen: string } }>;
  };
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

export const api = {
  getProject: () => req<BuilderProject>('/api/project'),
  saveProject: (project: BuilderProject) =>
    req<{ ok: boolean }>('/api/project', { method: 'PUT', body: JSON.stringify(project) }),
  setProfile: (profile: Record<string, string>) =>
    req<{ ok: boolean; errors?: string[] }>('/api/profile', {
      method: 'PUT',
      body: JSON.stringify({ profile }),
    }),
  applyCascade: () =>
    req<{ ok: boolean; applied: string[]; skippedTouched: string[]; project: BuilderProject }>(
      '/api/cascade',
      { method: 'POST' },
    ),
  touch: (path: string) =>
    req<{ ok: boolean; touched: string[] }>('/api/touch', {
      method: 'POST',
      body: JSON.stringify({ path }),
    }),
  compile: () =>
    req<{ ok: boolean; projectHash: string; files: string[]; wiring: WiringReport }>(
      '/api/compile',
      { method: 'POST' },
    ),
  getCards: () => req<BlockCard[]>('/api/cards'),
  getBlocks: () => req<BlockSummary[]>('/api/blocks'),
  previewUrl: (instanceId: string) => `/api/preview/${instanceId}`,
};
