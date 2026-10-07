import { describe, expect, it } from 'vitest';
import {
  applyOperation,
  baseGraph,
  diffFiles,
  mockRun,
  runBenchmark,
  TASKS,
} from '@blockfw/benchmark';

describe('task suite', () => {
  it('has 32 uniquely-identified tasks', () => {
    expect(TASKS).toHaveLength(32);
    const ids = TASKS.map((t) => t.id);
    expect(new Set(ids).size).toBe(32);
    for (const t of TASKS) {
      expect(t.title.length).toBeGreaterThan(0);
      expect(t.description.length).toBeGreaterThan(0);
    }
  });
});

describe('applyOperation', () => {
  it('applies a config edit', () => {
    const ctx = { graph: baseGraph() };
    applyOperation(ctx, { kind: 'set-config', instance: 'b1', config: { questions: [] } });
    const g = ctx.graph;
    expect(g.blocks.find((b) => b.id === 'b1')?.config).toEqual({ questions: [] });
  });

  it('applies a reorder', () => {
    const ctx = { graph: baseGraph() };
    applyOperation(ctx, { kind: 'reorder-screens', order: ['s3', 's1', 's2'] });
    const g = ctx.graph;
    expect(g.screens.map((s) => s.id)).toEqual(['s3', 's1', 's2']);
  });
});

describe('diffFiles', () => {
  it('detects changed and added files', () => {
    const before = [
      { path: 'a.ts', content: '1' },
      { path: 'b.ts', content: '2' },
    ];
    const after = [
      { path: 'a.ts', content: '1-changed' },
      { path: 'b.ts', content: '2' },
      { path: 'c.ts', content: '3' },
    ];
    expect(diffFiles(before, after)).toEqual(['a.ts', 'c.ts']);
    expect(diffFiles(before, before)).toEqual([]);
  });
});

describe('mock agent full suite', () => {
  it('passes all 32 tasks with zero tokens', () => {
    const report = runBenchmark(TASKS, 'mock');
    const failed = report.tasks.filter((t) => !t.pass);
    expect(
      failed.map((t) => `${t.id}: ${t.notes.join('; ')}`),
      'failed tasks',
    ).toEqual([]);
    expect(report.summary.passed).toBe(32);
    expect(report.summary.totalTokens).toBe(0);
  });

  it('mockRun records an error for invalid tasks', () => {
    const task = TASKS.find((t) => t.id === 'T04');
    if (!task) throw new Error('fixture broken');
    const outcome = mockRun(task);
    expect(outcome.error).toMatch(/questions/);
    expect(outcome.result).toBeUndefined();
  });
});
