#!/usr/bin/env node
/**
 * blockc — the Block Framework M0 command line.
 *
 *   blockc validate <graph.json>              validate graph + wiring
 *   blockc wires <graph.json>                 print the wiring report
 *   blockc compile <graph.json> --out <dir>   emit an Expo project
 *
 * No step here involves an AI model. That is the point.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { loadDefaultRegistry } from '@blockfw/blocks';
import type { ProjectGraph } from '@blockfw/manifest';
import { resolveWiring, type WiringResult } from '@blockfw/wiring';
import { compileProject } from './compile.js';

function loadGraph(path: string): ProjectGraph {
  const raw = readFileSync(resolve(path), 'utf8');
  return JSON.parse(raw) as ProjectGraph;
}

function printWiring(wiring: WiringResult): void {
  const { report } = wiring;
  console.log('wires:');
  for (const w of report.resolved) {
    console.log(`  ${w.id}  ${w.from.instance}.${w.from.event} -> ${w.to.screen}  [${w.origin}]`);
    console.log(`       ${w.reason}`);
  }
  if (report.warnings.length > 0) {
    console.log('warnings:');
    for (const w of report.warnings) console.log(`  ! ${w}`);
  }
  if (report.notes.length > 0) {
    console.log('notes:');
    for (const n of report.notes) console.log(`  - ${n}`);
  }
  console.log(
    `resolved=${report.resolved.length} unmet=${report.unmet.length} ` +
      `ambiguous=${report.ambiguous.length} warnings=${report.warnings.length}`,
  );
}

function fail(message: string): never {
  console.error(`error: ${message}`);
  process.exit(1);
}

function cmdValidate(graphPath: string): void {
  try {
    const graph = loadGraph(graphPath);
    const wiring = resolveWiring(graph, loadDefaultRegistry());
    console.log(`OK: ${graph.app.name} (${graph.app.slug})`);
    console.log(`screens=${graph.screens.length} blocks=${graph.blocks.length}`);
    printWiring(wiring);
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }
}

function cmdCompile(graphPath: string, outDir: string): void {
  try {
    const graph = loadGraph(graphPath);
    const result = compileProject(graph, loadDefaultRegistry());
    const out = resolve(outDir);
    for (const file of result.files) {
      const full = resolve(out, file.path);
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, file.content);
    }
    console.log(`compiled ${result.files.length} files -> ${out}`);
    printWiring(result.wiring);
    console.log(`project hash: ${result.projectHash}`);
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }
}

function main(): void {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { out: { type: 'string', short: 'o' } },
  });
  const [command, graphPath] = positionals;
  if (command === 'validate' && graphPath) {
    cmdValidate(graphPath);
  } else if (command === 'wires' && graphPath) {
    try {
      const wiring = resolveWiring(loadGraph(graphPath), loadDefaultRegistry());
      printWiring(wiring);
    } catch (err) {
      fail(err instanceof Error ? err.message : String(err));
    }
  } else if (command === 'compile' && graphPath) {
    const out = values.out;
    if (!out) fail('compile requires --out <dir>');
    cmdCompile(graphPath, out);
  } else {
    console.error(
      'usage:\n' +
        '  blockc validate <graph.json>\n' +
        '  blockc wires <graph.json>\n' +
        '  blockc compile <graph.json> --out <dir>',
    );
    process.exit(2);
  }
}

main();
