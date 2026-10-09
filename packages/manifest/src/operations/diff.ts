import { projectGraphToV1 } from '../migrations/projection.js';
import type { GraphDocument, GraphOperation, ProjectOperation } from './types.js';
import type { GraphInput } from '../graph-v1.js';
import { canonicalJson } from '../canonical.js';

const changed = (a: unknown, b: unknown) => canonicalJson(a) !== canonicalJson(b);
const project = (input: GraphInput) =>
  input.schemaVersion === '0' ? projectGraphToV1(input) : structuredClone(input);

/** Existing edit recipes become typed operations; only the operation executor writes saved state. */
export function diffGraphOperations(before: GraphInput, after: GraphInput): GraphOperation[] {
  const a = project(before);
  const b = project(after);
  const ops: GraphOperation[] = [];
  if (changed(a.app, b.app)) {
    const { targets: _targets, ...metadata } = b.app;
    ops.push({
      type: 'setApp',
      app:
        before.schemaVersion === '0' &&
        after.schemaVersion === '0' &&
        !changed(a.app.targets, b.app.targets)
          ? metadata
          : b.app,
    });
  }
  if (changed(a.theme, b.theme)) ops.push({ type: 'setTheme', theme: b.theme });
  for (const page of a.pages)
    if (!b.pages.some((item) => item.id === page.id)) ops.push({ type: 'removePage', id: page.id });
  for (const node of a.components)
    if (!b.components.some((item) => item.id === node.id))
      ops.push({ type: 'removeComponent', id: node.id });
  for (const node of b.components) {
    const old = a.components.find((item) => item.id === node.id);
    if (changed(old, node))
      ops.push({ type: old ? 'setComponent' : 'insertBlock', component: node });
  }
  for (const page of b.pages) {
    const old = a.pages.find((item) => item.id === page.id);
    if (changed(old, page)) ops.push({ type: old ? 'setPage' : 'addPage', page });
  }
  if (
    changed(
      a.pages.map((page) => page.id),
      b.pages.map((page) => page.id),
    )
  )
    ops.push({ type: 'orderPages', ids: b.pages.map((page) => page.id) });
  if (
    changed(
      a.components.map((node) => node.id),
      b.components.map((node) => node.id),
    )
  )
    ops.push({ type: 'orderComponents', ids: b.components.map((node) => node.id) });
  if (changed(a.wires, b.wires))
    ops.push(b.wires === undefined ? { type: 'setWires' } : { type: 'setWires', wires: b.wires });
  if (changed(a.data, b.data)) ops.push({ type: 'setData', data: b.data });
  if (changed(a.flows, b.flows)) ops.push({ type: 'setFlows', flows: b.flows });
  if (changed(a.services, b.services)) ops.push({ type: 'setServices', services: b.services });
  if (changed(a.agents, b.agents)) ops.push({ type: 'setAgents', agents: b.agents });
  if (changed(a.env, b.env)) ops.push({ type: 'setEnv', env: b.env });
  if (changed(a.i18n, b.i18n))
    ops.push(b.i18n === undefined ? { type: 'setLocales' } : { type: 'setLocales', i18n: b.i18n });
  if (changed(a.extensions, b.extensions))
    ops.push(
      b.extensions === undefined
        ? { type: 'setExtensions' }
        : { type: 'setExtensions', extensions: b.extensions },
    );
  return structuredClone(ops);
}
export function diffProjectOperations(
  before: GraphDocument,
  after: GraphDocument,
): ProjectOperation[] {
  const ops: ProjectOperation[] = diffGraphOperations(before.graph, after.graph);
  if (changed(before.profile, after.profile))
    ops.push({ type: 'setProfile', profile: structuredClone(after.profile) });
  if (changed(before.touched, after.touched))
    ops.push({ type: 'setTouched', touched: [...after.touched] });
  return ops;
}
