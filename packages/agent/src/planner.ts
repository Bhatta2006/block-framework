/**
 * Prompt planner: turns a plain-language instruction into the compact
 * prompt the model sees. Context stays small by design — block cards
 * (≤300 tokens each), not manifests or codebases.
 */
import { loadDefaultRegistry } from '@blockfw/blocks';
import type { AgentProject } from './types.js';

export interface PlannedPrompt {
  system: string;
  user: string;
  /** Block instance ids included, for debugging. */
  scope: string[];
}

const SYSTEM = `You are a scoped UI editor for a visual app builder. You edit block content, variants, and individual element styles, never code.

Rules (violations are rejected automatically):
- Output ONLY a JSON object: {"ops":[{"path":"block:<instanceId>.config.<key>","value":"..."}],"rationale":"..."}.
- Every path MUST be listed under "Editable fields" below. Anything else is rejected.
- NEVER invent new blocks, screens, or fields. NEVER delete anything.
- Content values follow their existing types. Keep copy short. Preserve structured arrays.
- Design value shape: {"elements":{"button":{"x":0,"y":0,"width":200,"alignSelf":"center"}}}. Element IDs: container, title, subtitle, eyebrow, button, secondaryButton, input, image; repeated elements use -2, -3 suffixes. title/body typography maps to title/subtitle.
- Element styles: x/y (-2000..2000), width/height/padding/marginTop/marginBottom/borderRadius (0..2000), fontSize (8..200), fontWeight ("400".."800"), textAlign (left/center/right), alignSelf (flex-start/center/flex-end/stretch), color/backgroundColor (#RRGGBB), opacity (0..1), hidden (boolean).
- Prefer a single design.elements.<elementId> edit over replacing design. Preserve unrelated styles. For a shared change, emit an op for EVERY matching block in scope.
- If the instruction asks for something outside the editable fields, return {"ops":[],"rationale":"..."} explaining why.

You will be retried with the rejection reason if your output is invalid.`;

/**
 * Build the prompt for an instruction. `focusInstanceIds` optionally narrows
 * the scope (e.g. the screen the user has selected); otherwise all blocks
 * are in scope but only their editSurface fields are shown.
 */
export function planPrompt(
  project: AgentProject,
  instruction: string,
  focusInstanceIds?: string[],
  allowTouched = false,
): PlannedPrompt {
  const registry = loadDefaultRegistry();
  const inScope = project.graph.blocks.filter(
    (b) => !focusInstanceIds || focusInstanceIds.includes(b.id),
  );

  const sections: string[] = [];
  const scope: string[] = [];
  for (const b of inScope) {
    const entry = registry.get(b.type);
    if (!entry) continue;
    const manifest = entry.manifest;
    scope.push(b.id);
    const editable = manifest.editSurface.filter((p) => {
      const key = p.replace(/^config\./, '');
      const touchedPath = `block:${b.id}.config.${key}`;
      // Don't even show user-hand-edited fields: the model must not see
      // them as candidates.
      return (
        allowTouched ||
        !project.touched.some(
          (t) =>
            touchedPath === t || touchedPath.startsWith(t + '.') || t.startsWith(touchedPath + '.'),
        )
      );
    });

    const current = editable
      .map((p) => {
        const key = p.replace(/^config\./, '');
        const v = (b.config ?? {})[key];
        return `  - block:${b.id}.config.${key} (current: ${JSON.stringify(v)})`;
      })
      .join('\n');
    sections.push(
      `Block ${b.id} (${manifest.id}, variant ${b.variant ?? manifest.defaultVariant ?? '?'}):\n${current}\n  - block:${b.id}.variant (allowed: ${manifest.variants.join(', ')})\n  - block:${b.id}.design (current: ${JSON.stringify(b.design ?? {})})\n  - block:${b.id}.design.elements.<elementId>`,
    );
  }

  const user = [
    `App: ${project.graph.app.name}`,
    instruction.trim() ? `Instruction: ${instruction.trim()}` : 'Instruction: (none given)',
    '',
    'Editable fields:',
    sections.length > 0 ? sections.join('\n') : '(none — every field is hand-edited or locked)',
  ].join('\n');

  return { system: SYSTEM, user, scope };
}
