/**
 * Agent Gateway: plans a scoped edit, validates it, and applies it only
 * after human review. Every step is logged; every edit is reversible.
 *
 * Flow:
 *   1. `plan(instruction)` → prompt (block cards) → provider → parse →
 *      scope-check → (retry with feedback, up to maxAttempts) →
 *      returns { plan, diff } WITHOUT applying.
 *   2. Human reviews the diff.
 *   3. `apply(plan)` → validates once more → applies ops → pushes the
 *      previous project onto the undo stack → marks paths touched.
 *   4. `undo()` → restores the previous project.
 *
 * Token usage for every LLM call is recorded in `usageLog`.
 */
import type {
  AgentEditOp,
  AgentPlan,
  AgentProject,
  AgentResult,
  FieldDiff,
  LlmProvider,
  TokenUsage,
} from './types.js';
import { planPrompt } from './planner.js';
import { checkScope, parsePlan, type EditScope } from './scoping.js';
import { ProjectOperationLog, type ProjectOperation } from '@blockfw/manifest';

export interface GatewayOptions {
  /** Max LLM attempts per edit (1 + retries). Default 3. */
  maxAttempts?: number;
  /** Max tokens the model may emit per call. Default 800. */
  maxTokens?: number;
}

function getPath(project: AgentProject, path: string): unknown {
  const [reference, ...keys] = path.split('.');
  let value: unknown = project.graph.blocks.find((b) => b.id === reference?.slice(6));
  for (const key of keys) value = (value as Record<string, unknown> | undefined)?.[key];
  return value;
}
function diffOf(before: AgentProject, ops: AgentEditOp[]): FieldDiff[] {
  return ops.map((op) => ({
    path: op.path,
    before: getPath(before, op.path),
    after: op.value,
  }));
}

export class AgentGateway<P extends AgentProject = AgentProject> {
  private provider: LlmProvider;
  private maxAttempts: number;
  private maxTokens: number;
  private operations: ProjectOperationLog<P>;
  readonly usageLog: TokenUsage[] = [];

  constructor(
    provider: LlmProvider,
    opts: GatewayOptions = {},
    operations = new ProjectOperationLog<P>(),
  ) {
    this.provider = provider;
    this.maxAttempts = opts.maxAttempts ?? 3;
    this.maxTokens = opts.maxTokens ?? 800;
    this.operations = operations;
  }

  /** Change connection without losing reviewed-edit undo history or usage. */
  setProvider(provider: LlmProvider) {
    this.provider = provider;
  }

  /** Plan an edit without applying it. Returns the plan + reviewable diff. */
  async plan(project: P, instruction: string, scope: EditScope = {}): Promise<AgentResult> {
    const provider = this.provider;
    const { system, user } = planPrompt(
      project,
      instruction,
      scope.focusInstanceIds,
      scope.allowTouched,
    );
    const usage: TokenUsage[] = [];
    let lastErrors: string[] = [];

    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      const promptUser =
        attempt === 1
          ? user
          : `${user}\n\nYour previous output was REJECTED:\n${lastErrors.map((e) => `- ${e}`).join('\n')}\nFix it and output valid JSON only.`;
      let res;
      try {
        res = await provider.complete({ system, user: promptUser, maxTokens: this.maxTokens });
      } catch (e) {
        this.usageLog.push(...usage);
        return {
          ok: false,
          errors: [`LLM call failed: ${e instanceof Error ? e.message : String(e)}`],
          attempts: attempt,
          usage,
        };
      }
      usage.push({
        provider: provider.name,
        model: provider.model,
        inputTokens: res.usage.inputTokens,
        outputTokens: res.usage.outputTokens,
        at: Date.now(),
      });

      const { plan, error } = parsePlan(res.text);
      if (!plan) {
        lastErrors = [`unparseable output: ${error}`];
        continue;
      }
      const check = checkScope(project, plan, scope);
      if (check.accepted.length > 0 || (plan.ops.length === 0 && check.ok)) {
        // Proceed with the valid ops. Rejections are reported but don't
        // block the valid ones (e.g., a touched path is skipped, others apply).
        this.usageLog.push(...usage);
        return {
          ok: true,
          plan: { ops: check.accepted, rationale: plan.rationale },
          diff: diffOf(project, check.accepted),
          usage,
          attempts: attempt,
          warnings: check.rejections,
        };
      }
      lastErrors = check.rejections;
    }

    this.usageLog.push(...usage);
    return {
      ok: false,
      errors: [`rejected after ${this.maxAttempts} attempts:`, ...lastErrors.map((e) => `  ${e}`)],
      attempts: this.maxAttempts,
      usage,
    };
  }

  /**
   * Apply a reviewed plan. Re-validates scope first (the project may have
   * changed since planning). Returns the updated project; the input is not
   * mutated.
   */
  apply(
    project: P,
    plan: AgentPlan,
    scope: EditScope = {},
  ): { project: P; applied: AgentEditOp[] } {
    const check = checkScope(project, plan, scope);
    if (!check.ok) {
      throw new Error(`refusing to apply: ${check.rejections.join('; ')}`);
    }
    const operations: ProjectOperation[] = check.accepted.map((op) => {
      const [reference, ...path] = op.path.split('.');
      return { type: 'setBlockField', id: reference!.slice(6), path, value: op.value };
    });
    operations.push({
      type: 'setTouched',
      touched: [...new Set([...project.touched, ...check.accepted.map((op) => op.path)])].sort(),
    });
    const next = this.operations.apply(project, operations, 'agent');
    return { project: next, applied: check.accepted };
  }

  /** Revert the most recent applied edit. Returns null when nothing to undo. */
  undo(): P | null {
    if (this.operations.lastSource !== 'agent') return null;
    return this.operations.travel('undo');
  }

  get undoDepth(): number {
    return this.operations.agentDepth;
  }

  /** Total tokens spent through this gateway (for honest cost reporting). */
  get totalUsage(): { inputTokens: number; outputTokens: number; calls: number } {
    return this.usageLog.reduce(
      (acc, u) => ({
        inputTokens: acc.inputTokens + u.inputTokens,
        outputTokens: acc.outputTokens + u.outputTokens,
        calls: acc.calls + 1,
      }),
      { inputTokens: 0, outputTokens: 0, calls: 0 },
    );
  }
}
