import type { GraphInput } from '@blockfw/manifest';
import type { BlockRegistry } from '@blockfw/blocks';
import type { SpineFile } from '@blockfw/spine';
import { prepareProject } from './frontend.js';
import { emitNativeIR } from './backends/native.js';
import type { CompileResult } from './files.js';
export { PINNED_DEPS, PINNED_DEV_DEPS, schemaToTs } from './backends/native.js';
export { CompileError, hashFiles, type CompiledFile, type CompileResult } from './files.js';

/** Compatibility entry point: shared semantic front-end, then native emission. */
export function compileProject(
  graph: GraphInput,
  registry: BlockRegistry,
  spine?: SpineFile,
): CompileResult {
  return emitNativeIR(prepareProject(graph, registry), registry, spine);
}
