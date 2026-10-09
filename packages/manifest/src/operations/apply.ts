import { legacyGraph, migrateGraph } from '../migrations/index.js';
import { validateAppGraphV1 } from '../validate.js';
import type { AppGraphV1, GraphInput } from '../graph-v1.js';
import type { GraphDocument, GraphOperation, ProjectOperation } from './types.js';

const unsafe = new Set(['__proto__', 'constructor', 'prototype']);
function assertJson(value: unknown): void {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (Array.isArray(value)) {
    for (const item of value) assertJson(item);
    return;
  }
  if (typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    for (const [key, item] of Object.entries(value)) {
      if (unsafe.has(key)) throw new Error(`Unsafe operation key: ${key}`);
      assertJson(item);
    }
    return;
  }
  throw new Error('Operations must contain finite JSON values');
}
function replace<T extends { id: string }>(items: T[], item: T, addOnly = false) {
  const index = items.findIndex((entry) => entry.id === item.id);
  if (index >= 0 && addOnly) throw new Error(`Duplicate ID: ${item.id}`);
  if (index < 0) items.push(item);
  else items[index] = item;
}
function reorder<T extends { id: string }>(items: T[], ids: string[]): T[] {
  if (ids.length !== items.length || new Set(ids).size !== items.length)
    throw new Error('Order must contain every ID exactly once');
  return ids.map((id) => {
    const item = items.find((entry) => entry.id === id);
    if (!item) throw new Error(`Unknown ID in order: ${id}`);
    return item;
  });
}
function apply(graph: AppGraphV1, op: GraphOperation) {
  switch (op.type) {
    case 'setApp':
      graph.app = { ...op.app, targets: op.app.targets ?? graph.app.targets };
      break;
    case 'setTheme':
      graph.theme = op.theme;
      break;
    case 'addPage':
      replace(graph.pages, op.page, true);
      break;
    case 'setPage':
      replace(graph.pages, op.page);
      break;
    case 'removePage':
      graph.pages = graph.pages.filter((page) => page.id !== op.id);
      break;
    case 'insertBlock': {
      replace(graph.components, op.component, true);
      if (op.pageId !== undefined) {
        const page = graph.pages.find((page) => page.id === op.pageId);
        if (!page) throw new Error(`Unknown page: ${op.pageId}`);
        const index = op.index ?? page.components.length;
        if (!Number.isInteger(index) || index < 0 || index > page.components.length)
          throw new Error('Invalid block insertion index');
        page.components.splice(index, 0, op.component.id);
      }
      break;
    }
    case 'setComponent':
      replace(graph.components, op.component);
      break;
    case 'removeComponent':
      graph.components = graph.components.filter((node) => node.id !== op.id);
      break;
    case 'orderPages':
      graph.pages = reorder(graph.pages, op.ids);
      break;
    case 'orderComponents':
      graph.components = reorder(graph.components, op.ids);
      break;
    case 'setBlockField': {
      const block = graph.components.find((node) => node.id === op.id);
      if (!block || block.kind !== 'block') throw new Error(`Unknown block: ${op.id}`);
      if (!op.path.length || !['config', 'design', 'variant'].includes(op.path[0]!))
        throw new Error('Block fields must be config, design, or variant');
      if (op.path.some((key) => !key || unsafe.has(key)))
        throw new Error('Unsafe block field path');
      let node = block as unknown as Record<string, unknown>;
      for (let i = 0; i < op.path.length - 1; i++) {
        const key = op.path[i]!;
        if (node[key] === undefined) node[key] = /^\d+$/.test(op.path[i + 1]!) ? [] : {};
        if (!node[key] || typeof node[key] !== 'object')
          throw new Error(`Invalid parent field: ${key}`);
        node = node[key] as Record<string, unknown>;
      }
      node[op.path.at(-1)!] = op.value;
      break;
    }
    case 'wire':
      graph.wires = (graph.wires ?? []).filter(
        (wire) =>
          wire.from.instance !== op.wire.from.instance || wire.from.event !== op.wire.from.event,
      );
      graph.wires.push(op.wire);
      break;
    case 'unwire':
      graph.wires = (graph.wires ?? []).filter(
        (wire) => wire.from.instance !== op.instance || wire.from.event !== op.event,
      );
      break;
    case 'setWires':
      if (op.wires === undefined) delete graph.wires;
      else graph.wires = op.wires;
      break;
    case 'createEntity':
      replace(graph.data.entities, op.entity, true);
      break;
    case 'addField': {
      const entity = graph.data.entities.find((entity) => entity.id === op.entityId);
      if (!entity) throw new Error(`Unknown entity: ${op.entityId}`);
      if (Object.hasOwn(entity.fields, op.name)) throw new Error(`Duplicate field: ${op.name}`);
      if (!op.name || unsafe.has(op.name)) throw new Error('Unsafe field name');
      entity.fields[op.name] = op.schema;
      break;
    }
    case 'createFlow':
      replace(graph.flows, op.flow, true);
      break;
    case 'setBinding': {
      const node = graph.components.find((node) => node.id === op.id);
      if (!node || node.kind !== 'block') throw new Error(`Unknown block: ${op.id}`);
      if (!op.field || unsafe.has(op.field)) throw new Error('Unsafe binding field');
      node.bindings ??= {};
      node.bindings[op.field] = op.binding;
      break;
    }
    case 'setData':
      graph.data = op.data;
      break;
    case 'setFlows':
      graph.flows = op.flows;
      break;
    case 'setServices':
      graph.services = op.services;
      break;
    case 'setAgents':
      graph.agents = op.agents;
      break;
    case 'setEnv':
      graph.env = op.env;
      break;
    case 'setLocales':
      if (op.i18n === undefined) delete graph.i18n;
      else graph.i18n = op.i18n;
      break;
    case 'setExtensions':
      if (op.extensions === undefined) delete graph.extensions;
      else graph.extensions = op.extensions;
      break;
    default:
      throw new Error(`Unknown graph operation: ${(op as { type: string }).type}`);
  }
}
export function applyGraphOperations(
  input: GraphInput,
  operations: readonly GraphOperation[],
): GraphInput {
  assertJson(operations);
  const graph = migrateGraph(input);
  for (const op of structuredClone(operations)) apply(graph, op);
  validateAppGraphV1(graph);
  if (
    input.schemaVersion === '0' &&
    JSON.stringify(graph.app.targets) !== JSON.stringify(migrateGraph(input).app.targets)
  )
    throw new Error('Use a v1 graph to edit target declarations');
  return input.schemaVersion === '0' ? legacyGraph(graph) : graph;
}
export function applyProjectOperations<P extends GraphDocument>(
  input: P,
  operations: readonly ProjectOperation[],
): P {
  assertJson(operations);
  const next = structuredClone(input);
  const graphOps: GraphOperation[] = [];
  for (const op of structuredClone(operations)) {
    if (op.type === 'setProfile') next.profile = op.profile;
    else if (op.type === 'setTouched') {
      if (!Array.isArray(op.touched) || op.touched.some((path) => typeof path !== 'string'))
        throw new Error('Touched paths must be strings');
      next.touched = [...new Set(op.touched)].sort();
    } else graphOps.push(op);
  }
  next.graph = applyGraphOperations(input.graph, graphOps);
  return next;
}
