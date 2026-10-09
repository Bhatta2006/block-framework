import type { GraphInput } from '@blockfw/manifest';
import type { BlockRegistry } from '@blockfw/blocks';
import type { CompileResult } from './compile.js';
import { prepareProject } from './frontend.js';
import { emitWebIR } from './backends/web.js';

/** Compatibility entry point: shared semantic front-end, then web emission. */
export function compileWebProject(graph: GraphInput, registry: BlockRegistry): CompileResult {
  return emitWebIR(prepareProject(graph, registry), registry);
}
