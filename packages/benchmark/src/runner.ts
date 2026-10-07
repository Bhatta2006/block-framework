import { performance } from 'node:perf_hooks';
import { loadDefaultRegistry } from '@blockfw/blocks';
import { compileProject, type CompiledFile, type CompileResult } from '@blockfw/compiler';
import type { ProjectGraph } from '@blockfw/manifest';
import { validateSpine, type SpineFile } from '@blockfw/spine';
import baseGraphJson from './base/graph.json' with { type: 'json' };
import baseSpineJson from './base/spine.json' with { type: 'json' };
import { TASKS } from './tasks.js';
import type {
  BenchmarkReport,
  BenchmarkTask,
  TaskCheck,
  TaskOperation,
  TaskReport,
} from './types.js';

/** Deep-cloned base graph fixture. */
export function baseGraph(): ProjectGraph {
  return JSON.parse(JSON.stringify(baseGraphJson)) as ProjectGraph;
}

/** Deep-cloned base spine fixture. */
export function baseSpine(): SpineFile {
  const spine = JSON.parse(JSON.stringify(baseSpineJson)) as SpineFile;
  validateSpine(spine);
  return spine;
}

/** Mutable state a task operation works on: the graph plus an optional spine. */
export interface TaskContext {
  graph: ProjectGraph;
  spine?: SpineFile;
}

/** Apply a task's operation to the context. Pure JSON surgery — no AI. */
export function applyOperation(ctx: TaskContext, op: TaskOperation): void {
  const graph = ctx.graph;
  const findBlock = (id: string) => {
    const b = graph.blocks.find((x) => x.id === id);
    if (!b) throw new Error(`benchmark: unknown block instance "${id}"`);
    return b;
  };
  switch (op.kind) {
    case 'none':
      break;
    case 'set-config':
      findBlock(op.instance).config = op.config;
      break;
    case 'set-variant':
      findBlock(op.instance).variant = op.variant;
      break;
    case 'set-block-type':
      findBlock(op.instance).type = op.type;
      break;
    case 'replace-block': {
      const b = findBlock(op.instance);
      b.type = op.type;
      if (op.variant !== undefined) b.variant = op.variant;
      if (op.config !== undefined) b.config = op.config;
      break;
    }
    case 'set-screen-block': {
      const s = graph.screens.find((x) => x.id === op.screen);
      if (!s) throw new Error(`benchmark: unknown screen "${op.screen}"`);
      s.block = op.block;
      break;
    }
    case 'set-slug':
      graph.app.slug = op.slug;
      break;
    case 'set-theme':
      graph.app.theme = { ...(graph.app.theme ?? {}), ...op.theme };
      break;
    case 'reorder-screens': {
      const byId = new Map(graph.screens.map((s) => [s.id, s]));
      graph.screens = op.order.map((id) => {
        const s = byId.get(id);
        if (!s) throw new Error(`benchmark: unknown screen "${id}"`);
        return s;
      });
      break;
    }
    case 'add-wire':
      graph.wires = [...(graph.wires ?? []), { from: op.from, to: { screen: op.toScreen } }];
      break;
    case 'add-wires':
      graph.wires = [
        ...(graph.wires ?? []),
        ...op.wires.map((w) => ({ from: w.from, to: { screen: w.toScreen } })),
      ];
      break;
    case 'remove-screen':
      graph.screens = graph.screens.filter((s) => s.id !== op.screen);
      break;
    case 'add-screen':
      graph.blocks = [...graph.blocks, op.block];
      graph.screens = [...graph.screens, op.screen];
      break;
    case 'set-spine': {
      const spine = op.spine as unknown;
      validateSpine(spine);
      ctx.spine = spine as SpineFile;
      break;
    }
  }
}

export interface MockOutcome {
  result?: CompileResult;
  error?: string;
  wallMs: number;
}

/**
 * The mock agent: applies the operation mechanically and recompiles.
 * Zero tokens by construction — it never calls a model.
 */
export function mockRun(task: BenchmarkTask): MockOutcome {
  const registry = loadDefaultRegistry();
  const ctx: TaskContext = { graph: baseGraph() };
  const start = performance.now();
  try {
    applyOperation(ctx, task.operation);
    const result = compileProject(ctx.graph, registry, ctx.spine);
    return { result, wallMs: performance.now() - start };
  } catch (err) {
    return {
      error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      wallMs: performance.now() - start,
    };
  }
}

function fileMap(files: CompiledFile[]): Map<string, string> {
  return new Map(files.map((f) => [f.path, f.content]));
}

/** Paths whose content differs between two compiles (sorted). */
export function diffFiles(before: CompiledFile[], after: CompiledFile[]): string[] {
  const a = fileMap(before);
  const b = fileMap(after);
  const changed = new Set<string>();
  for (const [path, content] of b) {
    if (a.get(path) !== content) changed.add(path);
  }
  for (const path of a.keys()) {
    if (!b.has(path)) changed.add(`${path} (deleted)`);
  }
  return [...changed].sort();
}

function checkTask(
  task: BenchmarkTask,
  outcome: MockOutcome,
  baseFiles: CompiledFile[],
): { pass: boolean; notes: string[] } {
  const notes: string[] = [];
  let pass = true;
  const fail = (note: string) => {
    pass = false;
    notes.push(note);
  };

  if (task.expects === 'success' && outcome.error !== undefined) {
    fail(`expected success but compile failed: ${outcome.error}`);
    return { pass, notes };
  }
  if (task.expects === 'compile-error' && outcome.error === undefined) {
    fail('expected a compile error but the graph compiled cleanly');
    return { pass, notes };
  }
  if (outcome.error !== undefined) {
    notes.push(`failed as expected: ${outcome.error.split('\n')[0]}`);
    return { pass, notes };
  }
  const result = outcome.result;
  if (!result) {
    fail('no result and no error — harness bug');
    return { pass, notes };
  }

  for (const check of task.checks ?? []) {
    evalCheck(task, check, result, baseFiles, notes, fail);
  }
  return { pass, notes };
}

function evalCheck(
  task: BenchmarkTask,
  check: TaskCheck,
  result: CompileResult,
  baseFiles: CompiledFile[],
  notes: string[],
  fail: (note: string) => void,
): boolean {
  switch (check.kind) {
    case 'hash-stable': {
      const again = (() => {
        const ctx = taskContext(task);
        return compileProject(ctx.graph, loadDefaultRegistry(), ctx.spine);
      })();
      if (again.projectHash !== result.projectHash) {
        fail(`hash unstable: ${result.projectHash} != ${again.projectHash}`);
        return false;
      }
      notes.push(`hash stable: ${result.projectHash.slice(0, 12)}…`);
      return true;
    }
    case 'changed-files': {
      const changed = diffFiles(baseFiles, result.files);
      const only = check.only;
      if (only !== undefined) {
        const unexpected = changed.filter((p) => !only.includes(p));
        if (unexpected.length > 0) {
          fail(`unexpected files changed: ${unexpected.join(', ')}`);
          return false;
        }
        notes.push(`only expected files changed: ${changed.join(', ') || '(none)'}`);
      }
      const not = check.not;
      if (not !== undefined) {
        const forbidden = changed.filter((p) => not.includes(p));
        if (forbidden.length > 0) {
          fail(`forbidden files changed: ${forbidden.join(', ')}`);
          return false;
        }
        notes.push(`protected files untouched; changed: ${changed.join(', ') || '(none)'}`);
      }
      return true;
    }
    case 'wire-target': {
      const wire = result.wiring.report.resolved.find(
        (w) => w.from.instance === check.instance && w.from.event === check.event,
      );
      if (!wire) {
        fail(`no wire found for ${check.instance}.${check.event}`);
        return false;
      }
      if (wire.to.screen !== check.screen) {
        fail(`wire target screen is ${wire.to.screen}, expected ${check.screen}`);
        return false;
      }
      if (check.toInstance !== undefined && wire.to.instance !== check.toInstance) {
        fail(`wire target instance is ${wire.to.instance}, expected ${check.toInstance}`);
        return false;
      }
      notes.push(
        `wire ${check.instance}.${check.event} -> screen ${wire.to.screen}` +
          (wire.to.instance ? ` (instance ${wire.to.instance})` : ''),
      );
      return true;
    }
    case 'file-contains': {
      const files = fileMap(result.files);
      const content = files.get(check.path);
      if (content === undefined) {
        fail(`file not emitted: ${check.path}`);
        return false;
      }
      if (!content.includes(check.text)) {
        fail(`file ${check.path} does not contain "${check.text.slice(0, 80)}"`);
        return false;
      }
      notes.push(`${check.path} contains expected text`);
      return true;
    }
  }
  // Unreachable: the switch above is exhaustive over TaskCheck.
  return true;
}

/** Rebuild the task's context (used for the hash-stability check). */
function taskContext(task: BenchmarkTask): TaskContext {
  const ctx: TaskContext = { graph: baseGraph() };
  applyOperation(ctx, task.operation);
  return ctx;
}

export function runTask(task: BenchmarkTask, baseFiles: CompiledFile[]): TaskReport {
  const outcome = mockRun(task);
  const { pass, notes } = checkTask(task, outcome, baseFiles);
  return {
    id: task.id,
    title: task.title,
    category: task.category,
    pass,
    wallMs: Math.round(outcome.wallMs * 10) / 10,
    tokensIn: 0,
    tokensOut: 0,
    notes,
  };
}

export function runBenchmark(tasks: BenchmarkTask[] = TASKS, agent = 'mock'): BenchmarkReport {
  const registry = loadDefaultRegistry();
  const baseFiles = compileProject(baseGraph(), registry).files;
  const reports = tasks.map((t) => runTask(t, baseFiles));
  const passed = reports.filter((r) => r.pass).length;
  return {
    generatedAt: new Date().toISOString(),
    agent,
    baseGraph: 'benchmark/base/graph.json',
    tasks: reports,
    summary: {
      total: reports.length,
      passed,
      failed: reports.length - passed,
      totalWallMs: Math.round(reports.reduce((s, r) => s + r.wallMs, 0) * 10) / 10,
      totalTokens: 0,
    },
  };
}

export { TASKS };
