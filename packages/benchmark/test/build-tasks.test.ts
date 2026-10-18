import { describe, expect, it } from 'vitest';
import { RecordedProvider } from '@blockfw/agent';
import {
  BUILD_PROMPTS,
  recordedBuildProvider,
  runBuildBenchmark,
  summarizeBuilds,
} from '../src/build-tasks.js';

describe('builder benchmark', () => {
  it('scores recorded builds, then replays an approved build as a zero-token recipe', async () => {
    const reports = await runBuildBenchmark(recordedBuildProvider());
    const builds = reports.filter((r) => r.category === 'build');
    expect(builds.length).toBeGreaterThanOrEqual(2);
    expect(builds.every((r) => r.pass)).toBe(true);
    expect(builds.every((r) => r.tokensIn > 0)).toBe(true);
    const replay = reports.find((r) => r.id === 'B-recipe')!;
    expect(replay.pass).toBe(true);
    expect(replay.tokensIn + replay.tokensOut).toBe(0);
  });

  it('fails a build whose blueprint misses the blocks the request needs', async () => {
    const prompt = BUILD_PROMPTS.find((p) => p.id === 'B01')!;
    const offTopic = JSON.stringify({
      pages: [{ id: 'home', title: 'Home', blocks: [{ id: 'hi', type: 'content.text@1.0.0' }] }],
    });
    const provider = new RecordedProvider([
      { matchUserIncludes: prompt.request, response: offTopic },
    ]);
    const [report] = await runBuildBenchmark(provider, [prompt]);
    expect(report!.pass).toBe(false);
    expect(report!.notes.join('\n')).toMatch(/expected one of/);
  });

  it('summarizes success rate, tokens and the 20k-per-10-pages budget', async () => {
    const summary = summarizeBuilds(await runBuildBenchmark(recordedBuildProvider()));
    expect(summary.successRate).toBe(1);
    expect(summary.tokensPerPage).toBeGreaterThan(0);
    expect(summary.withinBudget).toBe(summary.tokensPerPage <= 2000);
  });
});
