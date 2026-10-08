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
import { loadDefaultRegistry } from '@blockfw/blocks';
import type { ProjectGraph } from '@blockfw/manifest';

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
export async function exportZip(graph: ProjectGraph, zipPath: string): Promise<ExportResult> {
  const registry = loadDefaultRegistry();
  const result = compileProject(graph, registry);

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
    output.on('close', () => resolvePromise());
    archive.on('error', (...args: unknown[]) => reject(args[0] as Error));
    archive.pipe(output);
    for (const file of files) {
      archive.append(file.content, { name: file.path });
    }
    archive.finalize();
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
export async function exportZipFromFile(graphPath: string, zipPath: string): Promise<ExportResult> {
  const graph = JSON.parse(readFileSync(resolve(graphPath), 'utf8')) as ProjectGraph;
  return exportZip(graph, zipPath);
}
