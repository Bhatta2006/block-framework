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
