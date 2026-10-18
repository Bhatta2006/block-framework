/**
 * Block-author agent tests with recorded responses: contract drafting with
 * retry-with-feedback, scaffold + template fill + SDK/compile gates,
 * experimental registration, reload from disk, and the builder using the new
 * block on its next build.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDefaultRegistry, type BlockRegistry } from '@blockfw/blocks';
import { compileProject, compileWebProject, exportZip } from '@blockfw/compiler';
import type { ProjectGraph } from '@blockfw/manifest';
import { AppBuilder } from '../src/app-builder.js';
import { AgentGateway } from '../src/gateway.js';
import {
  BlockAuthor,
  checkContract,
  loadTemplate,
  verificationGraph,
  type BlockContract,
} from '../src/block-author.js';
import { RecordedProvider } from '../src/providers.js';
import type { AgentProject } from '../src/types.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = join(here, 'fixtures', 'chat.thread');
const CONTRACT = JSON.parse(readFileSync(join(fixture, 'contract.json'), 'utf8')) as BlockContract;
const TEMPLATE = readFileSync(join(fixture, 'template.ts'), 'utf8');
const MISSING = {
  capability: 'Live discussion chat',
  proposedBlock: 'chat.thread',
  reason: 'No chat block exists in the library yet.',
};

/** Recorded provider that replays responses in order and keeps the prompts. */
const recorded = (...responses: string[]) => {
  const prompts: string[] = [];
  const provider = new RecordedProvider([]);
  provider.complete = async (req) => {
    prompts.push(req.user);
    return {
      text: responses[Math.min(prompts.length - 1, responses.length - 1)]!,
      usage: { inputTokens: 900, outputTokens: 300 },
    };
  };
  return { provider, prompts };
};
const compileBoth = (graph: ProjectGraph, registry: BlockRegistry) => {
  compileWebProject(graph, registry);
  compileProject(graph, registry);
};
const author = (provider: RecordedProvider, registry = loadDefaultRegistry()) => {
  const root = mkdtempSync(join(tmpdir(), 'blockfw-author-'));
  return {
    root,
    registry,
    author: new BlockAuthor(provider, { root, registry, verify: compileBoth }),
  };
};

describe('BlockAuthor contract step', () => {
  it('drafts a reviewable contract and feeds rejections back to the model', async () => {
    const invalid = structuredClone(CONTRACT);
    invalid.manifest.id = 'content.text';
    invalid.manifest.editSurface.push('config.missing');
    invalid.manifest.locked = [];
    const { provider, prompts } = recorded(JSON.stringify(invalid), JSON.stringify(CONTRACT));
    const { author: blockAuthor, root } = author(provider);

    const result = await blockAuthor.draftContract(MISSING);

    expect(result.ok).toBe(true);
    expect(result.attempts).toBe(2);
    expect(result.contract?.manifest.id).toBe('chat.thread');
    expect(result.card?.markdown).toContain('# chat.thread@1.0.0');
    expect(result.card?.markdown).toContain('Message thread with author bubbles');
    expect(prompts[0]).toContain('Draft the contract for chat.thread');
    expect(prompts[0]).toContain('Capability: Live discussion chat');
    expect(prompts[0]).toContain('# content.hero@1.0.0');
    expect(prompts[1]).toContain('REJECTED');
    expect(prompts[1]).toContain('"content.text" already exists');
    expect(prompts[1]).toContain('"config.missing" is not a config property');
    expect(prompts[1]).toContain('locked: must include "ports"');
    // Review comes first: nothing is written before approval.
    expect(existsSync(join(root, 'chat.thread'))).toBe(false);
    expect(blockAuthor.usageLog).toHaveLength(2);
  });

  it('rejects contracts whose sample config breaks the schema', () => {
    const contract = structuredClone(CONTRACT);
    contract.sampleConfig = { variant: 'loud', config: { messages: [{ author: '' }] } };
    const errors = checkContract(contract, loadDefaultRegistry());
    expect(errors.join('\n')).toContain('sampleConfig.variant: "loud" is not in variants');
    expect(errors.some((e) => e.startsWith('sampleConfig.config'))).toBe(true);
    expect(checkContract(CONTRACT, loadDefaultRegistry())).toEqual([]);
  });

  it('reports failure after maxAttempts without approving anything', async () => {
    const { provider } = recorded('not json');
    const { author: blockAuthor } = author(provider);
    const result = await blockAuthor.draftContract(MISSING);
    expect(result.ok).toBe(false);
    expect(result.attempts).toBe(3);
    expect(result.errors?.join('\n')).toContain('unparseable output');
  });
});

describe('BlockAuthor implement step', () => {
  it('scaffolds, fills and verifies the template, then registers it as experimental', async () => {
    const identical = TEMPLATE.replace(
      "const compact = variant === 'compact';",
      'const compact = false;',
    );
    const { provider, prompts } = recorded(
      JSON.stringify({ template: identical }),
      JSON.stringify({ template: TEMPLATE }),
    );
    const { author: blockAuthor, registry, root } = author(provider);

    const result = await blockAuthor.implement(CONTRACT);

    expect(result.ok, result.errors?.join('\n')).toBe(true);
    expect(result.attempts).toBe(2);
    expect(result.block).toBe('chat.thread@1.0.0');
    expect(result.checks?.map((c) => [c.name, c.ok])).toEqual([
      ['manifest', true],
      ['sdk test', true],
      ['sdk validate', true],
      ['compile', true],
    ]);
    // The model starts from the sdk scaffold and sees why it was rejected.
    expect(prompts[0]).toContain('Implement the template for chat.thread');
    expect(prompts[0]).toContain('Scaffolded block. Edit freely');
    expect(prompts[1]).toContain('renders byte-identically to variant "bubbles"');
    // Files are on disk for review; the block is in the live registry.
    expect(readFileSync(join(root, 'chat.thread', 'template.ts'), 'utf8')).toBe(TEMPLATE);
    expect(JSON.parse(readFileSync(join(root, 'chat.thread', 'manifest.json'), 'utf8'))).toEqual(
      CONTRACT.manifest,
    );
    expect(registry.get('chat.thread@1.0.0').experimental?.summary).toBe(CONTRACT.summary);
    expect(blockAuthor.list()).toEqual([
      { id: 'chat.thread', version: '1.0.0', summary: CONTRACT.summary },
    ]);
    // The same id cannot be authored twice.
    expect((await blockAuthor.implement(CONTRACT)).errors?.[0]).toContain('already exists');
  });

  it('keeps the block unregistered when the gates keep failing', async () => {
    const { provider } = recorded(JSON.stringify({ template: 'export const x = 1;' }));
    const { author: blockAuthor, registry } = author(provider);
    const result = await blockAuthor.implement(CONTRACT);
    expect(result.ok).toBe(false);
    expect(result.checks?.find((c) => c.name === 'sdk test')?.issues[0]).toContain(
      'export function render',
    );
    expect(registry.has('chat.thread@1.0.0')).toBe(false);
  });

  it('reloads verified experimental blocks from disk', async () => {
    const { provider } = recorded(JSON.stringify({ template: TEMPLATE }));
    const { author: first, root } = author(provider);
    expect((await first.implement(CONTRACT)).ok).toBe(true);

    const registry = loadDefaultRegistry();
    const second = new BlockAuthor(provider, { root, registry });
    expect(second.loadExperimental()).toEqual({ loaded: ['chat.thread@1.0.0'], errors: [] });
    expect(registry.get('chat.thread@1.0.0').experimental?.sampleConfig).toEqual(
      CONTRACT.sampleConfig,
    );
  });
});

describe('recorded Studio demo', () => {
  it('drafts and implements the chat.thread block the demo build reports as missing', async () => {
    const demo = RecordedProvider.fromJson(
      readFileSync(join(here, '..', 'recorded', 'demo.json'), 'utf8'),
    );
    const { author: blockAuthor, registry } = author(demo);
    const drafted = await blockAuthor.draftContract(MISSING);
    expect(drafted.contract).toEqual(CONTRACT);
    const implemented = await blockAuthor.implement(drafted.contract!);
    expect(implemented.ok, implemented.errors?.join('\n')).toBe(true);
    expect(registry.has('chat.thread@1.0.0')).toBe(true);
  });
});

describe('generated template isolation', () => {
  const wrap = (body: string) =>
    `export function render(ctx: { instanceId: string }) {\n${body}\n}`;

  it('gives templates no Node globals or string code generation', () => {
    expect(() => loadTemplate(wrap('return process.env;'))({} as never)).toThrow(
      /process is not defined/,
    );
    expect(() => loadTemplate(wrap('return require("node:fs");'))({} as never)).toThrow(
      /require is not defined/,
    );
    expect(() => loadTemplate(wrap("return (0, eval)('1');"))({} as never)).toThrow(
      /Code generation from strings disallowed/,
    );
  });

  it('times out runaway templates and rejects import statements', () => {
    expect(() => loadTemplate(wrap('while (true) {}'), 50)({} as never)).toThrow(/timed out/);
    expect(() =>
      loadTemplate("import { readFileSync } from 'node:fs';\n" + wrap('return null;')),
    ).toThrow();
  });
});

describe('builder after authoring', () => {
  it('reads the experimental block card on the next build and can place the block', async () => {
    const { provider } = recorded(JSON.stringify({ template: TEMPLATE }));
    const { author: blockAuthor, registry } = author(provider);
    expect((await blockAuthor.implement(CONTRACT)).ok).toBe(true);

    const blueprint = {
      app: { name: 'Book Club' },
      pages: [
        {
          id: 'talk',
          title: 'Discussion',
          blocks: [{ id: 'thread', type: 'chat.thread', config: { title: 'This week' } }],
        },
      ],
    };
    const build = recorded(JSON.stringify(blueprint));
    const builder = new AppBuilder(build.provider, undefined, {
      registry,
      verify: (graph) => compileBoth(graph, registry),
    });
    const project: AgentProject = {
      version: 1,
      profile: null,
      touched: [],
      graph: verificationGraph(CONTRACT),
    };
    const result = await builder.build(project, 'A book club with a discussion page');

    expect(build.prompts[0]).toContain('# chat.thread@1.0.0');
    expect(build.prompts[0]).toContain('Experimental (agent-authored): Message thread');
    expect(result.ok, result.errors?.join('\n')).toBe(true);
    const thread = result.graph?.blocks.find((block) => block.id === 'thread');
    expect(thread?.type).toBe('chat.thread@1.0.0');
    // Sample content comes from the experimental block, not the library source tree.
    expect(thread?.config?.['messages']).toEqual(CONTRACT.sampleConfig.config['messages']);
    expect(thread?.config?.['title']).toBe('This week');
  });
});

describe('authored blocks outside the builder', () => {
  it('are editable by the scoped edit agent and export with the registry that has them', async () => {
    const { provider } = recorded(JSON.stringify({ template: TEMPLATE }));
    const { author: blockAuthor, registry, root } = author(provider);
    expect((await blockAuthor.implement(CONTRACT)).ok).toBe(true);
    const project: AgentProject = {
      version: 1,
      profile: null,
      touched: [],
      graph: verificationGraph(CONTRACT),
    };
    const plan = JSON.stringify({
      ops: [{ path: 'block:check-bubbles.config.title', value: 'Weekly discussion' }],
      rationale: 'Rename the thread.',
    });

    const edited = await new AgentGateway(recorded(plan).provider, { registry }).plan(
      project,
      'Rename the thread',
    );
    expect(edited.ok, edited.errors?.join('\n')).toBe(true);
    expect(edited.diff?.[0]?.after).toBe('Weekly discussion');
    // The library-only registry does not know the block.
    await expect(new AgentGateway(recorded(plan).provider).plan(project, 'Rename')).rejects.toThrow(
      /Unknown block type: chat.thread@1.0.0/,
    );

    const exported = await exportZip(project.graph, join(root, 'app.zip'), 'mobile', registry);
    expect(exported.audit.ok).toBe(true);
    await expect(exportZip(project.graph, join(root, 'lib.zip'), 'mobile')).rejects.toThrow(
      /Unknown block type: chat.thread@1.0.0/,
    );
  });
});
