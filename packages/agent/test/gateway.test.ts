/**
 * Gateway tests with the recorded (deterministic, zero-token) provider:
 * plan → review → apply → undo, retry on rejection, token logging.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AgentGateway } from '../src/gateway.js';
import { RecordedProvider } from '../src/providers.js';
import type { AgentProject } from '../src/types.js';

const here = dirname(fileURLToPath(import.meta.url));
const graph = JSON.parse(
  readFileSync(join(here, '..', '..', '..', 'examples', 'full-app', 'graph.json'), 'utf8'),
);

function project(): AgentProject {
  return {
    version: 1,
    profile: null,
    touched: [],
    graph: JSON.parse(JSON.stringify(graph)),
  };
}

const PLAYFUL = JSON.stringify({
  ops: [
    { path: 'block:b1.config.headline', value: "Let's do this! 🎉" },
    { path: 'block:b1.config.ctaText', value: 'Jump in!' },
  ],
  rationale: 'Playful tone: energetic headline and CTA.',
});

describe('AgentGateway', () => {
  it('applies a common element design across every block in the app', async () => {
    const p = project();
    const ops = p.graph.blocks.map((b) => ({
      path: 'block:' + b.id + '.design.elements.button',
      value: { borderRadius: 12, backgroundColor: '#345E4F' },
    }));
    const gw = new AgentGateway(
      new RecordedProvider([
        {
          matchUserIncludes: 'common',
          response: JSON.stringify({ ops, rationale: 'Common button design.' }),
        },
      ]),
    );
    const result = await gw.plan(p, 'apply a common button design');
    expect(result.plan?.ops).toHaveLength(p.graph.blocks.length);
    const next = gw.apply(p, result.plan!).project;
    expect(next.graph.blocks.every((b) => b.design?.elements?.button?.borderRadius === 12)).toBe(
      true,
    );
    expect(next.graph.blocks.map((b) => b.config)).toEqual(p.graph.blocks.map((b) => b.config));
  });
  it('customizes selected elements and variants, supports reviewed overwrite, and restores the original on undo', async () => {
    const p = project();
    p.touched = ['block:b1.design.elements.button'];
    p.graph.blocks.find((b) => b.id === 'b1')!.design = { elements: { button: { x: 5 } } };
    const gw = new AgentGateway(
      new RecordedProvider([
        {
          matchUserIncludes: 'design',
          response: JSON.stringify({
            ops: [
              {
                path: 'block:b1.design.elements.button',
                value: { x: 40, width: 180, backgroundColor: '#123456' },
              },
              { path: 'block:b1.variant', value: 'signup' },
              { path: 'block:b3.config.ctaText', value: 'Outside scope' },
            ],
            rationale: 'Move the button and use sign-up.',
          }),
        },
      ]),
    );
    const scope = { focusInstanceIds: ['b1'], allowTouched: true };
    const result = await gw.plan(p, 'design selected block', scope);
    expect(result.ok).toBe(true);
    expect(result.plan?.ops).toHaveLength(2);
    expect(result.warnings?.join(' ')).toContain('outside the selected blocks');
    const next = gw.apply(p, result.plan!, scope).project;
    expect(next.graph.blocks.find((b) => b.id === 'b1')?.design?.elements?.button?.x).toBe(40);
    expect(next.graph.blocks.find((b) => b.id === 'b1')?.variant).toBe('signup');
    expect(gw.undo()).toEqual(p);
    expect(() => gw.apply(p, result.plan!, { focusInstanceIds: ['b1'] })).toThrow('hand-edited');
  });
  it('rejects invalid design styles without modifying the graph', () => {
    const p = project();
    const gw = new AgentGateway(new RecordedProvider([]));
    expect(() =>
      gw.apply(p, {
        ops: [
          { path: 'block:b1.design.elements.button', value: { x: 'far', backgroundColor: 'red' } },
        ],
        rationale: '',
      }),
    ).toThrow('invalid element design');
    expect(p.graph.blocks.find((b) => b.id === 'b1')?.design).toBeUndefined();
  });
  it('accepts an empty plan as a successful no-op without retries', async () => {
    const gw = new AgentGateway(
      new RecordedProvider([
        {
          matchUserIncludes: 'nothing',
          response: JSON.stringify({ ops: [], rationale: 'Already correct.' }),
        },
      ]),
    );
    const result = await gw.plan(project(), 'change nothing');
    expect(result.ok).toBe(true);
    expect(result.attempts).toBe(1);
    expect(result.diff).toEqual([]);
  });
  it('protects edited nested fields from whole-array agent replacements', async () => {
    const p = project();
    p.touched = ['block:b8.config.sections.0.rows.0.value'];
    const gw = new AgentGateway(
      new RecordedProvider([
        {
          matchUserIncludes: 'price',
          response: JSON.stringify({
            ops: [
              {
                path: 'block:b8.config.sections',
                value: [
                  {
                    title: 'Preferences',
                    rows: [
                      { id: 'push', label: 'Push notifications', kind: 'toggle', value: false },
                    ],
                  },
                ],
              },
            ],
            rationale: 'Price edit.',
          }),
        },
      ]),
      { maxAttempts: 1 },
    );
    const result = await gw.plan(p, 'change price');
    expect(result.ok).toBe(false);
    expect(result.errors?.join(' ')).toContain('hand-edited');
  });
  it('plans a scoped edit and returns a reviewable diff without applying', async () => {
    const gw = new AgentGateway(
      new RecordedProvider([{ matchUserIncludes: 'make it playful', response: PLAYFUL }]),
    );
    const p = project();
    const before = p.graph.blocks.find((b) => b.id === 'b1')!.config!.headline;

    const res = await gw.plan(p, 'make it playful');
    expect(res.ok).toBe(true);
    expect(res.plan!.ops).toHaveLength(2);
    expect(res.diff).toHaveLength(2);
    expect(res.diff![0]!.before).toBe(before);
    expect(res.diff![0]!.after).toBe("Let's do this! 🎉");
    // Planning must not mutate the project.
    expect(p.graph.blocks.find((b) => b.id === 'b1')!.config!.headline).toBe(before);
    expect(res.attempts).toBe(1);
  });

  it('apply() validates, applies, marks touched, and supports undo', async () => {
    const gw = new AgentGateway(
      new RecordedProvider([{ matchUserIncludes: 'make it playful', response: PLAYFUL }]),
    );
    const p = project();
    const res = await gw.plan(p, 'make it playful');
    expect(res.ok).toBe(true);

    const { project: next, applied } = gw.apply(p, res.plan!);
    expect(applied).toHaveLength(2);
    expect(next.graph.blocks.find((b) => b.id === 'b1')!.config!.headline).toBe(
      "Let's do this! 🎉",
    );
    // Agent edits become touched so the cascade won't overwrite them.
    expect(next.touched).toContain('block:b1.config.headline');
    expect(next.touched).toContain('block:b1.config.ctaText');
    // Original untouched.
    expect(p.touched).toHaveLength(0);

    const undone = gw.undo();
    expect(undone).not.toBeNull();
    expect(undone!.graph.blocks.find((b) => b.id === 'b1')!.config!.headline).toBe(
      p.graph.blocks.find((b) => b.id === 'b1')!.config!.headline,
    );
    expect(gw.undo()).toBeNull();
  });

  it('apply() refuses a plan that became invalid (touched since planning)', async () => {
    const gw = new AgentGateway(
      new RecordedProvider([{ matchUserIncludes: 'make it playful', response: PLAYFUL }]),
    );
    const p = project();
    const res = await gw.plan(p, 'make it playful');
    expect(res.ok).toBe(true);
    // User hand-edits between plan and apply.
    p.touched.push('block:b1.config.headline');
    expect(() => gw.apply(p, res.plan!)).toThrow(/hand-edited/);
  });

  it('retries with feedback when the model first outputs an invalid op', async () => {
    const bad = JSON.stringify({
      ops: [{ path: 'block:b1.config.ports', value: {} }],
      rationale: 'trying locked field',
    });
    const gw = new AgentGateway(
      new RecordedProvider([
        { matchUserIncludes: 'REJECTED', response: PLAYFUL },
        { matchUserIncludes: 'make it playful', response: bad },
      ]),
      { maxAttempts: 3 },
    );
    const res = await gw.plan(project(), 'make it playful');
    expect(res.ok).toBe(true);
    expect(res.attempts).toBe(2);
    expect(res.plan!.ops).toHaveLength(2);
  });

  it('gives up after maxAttempts and reports honest errors', async () => {
    const bad = JSON.stringify({
      ops: [{ path: 'block:b1.variant', value: 'x' }],
      rationale: 'always bad',
    });
    const gw = new AgentGateway(
      new RecordedProvider([{ matchUserIncludes: 'anything', response: bad }]),
      { maxAttempts: 2 },
    );
    const res = await gw.plan(project(), 'anything');
    expect(res.ok).toBe(false);
    expect(res.attempts).toBe(2);
    expect(res.errors!.join('\n')).toMatch(/rejected after 2 attempts/);
  });

  it('logs token usage for every call', async () => {
    const gw = new AgentGateway(
      new RecordedProvider([
        {
          matchUserIncludes: 'make it playful',
          response: PLAYFUL,
          inputTokens: 100,
          outputTokens: 50,
        },
      ]),
    );
    await gw.plan(project(), 'make it playful');
    expect(gw.usageLog).toHaveLength(1);
    expect(gw.usageLog[0]).toMatchObject({
      provider: 'recorded',
      inputTokens: 100,
      outputTokens: 50,
    });
    expect(gw.totalUsage).toMatchObject({ inputTokens: 100, outputTokens: 50, calls: 1 });
  });

  it('handles a provider that throws', async () => {
    const gw = new AgentGateway({
      name: 'broken',
      model: 'broken',
      complete: async () => {
        throw new Error('boom');
      },
    });
    const res = await gw.plan(project(), 'make it playful');
    expect(res.ok).toBe(false);
    expect(res.errors![0]).toMatch(/LLM call failed: boom/);
  });
});
