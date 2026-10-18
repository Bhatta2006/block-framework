/**
 * Block-author agent: turns one capability the builder reported as missing
 * into a reviewed, tested, experimental library block (plan §16.3).
 *
 * Flow:
 *   1. `draftContract(missing)` → the model writes the block contract only
 *      (manifest: ports, config schema, editSurface, variants; sample config;
 *      card summary). It is checked against the manifest schema and SDK
 *      conventions, with rejections fed back (retry with feedback, as in the
 *      gateway). Nothing is written; the human reviews the contract and card.
 *   2. `implement(contract)` after approval → `sdk scaffold` writes the
 *      block's three files into the experimental directory, the model fills
 *      the scaffolded template, and every gate runs automatically: manifest
 *      validation, `sdk test`, `sdk validate`, and the caller's compile of a
 *      graph that places the block once per variant. Failures go back to the
 *      model, up to maxAttempts.
 *   3. A block that passes every gate is registered as experimental, so the
 *      builder agent sees its card on the next build. `loadExperimental()`
 *      re-registers verified blocks when the Studio restarts.
 *
 * Generated templates run in a `node:vm` context with no Node globals, no
 * code generation from strings, JSON-only input and output, and a timeout.
 * That contains honest mistakes; it is not a security boundary. Real
 * sandboxing (E2B/Docker) is deferred; see docs/adr/0014-block-author-agent.md.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import * as nodeModule from 'node:module';
import { join } from 'node:path';
import { createContext, runInContext } from 'node:vm';
import {
  generateCard,
  scaffoldManifest,
  testBlock,
  validateBlock,
  writeScaffoldedBlock,
  type BlockRegistry,
  type BlockTemplate,
  type RenderContext,
  type RenderedBlock,
} from '@blockfw/blocks';
import {
  normalizeConsumes,
  normalizeEmits,
  validateBlockConfig,
  validateManifest,
  type BlockManifest,
  type ProjectGraph,
} from '@blockfw/manifest';
import type { MissingCapability } from './blueprint.js';
import type { LlmProvider, TokenUsage } from './types.js';

/** What the human reviews before any file is written. */
export interface BlockContract {
  manifest: BlockManifest;
  /** Wrapped like sample-config.json: `{ variant?, config }`. */
  sampleConfig: { variant?: string; config: Record<string, unknown> };
  /** One-line purpose for the block card. */
  summary: string;
}

export interface AuthorCheck {
  name: 'manifest' | 'sdk test' | 'sdk validate' | 'compile';
  ok: boolean;
  issues: string[];
}

export interface ContractResult {
  ok: boolean;
  contract?: BlockContract;
  /** The block card the builder will read once the block is registered. */
  card?: { markdown: string; estimatedTokens: number };
  errors?: string[];
  usage: TokenUsage[];
  attempts: number;
}

export interface ImplementResult {
  ok: boolean;
  /** `id@version` once registered. */
  block?: string;
  /** Gate results of the last attempt. */
  checks?: AuthorCheck[];
  /** Files in the experimental directory. */
  files?: string[];
  errors?: string[];
  usage: TokenUsage[];
  attempts: number;
}

export interface BlockAuthorOptions {
  /** Directory for experimental blocks (one folder per block + experimental.json). */
  root: string;
  /** Live registry; verified blocks are registered here. */
  registry: BlockRegistry;
  /** Dry-run compile of a graph against a candidate registry. Throw to reject. */
  verify?: (graph: ProjectGraph, registry: BlockRegistry) => void;
  /** Max LLM attempts per step (1 + retries). Default 3. */
  maxAttempts?: number;
  /** Max output tokens per call. Defaults: contract 1500, template 4000. */
  maxTokens?: { contract?: number; template?: number };
  /** Per-render timeout for generated templates. Default 1000 ms. */
  renderTimeoutMs?: number;
}

interface ExperimentalIndex {
  blocks: Array<{ id: string; version: string; summary: string }>;
}

const CONTRACT_SYSTEM = `You are the block-author agent of a visual app compiler. You design the CONTRACT of one new reusable library block. You write no code in this step.

Output ONLY one JSON object:
{"manifest":{...block manifest...},"sampleConfig":{"variant":"default","config":{...}},"summary":"One line: what the block does."}

Rules (violations are rejected and you will be retried with the reason):
- The manifest follows the starter manifest shape shown below. "id" is "namespace.name" (lowercase; use the proposed id when given) and must not exist in the library. "version" is "1.0.0".
- "category" is one of: onboarding, paywall, home, auth, settings, profile, navigation, theme, data, media, social, utility.
- "variants": 1-3 lowercase names that render visibly differently; "defaultVariant" is one of them.
- "config" is a JSON Schema object with "properties" and "additionalProperties": false. Use plain content fields (strings, numbers, booleans, small arrays of objects) that a builder can fill with product copy.
- "defaultConfig" gives defaults for optional fields only.
- "editSurface" lists "config.<property>" for every content field the builder may set; nothing else.
- "locked" includes "ports" and "variants".
- "ports": reuse event names from the library where they fit (e.g. "action.pressed" to navigate). Emits are {"event":"<namespace>.<name>","payload":{JSON Schema}} or a string; consumes are strings or {"port":"...","accepts":{JSON Schema}}. No "backend".
- "sampleConfig.config" is realistic, valid against "config", and fills every required field.
- Keep the summary under 120 characters. The block must be generic and reusable, not tied to one app.`;

const TEMPLATE_SYSTEM = `You are the block-author agent of a visual app compiler. You implement the TEMPLATE of an approved block. The template is a pure TypeScript function that returns the source of one React Native component file.

Output ONLY one JSON object: {"template":"<complete template.ts source>"}

Rules (violations are rejected and you will be retried with the reason):
- Start from the scaffolded template below and keep its shape: self-contained, no import or require statements, exactly one export: "export function render(ctx: RenderContext): RenderedBlock".
- render() is pure and deterministic: no Date, Math.random, globals, I/O or network. Same context in, byte-identical file out.
- The returned "content" is a .tsx file that imports only 'react', 'react-native' and "{ theme } from '../theme'", and declares "export function \${componentName}()" using ctx.componentName.
- Read every config field from ctx.config with safe fallbacks; escape user text with JSON.stringify. Every variant must produce different output.
- Return { fileName: \`\${instanceId}.tsx\`, content, acceptsOnComplete: false, acceptsInput: false }.`;

function parseObject(text: string): { data?: Record<string, unknown>; error?: string } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return { error: 'output is not JSON and contains no JSON object' };
    try {
      data = JSON.parse(match[0]);
    } catch {
      return { error: 'output is not valid JSON' };
    }
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data))
    return { error: 'output JSON is not an object' };
  return { data: data as Record<string, unknown> };
}

/** Contract and convention checks; empty when the contract can be approved. */
export function checkContract(contract: BlockContract, registry: BlockRegistry): string[] {
  const errors: string[] = [];
  const { manifest, sampleConfig, summary } = contract;
  try {
    validateManifest(manifest);
  } catch (error) {
    return [`manifest: ${error instanceof Error ? error.message : String(error)}`];
  }
  if (registry.keys().some((key) => key.startsWith(`${manifest.id}@`)))
    errors.push(`id: "${manifest.id}" already exists in the library; reuse it or pick a new id`);
  if (manifest.version !== '1.0.0') errors.push('version: a new block starts at "1.0.0"');
  if (new Set(manifest.variants).size !== manifest.variants.length)
    errors.push('variants: names must be unique');
  if (manifest.defaultVariant && !manifest.variants.includes(manifest.defaultVariant))
    errors.push(`defaultVariant: "${manifest.defaultVariant}" is not in variants`);
  const schema = manifest.config as { type?: unknown; properties?: Record<string, unknown> };
  const properties = Object.keys(schema.properties ?? {});
  if (schema.type !== 'object' || properties.length === 0)
    errors.push('config: must be an object schema with properties');
  for (const path of manifest.editSurface)
    if (!/^config\.[A-Za-z][A-Za-z0-9_]*$/.test(path) || !properties.includes(path.slice(7)))
      errors.push(`editSurface: "${path}" is not a config property`);
  for (const field of ['ports', 'variants'])
    if (!manifest.locked.includes(field)) errors.push(`locked: must include "${field}"`);
  if (manifest.backend) errors.push('backend: experimental blocks cannot declare a backend');
  try {
    normalizeEmits(manifest.ports.emits);
    normalizeConsumes(manifest.ports.consumes);
  } catch (error) {
    errors.push(`ports: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (typeof summary !== 'string' || !summary.trim() || summary.length > 120)
    errors.push('summary: one line under 120 characters is required');
  if (
    typeof sampleConfig !== 'object' ||
    sampleConfig === null ||
    typeof sampleConfig.config !== 'object' ||
    sampleConfig.config === null
  )
    errors.push('sampleConfig: must be {"variant": "...", "config": {...}}');
  else {
    if (sampleConfig.variant !== undefined && !manifest.variants.includes(sampleConfig.variant))
      errors.push(`sampleConfig.variant: "${sampleConfig.variant}" is not in variants`);
    for (const issue of validateBlockConfig(manifest, sampleConfig.config))
      errors.push(`sampleConfig.config${issue.path ? `.${issue.path}` : ''}: ${issue.message}`);
  }
  if (!errors.length) {
    const card = generateCard(manifest, summary);
    if (card.estimatedTokens > 300)
      errors.push(`card: ${card.estimatedTokens} estimated tokens; the budget is 300`);
  }
  return errors;
}

/** Node's built-in type stripping (Node 22.13+); avoids a TypeScript runtime dependency. */
function stripTypeScript(source: string): string {
  const strip = (nodeModule as { stripTypeScriptTypes?: (source: string) => string })
    .stripTypeScriptTypes;
  if (!strip) throw new Error('Generated templates need Node 22.13 or newer (type stripping)');
  return strip(source);
}

/**
 * Load a self-contained template.ts into an isolated vm context. Each render
 * receives a JSON copy of the context and returns plain data. Not a security
 * boundary (see the module comment).
 */
export function loadTemplate(source: string, timeoutMs = 1000): BlockTemplate {
  if (!/^export function render\(/m.test(source))
    throw new Error('template must declare "export function render(ctx: RenderContext)"');
  const script = stripTypeScript(source).replace(/^export function render\(/m, 'function render(');
  const sandbox = createContext(Object.create(null) as object, {
    codeGeneration: { strings: false, wasm: false },
  });
  runInContext(script, sandbox, { timeout: timeoutMs });
  if (runInContext('typeof render', sandbox) !== 'function')
    throw new Error('template does not define render()');
  const globals = sandbox as Record<string, unknown>;
  return (ctx: RenderContext): RenderedBlock => {
    globals['__input'] = JSON.stringify(ctx);
    const output = runInContext(
      `(() => {
        const r = render(JSON.parse(__input));
        return JSON.stringify({ fileName: r && r.fileName, content: r && r.content,
          acceptsOnComplete: r && r.acceptsOnComplete, acceptsInput: r && r.acceptsInput });
      })()`,
      sandbox,
      { timeout: timeoutMs },
    ) as string;
    delete globals['__input'];
    const rendered = JSON.parse(output) as Partial<RenderedBlock>;
    if (typeof rendered.fileName !== 'string' || typeof rendered.content !== 'string')
      throw new Error('render() must return { fileName: string, content: string, ... }');
    return {
      fileName: rendered.fileName,
      content: rendered.content,
      acceptsOnComplete: rendered.acceptsOnComplete === true,
      acceptsInput: rendered.acceptsInput === true,
    };
  };
}

/** A graph that places the block once per variant, for the compile gate. */
export function verificationGraph(contract: BlockContract): ProjectGraph {
  const { manifest } = contract;
  const type = `${manifest.id}@${manifest.version}`;
  const blocks = manifest.variants.map((variant) => ({
    id: `check-${variant}`,
    type,
    variant,
    config: structuredClone(contract.sampleConfig.config),
  }));
  return {
    schemaVersion: '0',
    app: { name: 'Block check', slug: 'block-check', version: '1.0.0' },
    screens: blocks.map((block, index) => ({
      id: `page-${manifest.variants[index]}`,
      title: `Variant ${manifest.variants[index]}`,
      block: block.id,
      position: { x: 80 + index * 320, y: 120 },
    })),
    blocks,
  };
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

export class BlockAuthor {
  readonly usageLog: TokenUsage[] = [];

  constructor(
    private provider: LlmProvider,
    private readonly options: BlockAuthorOptions,
  ) {}

  setProvider(provider: LlmProvider) {
    this.provider = provider;
  }

  /** Run one model step with retry-with-feedback until `accept` returns no errors. */
  private async attempt<T>(
    system: string,
    user: string,
    maxTokens: number,
    accept: (data: Record<string, unknown>) => Promise<{ value?: T; errors: string[] }>,
  ): Promise<{ value?: T; errors: string[]; usage: TokenUsage[]; attempts: number }> {
    const provider = this.provider;
    const maxAttempts = this.options.maxAttempts ?? 3;
    const usage: TokenUsage[] = [];
    let errors: string[] = [];
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const prompt =
        attempt === 1
          ? user
          : `${user}\n\nYour previous output was REJECTED:\n${errors.map((e) => `- ${e}`).join('\n')}\nFix every issue and output the complete JSON again.`;
      let response;
      try {
        response = await provider.complete({ system, user: prompt, maxTokens });
      } catch (error) {
        this.usageLog.push(...usage);
        return { errors: [`LLM call failed: ${message(error)}`], usage, attempts: attempt };
      }
      usage.push({
        provider: provider.name,
        model: provider.model,
        inputTokens: response.usage.inputTokens,
        outputTokens: response.usage.outputTokens,
        at: Date.now(),
      });
      const parsed = parseObject(response.text);
      if (!parsed.data) {
        errors = [`unparseable output: ${parsed.error}`];
        continue;
      }
      const result = await accept(parsed.data);
      if (!result.errors.length) {
        this.usageLog.push(...usage);
        return { value: result.value, errors: [], usage, attempts: attempt };
      }
      errors = result.errors;
    }
    this.usageLog.push(...usage);
    return {
      errors: [`rejected after ${maxAttempts} attempts:`, ...errors.map((e) => `  ${e}`)],
      usage,
      attempts: maxAttempts,
    };
  }

  /** Step 1: draft a contract for review. Writes nothing. */
  async draftContract(missing: MissingCapability): Promise<ContractResult> {
    const { registry } = this.options;
    const proposed = missing.proposedBlock?.trim();
    const user = [
      proposed ? `Draft the contract for ${proposed}` : 'Draft the contract for a new block',
      `Capability: ${missing.capability.trim()}`,
      missing.reason ? `Why the library lacks it: ${missing.reason.trim()}` : '',
      '',
      'Starter manifest (from sdk scaffold):',
      scaffoldManifest(proposed || 'utility.example', 'utility'),
      '',
      'Existing library (reuse its event names; do not duplicate these blocks):',
      registry
        .entries()
        .map((entry) => generateCard(entry.manifest).markdown)
        .join('\n\n'),
    ]
      .filter((line) => line !== '')
      .join('\n');
    const result = await this.attempt<BlockContract>(
      CONTRACT_SYSTEM,
      user,
      this.options.maxTokens?.contract ?? 1500,
      async (data) => {
        const contract = {
          manifest: data['manifest'],
          sampleConfig: data['sampleConfig'],
          summary: data['summary'],
        } as BlockContract;
        const errors = checkContract(contract, registry);
        return errors.length ? { errors } : { value: contract, errors };
      },
    );
    if (!result.value)
      return { ok: false, errors: result.errors, usage: result.usage, attempts: result.attempts };
    const card = generateCard(result.value.manifest, result.value.summary);
    return {
      ok: true,
      contract: result.value,
      card: { markdown: card.markdown, estimatedTokens: card.estimatedTokens },
      usage: result.usage,
      attempts: result.attempts,
    };
  }

  /** Run every gate on a template; `render` is set when it loaded. */
  verify(
    contract: BlockContract,
    source: string,
  ): { checks: AuthorCheck[]; render?: BlockTemplate } {
    const { registry, verify, renderTimeoutMs } = this.options;
    const contractErrors = checkContract(contract, registry);
    const checks: AuthorCheck[] = [
      { name: 'manifest', ok: !contractErrors.length, issues: contractErrors },
    ];
    let render: BlockTemplate | undefined;
    try {
      render = loadTemplate(source, renderTimeoutMs);
    } catch (error) {
      checks.push({ name: 'sdk test', ok: false, issues: [`template: ${message(error)}`] });
      return { checks };
    }
    const issues = (result: { issues: { path: string; message: string }[] }) =>
      result.issues.map((issue) => `${issue.path}: ${issue.message}`);
    const tested = testBlock(contract.manifest, render, contract.sampleConfig);
    checks.push({ name: 'sdk test', ok: tested.ok, issues: issues(tested) });
    if (!tested.ok) return { checks };
    const validated = validateBlock(contract.manifest, render, contract.sampleConfig);
    checks.push({ name: 'sdk validate', ok: validated.ok, issues: issues(validated) });
    if (!validated.ok || contractErrors.length) return { checks };
    try {
      const candidate = registry.clone();
      candidate.registerExperimental(contract.manifest, render, {
        summary: contract.summary,
        sampleConfig: contract.sampleConfig,
      });
      verify?.(verificationGraph(contract), candidate);
      checks.push({ name: 'compile', ok: true, issues: [] });
    } catch (error) {
      checks.push({ name: 'compile', ok: false, issues: [message(error)] });
    }
    return { checks, render };
  }

  /**
   * Steps 2-4 for an approved contract: scaffold, fill the template, verify,
   * then register as experimental. Files stay on disk for review either way.
   */
  async implement(contract: BlockContract): Promise<ImplementResult> {
    const { registry, root } = this.options;
    const contractErrors = checkContract(contract, registry);
    if (contractErrors.length) return { ok: false, errors: contractErrors, usage: [], attempts: 0 };
    const { manifest } = contract;
    const files = writeScaffoldedBlock(manifest.id, manifest.category, root);
    const dir = join(root, manifest.id);
    writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    writeFileSync(
      join(dir, 'sample-config.json'),
      JSON.stringify(contract.sampleConfig, null, 2) + '\n',
    );
    const scaffold = readFileSync(join(dir, 'template.ts'), 'utf8');
    const user = [
      `Implement the template for ${manifest.id}`,
      `Purpose: ${contract.summary}`,
      '',
      'Approved manifest:',
      JSON.stringify(manifest, null, 2),
      '',
      'Sample config (sdk test renders every variant with it):',
      JSON.stringify(contract.sampleConfig, null, 2),
      '',
      'Scaffolded template.ts (from sdk scaffold; it passes sdk test unmodified):',
      scaffold,
    ].join('\n');
    let checks: AuthorCheck[] = [];
    const result = await this.attempt<{ source: string; render: BlockTemplate }>(
      TEMPLATE_SYSTEM,
      user,
      this.options.maxTokens?.template ?? 4000,
      async (data) => {
        const source = data['template'];
        if (typeof source !== 'string' || !source.trim())
          return { errors: ['"template" must be the template.ts source as a string'] };
        const verified = this.verify(contract, source);
        checks = verified.checks;
        const errors = checks.flatMap((check) =>
          check.ok ? [] : check.issues.map((issue) => `${check.name}: ${issue}`),
        );
        return errors.length || !verified.render
          ? { errors: errors.length ? errors : ['template did not load'] }
          : { value: { source, render: verified.render }, errors };
      },
    );
    if (!result.value)
      return {
        ok: false,
        checks,
        files,
        errors: result.errors,
        usage: result.usage,
        attempts: result.attempts,
      };
    writeFileSync(join(dir, 'template.ts'), result.value.source);
    this.register(contract, result.value.render);
    return {
      ok: true,
      block: `${manifest.id}@${manifest.version}`,
      checks,
      files,
      usage: result.usage,
      attempts: result.attempts,
    };
  }

  private indexPath(): string {
    return join(this.options.root, 'experimental.json');
  }

  private readIndex(): ExperimentalIndex {
    try {
      return JSON.parse(readFileSync(this.indexPath(), 'utf8')) as ExperimentalIndex;
    } catch {
      return { blocks: [] };
    }
  }

  private register(contract: BlockContract, render: BlockTemplate): void {
    const { manifest, summary } = contract;
    this.options.registry.registerExperimental(manifest, render, {
      summary,
      sampleConfig: contract.sampleConfig,
    });
    const index = this.readIndex();
    index.blocks = [
      ...index.blocks.filter((block) => block.id !== manifest.id),
      { id: manifest.id, version: manifest.version, summary },
    ].sort((a, b) => (a.id < b.id ? -1 : 1));
    mkdirSync(this.options.root, { recursive: true });
    writeFileSync(this.indexPath(), JSON.stringify(index, null, 2) + '\n');
  }

  /** Experimental blocks registered by this author, for listing. */
  list(): ExperimentalIndex['blocks'] {
    return this.readIndex().blocks.filter((block) =>
      this.options.registry.has(`${block.id}@${block.version}`),
    );
  }

  /**
   * Re-register verified experimental blocks from disk (e.g. on Studio start).
   * Each one passes `sdk validate` again first; failures are returned, not thrown.
   */
  loadExperimental(): { loaded: string[]; errors: string[] } {
    const loaded: string[] = [];
    const errors: string[] = [];
    for (const entry of this.readIndex().blocks) {
      const key = `${entry.id}@${entry.version}`;
      const dir = join(this.options.root, entry.id);
      try {
        if (this.options.registry.has(key)) continue;
        if (!existsSync(join(dir, 'template.ts'))) throw new Error('template.ts is missing');
        const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
        const sampleConfig = JSON.parse(readFileSync(join(dir, 'sample-config.json'), 'utf8'));
        const render = loadTemplate(
          readFileSync(join(dir, 'template.ts'), 'utf8'),
          this.options.renderTimeoutMs,
        );
        const result = validateBlock(manifest, render, sampleConfig);
        if (!result.ok)
          throw new Error(result.issues.map((i) => `${i.path}: ${i.message}`).join('; '));
        this.options.registry.registerExperimental(manifest, render, {
          summary: entry.summary,
          sampleConfig,
        });
        loaded.push(key);
      } catch (error) {
        errors.push(`${key}: ${message(error)}`);
      }
    }
    return { loaded, errors };
  }
}
