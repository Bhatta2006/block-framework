/**
 * Scoping validator — the safety core of the agent.
 *
 * Every op in a plan is checked, in order:
 *   1. Path shape: must be `block:<instanceId>.config.<key>`.
 *   2. The block instance must exist in the project.
 *   3. The key must be in the block manifest's `editSurface`.
 *   4. The key must NOT be in the manifest's `locked`.
 *   5. The path must NOT be in the project's `touched` (hand-edited) list.
 *   6. The value must validate against the block's config JSON Schema.
 *
 * Any failure rejects the op. The gateway retries the model with the
 * reasons; if retries are exhausted the whole edit is rejected and
 * nothing is applied.
 */
import { Ajv } from 'ajv';
import { blockDesignSchema, elementDesignSchema } from '@blockfw/manifest';
import { loadDefaultRegistry } from '@blockfw/blocks';
import type { AgentEditOp, AgentPlan, AgentProject } from './types.js';

const ajv = new Ajv({ allErrors: true, strict: true });

export interface ScopeCheck {
  ok: boolean;
  /** Accepted ops (subset of the plan). */
  accepted: AgentEditOp[];
  /** Human-readable rejection reasons, one per rejected op. */
  rejections: string[];
}

export interface EditScope {
  focusInstanceIds?: string[];
  allowTouched?: boolean;
}
const PATH_RE =
  /^block:([A-Za-z0-9_-]+)\.(config\.[A-Za-z0-9_]+|variant|design|design\.elements\.[A-Za-z][A-Za-z0-9-]*)$/;

export function checkScope(
  project: AgentProject,
  plan: AgentPlan,
  scope: EditScope = {},
): ScopeCheck {
  const registry = loadDefaultRegistry();
  const accepted: AgentEditOp[] = [];
  const rejections: string[] = [];

  if (!plan || !Array.isArray(plan.ops)) {
    return { ok: false, accepted, rejections: ['plan.ops is not an array'] };
  }

  for (const op of plan.ops) {
    const why = checkOp(project, registry, op, scope);
    if (why === null) accepted.push(op);
    else rejections.push(why);
  }
  return { ok: rejections.length === 0, accepted, rejections };
}

function checkOp(
  project: AgentProject,
  registry: ReturnType<typeof loadDefaultRegistry>,
  op: AgentEditOp,
  scope: EditScope,
): string | null {
  if (!op || typeof op.path !== 'string') return 'op has no string path';
  const m = PATH_RE.exec(op.path);
  if (!m) {
    return `rejected ${JSON.stringify(op.path)}: path must look like "block:<id>.config.<key>" — nothing else is editable`;
  }
  const [, instanceId, surfaceKey] = m as unknown as [string, string, string];

  const block = project.graph.blocks.find((b) => b.id === instanceId);
  if (!block) return `rejected ${op.path}: unknown block instance "${instanceId}"`;

  const entry = registry.get(block.type);
  if (!entry) return `rejected ${op.path}: unknown block type "${block.type}"`;
  const manifest = entry.manifest;

  if (scope.focusInstanceIds && !scope.focusInstanceIds.includes(instanceId))
    return `rejected ${op.path}: outside the selected blocks`;
  if (
    !scope.allowTouched &&
    project.touched.some(
      (t) => op.path === t || op.path.startsWith(t + '.') || t.startsWith(op.path + '.'),
    )
  )
    return `rejected ${op.path}: hand-edited by the user — the agent must not overwrite it`;
  if (surfaceKey === 'variant')
    return manifest.variants.includes(String(op.value))
      ? null
      : `rejected ${op.path}: unknown variant`;
  if (surfaceKey === 'design' || surfaceKey.startsWith('design.elements.')) {
    const validate = ajv.compile(surfaceKey === 'design' ? blockDesignSchema : elementDesignSchema);
    return validate(op.value)
      ? null
      : `rejected ${op.path}: invalid element design (${ajv.errorsText(validate.errors)})`;
  }
  const key = surfaceKey.slice('config.'.length);
  if (!manifest.editSurface.includes(surfaceKey)) {
    return `rejected ${op.path}: "${surfaceKey}" is not in the block's editSurface (${manifest.editSurface.join(', ') || 'empty'})`;
  }
  if (manifest.locked.some((l) => surfaceKey === l || surfaceKey.startsWith(l + '.'))) {
    return `rejected ${op.path}: "${surfaceKey}" is locked and can never be agent-edited`;
  }
  if (
    !scope.allowTouched &&
    project.touched.some(
      (t) => op.path === t || op.path.startsWith(t + '.') || t.startsWith(op.path + '.'),
    )
  ) {
    return `rejected ${op.path}: hand-edited by the user — the agent must not overwrite it`;
  }

  // Schema validation of the new value against the block's config schema.
  const schema = manifest.config as Record<string, unknown>;
  const props = (schema.properties ?? {}) as Record<string, unknown>;
  const propSchema = props[key];
  if (propSchema !== undefined && propSchema !== null && typeof propSchema === 'object') {
    const validate = ajv.compile(propSchema as Record<string, unknown>);
    if (!validate(op.value)) {
      const msgs = (validate.errors ?? [])
        .map((e) => `${e.instancePath || 'value'} ${e.message}`)
        .join('; ');
      return `rejected ${op.path}: value fails schema validation (${msgs})`;
    }
  }
  return null;
}

/** Parse raw model text into a plan. Returns errors instead of throwing. */
export function parsePlan(text: string): { plan?: AgentPlan; error?: string } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    // Try to extract a JSON object if the model wrapped it in prose.
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return { error: 'output is not JSON and contains no JSON object' };
    try {
      data = JSON.parse(m[0]);
    } catch {
      return { error: 'output is not valid JSON' };
    }
  }
  if (typeof data !== 'object' || data === null) return { error: 'output JSON is not an object' };
  const d = data as Record<string, unknown>;
  if (!Array.isArray(d.ops)) return { error: 'output JSON has no "ops" array' };
  for (const op of d.ops) {
    if (
      typeof op !== 'object' ||
      op === null ||
      typeof (op as Record<string, unknown>).path !== 'string'
    ) {
      return { error: 'every op needs a string "path"' };
    }
  }
  return {
    plan: {
      ops: (d.ops as Array<Record<string, unknown>>).map((o) => ({
        path: o.path as string,
        value: o.value,
      })),
      rationale: typeof d.rationale === 'string' ? d.rationale : '',
    },
  };
}
