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
import { runAgentBenchmark, runLiveModelCheck } from './agent-tasks.js';

function cmdList(): void {
  console.log('id   category      expects       title');
  console.log('---  ------------  ------------  -----');
  for (const t of TASKS) {
    console.log(`${t.id}  ${t.category.padEnd(12)}  ${t.expects.padEnd(12)}  ${t.title}`);
  }
  console.log(`\n${TASKS.length} tasks`);
}

async function cmdRun(agent: string, out: string | undefined): Promise<void> {
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
  // M3: agent benchmark (recorded provider, deterministic, zero real tokens).
  console.log('\n--- agent tasks (M3) ---');
  const agentReports = await runAgentBenchmark();
  let agentFailed = 0;
  for (const t of agentReports) {
    const mark = t.pass ? 'PASS' : 'FAIL';
    if (!t.pass) agentFailed++;
    console.log(`${mark} ${t.id} ${t.title} (${t.wallMs}ms, ${t.tokensIn + t.tokensOut} tokens)`);
    for (const n of t.notes) console.log(`       ${n}`);
  }
  // M3: live-model spot check, only when BLOCKFW_LLM_* is configured.
  const live = await runLiveModelCheck();
  if (live) {
    const mark = live.pass ? 'PASS' : 'FAIL';
    if (!live.pass) agentFailed++;
    console.log(
      `${mark} ${live.id} ${live.title} (${live.wallMs}ms, ${live.tokensIn + live.tokensOut} tokens)`,
    );
    for (const n of live.notes) console.log(`       ${n}`);
    agentReports.push(live);
  } else {
    console.log('SKIP T43 live model spot check (no BLOCKFW_LLM_* configured)');
  }
  const s = report.summary;
  const totalFailed = s.failed + agentFailed;
  console.log(
    `\n${s.passed}/${s.total} mechanical passed, ${s.failed} failed; agent: ${agentReports.length - agentFailed}/${agentReports.length} passed`,
  );
  if (out) {
    const path = resolve(out);
    writeFileSync(path, `${canonicalJson({ ...report, agentTasks: agentReports })}\n`);
    console.log(`report written to ${path}`);
  }
  process.exit(totalFailed > 0 ? 1 : 0);
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
