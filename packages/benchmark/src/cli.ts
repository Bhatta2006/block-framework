#!/usr/bin/env node
/**
 * bf-bench — the Block Framework benchmark harness.
 *
 *   bf-bench list                        list the 20 tasks
 *   bf-bench run --agent mock --out f    run the suite with the mock agent
 *
 * The mock agent performs each task mechanically (JSON edit + recompile)
 * and records zero tokens. Replaying the suite against a real coding agent
 * is the honest baseline comparison; see the repo README for the procedure
 * (it requires an LLM API key, which this machine does not have).
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { canonicalJson } from '@blockfw/blocks';
import { runBenchmark, TASKS } from './runner.js';

function cmdList(): void {
  console.log('id   category      expects       title');
  console.log('---  ------------  ------------  -----');
  for (const t of TASKS) {
    console.log(`${t.id}  ${t.category.padEnd(12)}  ${t.expects.padEnd(12)}  ${t.title}`);
  }
  console.log(`\n${TASKS.length} tasks`);
}

function cmdRun(agent: string, out: string | undefined): void {
  if (agent !== 'mock') {
    console.error(
      `error: unknown agent "${agent}". Only "mock" is supported in M0.\n` +
        'Running against a real coding agent requires an LLM API key; ' +
        'see README for the baseline procedure.',
    );
    process.exit(1);
  }
  const report = runBenchmark(TASKS, agent);
  for (const t of report.tasks) {
    const mark = t.pass ? 'PASS' : 'FAIL';
    console.log(`${mark} ${t.id} ${t.title} (${t.wallMs}ms, ${t.tokensIn + t.tokensOut} tokens)`);
    for (const n of t.notes) console.log(`       ${n}`);
  }
  const s = report.summary;
  console.log(`\n${s.passed}/${s.total} passed, ${s.failed} failed, ${s.totalWallMs}ms total`);
  if (out) {
    const path = resolve(out);
    writeFileSync(path, `${canonicalJson(report)}\n`);
    console.log(`report written to ${path}`);
  }
  process.exit(s.failed > 0 ? 1 : 0);
}

function main(): void {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      agent: { type: 'string', default: 'mock' },
      out: { type: 'string', short: 'o' },
    },
  });
  const [command] = positionals;
  if (command === 'list') cmdList();
  else if (command === 'run') cmdRun(values.agent ?? 'mock', values.out);
  else {
    console.error('usage:\n  bf-bench list\n  bf-bench run --agent mock --out <file>');
    process.exit(2);
  }
}

main();
