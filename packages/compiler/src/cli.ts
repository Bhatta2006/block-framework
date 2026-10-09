#!/usr/bin/env node
/**
 * blockc — the Block Framework command line.
 *
 *   blockc validate <graph.json>              validate graph + wiring
 *   blockc wires <graph.json>                 print the wiring report
 *   blockc compile <graph.json> --out <dir>   emit an Expo project
 *   blockc sdk scaffold <id> --category <c>   scaffold a new block
 *   blockc sdk validate [id]                  quality-gate every (or one) block
 *   blockc sdk test [id]                      fast render contract check
 *
 * No step here involves an AI model. That is the point.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import {
  loadDefaultRegistry,
  testBlock,
  validateBlock,
  loadSampleConfig,
  writeScaffoldedBlock,
  blockSourceDir,
} from '@blockfw/blocks';
import {
  legacyGraph,
  migrateGraph,
  canonicalJson,
  ProjectOperationLog,
  type GraphDocument,
  type GraphInput,
  type ProjectOperation,
} from '@blockfw/manifest';
import { resolveWiring, type WiringResult } from '@blockfw/wiring';
import { validateSpine, spineToSql, spineToTypes, type SpineFile } from '@blockfw/spine';
import { compileProject } from './compile.js';
import { compileWebProject } from './compile-web.js';
import { compileWorkspace } from './compile-workspace.js';
import { exportZipFromFile, type ExportTarget } from './export-zip.js';

function loadGraph(path: string): GraphInput {
  const raw = readFileSync(resolve(path), 'utf8');
  return migrateGraph(JSON.parse(raw));
}

function cmdOperations(graphPath: string, operationsPath: string, out: string): void {
  const graph = migrateGraph(JSON.parse(readFileSync(resolve(graphPath), 'utf8')));
  const operations = JSON.parse(
    readFileSync(resolve(operationsPath), 'utf8'),
  ) as ProjectOperation[];
  if (!Array.isArray(operations)) throw new Error('Operations must be an array');
  const log = new ProjectOperationLog<GraphDocument>();
  const next = log.apply({ version: 1, profile: null, touched: [], graph }, operations, 'cli');
  const registry = loadDefaultRegistry();
  if (next.graph.schemaVersion === '0' || next.graph.app.targets.includes('web'))
    compileWebProject(next.graph, registry);
  if (next.graph.schemaVersion === '1' && next.graph.app.targets.some((target) => target !== 'web'))
    compileProject(next.graph, registry);
  const path = resolve(out);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path + '.tmp', canonicalJson(next.graph) + '\n');
  renameSync(path + '.tmp', path);
  writeFileSync(
    path + '.operations.json',
    canonicalJson({ ...log.state, entries: log.entries }) + '\n',
  );
  console.log(`applied ${operations.length} operation(s) -> ${path}`);
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
    const view = legacyGraph(graph);
    console.log(`screens=${view.screens.length} blocks=${view.blocks.length}`);
    printWiring(wiring);
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }
}

function loadSpine(path: string): SpineFile {
  const raw = readFileSync(resolve(path), 'utf8');
  const spine = JSON.parse(raw) as unknown;
  validateSpine(spine);
  return spine;
}

function cmdSpine(args: string[], values: { out?: string }): void {
  const [sub, spinePath] = args;
  if (!spinePath) fail('spine requires a <spine.json> path');
  const spine = loadSpine(spinePath);

  if (sub === 'sql') {
    process.stdout.write(spineToSql(spine));
  } else if (sub === 'types') {
    process.stdout.write(spineToTypes(spine));
  } else if (sub === 'build') {
    const out = values.out;
    if (!out) fail('spine build requires --out <dir>');
    const dir = resolve(out);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'migration.sql'), spineToSql(spine));
    writeFileSync(join(dir, 'spine-types.ts'), spineToTypes(spine));
    console.log(`spine built -> ${dir} (migration.sql, spine-types.ts)`);
  } else {
    fail(
      'usage:\n  blockc spine sql <spine.json>\n  blockc spine types <spine.json>\n  blockc spine build <spine.json> --out <dir>',
    );
  }
}

function cmdCompile(
  graphPath: string,
  outDir: string,
  spinePath?: string,
  target: ExportTarget = 'mobile',
): void {
  try {
    const graph = loadGraph(graphPath);
    const spine = spinePath ? loadSpine(spinePath) : undefined;
    if (target !== 'mobile' && spine) fail('--spine currently supports only --target mobile.');
    const result =
      target === 'workspace'
        ? compileWorkspace(graph, loadDefaultRegistry())
        : target === 'web'
          ? compileWebProject(graph, loadDefaultRegistry())
          : compileProject(graph, loadDefaultRegistry(), spine);
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

async function cmdExport(
  graphPath: string,
  zipPath: string,
  target: ExportTarget = 'mobile',
): Promise<void> {
  try {
    const out = resolve(zipPath);
    mkdirSync(dirname(out), { recursive: true });
    const result = await exportZipFromFile(graphPath, out, target);
    if (!result.audit.ok) {
      console.error('export audit FAILED:');
      for (const v of result.audit.violations) {
        console.error(`  - ${v}`);
      }
      process.exit(1);
    }
    console.log(`exported ${result.fileCount} files -> ${out}`);
    console.log('audit: clean (no secrets, no scratch, no absolute paths)');
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }
}

/**
 * Load a block from the source tree (for scaffolded-but-unregistered blocks).
 * Uses Node's native TypeScript support; the template must be self-contained.
 */
async function loadBlockFromDisk(id: string): Promise<{
  manifest: unknown;
  render: (ctx: unknown) => { content: string };
  sample: unknown;
} | null> {
  const dir = join(blockSourceDir(), id);
  const manifestPath = join(dir, 'manifest.json');
  const templatePath = join(dir, 'template.ts');
  const samplePath = join(dir, 'sample-config.json');
  if (!existsSync(manifestPath) || !existsSync(templatePath) || !existsSync(samplePath)) {
    return null;
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const sample = JSON.parse(readFileSync(samplePath, 'utf8'));
  const mod = (await import(pathToFileURL(templatePath).href)) as {
    render?: (ctx: unknown) => { content: string };
  };
  if (typeof mod.render !== 'function') {
    fail(`block "${id}" template.ts does not export a render function`);
  }
  return { manifest, render: mod.render as (ctx: unknown) => { content: string }, sample };
}

async function cmdSdk(args: string[], values: { category?: string }): Promise<void> {
  const [sub, id] = args;
  const registry = loadDefaultRegistry();

  if (sub === 'scaffold' && id) {
    const category = values.category ?? 'utility';
    const created = writeScaffoldedBlock(id, category);
    console.log(`scaffolded block "${id}":`);
    for (const f of created) console.log(`  ${f}`);
    console.log('next:');
    console.log(`  1. blockc sdk test ${id}   (works before registration)`);
    console.log(`  2. register it in packages/blocks/src/registry.ts`);
    console.log(`  3. blockc sdk validate ${id}`);
    return;
  }

  if (sub === 'validate' || sub === 'test') {
    const check = sub === 'validate' ? validateBlock : testBlock;

    if (id) {
      // Single block: prefer the registry, fall back to the source tree
      // (so scaffolded blocks pass `sdk test` before registration).
      const reg = registry.entries().find((e) => e.manifest.id === id);
      if (reg) {
        const sample = loadSampleConfig(id);
        const result = check(reg.manifest, reg.render, sample);
        printSdkResult(result, sub);
        if (!result.ok) process.exit(1);
        return;
      }
      const disk = await loadBlockFromDisk(id);
      if (!disk) fail(`unknown block id: ${id}`);
      const result = check(disk.manifest, disk.render as Parameters<typeof check>[1], disk.sample);
      printSdkResult(result, sub);
      if (!result.ok) process.exit(1);
      return;
    }

    // All registered blocks.
    let failed = 0;
    for (const e of registry.entries()) {
      const sample = loadSampleConfig(e.manifest.id);
      const result = check(e.manifest, e.render, sample);
      printSdkResult(result, sub);
      if (!result.ok) failed++;
    }
    if (failed > 0) {
      console.error(`${failed} block(s) failed ${sub}`);
      process.exit(1);
    }
    console.log(`all ${registry.size()} block(s) passed ${sub}`);
    return;
  }

  fail(
    'usage:\n' +
      '  blockc sdk scaffold <block-id> --category <category>\n' +
      '  blockc sdk validate [block-id]\n' +
      '  blockc sdk test [block-id]',
  );
}

function printSdkResult(
  result: { block: string; ok: boolean; issues: { path: string; message: string }[] },
  sub: string,
): void {
  void sub;
  const mark = result.ok ? 'PASS' : 'FAIL';
  console.log(`${mark} ${result.block}`);
  for (const issue of result.issues) {
    console.log(`     ${issue.path}: ${issue.message}`);
  }
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      out: { type: 'string', short: 'o' },
      category: { type: 'string' },
      spine: { type: 'string' },
      target: { type: 'string' },
    },
  });
  const [command, ...rest] = positionals;
  if (values.target && !['web', 'mobile', 'workspace'].includes(values.target))
    fail('--target must be web, mobile or workspace');
  const target = (values.target ?? 'mobile') as ExportTarget;
  if (command === 'ops' && rest[0] === 'apply' && rest[1] && rest[2]) {
    if (!values.out) fail('ops apply requires --out <graph.json>');
    cmdOperations(rest[1], rest[2], values.out);
  } else if (command === 'validate' && rest[0]) {
    cmdValidate(rest[0]);
  } else if (command === 'wires' && rest[0]) {
    try {
      const wiring = resolveWiring(loadGraph(rest[0]), loadDefaultRegistry());
      printWiring(wiring);
    } catch (err) {
      fail(err instanceof Error ? err.message : String(err));
    }
  } else if (command === 'compile' && rest[0]) {
    const out = values.out;
    if (!out) fail('compile requires --out <dir>');
    cmdCompile(rest[0], out, values.spine, target);
  } else if (command === 'export' && rest[0]) {
    const out = values.out;
    if (!out) fail('export requires --out <zipfile>');
    await cmdExport(rest[0], out, target);
  } else if (command === 'sdk') {
    await cmdSdk(rest, { category: values.category });
  } else if (command === 'spine') {
    cmdSpine(rest, { out: values.out });
  } else {
    console.error(
      'usage:\n' +
        '  blockc ops apply <graph.json> <operations.json> --out <graph.json>\n' +
        '  blockc validate <graph.json>\n' +
        '  blockc wires <graph.json>\n' +
        '  blockc compile <graph.json> --out <dir> [--target web|mobile|workspace] [--spine <spine.json>]\n' +
        '  blockc export <graph.json> --out <zipfile> [--target web|mobile|workspace]\n' +
        '  blockc sdk scaffold <block-id> --category <category>\n' +
        '  blockc sdk validate [block-id]\n' +
        '  blockc sdk test [block-id]\n' +
        '  blockc spine sql <spine.json>\n' +
        '  blockc spine types <spine.json>\n' +
        '  blockc spine build <spine.json> --out <dir>',
    );
    process.exit(2);
  }
}

main().catch((err) => {
  console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
