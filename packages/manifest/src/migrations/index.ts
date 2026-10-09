import type { AppGraphV1, CompatibilityFlags, GraphInput } from '../graph-v1.js';
import type { AppTheme, ProjectGraph } from '../types.js';
import { validateAppGraphV1, validateProjectGraph } from '../validate.js';
import { LEGACY_THEME_KEYS, migrate0To1 } from './0-to-1.js';

export { migrate0To1 } from './0-to-1.js';

export function migrateGraph(input: unknown): AppGraphV1 {
  if ((input as { schemaVersion?: unknown } | null)?.schemaVersion === '0') {
    validateProjectGraph(input);
    return migrate0To1(input);
  }
  validateAppGraphV1(input);
  return structuredClone(input);
}

/** Phase 0 compatibility view; reject every declaration the current emitters cannot execute. */
export function legacyGraph(input: GraphInput | unknown): ProjectGraph {
  if ((input as { schemaVersion?: unknown } | null)?.schemaVersion === '0') {
    validateProjectGraph(input);
    return structuredClone(input);
  }
  validateAppGraphV1(input);
  const graph = input;
  const unsupported = (what: string): never => {
    throw new Error(`${what} is not implemented in Phase 0`);
  };
  if (Object.values(graph.data).some((items) => items.length)) unsupported('Data model execution');
  if (graph.flows.length) unsupported('Flows');
  if (graph.agents.length) unsupported('In-app agents');
  if (graph.env.length) unsupported('Environment bindings');
  if (graph.i18n) unsupported('Localization');
  if (Object.keys(graph.extensions ?? {}).some((key) => key !== 'blockfw.compatibility'))
    unsupported('Graph extensions');
  const flags = graph.extensions?.['blockfw.compatibility'] as CompatibilityFlags | undefined;
  const theme: AppTheme = {};
  for (const [key, name] of Object.entries(LEGACY_THEME_KEYS)) {
    const token = graph.theme[name];
    if (token !== undefined) {
      if (token.$type !== 'color' || typeof token.$value !== 'string')
        unsupported(`Theme token ${name}`);
      theme[key as keyof AppTheme] = token.$value as string;
    }
  }
  if (
    Object.keys(graph.theme).some(
      (key) => !Object.values(LEGACY_THEME_KEYS).some((name) => name === key),
    )
  )
    unsupported('Extended theme tokens');
  if (
    graph.services.length > 1 ||
    graph.services.some(
      (service) => service.id !== 'cloud' || service.provider !== 'supabase' || service.env,
    )
  )
    unsupported('Service provider');
  const { targets: _targets, ...app } = structuredClone(graph.app);
  const cloud = graph.services[0];
  const legacy: ProjectGraph = {
    schemaVersion: '0',
    app: {
      ...app,
      ...(flags?.themePresent || Object.keys(theme).length ? { theme } : {}),
      ...(cloud
        ? {
            cloud: {
              provider: 'supabase' as const,
              ...(cloud.publicUrl !== undefined ? { backendUrl: cloud.publicUrl } : {}),
            },
          }
        : {}),
    },
    screens: graph.pages.map(
      ({ primaryComponent, components, route, params, guards, redirect, parent, ...page }) => {
        if (
          route !== undefined ||
          params !== undefined ||
          guards !== undefined ||
          redirect !== undefined ||
          parent !== undefined
        )
          unsupported('Advanced routing');
        return {
          ...page,
          block: primaryComponent,
          ...(flags?.composedPages.includes(page.id) ||
          components.length !== 1 ||
          components[0] !== primaryComponent
            ? { blocks: [...components] }
            : {}),
        };
      },
    ),
    blocks: graph.components.map((node) => {
      if (node.kind !== 'block') return unsupported('Nested layouts');
      const { kind: _kind, slots, bindings, ...block } = node;
      if (slots !== undefined || bindings !== undefined) unsupported('Slots and data bindings');
      return structuredClone(block);
    }),
    ...(graph.wires !== undefined ? { wires: structuredClone(graph.wires) } : {}),
  };
  validateProjectGraph(legacy);
  return legacy;
}
