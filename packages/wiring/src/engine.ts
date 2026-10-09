import {
  pageBlockIds,
  parseBlockType,
  validateBlockConfig,
  validateProjectGraph,
  normalizeEmits,
  normalizeConsumes,
  elementEvent,
  legacyGraph,
  type GraphInput,
  type BlockManifest,
  type ConsumePort,
  type EventPort,
  type ProjectGraph,
} from '@blockfw/manifest';
import type { BlockRegistry } from '@blockfw/blocks';
import {
  CONVENTION_CONSUMES,
  PLATFORM_ENTITIES,
  type WiringReport,
  type WiringResult,
  type Wire,
} from './types.js';

/** Thrown when the graph cannot be wired. Message is human-readable. */
export class WiringError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WiringError';
  }
}

export interface ResolvedInstance {
  id: string;
  manifest: BlockManifest;
  variant: string;
  config: Record<string, unknown>;
  screenId: string;
  emits: EventPort[];
  consumes: ConsumePort[];
}

/**
 * Check that an emitter's payload satisfies a consumer's accepted shape.
 * Returns a human-readable issue, or null when compatible (or when either
 * side declares no schema — undeclared payloads are not checked).
 */
function checkPayload(emitter: EventPort, consumer: ConsumePort): string | null {
  const payload = emitter.payload;
  const accepts = consumer.accepts;
  if (!payload || !accepts) return null;
  if (payload.type !== undefined && payload.type !== 'object') return null;
  if (accepts.type !== undefined && accepts.type !== 'object') return null;
  const props = payload.properties ?? {};
  const acceptProps = accepts.properties ?? {};
  for (const req of accepts.required ?? []) {
    const provided = props[req];
    if (!provided) {
      return (
        `consumer requires property "${req}" but the "${emitter.event}" ` +
        `payload declares no such property`
      );
    }
    const want = acceptProps[req]?.type;
    const have = provided.type;
    if (want && have && want !== have) {
      return `type mismatch for "${req}": consumer expects ${want}, emitter provides ${have}`;
    }
  }
  return null;
}

/**
 * Resolve a project graph into concrete wires, deterministically and with
 * zero AI involvement.
 *
 * Routing, in precedence order:
 *  1. Explicit user wires win (validated strictly).
 *  2. Semantic match: the event name matches exactly one other block's
 *     consumed port → auto-wire to that block (payload-checked).
 *  3. Convention fallback: no consumer declares the event → route to the
 *     next screen in flow order (the M0 behavior, kept for navigation).
 *  4. Terminal: last screen with no consumer → note, not an error.
 *
 * Multiple consumers (or multiple explicit targets) for one event is
 * ambiguous and fails loudly. Payload mismatches fail loudly.
 */
export function resolveGraph(
  input: GraphInput,
  registry: BlockRegistry,
): WiringResult & { instances: ResolvedInstance[] } {
  const graph = legacyGraph(input);
  validateProjectGraph(graph);

  const report: WiringReport = {
    resolved: [],
    unmet: [],
    ambiguous: [],
    unmetRequirements: [],
    warnings: [],
    notes: [],
    flow: { entry: '', screens: [], reachable: [], unreachable: [] },
  };

  // --- index screens and instances -----------------------------------------
  const screenOrder = graph.screens.map((s) => s.id);
  const screenById = new Map(graph.screens.map((s) => [s.id, s]));
  const instanceById = new Map(graph.blocks.map((b) => [b.id, b]));

  if (screenById.size !== graph.screens.length) {
    throw new WiringError('Duplicate screen ids in project graph.');
  }
  if (instanceById.size !== graph.blocks.length) {
    throw new WiringError('Duplicate block instance ids in project graph.');
  }

  const instances: ResolvedInstance[] = [];
  const placement = new Set<string>();
  for (const screen of graph.screens) {
    if (screen.blocks && !screen.blocks.includes(screen.block)) {
      throw new WiringError(`Page "${screen.id}" must include its primary block in blocks.`);
    }
    for (const blockId of pageBlockIds(screen)) {
      if (placement.has(blockId))
        throw new WiringError(
          `Block "${blockId}" is placed more than once. Duplicate the block to reuse it.`,
        );
      placement.add(blockId);
      const inst = instanceById.get(blockId);
      if (!inst) {
        throw new WiringError(
          `Screen "${screen.id}" references unknown block instance "${blockId}".`,
        );
      }
      const { manifest } = registry.get(inst.type);
      const variant = inst.variant ?? manifest.defaultVariant ?? manifest.variants[0];
      if (variant === undefined || !manifest.variants.includes(variant)) {
        throw new WiringError(
          `Block instance "${inst.id}" requests unknown variant "${inst.variant}". ` +
            `Available: ${manifest.variants.join(', ')}.`,
        );
      }
      const config = { ...(manifest.defaultConfig ?? {}), ...(inst.config ?? {}) };
      const issues = validateBlockConfig(manifest, config);
      if (issues.length > 0) {
        throw new WiringError(
          `Block instance "${inst.id}" has invalid config:\n` +
            issues.map((i) => `  ${i.path}: ${i.message}`).join('\n'),
        );
      }
      instances.push({
        id: inst.id,
        manifest,
        variant,
        config,
        screenId: screen.id,
        emits: [
          ...normalizeEmits(manifest.ports.emits),
          ...[
            ...new Set([
              ...(inst.design?.content ?? []).filter((e) => e.type === 'button').map((e) => e.id),
              ...Object.keys(inst.design?.actions ?? {}),
            ]),
          ].map((id) => ({ event: elementEvent(id) })),
        ],
        consumes: normalizeConsumes(manifest.ports.consumes),
      });
    }
  }
  const instanceByInstanceId = new Map(instances.map((i) => [i.id, i]));

  // Instances that exist but are placed on no screen are ignored by the
  // compiler. Note it loudly rather than failing: the library is the palette,
  // the screens are the painting.
  const placed = new Set(graph.screens.flatMap(pageBlockIds));
  for (const b of graph.blocks) {
    if (!placed.has(b.id)) {
      report.notes.push(
        `Block instance "${b.id}" is placed on no screen and will not be compiled.`,
      );
    }
  }

  // --- requires / provides ---------------------------------------------------
  const provided = new Set<string>(PLATFORM_ENTITIES);
  for (const inst of instances) {
    for (const p of inst.manifest.ports.provides ?? []) provided.add(p.entity);
  }
  for (const inst of instances) {
    for (const req of inst.manifest.ports.requires ?? []) {
      if (provided.has(req.entity)) continue;
      if (req.optional) {
        report.warnings.push(
          `Block "${inst.id}" wants optional service "${req.entity}" which is not provided; ` +
            `using the built-in M0 fallback.`,
        );
      } else {
        report.unmetRequirements.push({ instance: inst.id, entity: req.entity });
      }
    }
  }
  if (report.unmetRequirements.length > 0) {
    throw new WiringError(
      'Unmet block requirements:\n' +
        report.unmetRequirements.map((r) => `  ${r.instance} requires "${r.entity}"`).join('\n'),
    );
  }

  // --- consumer index: event name -> instances consuming it -------------------
  const consumerIndex = new Map<string, ResolvedInstance[]>();
  const emitterIndex = new Map<string, ResolvedInstance[]>();
  for (const inst of instances) {
    for (const c of inst.consumes) {
      const list = consumerIndex.get(c.port) ?? [];
      list.push(inst);
      consumerIndex.set(c.port, list);
    }
    for (const e of inst.emits) {
      const list = emitterIndex.get(e.event) ?? [];
      list.push(inst);
      emitterIndex.set(e.event, list);
    }
  }

  // --- event routing ---------------------------------------------------------
  const userWires = new Map<string, { screen: string; instance?: string; port?: string }[]>();
  for (const inst of graph.blocks) {
    const ids = (inst.design?.content ?? []).map((e) => e.id);
    if (new Set(ids).size !== ids.length)
      throw new WiringError(`Duplicate added element ids in block "${inst.id}".`);
    for (const [id, action] of Object.entries(inst.design?.actions ?? {})) {
      if (action.type === 'url') {
        try {
          const url = new URL(action.url);
          if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) throw new Error();
        } catch {
          throw new WiringError(`Button "${id}" needs a complete HTTP or HTTPS URL.`);
        }
      }
      if (action.type !== 'navigate') continue;
      if (!screenById.has(action.screen))
        throw new WiringError(`Button "${id}" targets unknown page "${action.screen}".`);
      userWires.set(`${inst.id}.${elementEvent(id)}`, [{ screen: action.screen }]);
    }
  }
  const explicitKeys = new Set<string>();
  for (const wire of graph.wires ?? []) {
    if (!screenById.has(wire.to.screen)) {
      throw new WiringError(
        `Wire from ${wire.from.instance}.${wire.from.event} targets unknown screen "${wire.to.screen}".`,
      );
    }
    if (!instanceById.has(wire.from.instance)) {
      throw new WiringError(
        `Wire targets screen "${wire.to.screen}" from unknown block instance "${wire.from.instance}".`,
      );
    }
    const source = instanceByInstanceId.get(wire.from.instance);
    if (!source?.emits.some((e) => e.event === wire.from.event)) {
      throw new WiringError(`Block "${wire.from.instance}" does not emit "${wire.from.event}".`);
    }
    const key = `${wire.from.instance}.${wire.from.event}`;
    const list = explicitKeys.has(key) ? (userWires.get(key) ?? []) : [];
    explicitKeys.add(key);
    list.push({ screen: wire.to.screen, instance: wire.to.instance, port: wire.to.port });
    userWires.set(key, list);
  }

  let wireSeq = 0;
  const nextWireId = () => `w${++wireSeq}`;

  /** Resolve the semantic consumer for an explicit wire target. */
  function resolveExplicitConsumer(
    key: string,
    ep: EventPort,
    target: { screen: string; instance?: string; port?: string },
  ): { consumer?: ResolvedInstance; port?: ConsumePort } {
    if (target.instance !== undefined) {
      const consumer = instanceByInstanceId.get(target.instance);
      if (!consumer) {
        throw new WiringError(`Wire ${key} targets unknown block instance "${target.instance}".`);
      }
      if (consumer.screenId !== target.screen) {
        throw new WiringError(
          `Wire ${key} targets instance "${target.instance}" on screen "${consumer.screenId}", ` +
            `not "${target.screen}".`,
        );
      }
      const portName = target.port ?? ep.event;
      const port = consumer.consumes.find((c) => c.port === portName);
      if (!port) {
        throw new WiringError(
          `Wire ${key} targets port "${portName}" but instance "${target.instance}" does not consume it.`,
        );
      }
      return { consumer, port };
    }
    const onScreen = instances.filter(
      (i) => i.screenId === target.screen && i.consumes.some((c) => c.port === ep.event),
    );
    if (onScreen.length > 1) {
      report.ambiguous.push({
        instance: key.split('.')[0] ?? key,
        event: ep.event,
        candidates: onScreen.map((i) => `${i.id} (screen "${target.screen}")`),
      });
      return {};
    }
    if (onScreen.length === 1) {
      const consumer = onScreen[0] as ResolvedInstance;
      return { consumer, port: consumer.consumes.find((c) => c.port === ep.event) };
    }
    return {};
  }

  for (const inst of instances) {
    for (const ep of inst.emits) {
      const key = `${inst.id}.${ep.event}`;
      const design = instanceById.get(inst.id)?.design;
      const builtInEvents = normalizeEmits(inst.manifest.ports.emits);
      const overridden =
        (design?.actions?.button && ep.event === builtInEvents[0]?.event) ||
        (design?.actions?.secondaryButton && ep.event === builtInEvents[1]?.event);
      if (overridden || design?.disconnectedEvents?.includes(ep.event)) {
        report.notes.push(`Connection ${key} was cut by the user.`);
        continue;
      }
      const explicit = userWires.get(key) ?? [];

      if (explicit.length > 1) {
        report.ambiguous.push({
          instance: inst.id,
          event: ep.event,
          candidates: explicit.map((e) => e.screen),
        });
        continue;
      }

      if (explicit.length === 1) {
        const target = explicit[0] as { screen: string; instance?: string; port?: string };
        const { consumer, port } = resolveExplicitConsumer(key, ep, target);
        if (report.ambiguous.length > 0) continue;
        if (consumer && port) {
          const issue = checkPayload(ep, port);
          if (issue) {
            throw new WiringError(`Wire ${key} -> ${consumer.id}.${port.port}: ${issue}.`);
          }
        }
        report.resolved.push({
          id: nextWireId(),
          from: { instance: inst.id, event: ep.event },
          to: { screen: target.screen, instance: consumer?.id, port: port?.port },
          origin: 'user',
          reason:
            consumer && port
              ? `explicit wire to ${consumer.id}.${port.port}`
              : 'explicit wire in project graph',
        });
        continue;
      }

      // No explicit wire: semantic match, then convention fallback.
      if (ep.event.startsWith('element.')) continue;
      const candidates = (consumerIndex.get(ep.event) ?? []).filter((c) => c.id !== inst.id);
      const local = candidates.filter((c) => c.screenId === inst.screenId);
      const consumers = local.length > 0 ? local : candidates;
      if (consumers.length === 1) {
        const consumer = consumers[0] as ResolvedInstance;
        const port = consumer.consumes.find((c) => c.port === ep.event) as ConsumePort;
        const issue = checkPayload(ep, port);
        if (issue) {
          throw new WiringError(`Auto-wire ${key} -> ${consumer.id}.${port.port}: ${issue}.`);
        }
        report.resolved.push({
          id: nextWireId(),
          from: { instance: inst.id, event: ep.event },
          to: { screen: consumer.screenId, instance: consumer.id, port: port.port },
          origin: 'auto',
          reason: `semantic: "${consumer.id}" consumes "${ep.event}"`,
        });
      } else if (consumers.length > 1) {
        report.ambiguous.push({
          instance: inst.id,
          event: ep.event,
          candidates: consumers.map((c) => `${c.id} (screen "${c.screenId}")`),
        });
      } else {
        const nextScreen = screenOrder[screenOrder.indexOf(inst.screenId) + 1];
        if (nextScreen !== undefined) {
          report.resolved.push({
            id: nextWireId(),
            from: { instance: inst.id, event: ep.event },
            to: { screen: nextScreen },
            origin: 'auto',
            reason: `convention: no block consumes "${ep.event}"; routes to next screen ("${nextScreen}")`,
          });
        } else {
          report.notes.push(
            `Event "${ep.event}" on "${inst.id}" is terminal (last screen) and intentionally routes nowhere.`,
          );
        }
      }
    }
  }

  if (report.ambiguous.length > 0) {
    throw new WiringError(
      'Ambiguous wires (same event routed to multiple screens):\n' +
        report.ambiguous
          .map((a) => `  ${a.instance}.${a.event} -> ${a.candidates.join(', ')}`)
          .join('\n'),
    );
  }

  // --- consumes --------------------------------------------------------------
  for (const inst of instances) {
    for (const c of inst.consumes) {
      const convention = CONVENTION_CONSUMES[c.port];
      if (convention) {
        report.notes.push(`Consume port "${c.port}" on "${inst.id}": ${convention}.`);
      } else if (!(emitterIndex.get(c.port) ?? []).some((e) => e.id !== inst.id)) {
        // A named event port with no emitter anywhere: it simply never fires.
        // Not an error — the block just never receives this event.
        report.notes.push(
          `Consume port "${c.port}" on "${inst.id}" has no emitter in this graph; it will never fire.`,
        );
      }
    }
  }
  if (report.unmet.length > 0) {
    throw new WiringError(
      'Unmet wires:\n' + report.unmet.map((u) => `  ${u.instance}: ${u.reason}`).join('\n'),
    );
  }

  // --- flow analysis (Flow Lanes) --------------------------------------------
  const screenOfInstance = new Map(instances.map((i) => [i.id, i.screenId]));
  const adjacency = new Map<string, Set<string>>();
  for (const w of report.resolved) {
    const fromScreen = screenOfInstance.get(w.from.instance);
    if (fromScreen === undefined) continue;
    const set = adjacency.get(fromScreen) ?? new Set<string>();
    set.add(w.to.screen);
    adjacency.set(fromScreen, set);
  }
  const entry = screenOrder[0] as string;
  const reachable: string[] = [];
  // Navigation lanes and cloud account gates are independent entry points.
  const roots = [
    entry,
    ...graph.screens
      .filter(
        (s) =>
          (s.lane ?? 'main') !== 'main' ||
          (graph.app.cloud &&
            graph.blocks.some(
              (b) =>
                (s.block === b.id || s.blocks?.includes(b.id)) &&
                /^(auth.account|onboarding.profile)@/.test(b.type),
            )),
      )
      .map((s) => s.id),
  ];
  const seen = new Set<string>(roots);
  const queue = [...seen];
  while (queue.length > 0) {
    const cur = queue.shift() as string;
    reachable.push(cur);
    for (const next of adjacency.get(cur) ?? []) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  // Screens in a non-"main" lane (e.g. "tabs") are reachable outside the
  // event flow — tab bar, drawer, deep link — so they are not flagged.
  const laneOf = new Map(graph.screens.map((s) => [s.id, s.lane ?? 'main']));
  const unreachable = screenOrder.filter((s) => !seen.has(s) && laneOf.get(s) === 'main');
  const laneScreens = graph.screens.filter((s) => (s.lane ?? 'main') !== 'main').map((s) => s.id);
  report.flow = {
    entry,
    screens: graph.screens.map((s) => ({ id: s.id, title: s.title, block: s.block })),
    reachable,
    unreachable,
  };
  for (const s of unreachable) {
    report.warnings.push(
      `Screen "${s}" is not reachable from the entry screen ("${entry}"); it will still be compiled.`,
    );
  }
  if (laneScreens.length > 0) {
    report.flow.lanes = [...new Set(graph.screens.map((s) => s.lane ?? 'main'))];
  }

  const wires: Wire[] = report.resolved;
  return { wires, report, instances };
}

/** Public wiring-only view; compiler front-ends also consume the resolved instances. */
export function resolveWiring(input: GraphInput, registry: BlockRegistry): WiringResult {
  const resolved = resolveGraph(input, registry);
  return { wires: resolved.wires, report: resolved.report };
}

/** Map each block instance to the screen its primary event navigates to. */
export function navigationTargets(result: WiringResult): Map<string, string> {
  const targets = new Map<string, string>();
  for (const wire of result.wires) {
    if (wire.from.event.startsWith('element.')) continue;
    if (!targets.has(wire.from.instance)) {
      targets.set(wire.from.instance, wire.to.screen);
    }
  }
  return targets;
}

export type { BlockManifest, ProjectGraph };
export { parseBlockType };
