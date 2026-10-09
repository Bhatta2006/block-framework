import {
  legacyGraph,
  migrateGraph,
  normalizeConsumes,
  normalizeEmits,
  parseBlockType,
  type AppTarget,
  type ConsumePort,
  type EventPort,
  type GraphInput,
  type JsonSchema,
  type ProjectGraph,
} from '@blockfw/manifest';
import type { BlockRegistry, BlockTheme } from '@blockfw/blocks';
import { navigationTargets, resolveGraph, type WiringResult } from '@blockfw/wiring';

export interface ResolvedBlockIR {
  id: string;
  type: string;
  version: string;
  screenId: string | null;
  registered: boolean;
  variant: string;
  config: Record<string, unknown>;
  emits: EventPort[];
  consumes: ConsumePort[];
}
export interface InputBindingIR {
  instanceId: string;
  screenId: string;
  event: string;
  schema: JsonSchema;
}
export interface CompilerIR {
  readonly irVersion: '1';
  readonly sourceSchemaVersion: '0' | '1';
  readonly compatibilityGraph: ProjectGraph;
  readonly blocks: ResolvedBlockIR[];
  readonly inputs: InputBindingIR[];
  readonly theme: BlockTheme;
  readonly navigation: Record<string, string>;
  readonly wiring: WiringResult;
  readonly capabilities: { targets: AppTarget[]; cloud: boolean; accountBlocks: boolean };
}

const validated = new WeakMap<CompilerIR, BlockRegistry>();
function freeze(value: unknown): void {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return;
  for (const child of Object.values(value)) freeze(child);
  Object.freeze(value);
}

/** Shared semantic resolution; no target syntax, AST nodes or registry objects in the IR. */
export function prepareProject(input: GraphInput, registry: BlockRegistry): CompilerIR {
  const graph = legacyGraph(input);
  const resolved = resolveGraph(graph, registry);
  const canonical = migrateGraph(input);
  const placed = new Map(resolved.instances.map((instance) => [instance.id, instance]));
  const blocks: ResolvedBlockIR[] = graph.blocks.map((block) => {
    const instance = placed.get(block.id);
    const manifest = registry.has(block.type) ? registry.get(block.type).manifest : undefined;
    return {
      id: block.id,
      type: block.type,
      version: parseBlockType(block.type).version,
      screenId: instance?.screenId ?? null,
      registered: manifest !== undefined,
      variant:
        instance?.variant ??
        block.variant ??
        manifest?.defaultVariant ??
        manifest?.variants[0] ??
        '',
      config: instance?.config ?? { ...manifest?.defaultConfig, ...block.config },
      emits: instance?.emits ?? normalizeEmits(manifest?.ports.emits ?? []),
      consumes: instance?.consumes ?? normalizeConsumes(manifest?.ports.consumes ?? []),
    };
  });
  const inputs: InputBindingIR[] = [];
  for (const wire of resolved.wires) {
    if (
      wire.to.instance === undefined ||
      wire.to.port === undefined ||
      inputs.some((binding) => binding.instanceId === wire.to.instance)
    )
      continue;
    const instance = placed.get(wire.to.instance);
    const schema = instance?.consumes.find((port) => port.port === wire.to.port)?.accepts;
    if (instance && schema)
      inputs.push({
        instanceId: instance.id,
        screenId: instance.screenId,
        event: wire.from.event,
        schema,
      });
  }
  const ir: CompilerIR = structuredClone({
    irVersion: '1',
    sourceSchemaVersion: input.schemaVersion,
    compatibilityGraph: graph,
    blocks,
    inputs,
    theme: {
      primaryColor: graph.app.theme?.primaryColor ?? '#345E4F',
      backgroundColor: graph.app.theme?.backgroundColor ?? '#FAFAF7',
      textColor: graph.app.theme?.textColor ?? '#202A25',
    },
    navigation: Object.fromEntries(navigationTargets(resolved)),
    wiring: { wires: resolved.wires, report: resolved.report },
    capabilities: {
      targets: canonical.app.targets,
      cloud: Boolean(graph.app.cloud),
      accountBlocks: graph.blocks.some((block) =>
        /^(auth.account|onboarding.profile|billing.plans|account.settings|billing.review)@/.test(
          block.type,
        ),
      ),
    },
  });
  freeze(ir);
  validated.set(ir, registry);
  return ir;
}

/** Serialized IR must pass the front-end again before emission. */
export function assertPreparedIR(ir: CompilerIR, registry: BlockRegistry): void {
  if (validated.get(ir) !== registry)
    throw new Error('Emitter requires a front-end-validated compiler IR and its registry');
}
