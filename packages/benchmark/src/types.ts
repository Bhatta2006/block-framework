/**
 * Benchmark task model.
 *
 * A task describes ONE change to the base app graph. The harness runs it
 * through an agent (mock = mechanical JSON edit + recompile, zero tokens)
 * and checks the outcome. The same tasks will later be run against a
 * baseline coding agent to measure the token/cost delta honestly.
 */

export type TaskOperation =
  | { kind: 'set-config'; instance: string; config: Record<string, unknown> }
  | { kind: 'set-variant'; instance: string; variant: string }
  | { kind: 'set-block-type'; instance: string; type: string }
  | {
      kind: 'replace-block';
      instance: string;
      type: string;
      variant?: string;
      config?: Record<string, unknown>;
    }
  | { kind: 'set-screen-block'; screen: string; block: string }
  | { kind: 'set-slug'; slug: string }
  | {
      kind: 'set-theme';
      theme: { primaryColor?: string; backgroundColor?: string; textColor?: string };
    }
  | { kind: 'reorder-screens'; order: string[] }
  | { kind: 'add-wire'; from: { instance: string; event: string }; toScreen: string }
  | {
      kind: 'add-wires';
      wires: Array<{ from: { instance: string; event: string }; toScreen: string }>;
    }
  | { kind: 'remove-screen'; screen: string }
  | {
      kind: 'add-screen';
      screen: { id: string; block: string; title: string };
      block: { id: string; type: string; variant?: string; config?: Record<string, unknown> };
    }
  | { kind: 'set-spine'; spine: Record<string, unknown> }
  | { kind: 'apply-profile'; profile: Record<string, string>; touched?: string[] }
  | { kind: 'set-lane'; screen: string; lane?: string }
  | { kind: 'none' };

export type TaskCheck =
  | { kind: 'hash-stable' }
  | { kind: 'changed-files'; only?: string[]; not?: string[] }
  | { kind: 'wire-origin'; instance: string; event: string; origin: 'auto' | 'user' }
  | {
      kind: 'wire-target';
      instance: string;
      event: string;
      screen: string;
      toInstance?: string;
    }
  | { kind: 'file-contains'; path: string; text: string }
  | { kind: 'cards-stable' };

export type TaskCategory =
  'config-edit' | 'variant-swap' | 'graph-op' | 'wiring' | 'determinism' | 'invalid';

export interface BenchmarkTask {
  id: string;
  title: string;
  category: TaskCategory;
  description: string;
  operation: TaskOperation;
  expects: 'success' | 'compile-error';
  checks?: TaskCheck[];
}

export interface TaskReport {
  id: string;
  title: string;
  category: TaskCategory;
  pass: boolean;
  wallMs: number;
  tokensIn: number;
  tokensOut: number;
  notes: string[];
}

export interface BenchmarkReport {
  generatedAt: string;
  agent: string;
  baseGraph: string;
  tasks: TaskReport[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    totalWallMs: number;
    totalTokens: number;
  };
}

/** Minimal agent interface. The mock agent performs the operation mechanically. */
export interface AgentResult {
  wallMs: number;
  tokensIn: number;
  tokensOut: number;
  error?: string;
}
