import { createHash } from 'node:crypto';
import type { WiringResult } from '@blockfw/wiring';

export interface CompiledFile {
  path: string;
  content: string;
}
export interface CompileResult {
  files: CompiledFile[];
  wiring: WiringResult;
  /** SHA-256 over emitted files except the wiring report. */
  projectHash: string;
}
export class CompileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CompileError';
  }
}
export function hashFiles(files: CompiledFile[]): string {
  const sorted = [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const hash = createHash('sha256');
  for (const file of sorted) {
    hash.update(file.path);
    hash.update('\0');
    hash.update(file.content);
    hash.update('\0');
  }
  return hash.digest('hex');
}
