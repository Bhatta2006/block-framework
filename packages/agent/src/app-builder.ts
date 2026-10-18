/**
 * Builder agent: assembles an app from library blocks for a plain-language
 * request (plan §16.2).
 *
 * Flow:
 *   1. Recipe lookup: an approved blueprint for the same request replays at
 *      zero tokens.
 *   2. Otherwise the model receives block cards and writes a blueprint.
 *   3. The blueprint is checked against block contracts, merged into the
 *      graph, schema-validated, wired, and passed to the caller's dry-run
 *      verifier (the Studio compiles it). Every rejection is fed back to the
 *      model, up to maxAttempts.
 *   4. The caller reviews the typed operations, then applies them through the
 *      gateway so agent undo covers the whole build.
 *
 * Capabilities no block covers are reported in `missing` (the coverage
 * report) instead of being improvised; they are the block-author path.
 */
import { generateCard, loadDefaultRegistry, type BlockRegistry } from '@blockfw/blocks';
import {
  diffProjectOperations,
  validateProjectGraph,
  type ProjectGraph,
  type ProjectOperation,
} from '@blockfw/manifest';
import { resolveWiring } from '@blockfw/wiring';
import {
  assembleBlueprint,
  mergeIntoGraph,
  parseBlueprint,
  type AppBlueprint,
  type MissingCapability,
} from './blueprint.js';
import { RecipeBook, recipeKey } from './recipes.js';
import type { AgentProject, LlmProvider, TokenUsage } from './types.js';

export type BuildMode = 'new' | 'extend';

export interface BuildOptions {
  /** Max LLM attempts (1 + retries). Default 3. */
  maxAttempts?: number;
  /** Max output tokens per call. Default 3000. */
  maxTokens?: number;
  /** Dry-run gate, e.g. compile the graph. Throw to reject with a reason. */
  verify?: (graph: ProjectGraph) => void;
  registry?: BlockRegistry;
}

export interface BuildResult {
  ok: boolean;
  source?: 'recipe' | 'model';
  recipeKey?: string;
  blueprint?: AppBlueprint;
  /** The proposed graph; for review and preview, not yet saved. */
  graph?: ProjectGraph;
  /** Typed operations that turn the current graph into `graph`. */
  operations?: ProjectOperation[];
  /** Coverage report: requested capabilities with no library block. */
  missing?: MissingCapability[];
  coverage?: { blocks: number; pages: number };
  warnings?: string[];
  errors?: string[];
  usage?: TokenUsage[];
  attempts?: number;
}

const SYSTEM = `You are the builder agent of a visual app compiler. You assemble apps ONLY from the library blocks listed below; you never write code.

Output ONLY one JSON object:
{"app":{"name":"..."},"pages":[{"id":"home","title":"Home","layout":"stack","blocks":[{"id":"hero","type":"content.hero@1.0.0","variant":"default","config":{"title":"..."}}]}],"wires":[{"from":{"block":"hero","event":"action.pressed"},"to":{"page":"next","block":"optional-consumer-id"}}],"missing":[{"capability":"...","proposedBlock":"category.name","reason":"..."}],"rationale":"..."}

Rules (violations are rejected and you will be retried with the reason):
- "type" MUST be a block id from the library. Never invent blocks. If a requested feature has no suitable block, leave it out and add it to "missing".
- Page and block ids: letters, digits, "-" or "_", starting with a letter, unique across the app.
- "config" may set ONLY that block's "Edit surface" fields; omitted fields keep sample content. Write real, specific product copy.
- Wires connect an event the block "Emits" to a target page; set "to.block" only for a block on that page that "Consumes" the event. Navigation events (action.pressed, auth.completed, billing.continued...) need a wire when several pages could receive them.
- "layout": stack | grid | split. Set "navigation": false for pages reached only by a wire (e.g. detail or editor pages).
- Blocks described as requiring the cloud backend only work in cloud apps; do not use them otherwise.
- Prefer few pages that each do one job. The first page is the entry point.`;

/** Cards for every registered block, including experimental ones the block author added. */
function catalog(registry: BlockRegistry): string {
  return registry
    .entries()
    .map((entry) =>
      generateCard(
        entry.manifest,
        entry.experimental && `Experimental (agent-authored): ${entry.experimental.summary}`,
      ),
    )
    .sort((a, b) => (a.block < b.block ? -1 : 1))
    .map((card) => card.markdown)
    .join('\n\n');
}

function graphSummary(graph: ProjectGraph): string {
  return graph.screens
    .map((screen) => {
      const blocks = (screen.blocks ?? [screen.block]).map((id) => {
        const block = graph.blocks.find((item) => item.id === id);
        return `${id} (${block?.type ?? '?'})`;
      });
      return `- page ${screen.id} "${screen.title}": ${blocks.join(', ')}`;
    })
    .join('\n');
}

export class AppBuilder {
  readonly usageLog: TokenUsage[] = [];
  private readonly registry: BlockRegistry;

  constructor(
    private provider: LlmProvider,
    readonly recipes = new RecipeBook(),
    private readonly options: BuildOptions = {},
  ) {
    this.registry = options.registry ?? loadDefaultRegistry();
  }

  setProvider(provider: LlmProvider) {
    this.provider = provider;
  }

  /** Validate a blueprint and derive the proposed graph and operations. */
  evaluate<P extends AgentProject>(
    project: P,
    blueprint: AppBlueprint,
    mode: BuildMode,
  ): Omit<BuildResult, 'source' | 'usage' | 'attempts'> {
    const base = project.graph;
    const assembled = assembleBlueprint(
      blueprint,
      this.registry,
      mode === 'extend' ? base : undefined,
    );
    if (assembled.errors.length) return { ok: false, errors: assembled.errors };
    const graph = mergeIntoGraph(base, blueprint, assembled, mode);
    const warnings: string[] = [];
    try {
      validateProjectGraph(graph);
      const { report } = resolveWiring(graph, this.registry);
      const ambiguous = report.ambiguous.map(
        (item) =>
          `${item.instance}.${item.event} has several possible targets (${item.candidates.join(', ')}); add a wire`,
      );
      if (ambiguous.length) return { ok: false, errors: ambiguous };
      warnings.push(
        ...report.unmet.map((item) => `${item.instance}.${item.event}: ${item.reason}`),
        ...report.warnings,
      );
      this.options.verify?.(graph);
    } catch (error) {
      return { ok: false, errors: [error instanceof Error ? error.message : String(error)] };
    }
    const operations = diffProjectOperations(project, { ...project, graph });
    return {
      ok: true,
      blueprint,
      graph,
      operations,
      missing: blueprint.missing ?? [],
      coverage: { blocks: assembled.blocks.length, pages: assembled.screens.length },
      warnings,
    };
  }

  /** Plan a build without applying it. */
  async build<P extends AgentProject>(
    project: P,
    request: string,
    mode: BuildMode = 'new',
  ): Promise<BuildResult> {
    const key = recipeKey(request, mode, this.registry, project.graph);
    const recipe = this.recipes.get(key);
    if (recipe) {
      const replay = this.evaluate(project, recipe.blueprint, mode);
      if (replay.ok) return { ...replay, source: 'recipe', recipeKey: key, usage: [], attempts: 0 };
    }

    const provider = this.provider;
    const maxAttempts = this.options.maxAttempts ?? 3;
    const user = [
      `Request: ${request.trim()}`,
      mode === 'extend'
        ? `Mode: extend. Add new pages to this existing app; reuse none of its ids. Wires may target existing pages.\nExisting app "${project.graph.app.name}":\n${graphSummary(project.graph)}`
        : 'Mode: new app. Design the complete app.',
      '',
      'Block library:',
      catalog(this.registry),
    ].join('\n');
    const usage: TokenUsage[] = [];
    let errors: string[] = [];
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const prompt =
        attempt === 1
          ? user
          : `${user}\n\nYour previous blueprint was REJECTED:\n${errors.map((e) => `- ${e}`).join('\n')}\nFix every issue and output the complete JSON again.`;
      let response;
      try {
        response = await provider.complete({
          system: SYSTEM,
          user: prompt,
          maxTokens: this.options.maxTokens ?? 3000,
        });
      } catch (error) {
        this.usageLog.push(...usage);
        return {
          ok: false,
          errors: [`LLM call failed: ${error instanceof Error ? error.message : String(error)}`],
          usage,
          attempts: attempt,
        };
      }
      usage.push({
        provider: provider.name,
        model: provider.model,
        inputTokens: response.usage.inputTokens,
        outputTokens: response.usage.outputTokens,
        at: Date.now(),
      });
      const parsed = parseBlueprint(response.text);
      if (!parsed.blueprint) {
        errors = [`unparseable output: ${parsed.error}`];
        continue;
      }
      const result = this.evaluate(project, parsed.blueprint, mode);
      if (result.ok) {
        this.usageLog.push(...usage);
        return { ...result, source: 'model', recipeKey: key, usage, attempts: attempt };
      }
      errors = result.errors ?? [];
    }
    this.usageLog.push(...usage);
    return {
      ok: false,
      errors: [`rejected after ${maxAttempts} attempts:`, ...errors.map((e) => `  ${e}`)],
      usage,
      attempts: maxAttempts,
    };
  }

  /** Remember an approved build so the same request replays without tokens. */
  remember(key: string, request: string, mode: BuildMode, blueprint: AppBlueprint): void {
    this.recipes.record(key, { request, mode, blueprint });
  }
}
