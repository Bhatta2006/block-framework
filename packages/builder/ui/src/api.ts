import type { BlockDesign } from '@blockfw/manifest';
export interface AppCatalog {
  activeId: string;
  apps: Array<{ id: string; name: string; deleted: boolean }>;
}
let activeAppId = '';
export interface BlockSummary {
  id: string;
  category: string;
  variants: string[];
  defaultVariant: string;
  configSchema: Record<string, unknown>;
  defaultConfig: Record<string, unknown>;
  ports: { emits: Array<string | { event: string }>; consumes: Array<string | { port: string }> };
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
      dataId?: string;
      layout?: 'standard' | 'notes';
      name: string;
      slug: string;
      version: string;
      theme?: { primaryColor?: string; backgroundColor?: string; textColor?: string };
    };
    blocks: Array<{
      design?: BlockDesign;
      id: string;
      type: string;
      variant?: string;
      config: Record<string, unknown>;
      position?: { x: number; y: number };
    }>;
    screens: Array<{
      navigation?: boolean;
      id: string;
      block: string;
      blocks?: string[];
      layout?: 'stack' | 'grid' | 'split';
      disconnectedLayout?: string[];
      position?: { x: number; y: number };
      title: string;
      lane?: string;
    }>;
    wires?: Array<{ from: { instance: string; event: string }; to: WireTarget }>;
  };
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(activeAppId ? { 'X-Block-App-Id': activeAppId } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    let message = body;
    try {
      const data = JSON.parse(body);
      message = data.error ?? data.errors?.join('; ') ?? body;
    } catch {
      /* plain text */
    }
    throw new Error(message.slice(0, 1000));
  }
  return (await res.json()) as T;
}

export const api = {
  getApps: async () => {
    const catalog = await req<AppCatalog>('/api/apps');
    activeAppId = catalog.activeId;
    return catalog;
  },
  appAction: async (id: string, action: 'activate' | 'delete' | 'restore') => {
    const result = await req<AppCatalog & { project: BuilderProject }>(
      '/api/apps/' + id + (action === 'delete' ? '' : '/' + action),
      { method: action === 'delete' ? 'DELETE' : 'POST' },
    );
    activeAppId = result.activeId;
    return result;
  },
  createApp: async (project: BuilderProject) => {
    const result = await req<AppCatalog & { project: BuilderProject }>('/api/apps', {
      method: 'POST',
      body: JSON.stringify({ project }),
    });
    activeAppId = result.activeId;
    return result;
  },
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
  compile: (target: 'web' | 'mobile' = 'mobile') =>
    req<{ ok: boolean; projectHash: string; files: string[]; wiring: WiringReport }>(
      `/api/compile?target=${target}`,
      { method: 'POST' },
    ),
  getCards: () => req<BlockCard[]>('/api/cards'),
  getBlocks: () => req<BlockSummary[]>('/api/blocks'),
  previewUrl: (instanceId: string, bust?: string) =>
    `/api/preview/${instanceId}${bust ? `?t=${bust}` : ''}`,
  agentEdit: (instruction: string, focusInstanceIds?: string[], allowTouched = false) =>
    req<{
      ok: boolean;
      planId?: string;
      plan?: { ops: Array<{ path: string; value: unknown }>; rationale: string };
      diff?: Array<{ path: string; before: unknown; after: unknown }>;
      warnings?: string[];
      attempts?: number;
      usage?: Array<{ inputTokens: number; outputTokens: number }>;
      errors?: string[];
      provider: string;
      liveModel: boolean;
    }>('/api/agent/edit', {
      method: 'POST',
      body: JSON.stringify({ instruction, focusInstanceIds, allowTouched }),
    }),
  agentApply: (planId: string) =>
    req<{ ok: boolean; applied?: Array<{ path: string; value: unknown }>; errors?: string[] }>(
      '/api/agent/apply',
      { method: 'POST', body: JSON.stringify({ planId }) },
    ),
  agentUndo: () => req<{ ok: boolean; errors?: string[] }>('/api/agent/undo', { method: 'POST' }),
  agentUsage: () =>
    req<{
      undoDepth: number;
      log: Array<{ provider: string; model: string; inputTokens: number; outputTokens: number }>;
      total: { inputTokens: number; outputTokens: number; calls: number };
      provider: string;
      liveModel: boolean;
    }>('/api/agent/usage'),
  exportZip: async (target: 'web' | 'mobile' = 'mobile'): Promise<Blob> => {
    const res = await fetch(`/api/export/zip?target=${target}`, {
      method: 'POST',
      headers: { 'X-Block-App-Id': activeAppId },
    });
    if (!res.ok) throw new Error(`Export failed: ${res.status}`);
    return res.blob();
  },
};
