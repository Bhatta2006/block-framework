import {
  parseBlockType,
  validateBlockConfig,
  validateProjectGraph,
  type BlockManifest,
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

interface ResolvedInstance {
  id: string;
  manifest: BlockManifest;
  variant: string;
  config: Record<string, unknown>;
  screenId: string;
}

/**
 * Resolve a project graph into concrete wires, deterministically and with
 * zero AI involvement.
 *
 * Steps:
 *  1. Validate the graph schema.
 *  2. Resolve every block instance against the registry; validate its
 *     config against the block's own config schema.
 *  3. Check requires/provides (platform entities + optional-service warnings).
 *  4. Route events: explicit user wires win; otherwise an event emitted on a
 *     non-last screen auto-wires to the next screen; events on the last
 *     screen are terminal and intentionally go nowhere.
 *  5. Check consumes against the convention table.
 *
 * Any unmet wire, ambiguous wire, or unmet non-optional requirement throws.
 */
export function resolveWiring(graph: ProjectGraph, registry: BlockRegistry): WiringResult {
  validateProjectGraph(graph);

  const report: WiringReport = {
    resolved: [],
    unmet: [],
    ambiguous: [],
    unmetRequirements: [],
    warnings: [],
    notes: [],
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
  for (const screen of graph.screens) {
    const inst = instanceById.get(screen.block);
    if (!inst) {
      throw new WiringError(
        `Screen "${screen.id}" references unknown block instance "${screen.block}".`,
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
    instances.push({ id: inst.id, manifest, variant, config, screenId: screen.id });
  }

  // Instances that exist but are placed on no screen are ignored by the
  // compiler. Note it loudly rather than failing: the library is the palette,
  // the screens are the painting.
  const placed = new Set(graph.screens.map((s) => s.block));
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

  // --- event routing ---------------------------------------------------------
  const userWires = new Map<string, { screen: string }[]>();
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
    const key = `${wire.from.instance}.${wire.from.event}`;
    const list = userWires.get(key) ?? [];
    list.push({ screen: wire.to.screen });
    userWires.set(key, list);
  }

  let wireSeq = 0;
  const nextWireId = () => `w${++wireSeq}`;

  for (const inst of instances) {
    for (const event of inst.manifest.ports.emits) {
      const key = `${inst.id}.${event}`;
      const explicit = userWires.get(key) ?? [];

      if (explicit.length > 1) {
        report.ambiguous.push({
          instance: inst.id,
          event,
          candidates: explicit.map((e) => e.screen),
        });
        continue;
      }
      const explicitTarget = explicit.length === 1 ? explicit[0]?.screen : undefined;
      const nextScreen = screenOrder[screenOrder.indexOf(inst.screenId) + 1];

      if (explicitTarget !== undefined) {
        report.resolved.push({
          id: nextWireId(),
          from: { instance: inst.id, event },
          to: { screen: explicitTarget },
          origin: 'user',
          reason: 'explicit wire in project graph',
        });
      } else if (nextScreen !== undefined) {
        report.resolved.push({
          id: nextWireId(),
          from: { instance: inst.id, event },
          to: { screen: nextScreen },
          origin: 'auto',
          reason: `convention: event on non-terminal screen routes to next screen ("${nextScreen}")`,
        });
      } else {
        report.notes.push(
          `Event "${event}" on "${inst.id}" is terminal (last screen) and intentionally routes nowhere.`,
        );
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
    for (const port of inst.manifest.ports.consumes) {
      const convention = CONVENTION_CONSUMES[port];
      if (convention) {
        report.notes.push(`Consume port "${port}" on "${inst.id}": ${convention}.`);
      } else {
        report.unmet.push({
          instance: inst.id,
          event: port,
          reason: `no convention or wire satisfies consumed port "${port}"`,
        });
      }
    }
  }
  if (report.unmet.length > 0) {
    throw new WiringError(
      'Unmet wires:\n' + report.unmet.map((u) => `  ${u.instance}: ${u.reason}`).join('\n'),
    );
  }

  const wires: Wire[] = report.resolved;
  return { wires, report };
}

/**
 * Map each block instance to its navigation target: the screen its
 * onComplete prop navigates to. When an instance emits several events routed
 * to different screens, the first emitted event wins (deterministic).
 */
export function navigationTargets(result: WiringResult): Map<string, string> {
  const targets = new Map<string, string>();
  for (const wire of result.wires) {
    if (!targets.has(wire.from.instance)) {
      targets.set(wire.from.instance, wire.to.screen);
    }
  }
  return targets;
}

export type { BlockManifest, ProjectGraph };
export { parseBlockType };
