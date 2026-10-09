// NOTE: ajv is CJS. Under `module: NodeNext` + `"type": "module"`, the
// default import (`import Ajv from 'ajv'`) typechecks as the module
// namespace and is not constructable (TS2351). The named import below is
// equivalent at runtime (verified) and typechecks correctly.
import { Ajv, type ValidateFunction } from 'ajv';
import blockManifestSchema from './schema/block-manifest-v0.json' with { type: 'json' };
import projectGraphSchema from './schema/project-graph-v0.json' with { type: 'json' };
import appGraphSchema from './schema/project-graph-v1.json' with { type: 'json' };
import type { AppGraphV1 } from './graph-v1.js';
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
const validateAppGraphFn = ajv.compile<AppGraphV1>(appGraphSchema);

/** Shape plus reference integrity, independent of target execution support. */
export function validateAppGraphV1(graph: unknown): asserts graph is AppGraphV1 {
  if (!validateAppGraphFn(graph)) throw new SchemaError('Application graph v1', validateAppGraphFn);
  const uniqueIds = (items: { id: string }[], label: string) => {
    const ids = new Set(items.map((item) => item.id));
    if (ids.size !== items.length) throw new Error(`Duplicate ${label} ID`);
    return ids;
  };
  const pages = uniqueIds(graph.pages, 'page');
  const components = uniqueIds(graph.components, 'component');
  const entities = uniqueIds(graph.data.entities, 'entity');
  const services = uniqueIds(graph.services, 'service');
  uniqueIds(graph.data.relations, 'relation');
  uniqueIds(graph.data.policies, 'policy');
  uniqueIds(graph.flows, 'flow');
  uniqueIds(graph.agents, 'agent');
  if (new Set(graph.env.map((env) => env.name)).size !== graph.env.length)
    throw new Error('Duplicate environment name');
  const reference = (ids: Set<string>, id: string, label: string) => {
    if (!ids.has(id)) throw new Error(`Unknown ${label}: ${id}`);
  };
  const nodes = new Map(graph.components.map((node) => [node.id, node]));
  const placed = new Set<string>();
  const visit = (id: string, ancestors: Set<string>) => {
    reference(components, id, 'component');
    if (ancestors.has(id)) throw new Error(`Component cycle: ${id}`);
    if (placed.has(id)) throw new Error(`Duplicate component placement: ${id}`);
    placed.add(id);
    const node = nodes.get(id)!;
    const children =
      node.kind === 'layout' ? node.children : Object.values(node.slots ?? {}).flat();
    for (const child of children) visit(child, new Set([...ancestors, id]));
  };
  for (const page of graph.pages) {
    if (!components.has(page.primaryComponent))
      throw new Error(
        `Page "${page.id}" references unknown block instance "${page.primaryComponent}".`,
      );
    if (!page.components.includes(page.primaryComponent))
      throw new Error(`Primary component missing from page: ${page.id}`);
    if (page.parent) reference(pages, page.parent, 'parent page');
    for (const id of page.components) visit(id, new Set());
  }
  // Unplaced blocks remain legal; their children must still be valid and acyclic.
  const validateTree = (id: string, ancestors: Set<string>) => {
    reference(components, id, 'component');
    if (ancestors.has(id)) throw new Error(`Component cycle: ${id}`);
    const node = nodes.get(id)!;
    for (const child of node.kind === 'layout'
      ? node.children
      : Object.values(node.slots ?? {}).flat())
      validateTree(child, new Set([...ancestors, id]));
  };
  for (const node of graph.components) validateTree(node.id, new Set());
  for (const wire of graph.wires ?? []) {
    reference(components, wire.from.instance, 'wire source');
    reference(pages, wire.to.screen, 'wire page');
    if (wire.to.instance) reference(components, wire.to.instance, 'wire consumer');
  }
  for (const relation of graph.data.relations) {
    reference(entities, relation.from, 'relation entity');
    reference(entities, relation.to, 'relation entity');
  }
  for (const entry of [...graph.data.policies, ...graph.data.seeds])
    reference(entities, entry.entity, 'entity');
  for (const agent of graph.agents) reference(services, agent.service, 'agent service');
  const envNames = new Set(graph.env.map((env) => env.name));
  for (const service of graph.services)
    for (const name of Object.values(service.env ?? {}))
      reference(envNames, name, 'environment declaration');
  for (const flow of graph.flows) {
    const steps = uniqueIds(flow.steps, 'flow step');
    for (const edge of flow.edges) {
      reference(steps, edge.from, 'flow step');
      reference(steps, edge.to, 'flow step');
    }
  }
}

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
