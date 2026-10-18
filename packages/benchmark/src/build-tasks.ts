/**
 * Builder-agent benchmark (plan §16.5): plain-language app requests run
 * through AppBuilder with a real compile as the gate. Each build is scored on
 * success, whether the requested capabilities landed in the right blocks,
 * honest "missing" reporting, attempts and tokens. A final task replays an
 * approved build as a recipe and must cost zero tokens.
 *
 * Recorded mode replays fixed blueprints (CI, zero real tokens). Live mode
 * (env or ChatGPT provider, see cli.ts) measures real model quality and cost.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AppBuilder,
  RecordedProvider,
  type AgentProject,
  type AppBlueprint,
  type LlmProvider,
} from '@blockfw/agent';
import { loadDefaultRegistry } from '@blockfw/blocks';
import { compileProject, compileWebProject } from '@blockfw/compiler';
import type { TaskReport } from './types.js';

export interface BuildPrompt {
  id: string;
  request: string;
  /** Each group needs at least one of its block ids in the built app. */
  needs: string[][];
  minPages: number;
  /** The library cannot cover this request; the build must report it as missing. */
  expectsMissing?: boolean;
}

export const BUILD_PROMPTS: BuildPrompt[] = [
  {
    id: 'B01',
    request: 'A recipe app where people browse recipes and open one to read it',
    needs: [
      ['home.list', 'data.collection'],
      ['content.detail', 'data.editor'],
    ],
    minPages: 2,
  },
  {
    id: 'B02',
    request: 'A SaaS landing page with a metrics dashboard and a settings page',
    needs: [['content.hero'], ['stats.overview'], ['settings.list']],
    minPages: 3,
  },
  {
    id: 'B03',
    request: 'A habit tracker with onboarding questions, a subscription paywall and a profile',
    needs: [['onboarding.quiz'], ['paywall.basic'], ['profile.card']],
    minPages: 3,
  },
  {
    id: 'B04',
    request: 'A personal journal that saves entries on this device and lets me edit them',
    needs: [['data.collection'], ['data.editor']],
    minPages: 2,
  },
  {
    id: 'B05',
    request: 'A fitness app with email sign in, a workout list, workout details and weekly stats',
    needs: [['auth.email'], ['home.list'], ['content.detail'], ['stats.overview']],
    minPages: 3,
  },
  {
    id: 'B06',
    request: 'A language learning app with a placement quiz and progress stats',
    needs: [['onboarding.quiz'], ['stats.overview']],
    minPages: 2,
  },
  {
    id: 'B07',
    request: 'A company website with an about section, services and a contact call to action',
    needs: [['content.hero'], ['content.text'], ['action.button', 'content.hero']],
    minPages: 1,
  },
  {
    id: 'B08',
    request: 'A team chat app with live messages and video calls',
    needs: [],
    minPages: 1,
    expectsMissing: true,
  },
  {
    id: 'B09',
    request: 'A second-hand marketplace with listings, a cart and card checkout',
    needs: [['home.list', 'data.collection']],
    minPages: 2,
    expectsMissing: true,
  },
  {
    id: 'B10',
    request: 'A creator profile page with bio, stats and a list of published posts',
    needs: [['profile.card'], ['home.list', 'data.collection']],
    minPages: 1,
  },
];

/** Hand-written blueprints for CI; they exercise success, wiring and coverage reporting. */
const RECORDED: Record<string, unknown> = {
  B01: {
    app: { name: 'Recipe Box' },
    pages: [
      {
        id: 'recipes',
        title: 'Recipes',
        blocks: [
          { id: 'list', type: 'home.list@1.0.0', variant: 'grid', config: { title: 'Recipes' } },
        ],
      },
      {
        id: 'recipe',
        title: 'Recipe',
        navigation: false,
        blocks: [{ id: 'read', type: 'content.detail@1.0.0', config: { ctaText: 'Cook this' } }],
      },
    ],
    wires: [
      {
        from: { block: 'list', event: 'home.itemSelected' },
        to: { page: 'recipe', block: 'read' },
      },
      { from: { block: 'read', event: 'content.action' }, to: { page: 'recipes' } },
    ],
  },
  B02: {
    app: { name: 'Metricly' },
    pages: [
      {
        id: 'landing',
        title: 'Overview',
        blocks: [
          {
            id: 'hero',
            type: 'content.hero@1.0.0',
            config: { title: 'Know your numbers', ctaText: 'Open dashboard' },
          },
        ],
      },
      {
        id: 'dashboard',
        title: 'Dashboard',
        blocks: [{ id: 'kpis', type: 'stats.overview@1.0.0', variant: 'grid' }],
      },
      { id: 'settings', title: 'Settings', blocks: [{ id: 'prefs', type: 'settings.list@1.0.0' }] },
    ],
    wires: [{ from: { block: 'hero', event: 'action.pressed' }, to: { page: 'dashboard' } }],
  },
  B08: {
    app: { name: 'Huddle' },
    pages: [
      {
        id: 'welcome',
        title: 'Welcome',
        blocks: [{ id: 'intro', type: 'content.text@1.0.0', config: { title: 'Huddle' } }],
      },
    ],
    missing: [
      { capability: 'Realtime messaging', proposedBlock: 'chat.thread' },
      { capability: 'Video calls', proposedBlock: 'call.video' },
    ],
  },
};

export function recordedBuildProvider(): RecordedProvider {
  return new RecordedProvider(
    Object.entries(RECORDED).map(([id, blueprint]) => ({
      matchUserIncludes: `Request: ${BUILD_PROMPTS.find((p) => p.id === id)!.request}`,
      response: JSON.stringify(blueprint),
      inputTokens: 3600,
      outputTokens: 400,
    })),
    'recorded-build-v1',
  );
}

const here = dirname(fileURLToPath(import.meta.url));
function emptyProject(): AgentProject {
  const graph = JSON.parse(readFileSync(join(here, 'base', 'graph.json'), 'utf8'));
  return { version: 1, profile: null, touched: [], graph };
}

export interface BuildReport extends TaskReport {
  pages: number;
  blocks: number;
  missing: number;
  attempts: number;
}

/**
 * Run each prompt through the builder. Recorded providers only run prompts
 * they have a response for; live providers run everything.
 */
export async function runBuildBenchmark(
  provider: LlmProvider,
  prompts: BuildPrompt[] = BUILD_PROMPTS,
): Promise<BuildReport[]> {
  const registry = loadDefaultRegistry();
  const verify = (graph: Parameters<typeof compileProject>[0]) => {
    compileWebProject(graph, registry);
    compileProject(graph, registry);
  };
  const builder = new AppBuilder(provider, undefined, { registry, verify });
  const selected =
    provider instanceof RecordedProvider && prompts === BUILD_PROMPTS
      ? prompts.filter((p) => p.id in RECORDED)
      : prompts;
  const reports: BuildReport[] = [];
  let approved: { key: string; prompt: BuildPrompt; blueprint: AppBlueprint } | undefined;

  for (const prompt of selected) {
    const started = Date.now();
    const result = await builder.build(emptyProject(), prompt.request);
    const tokensIn = (result.usage ?? []).reduce((a, u) => a + u.inputTokens, 0);
    const tokensOut = (result.usage ?? []).reduce((a, u) => a + u.outputTokens, 0);
    const types = new Set(result.graph?.blocks.map((b) => b.type.split('@')[0]) ?? []);
    const notes: string[] = [];
    if (!result.ok) notes.push(...(result.errors ?? ['build failed']));
    const pages = result.graph?.screens.length ?? 0;
    if (result.ok && pages < prompt.minPages)
      notes.push(`expected at least ${prompt.minPages} pages, got ${pages}`);
    for (const group of prompt.needs)
      if (result.ok && !group.some((id) => types.has(id)))
        notes.push(`expected one of ${group.join(' | ')}`);
    const missing = result.missing?.length ?? 0;
    if (result.ok && prompt.expectsMissing && missing === 0)
      notes.push('expected the unsupported capability to be reported as missing');
    const pass = notes.length === 0;
    notes.push(
      `${pages} pages, ${types.size} block types, ${missing} missing, attempts=${result.attempts ?? 0}`,
    );
    if (pass && result.recipeKey && result.blueprint && !approved)
      approved = { key: result.recipeKey, prompt, blueprint: result.blueprint };
    reports.push({
      id: prompt.id,
      title: prompt.request,
      category: 'build',
      pass,
      wallMs: Date.now() - started,
      tokensIn,
      tokensOut,
      notes,
      pages,
      blocks: result.graph?.blocks.length ?? 0,
      missing,
      attempts: result.attempts ?? 0,
    });
  }

  if (approved) {
    const started = Date.now();
    builder.remember(approved.key, approved.prompt.request, 'new', approved.blueprint);
    builder.setProvider({
      name: 'unavailable',
      model: 'none',
      complete: () => Promise.reject(new Error('a recipe replay must not call the model')),
    });
    const replay = await builder.build(emptyProject(), approved.prompt.request);
    const tokens = (replay.usage ?? []).reduce((a, u) => a + u.inputTokens + u.outputTokens, 0);
    reports.push({
      id: 'B-recipe',
      title: `Replay "${approved.prompt.request}" as an approved recipe`,
      category: 'recipe',
      pass: replay.ok && replay.source === 'recipe' && tokens === 0,
      wallMs: Date.now() - started,
      tokensIn: 0,
      tokensOut: 0,
      notes: [`source=${replay.source ?? 'none'}`, ...(replay.errors ?? [])],
      pages: replay.graph?.screens.length ?? 0,
      blocks: replay.graph?.blocks.length ?? 0,
      missing: 0,
      attempts: 0,
    });
  }
  return reports;
}

export function summarizeBuilds(reports: BuildReport[]) {
  const builds = reports.filter((r) => r.category === 'build');
  const passed = builds.filter((r) => r.pass);
  const tokens = builds.reduce((a, r) => a + r.tokensIn + r.tokensOut, 0);
  const pages = passed.reduce((a, r) => a + r.pages, 0);
  const tokensPerPage = pages ? Math.round(tokens / pages) : 0;
  return {
    builds: builds.length,
    passed: passed.length,
    successRate: builds.length ? passed.length / builds.length : 0,
    totalTokens: tokens,
    tokensPerPage,
    // Plan §16.5 target: under 20k tokens for a 10-page app.
    withinBudget: tokensPerPage <= 2000,
    meanAttempts: builds.length ? builds.reduce((a, r) => a + r.attempts, 0) / builds.length : 0,
    recipeReplayFree: reports.some((r) => r.id === 'B-recipe' && r.pass),
  };
}
