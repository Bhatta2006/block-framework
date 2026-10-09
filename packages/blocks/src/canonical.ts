/**
 * Deterministic JSON serialization: object keys sorted recursively.
 * Used whenever config is baked into generated code so that recompiling
 * the same graph always yields byte-identical output.
 */
export { canonicalize, canonicalJson } from '@blockfw/manifest';
