/**
 * Builder agent tests with the recorded provider: blueprint → contract
 * validation → graph + typed operations, retries, coverage report, recipe
 * replay at zero tokens, and gateway apply/undo of a whole build.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDefaultRegistry } from '@blockfw/blocks';
import { compileWebProject } from '@blockfw/compiler';
import { AppBuilder } from '../src/app-builder.js';
import { AgentGateway } from '../src/gateway.js';
import { RecordedProvider } from '../src/providers.js';
import { RecipeBook, normalizeRequest } from '../src/recipes.js';
import type { AgentProject } from '../src/types.js';

const here = dirname(fileURLToPath(import.meta.url));
const graph = JSON.parse(
  readFileSync(join(here, '..', '..', '..', 'examples', 'full-app', 'graph.json'), 'utf8'),
);
const project = (): AgentProject => ({
  version: 1,
  profile: null,
  touched: [],
  graph: structuredClone(graph),
});

const BLUEPRINT = {
  app: { name: 'Reading Club' },
  pages: [
    {
      id: 'welcome',
      title: 'Welcome',
      blocks: [
        {
          id: 'intro',
          type: 'content.hero@1.0.0',
          config: { title: 'Read together', ctaText: 'Browse books' },
        },
      ],
    },
    {
      id: 'books',
      title: 'Books',
      blocks: [
        { id: 'shelf', type: 'home.list', variant: 'grid', config: { title: 'This month' } },
      ],
    },
    {
      id: 'book',
      title: 'Book',
      navigation: false,
      blocks: [{ id: 'about', type: 'content.detail@1.0.0', config: { ctaText: 'Join chat' } }],
    },
  ],
  wires: [
    { from: { block: 'intro', event: 'action.pressed' }, to: { page: 'books' } },
    {
      from: { block: 'shelf', event: 'home.itemSelected' },
      to: { page: 'book', block: 'about' },
    },
  ],
  missing: [{ capability: 'Group chat', proposedBlock: 'chat.thread' }],
  rationale: 'Landing, catalog and detail from library blocks.',
};

const recorded = (...responses: string[]) => {
  let call = 0;
  const provider = new RecordedProvider([]);
  provider.complete = async () => ({
    text: responses[Math.min(call++, responses.length - 1)]!,
    usage: { inputTokens: 1000, outputTokens: 200 },
  });
  return provider;
};
const verify = (g: unknown) => void compileWebProject(g as never, loadDefaultRegistry());

describe('AppBuilder', () => {
  it('builds a new app from library blocks with sample content filled in', async () => {
    const builder = new AppBuilder(recorded(JSON.stringify(BLUEPRINT)), new RecipeBook(), {
      verify,
    });
    const result = await builder.build(project(), 'A reading club app');
    expect(result.ok, result.errors?.join('\n')).toBe(true);
    expect(result.source).toBe('model');
    expect(result.graph!.app).toMatchObject({ name: 'Reading Club', slug: 'reading-club' });
    expect(result.graph!.screens.map((s) => s.id)).toEqual(['welcome', 'books', 'book']);
    const shelf = result.graph!.blocks.find((b) => b.id === 'shelf')!;
    expect(shelf.type).toBe('home.list@1.0.0');
    expect(shelf.config?.title).toBe('This month');
    expect(Object.keys(shelf.config!).length).toBeGreaterThan(1);
    expect(result.missing).toEqual([{ capability: 'Group chat', proposedBlock: 'chat.thread' }]);
    expect(result.coverage).toEqual({ blocks: 3, pages: 3 });
    expect(result.operations!.length).toBeGreaterThan(0);
  });

  it('feeds contract violations back to the model and accepts the fix', async () => {
    const invalid = structuredClone(BLUEPRINT);
    invalid.pages[0]!.blocks[0]!.type = 'chat.thread@1.0.0';
    (invalid.pages[1]!.blocks[0]!.config as Record<string, unknown>).secret = 1;
    const provider = recorded(JSON.stringify(invalid), JSON.stringify(BLUEPRINT));
    const prompts: string[] = [];
    const complete = provider.complete.bind(provider);
    provider.complete = async (req) => (prompts.push(req.user), complete(req));
    const result = await new AppBuilder(provider).build(project(), 'A reading club app');
    expect(result.ok).toBe(true);
    expect(result.attempts).toBe(2);
    expect(prompts[1]).toContain('unknown block type "chat.thread@1.0.0"');
    expect(prompts[1]).toContain('"config.secret" is not editable');
  });

  it('rejects wires to blocks that do not consume the event', async () => {
    const bad = structuredClone(BLUEPRINT);
    bad.wires[1]!.to = { page: 'welcome', block: 'intro' };
    const result = await new AppBuilder(recorded(JSON.stringify(bad)), new RecipeBook(), {
      maxAttempts: 1,
    }).build(project(), 'x');
    expect(result.ok).toBe(false);
    expect(result.errors!.join('\n')).toContain('does not consume home.itemSelected');
  });

  it('replays an approved build as a zero-token recipe', async () => {
    const provider = recorded(JSON.stringify(BLUEPRINT));
    const builder = new AppBuilder(provider);
    const first = await builder.build(project(), 'A reading club app');
    builder.remember(first.recipeKey!, 'A reading club app', 'new', first.blueprint!);
    provider.complete = async () => {
      throw new Error('model must not be called for a recipe');
    };
    const again = await builder.build(project(), '  a READING club app. ');
    expect(again.source).toBe('recipe');
    expect(again.usage).toEqual([]);
    expect(again.graph).toEqual(first.graph);
    expect(normalizeRequest('  a READING club app. ')).toBe('a reading club app');
    expect(new RecipeBook(builder.recipes.toJSON()).get(first.recipeKey!)?.uses).toBe(1);
  });

  it('extends the current app and undoes the whole build in one step', async () => {
    const p = project();
    const extension = {
      pages: [
        {
          id: 'club',
          title: 'Club',
          blocks: [
            { id: 'clubintro', type: 'content.text@1.0.0', config: { title: 'Weekly club' } },
          ],
        },
      ],
    };
    const builder = new AppBuilder(recorded(JSON.stringify(extension)));
    const result = await builder.build(p, 'Add a club page', 'extend');
    expect(result.ok, result.errors?.join('\n')).toBe(true);
    expect(result.graph!.screens.length).toBe(p.graph.screens.length + 1);
    expect(result.graph!.app).toEqual(p.graph.app);

    const gateway = new AgentGateway(recorded('{}'));
    const next = gateway.applyOperations(p, result.operations!);
    expect(next.graph).toEqual(result.graph);
    expect(gateway.undo()!.graph).toEqual(p.graph);

    const clash = await new AppBuilder(recorded(JSON.stringify(extension)), new RecipeBook(), {
      maxAttempts: 1,
    }).build(next, 'Add a club page', 'extend');
    expect(clash.errors!.join('\n')).toContain('id already exists');
  });
});
