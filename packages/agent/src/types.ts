/**
 * Agent Gateway types.
 *
 * The agent edits the *diagram and block settings*. It never freely rewrites
 * generated code. Every edit is a list of ops scoped to paths like
 * `block:<instanceId>.config.<key>`, validated against the block manifest's
 * `editSurface`, `locked` fields, the project's `touched` (hand-edited)
 * paths, and the config JSON Schema — before anything is applied.
 */

/** One scoped edit operation proposed by the agent. */
export interface AgentEditOp {
  /** Scoped path, e.g. "block:b1.config.headline". */
  path: string;
  /** New value for the path. */
  value: unknown;
}

/** The agent's plan: ops plus a human-readable rationale. */
export interface AgentPlan {
  ops: AgentEditOp[];
  rationale: string;
}

/** One line of a human-reviewable diff. */
export interface FieldDiff {
  path: string;
  before: unknown;
  after: unknown;
}

/** Token usage for a single LLM call. */
export interface TokenUsage {
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  /** Unix ms timestamp of the call. */
  at: number;
}

/** Result of planning (and optionally applying) an agent edit. */
export interface AgentResult {
  ok: boolean;
  plan?: AgentPlan;
  /** Field-level diff (before → after) for review. Only set when ok. */
  diff?: FieldDiff[];
  applied?: AgentEditOp[];
  usage?: TokenUsage[];
  /** Machine-readable rejection reasons; set when !ok. */
  errors?: string[];
  /** Non-blocking warnings (e.g., ops skipped due to touched paths); set when ok. */
  warnings?: string[];
  /** How many LLM attempts were used (1 + retries). */
  attempts?: number;
}

/** A provider the gateway can call. Swappable; see providers.ts. */
export interface LlmProvider {
  readonly name: string;
  readonly model: string;
  complete(req: CompletionRequest): Promise<CompletionResponse>;
}

export interface CompletionRequest {
  system: string;
  user: string;
  /** Hard cap on output tokens for this call. */
  maxTokens: number;
}

export interface CompletionResponse {
  text: string;
  usage: { inputTokens: number; outputTokens: number };
}

/** Minimal project shape the gateway needs (mirrors @blockfw/builder). */
export interface AgentProject {
  version: 1;
  /** Not read by the agent; kept as unknown to avoid coupling. */
  profile: unknown;
  touched: string[];
  graph: import('@blockfw/manifest').ProjectGraph;
}
