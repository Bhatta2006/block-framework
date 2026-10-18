/**
 * Recipe book: approved blueprints keyed by normalized request.
 *
 * Asking for the same app twice should not pay for the same plan twice.
 * Once a user applies a build, its blueprint is recorded here; the same
 * request against the same block library (and, for extensions, the same
 * starting graph) replays it with zero model tokens. Replays are still
 * re-validated, so a changed library falls back to the model.
 */
import { createHash } from 'node:crypto';
import { canonicalJson } from '@blockfw/manifest';
import type { BlockRegistry } from '@blockfw/blocks';
import type { AppBlueprint } from './blueprint.js';

export interface Recipe {
  request: string;
  mode: 'new' | 'extend';
  blueprint: AppBlueprint;
  uses: number;
}

/** Lowercase, collapse whitespace and strip trailing punctuation. */
export function normalizeRequest(request: string): string {
  return request
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[\s.!?]+$/, '')
    .trim();
}

export function recipeKey(
  request: string,
  mode: 'new' | 'extend',
  registry: BlockRegistry,
  graph?: unknown,
): string {
  const parts = [normalizeRequest(request), mode, registry.keys().sort().join(',')];
  if (mode === 'extend') parts.push(canonicalJson(graph));
  return createHash('sha256').update(parts.join('\n')).digest('hex').slice(0, 32);
}

export class RecipeBook {
  private readonly recipes = new Map<string, Recipe>();

  constructor(entries: Record<string, Recipe> = {}) {
    for (const [key, recipe] of Object.entries(entries)) this.recipes.set(key, recipe);
  }

  get(key: string): Recipe | undefined {
    const recipe = this.recipes.get(key);
    return recipe ? structuredClone(recipe) : undefined;
  }

  /** Record an approved blueprint; repeated approvals count as reuse. */
  record(key: string, recipe: Omit<Recipe, 'uses'>): void {
    const uses = (this.recipes.get(key)?.uses ?? 0) + 1;
    this.recipes.set(key, { ...structuredClone(recipe), uses });
  }

  get size(): number {
    return this.recipes.size;
  }

  toJSON(): Record<string, Recipe> {
    return Object.fromEntries([...this.recipes].sort(([a], [b]) => (a < b ? -1 : 1)));
  }
}
