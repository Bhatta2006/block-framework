// NOTE: ajv is CJS. Under `module: NodeNext` + `"type": "module"`, the
// default import (`import Ajv from 'ajv'`) typechecks as the module
// namespace and is not constructable (TS2351). The named import below is
// equivalent at runtime (verified) and typechecks correctly.
import { Ajv, type ValidateFunction } from 'ajv';
import blockManifestSchema from './schema/block-manifest-v0.json' with { type: 'json' };
import projectGraphSchema from './schema/project-graph-v0.json' with { type: 'json' };
import type { BlockManifest, ProjectGraph } from './types.js';

export interface ValidationIssue {
  path: string;
  message: string;
}

export class SchemaError extends Error {
  readonly issues: ValidationIssue[];
  constructor(what: string, validate: ValidateFunction) {
    const issues: ValidationIssue[] = (validate.errors ?? []).map((e) => ({
      path: e.instancePath || '(root)',
      message: e.message ?? 'invalid',
    }));
    super(
      `${what} failed schema validation:\n${issues.map((i) => `  ${i.path}: ${i.message}`).join('\n')}`,
    );
    this.name = 'SchemaError';
    this.issues = issues;
  }
}

const ajv = new Ajv({ allErrors: true, strict: true });

const validateManifestFn = ajv.compile<BlockManifest>(blockManifestSchema);
const validateGraphFn = ajv.compile<ProjectGraph>(projectGraphSchema);

/** Validate a block manifest against block-manifest-v0. Throws SchemaError. */
export function validateManifest(manifest: unknown): asserts manifest is BlockManifest {
  if (!validateManifestFn(manifest)) throw new SchemaError('Block manifest', validateManifestFn);
}

/** Validate a project graph against project-graph-v0. Throws SchemaError. */
export function validateProjectGraph(graph: unknown): asserts graph is ProjectGraph {
  if (!validateGraphFn(graph)) throw new SchemaError('Project graph', validateGraphFn);
}

/**
 * Validate a block instance's config against the block's own config schema.
 * Returns a list of human-readable issues (empty = valid).
 */
export function validateBlockConfig(manifest: BlockManifest, config: unknown): ValidationIssue[] {
  const validate = ajv.compile(manifest.config);
  if (validate(config)) return [];
  return (validate.errors ?? []).map((e) => ({
    path: e.instancePath || '(root)',
    message: e.message ?? 'invalid',
  }));
}
