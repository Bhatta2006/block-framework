/**
 * App blueprints: the compact plan the builder agent writes instead of code.
 *
 * A blueprint names pages, the library blocks on each page, their content
 * fields, and explicit event wires. It is validated against block contracts
 * (registry, variants, editSurface, config schema, ports) and then assembled
 * into a project graph deterministically. The same blueprint always yields
 * the same graph, which is what makes recorded recipes replayable at zero
 * tokens.
 */
import { Ajv } from 'ajv';
import { loadSampleConfig, unwrapSampleConfig, type BlockRegistry } from '@blockfw/blocks';
import {
  normalizeConsumes,
  normalizeEmits,
  type GraphBlock,
  type GraphScreen,
  type GraphWire,
  type ProjectGraph,
} from '@blockfw/manifest';

const ajv = new Ajv({ allErrors: true, strict: false });

export interface BlueprintBlock {
  id: string;
  /** `id@semver`; a bare id resolves to the single registered version. */
  type: string;
  variant?: string;
  config?: Record<string, unknown>;
}
export interface BlueprintPage {
  id: string;
  title: string;
  layout?: 'stack' | 'grid' | 'split';
  navigation?: boolean;
  blocks: BlueprintBlock[];
}
export interface BlueprintWire {
  from: { block: string; event: string };
  to: { page: string; block?: string };
}
/** A capability no library block covers; input to the block-author path. */
export interface MissingCapability {
  capability: string;
  proposedBlock?: string;
  reason?: string;
}
export interface AppBlueprint {
  app?: {
    name?: string;
    theme?: { primaryColor?: string; backgroundColor?: string; textColor?: string };
  };
  pages: BlueprintPage[];
  wires?: BlueprintWire[];
  missing?: MissingCapability[];
  rationale?: string;
}

/** Extract a blueprint object from model text. Errors are returned, never thrown. */
export function parseBlueprint(text: string): { blueprint?: AppBlueprint; error?: string } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return { error: 'output is not JSON and contains no JSON object' };
    try {
      data = JSON.parse(match[0]);
    } catch {
      return { error: 'output is not valid JSON' };
    }
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data))
    return { error: 'output JSON is not an object' };
  const pages = (data as { pages?: unknown }).pages;
  if (!Array.isArray(pages)) return { error: 'output JSON has no "pages" array' };
  for (const page of pages)
    if (typeof page !== 'object' || page === null || !Array.isArray(page.blocks))
      return { error: 'every page needs a "blocks" array' };
  return { blueprint: data as AppBlueprint };
}

function resolveType(registry: BlockRegistry, type: unknown): string | undefined {
  if (typeof type !== 'string') return undefined;
  if (registry.has(type)) return type;
  const versions = registry.keys().filter((key) => key.startsWith(`${type}@`));
  return versions.length === 1 ? versions[0] : undefined;
}

function sampleConfig(blockId: string): Record<string, unknown> {
  try {
    return structuredClone(unwrapSampleConfig(loadSampleConfig(blockId)));
  } catch {
    return {};
  }
}

export interface AssembledBlueprint {
  /** Blocks and screens produced by the blueprint, ready to merge. */
  screens: GraphScreen[];
  blocks: GraphBlock[];
  wires: GraphWire[];
  errors: string[];
}

/**
 * Validate a blueprint against block contracts and assemble graph pieces.
 * `existing` lists ids already in the target graph: new ids must not collide,
 * and wires may target existing pages/blocks.
 */
export function assembleBlueprint(
  blueprint: AppBlueprint,
  registry: BlockRegistry,
  existing: { screens: GraphScreen[]; blocks: GraphBlock[] } = { screens: [], blocks: [] },
): AssembledBlueprint {
  const errors: string[] = [];
  const screens: GraphScreen[] = [];
  const blocks: GraphBlock[] = [];
  const pageIds = new Set(existing.screens.map((screen) => screen.id));
  const blockIds = new Set(existing.blocks.map((block) => block.id));
  const blockPage = new Map<string, string>();
  for (const screen of existing.screens)
    for (const id of screen.blocks ?? [screen.block]) blockPage.set(id, screen.id);
  const blockType = new Map(existing.blocks.map((block) => [block.id, block.type]));

  if (blueprint.pages.length === 0) errors.push('blueprint needs at least one page');
  blueprint.pages.forEach((page, pageIndex) => {
    const where = `page "${String(page.id)}"`;
    if (pageIds.has(page.id)) errors.push(`${where}: id already exists`);
    pageIds.add(page.id);
    if (typeof page.title !== 'string' || !page.title.trim())
      errors.push(`${where}: title is required`);
    if (page.blocks.length === 0) errors.push(`${where}: needs at least one block`);
    for (const item of page.blocks) {
      const at = `${where} block "${String(item.id)}"`;
      if (blockIds.has(item.id)) errors.push(`${at}: id already exists`);
      blockIds.add(item.id);
      blockPage.set(item.id, page.id);
      const type = resolveType(registry, item.type);
      if (!type) {
        errors.push(
          `${at}: unknown block type ${JSON.stringify(item.type)}; use a library block or list it under "missing"`,
        );
        continue;
      }
      blockType.set(item.id, type);
      const manifest = registry.get(type).manifest;
      if (item.variant !== undefined && !manifest.variants.includes(item.variant))
        errors.push(`${at}: unknown variant "${item.variant}" (${manifest.variants.join(', ')})`);
      const config = sampleConfig(manifest.id);
      const properties = ((manifest.config as { properties?: Record<string, object> }).properties ??
        {}) as Record<string, object>;
      for (const [key, value] of Object.entries(item.config ?? {})) {
        if (!manifest.editSurface.includes(`config.${key}`)) {
          errors.push(
            `${at}: "config.${key}" is not editable (${manifest.editSurface.join(', ') || 'none'})`,
          );
          continue;
        }
        const schema = properties[key];
        if (schema) {
          const validate = ajv.compile(schema);
          if (!validate(value)) {
            errors.push(`${at}: config.${key} ${ajv.errorsText(validate.errors)}`);
            continue;
          }
        }
        config[key] = value;
      }
      const validateAll = ajv.compile(manifest.config);
      if (!validateAll(config))
        errors.push(`${at}: config fails the block schema (${ajv.errorsText(validateAll.errors)})`);
      blocks.push({
        id: item.id,
        type,
        ...(item.variant !== undefined ? { variant: item.variant } : {}),
        config,
      });
    }
    const ids = page.blocks.map((item) => item.id);
    screens.push({
      id: page.id,
      title: page.title,
      block: ids[0] ?? '',
      ...(ids.length > 1 ? { blocks: ids } : {}),
      ...(page.layout && page.layout !== 'stack' ? { layout: page.layout } : {}),
      ...(page.navigation === false ? { navigation: false } : {}),
      position: { x: 80 + (existing.screens.length + pageIndex) * 320, y: 120 },
    });
  });

  const wires: GraphWire[] = [];
  for (const wire of blueprint.wires ?? []) {
    const from = wire?.from?.block;
    const event = wire?.from?.event;
    const label = `wire ${String(from)}.${String(event)}`;
    const type = blockType.get(from);
    if (!type) {
      errors.push(`${label}: unknown source block`);
      continue;
    }
    const emits = normalizeEmits(registry.get(type).manifest.ports.emits).map((e) => e.event);
    if (!emits.includes(event)) {
      errors.push(`${label}: block emits ${emits.join(', ') || 'nothing'}`);
      continue;
    }
    if (!pageIds.has(wire.to?.page)) {
      errors.push(`${label}: unknown target page "${String(wire.to?.page)}"`);
      continue;
    }
    const target = wire.to.block;
    if (target !== undefined) {
      const targetType = blockType.get(target);
      if (!targetType || blockPage.get(target) !== wire.to.page) {
        errors.push(`${label}: block "${target}" is not on page "${wire.to.page}"`);
        continue;
      }
      const ports = normalizeConsumes(registry.get(targetType).manifest.ports.consumes);
      if (!ports.some((port) => port.port === event)) {
        errors.push(`${label}: block "${target}" does not consume ${event}`);
        continue;
      }
    }
    wires.push({
      from: { instance: from, event },
      to: { screen: wire.to.page, ...(target !== undefined ? { instance: target } : {}) },
    });
  }
  return { screens, blocks, wires, errors };
}

/** Turn an app name into a valid slug. */
export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^[^a-z]+|-+$/g, '');
  return slug || 'app';
}

/** Merge assembled pieces into a graph: replace its pages, or append to them. */
export function mergeIntoGraph(
  graph: ProjectGraph,
  blueprint: AppBlueprint,
  assembled: AssembledBlueprint,
  mode: 'new' | 'extend',
): ProjectGraph {
  const next = structuredClone(graph);
  if (mode === 'new') {
    // A new app starts clean: no cloud backend, data namespace or layout carried over.
    const name = blueprint.app?.name?.trim() || graph.app.name;
    next.app = { name, slug: slugify(name), version: '1.0.0' };
    next.screens = assembled.screens;
    next.blocks = assembled.blocks;
    if (assembled.wires.length) next.wires = assembled.wires;
    else delete next.wires;
  } else {
    next.screens.push(...assembled.screens);
    next.blocks.push(...assembled.blocks);
    if (assembled.wires.length) next.wires = [...(next.wires ?? []), ...assembled.wires];
  }
  if (blueprint.app?.theme) next.app.theme = { ...next.app.theme, ...blueprint.app.theme };
  return next;
}
