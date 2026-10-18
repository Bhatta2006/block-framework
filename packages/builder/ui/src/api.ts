import type { BlockPorts, OperationEntry, ProjectOperation } from '@blockfw/manifest';
import type { BuilderProject, BuilderProfile } from '../../src/cascade';
import type { BlockCard } from '../../src/cards';
import type { ChatGPTStatus, ChatGPTModel } from '../../src/chatgpt';
import type { Wire, WiringReport } from '@blockfw/wiring';
import type { ExportTarget } from '@blockfw/compiler';

export type { BuilderProject, BlockCard, ChatGPTStatus, ChatGPTModel, Wire, WiringReport };
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
  ports: BlockPorts;
}

/** A builder-agent plan awaiting review (see packages/agent/src/app-builder.ts). */
export interface AgentBuildPlan {
  ok: boolean;
  planId?: string;
  mode?: 'new' | 'extend';
  source?: 'recipe' | 'model';
  appName?: string;
  pages?: Array<{ id: string; title: string; blocks: string[] }>;
  operations?: number;
  coverage?: { blocks: number; pages: number };
  missing?: Array<{ capability: string; proposedBlock?: string; reason?: string }>;
  rationale?: string;
  warnings?: string[];
  errors?: string[];
  attempts?: number;
  usage?: Array<{ inputTokens: number; outputTokens: number }>;
  provider: string;
  liveModel: boolean;
}

/** A capability the builder found no library block for. */
export type MissingCapability = NonNullable<AgentBuildPlan['missing']>[number];

/** A block contract awaiting review (see packages/agent/src/block-author.ts). */
export interface AgentBlockDraft {
  ok: boolean;
  contractId?: string;
  contract?: {
    manifest: {
      id: string;
      version: string;
      category: string;
      variants: string[];
      editSurface: string[];
      ports: BlockPorts;
    };
    sampleConfig: { variant?: string; config: Record<string, unknown> };
    summary: string;
  };
  card?: { markdown: string; estimatedTokens: number };
  errors?: string[];
  attempts?: number;
  usage?: Array<{ inputTokens: number; outputTokens: number }>;
  provider: string;
  liveModel: boolean;
}

/** Result of implementing an approved contract. */
export interface AgentBlockResult {
  ok: boolean;
  block?: string;
  checks?: Array<{ name: string; ok: boolean; issues: string[] }>;
  errors?: string[];
  attempts?: number;
  usage?: Array<{ inputTokens: number; outputTokens: number }>;
}

export type WireTarget = Wire['to'];
export interface OperationHistory {
  undo: number;
  redo: number;
  revision: number;
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
  chatgptStatus: () => req<ChatGPTStatus>('/api/agent/chatgpt/status'),
  chatgptModels: () => req<ChatGPTModel[]>('/api/agent/chatgpt/models'),
  chatgptLogin: (id?: string) =>
    req<{ url: string }>('/api/agent/chatgpt/login', {
      method: 'POST',
      body: JSON.stringify({ id }),
    }),
  chatgptAction: (action: 'cancel' | 'select' | 'model' | 'signout' | 'welcome', value?: string) =>
    req<ChatGPTStatus>('/api/agent/chatgpt/' + action, {
      method: 'POST',
      body: JSON.stringify(action === 'model' ? { model: value } : { id: value }),
    }),
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
  getOperations: () =>
    req<OperationHistory & { project: BuilderProject; entries: OperationEntry[] }>(
      '/api/operations',
    ),
  applyOperations: (operations: ProjectOperation[], revision: number) =>
    req<{ project: BuilderProject; history: OperationHistory }>('/api/operations', {
      method: 'POST',
      body: JSON.stringify({ operations, revision }),
    }),
  travel: (direction: 'undo' | 'redo', revision: number) =>
    req<{ project: BuilderProject; history: OperationHistory }>('/api/operations/' + direction, {
      method: 'POST',
      body: JSON.stringify({ revision }),
    }),
  saveProject: (project: BuilderProject) =>
    req<{ ok: boolean }>('/api/project', { method: 'PUT', body: JSON.stringify(project) }),
  setProfile: (profile: BuilderProfile) =>
    req<{ ok: boolean; errors?: string[] }>('/api/profile', {
      method: 'PUT',
      body: JSON.stringify({ profile }),
    }),
  applyCascade: () =>
    req<{ ok: boolean; applied: string[]; skippedTouched: string[]; project: BuilderProject }>(
      '/api/cascade',
      { method: 'POST' },
    ),
  compile: (target: ExportTarget = 'mobile') =>
    req<{ ok: boolean; projectHash: string; files: string[]; wiring: WiringReport }>(
      `/api/compile?target=${target}`,
      { method: 'POST' },
    ),
  getCards: () => req<BlockCard[]>('/api/cards'),
  getBlocks: () => req<BlockSummary[]>('/api/blocks'),
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
  agentBuild: (request: string, mode: 'new' | 'extend') =>
    req<AgentBuildPlan>('/api/agent/build', {
      method: 'POST',
      body: JSON.stringify({ request, mode }),
    }),
  agentBuildApply: async (planId: string) => {
    const result = await req<
      AppCatalog & { ok: boolean; mode: 'new' | 'extend'; project: BuilderProject }
    >('/api/agent/build/apply', { method: 'POST', body: JSON.stringify({ planId }) });
    activeAppId = result.activeId;
    return result;
  },
  agentBlockDraft: (missing: MissingCapability) =>
    req<AgentBlockDraft>('/api/agent/blocks/draft', {
      method: 'POST',
      body: JSON.stringify(missing),
    }),
  agentBlockImplement: (contractId: string) =>
    req<AgentBlockResult>('/api/agent/blocks/implement', {
      method: 'POST',
      body: JSON.stringify({ contractId }),
    }),
  agentUndo: () => req<{ ok: boolean; errors?: string[] }>('/api/agent/undo', { method: 'POST' }),
  agentUsage: () =>
    req<{
      undoDepth: number;
      log: Array<{ provider: string; model: string; inputTokens: number; outputTokens: number }>;
      total: { inputTokens: number; outputTokens: number; calls: number };
      provider: string;
      liveModel: boolean;
    }>('/api/agent/usage'),
  exportZip: async (target: ExportTarget = 'mobile'): Promise<Blob> => {
    const res = await fetch(`/api/export/zip?target=${target}`, {
      method: 'POST',
      headers: { 'X-Block-App-Id': activeAppId },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(
        body?.error || body?.violations?.join('; ') || `Export failed: ${res.status}`,
      );
    }
    return res.blob();
  },
};
