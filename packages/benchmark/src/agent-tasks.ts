/**
 * M3 agent benchmark tasks (T37+).
 *
 * These run the real AgentGateway against the recorded (deterministic,
 * zero-real-token) provider and assert the safety properties: scoping,
 * validation, retry, apply/undo, and token logging. They use the same
 * TaskReport shape as the mechanical benchmark so results are comparable.
 *
 * Live-model variants (T4x) are only run when BLOCKFW_LLM_* env vars point
 * at a real endpoint; otherwise they are skipped with an honest note.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AgentGateway, RecordedProvider, providerFromEnv, type AgentProject } from '@blockfw/agent';
import type { TaskReport } from './types.js';

const here = dirname(fileURLToPath(import.meta.url));
const EXAMPLE = join(here, '..', '..', '..', 'examples', 'full-app', 'graph.json');

function baseProject(): AgentProject {
  return {
    version: 1,
    profile: null,
    touched: [],
    graph: JSON.parse(readFileSync(EXAMPLE, 'utf8')),
  };
}

function recordedGateway(pairs: Array<{ matchUserIncludes: string; response: string }>) {
  return new AgentGateway(new RecordedProvider(pairs));
}

const PLAYFUL = JSON.stringify({
  ops: [
    { path: 'block:b1.config.headline', value: "Let's do this!" },
    { path: 'block:b1.config.ctaText', value: 'Go!' },
  ],
  rationale: 'playful',
});

interface AgentTaskDef {
  id: string;
  title: string;
  run: () => Promise<{ pass: boolean; notes: string[]; tokensIn: number; tokensOut: number }>;
}

const TASKS: AgentTaskDef[] = [
  {
    id: 'T37',
    title: 'Agent plans a scoped "make it playful" edit',
    run: async () => {
      const gw = recordedGateway([{ matchUserIncludes: 'playful', response: PLAYFUL }]);
      const res = await gw.plan(baseProject(), 'make it playful');
      const notes: string[] = [];
      if (!res.ok)
        return { pass: false, notes: res.errors ?? ['plan failed'], tokensIn: 0, tokensOut: 0 };
      notes.push(`${res.plan!.ops.length} ops, attempts=${res.attempts}`);
      const ok =
        res.plan!.ops.length === 2 &&
        res.plan!.ops.every((o) => o.path.startsWith('block:b1.config.'));
      const u = gw.totalUsage;
      return { pass: ok, notes, tokensIn: u.inputTokens, tokensOut: u.outputTokens };
    },
  },
  {
    id: 'T38',
    title: 'Agent rejects locked-field attack',
    run: async () => {
      const evil = JSON.stringify({
        ops: [{ path: 'block:b1.config.ports', value: {} }],
        rationale: 'x',
      });
      const gw = recordedGateway([{ matchUserIncludes: 'evil', response: evil }]);
      const res = await gw.plan(baseProject(), 'evil');
      // The recorded response is always evil; after retries it must fail.
      const notes = res.errors ?? ['unexpectedly ok'];
      const u = gw.totalUsage;
      return {
        pass: !res.ok && res.attempts === 3,
        notes,
        tokensIn: u.inputTokens,
        tokensOut: u.outputTokens,
      };
    },
  },
  {
    id: 'T39',
    title: 'Agent respects user hand-edited (touched) paths',
    run: async () => {
      const gw = recordedGateway([{ matchUserIncludes: 'playful', response: PLAYFUL }]);
      const p = baseProject();
      p.touched.push('block:b1.config.headline');
      const res = await gw.plan(p, 'make it playful');
      const notes: string[] = [];
      if (!res.ok) return { pass: false, notes: res.errors ?? [], tokensIn: 0, tokensOut: 0 };
      const touchedOp = res.plan!.ops.find((o) => o.path === 'block:b1.config.headline');
      notes.push(`touched op present: ${touchedOp !== undefined}`);
      const u = gw.totalUsage;
      return {
        pass: touchedOp === undefined,
        notes,
        tokensIn: u.inputTokens,
        tokensOut: u.outputTokens,
      };
    },
  },
  {
    id: 'T40',
    title: 'Agent output validated against JSON Schema',
    run: async () => {
      const bad = JSON.stringify({
        ops: [{ path: 'block:b1.config.headline', value: '' }],
        rationale: 'x',
      });
      const gw = recordedGateway([{ matchUserIncludes: 'bad', response: bad }]);
      const res = await gw.plan(baseProject(), 'bad');
      const notes = res.errors ?? ['unexpectedly ok'];
      const u = gw.totalUsage;
      return {
        pass: !res.ok,
        notes: notes.slice(0, 2),
        tokensIn: u.inputTokens,
        tokensOut: u.outputTokens,
      };
    },
  },
  {
    id: 'T41',
    title: 'Agent apply + undo roundtrip preserves project',
    run: async () => {
      const gw = recordedGateway([{ matchUserIncludes: 'playful', response: PLAYFUL }]);
      const p = baseProject();
      const before = JSON.stringify(p);
      const res = await gw.plan(p, 'make it playful');
      if (!res.ok || !res.plan)
        return { pass: false, notes: res.errors ?? [], tokensIn: 0, tokensOut: 0 };
      const { project: next } = gw.apply(p, res.plan);
      const changed = JSON.stringify(next) !== before;
      const undone = gw.undo();
      const restored = undone !== null && JSON.stringify(undone) === before;
      const u = gw.totalUsage;
      return {
        pass: changed && restored,
        notes: [`changed=${changed}`, `restored=${restored}`],
        tokensIn: u.inputTokens,
        tokensOut: u.outputTokens,
      };
    },
  },
  {
    id: 'T42',
    title: 'Token usage is logged for every agent call',
    run: async () => {
      const gw = recordedGateway([{ matchUserIncludes: 'playful', response: PLAYFUL }]);
      await gw.plan(baseProject(), 'make it playful');
      await gw.plan(baseProject(), 'make it playful');
      const u = gw.totalUsage;
      return {
        pass: u.calls === 2 && u.inputTokens > 0 && u.outputTokens > 0,
        notes: [`calls=${u.calls}`, `tokens=${u.inputTokens + u.outputTokens}`],
        tokensIn: u.inputTokens,
        tokensOut: u.outputTokens,
      };
    },
  },
];

/** Run the M3 agent benchmark tasks. Returns TaskReports in benchmark format. */
export async function runAgentBenchmark(): Promise<TaskReport[]> {
  const reports: TaskReport[] = [];
  for (const t of TASKS) {
    const start = Date.now();
    let pass = false;
    let notes: string[];
    let tokensIn = 0;
    let tokensOut = 0;
    try {
      const r = await t.run();
      pass = r.pass;
      notes = r.notes;
      tokensIn = r.tokensIn;
      tokensOut = r.tokensOut;
    } catch (e) {
      notes = [`threw: ${e instanceof Error ? e.message : String(e)}`];
    }
    reports.push({
      id: t.id,
      title: t.title,
      category: 'agent',
      pass,
      wallMs: Date.now() - start,
      tokensIn,
      tokensOut,
      notes,
    });
  }
  return reports;
}

/**
 * Live-model spot check (T43): only runs when BLOCKFW_LLM_* is configured.
 * Returns null when skipped so the report is honest about what ran.
 */
export async function runLiveModelCheck(): Promise<TaskReport | null> {
  const provider = providerFromEnv(process.env, new RecordedProvider([]));
  if (provider.name === 'recorded') return null;
  const gw = new AgentGateway(provider, { maxAttempts: 2 });
  const start = Date.now();
  const instructions = ['make it playful', 'make the headlines more energetic', 'friendlier tone'];
  let successes = 0;
  const notes: string[] = [];
  for (const instruction of instructions) {
    try {
      const res = await gw.plan(baseProject(), instruction);
      if (res.ok && res.plan!.ops.length > 0) successes++;
      notes.push(`${instruction}: ${res.ok ? `${res.plan!.ops.length} ops` : 'rejected'}`);
    } catch (e) {
      notes.push(`${instruction}: error ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  const u = gw.totalUsage;
  return {
    id: 'T43',
    title: `Live model spot check (${provider.model})`,
    category: 'agent',
    pass: successes >= 2,
    wallMs: Date.now() - start,
    tokensIn: u.inputTokens,
    tokensOut: u.outputTokens,
    notes: [...notes, `success rate: ${successes}/${instructions.length}`],
  };
}
