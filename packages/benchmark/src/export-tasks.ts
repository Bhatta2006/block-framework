/**
 * M4 export benchmark tasks (T44+).
 *
 * Verifies the ZIP export: audit passes, ZIP is created, contents are clean.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { exportZip } from '@blockfw/compiler';
import type { TaskReport } from './types.js';

const here = dirname(fileURLToPath(import.meta.url));
const EXAMPLE = join(here, '..', '..', '..', 'examples', 'full-app', 'graph.json');

interface ExportTaskDef {
  id: string;
  title: string;
  run: () => Promise<{ pass: boolean; notes: string[] }>;
}

const TASKS: ExportTaskDef[] = [
  {
    id: 'T44',
    title: 'ZIP export creates audited archive',
    run: async () => {
      const graph = JSON.parse(readFileSync(EXAMPLE, 'utf8'));
      const zipPath = join(tmpdir(), `bf-bench-export-${Date.now()}.zip`);
      const result = await exportZip(graph, zipPath);
      const notes = [
        `files: ${result.fileCount}`,
        `audit: ${result.audit.ok ? 'clean' : 'FAILED'}`,
      ];
      if (!result.audit.ok) {
        notes.push(...result.audit.violations.slice(0, 3));
      }
      return {
        pass: result.audit.ok && result.fileCount > 0,
        notes,
      };
    },
  },
  {
    id: 'T45',
    title: 'Export audit rejects secrets',
    run: async () => {
      // The audit module is tested directly in compiler tests;
      // here we verify the export pipeline calls it.
      const graph = JSON.parse(readFileSync(EXAMPLE, 'utf8'));
      // Inject a fake secret into a config value to verify audit catches it.
      const evilGraph = JSON.parse(JSON.stringify(graph));
      evilGraph.blocks[0].config.headline = 'test sk-or-v1-abc123def456ghi789';
      const zipPath = join(tmpdir(), `bf-bench-export-evil-${Date.now()}.zip`);
      const result = await exportZip(evilGraph, zipPath);
      return {
        pass: !result.audit.ok && result.audit.violations.length > 0,
        notes: result.audit.ok
          ? ['audit MISSED the injected secret']
          : [`caught: ${result.audit.violations[0]?.slice(0, 60)}...`],
      };
    },
  },
];

/** Run the M4 export benchmark tasks. */
export async function runExportBenchmark(): Promise<TaskReport[]> {
  const reports: TaskReport[] = [];
  for (const t of TASKS) {
    const start = Date.now();
    let pass = false;
    let notes: string[];
    try {
      const r = await t.run();
      pass = r.pass;
      notes = r.notes;
    } catch (e) {
      notes = [`threw: ${e instanceof Error ? e.message : String(e)}`];
    }
    reports.push({
      id: t.id,
      title: t.title,
      category: 'export',
      pass,
      wallMs: Date.now() - start,
      tokensIn: 0,
      tokensOut: 0,
      notes,
    });
  }
  return reports;
}
