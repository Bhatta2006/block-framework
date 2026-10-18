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
import { runExportBenchmark } from './export-tasks.js';
import { recordedBuildProvider, runBuildBenchmark, summarizeBuilds } from './build-tasks.js';
import { providerFromEnv, type LlmProvider } from '@blockfw/agent';
import { ChatGPTConnection } from '@blockfw/builder';

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
  // M4: export benchmark (ZIP creation + audit).
  console.log('\n--- export tasks (M4) ---');
  const exportReports = await runExportBenchmark();
  let exportFailed = 0;
  for (const t of exportReports) {
    const mark = t.pass ? 'PASS' : 'FAIL';
    if (!t.pass) exportFailed++;
    console.log(`${mark} ${t.id} ${t.title} (${t.wallMs}ms)`);
    for (const n of t.notes) console.log(`       ${n}`);
  }
  agentReports.push(...exportReports);
  agentFailed += exportFailed;
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

/** Builder benchmark: recorded (CI), env (BLOCKFW_LLM_*) or chatgpt (Studio's saved ChatGPT login). */
async function cmdBuild(providerName: string, out: string | undefined): Promise<void> {
  const recorded = recordedBuildProvider();
  let provider: LlmProvider = recorded;
  let connection: ChatGPTConnection | undefined;
  if (providerName === 'env') {
    provider = providerFromEnv(process.env, recorded);
    if (provider.name === 'recorded') {
      console.error('error: set BLOCKFW_LLM_PROVIDER, _BASE_URL, _API_KEY and _MODEL first.');
      process.exit(1);
    }
  } else if (providerName === 'chatgpt') {
    connection = new ChatGPTConnection();
    provider = connection.provider(provider);
    if (provider.name !== 'chatgpt') {
      console.error('error: connect ChatGPT and choose a model in Studio → AI assistant first.');
      process.exit(1);
    }
  } else if (providerName !== 'recorded') {
    console.error(`error: unknown provider "${providerName}" (recorded, env, chatgpt).`);
    process.exit(2);
  }
  console.log(`builder benchmark · ${provider.name} · ${provider.model}`);
  const reports = await runBuildBenchmark(provider);
  for (const t of reports) {
    console.log(
      `${t.pass ? 'PASS' : 'FAIL'} ${t.id} ${t.title} (${t.wallMs}ms, ${t.tokensIn + t.tokensOut} tokens)`,
    );
    for (const n of t.notes) console.log(`       ${n}`);
  }
  const summary = summarizeBuilds(reports);
  console.log(
    `\n${summary.passed}/${summary.builds} builds passed · ${summary.totalTokens} tokens · ` +
      `${summary.tokensPerPage} tokens/page (${summary.withinBudget ? 'within' : 'over'} the 20k per 10 pages target) · ` +
      `mean attempts ${summary.meanAttempts.toFixed(2)} · recipe replay ${summary.recipeReplayFree ? 'free' : 'FAILED'}`,
  );
  if (out) {
    const path = resolve(out);
    writeFileSync(
      path,
      `${canonicalJson({ provider: provider.name, model: provider.model, summary, reports })}\n`,
    );
    console.log(`report written to ${path}`);
  }
  connection?.close();
  process.exit(summary.passed === summary.builds && summary.recipeReplayFree ? 0 : 1);
}

function main(): void {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      agent: { type: 'string', default: 'mock' },
      provider: { type: 'string', default: 'recorded' },
      out: { type: 'string', short: 'o' },
    },
  });
  const [command] = positionals;
  if (command === 'list') cmdList();
  else if (command === 'run') cmdRun(values.agent ?? 'mock', values.out);
  else if (command === 'build') void cmdBuild(values.provider ?? 'recorded', values.out);
  else {
    console.error(
      'usage:\n  bf-bench list\n  bf-bench run --agent mock --out <file>\n  bf-bench build --provider recorded|env|chatgpt --out <file>',
    );
    process.exit(2);
  }
}

main();
