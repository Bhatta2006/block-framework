/**
 * M4: One-click ZIP export of a compiled project.
 *
 * Creates a clean ZIP that installs and runs from a clean machine using
 * only the README. Audits contents (no secrets, no scratch, no absolute paths).
 */
import { createWriteStream, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ZipArchive } from 'archiver';
import { shouldExclude, auditFileContent, type AuditResult } from './export-audit.js';
import { compileProject } from './compile.js';
import { compileWebProject } from './compile-web.js';
import { loadDefaultRegistry } from '@blockfw/blocks';
import { migrateGraph, type GraphInput } from '@blockfw/manifest';

export interface ExportResult {
  zipPath: string;
  fileCount: number;
  audit: AuditResult;
}

/**
 * Compile a graph and create a ZIP export.
 * @param graph The project graph to export.
 * @param zipPath Where to write the ZIP file.
 * @returns Export result with audit findings.
 */
export async function exportZip(
  graph: GraphInput,
  zipPath: string,
  target: 'web' | 'mobile' = 'mobile',
): Promise<ExportResult> {
  const registry = loadDefaultRegistry();
  const result =
    target === 'web' ? compileWebProject(graph, registry) : compileProject(graph, registry);

  const violations: string[] = [];
  const files: Array<{ path: string; content: string }> = [];

  // Collect and audit files.
  for (const file of result.files) {
    if (shouldExclude(file.path)) {
      continue;
    }
    const fileViolations = auditFileContent(file.path, file.content);
    violations.push(...fileViolations);
    files.push(file);
  }

  if (violations.length > 0) {
    return {
      zipPath,
      fileCount: 0,
      audit: { ok: false, violations },
    };
  }

  // Create the ZIP.
  await new Promise<void>((resolvePromise, reject) => {
    const output = createWriteStream(zipPath);
    const archive = new ZipArchive({ zlib: { level: 9 } });
    output.on('error', reject);
    output.on('close', () => resolvePromise());
    archive.on('error', (...args: unknown[]) => reject(args[0] as Error));
    archive.pipe(output);
    for (const file of files) {
      archive.append(file.content, {
        name: file.path,
        date: new Date('2000-01-01T00:00:00Z'),
        mode: 0o644,
      });
    }
    void archive.finalize().catch(reject);
  });

  return {
    zipPath,
    fileCount: files.length,
    audit: { ok: true, violations: [] },
  };
}

/**
 * Export from a graph file on disk (CLI helper).
 */
export async function exportZipFromFile(
  graphPath: string,
  zipPath: string,
  target: 'web' | 'mobile' = 'mobile',
): Promise<ExportResult> {
  const graph = migrateGraph(JSON.parse(readFileSync(resolve(graphPath), 'utf8')));
  return exportZip(graph, zipPath, target);
}
