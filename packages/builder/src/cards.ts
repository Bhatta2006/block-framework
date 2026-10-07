import { loadDefaultRegistry } from '@blockfw/blocks';
import type { BlockManifest } from '@blockfw/manifest';

/**
 * Block Cards (M2).
 *
 * A block card is a ≤300-token deterministic summary of a block, generated
 * from its manifest. Cards are the compact representation the M3 agent will
 * read instead of full manifests — small enough to fit many blocks in
 * context, complete enough to wire and configure them.
 *
 * Token estimate: ceil(chars / 4), labeled as an estimate everywhere it is
 * surfaced. The ≤300 assertion uses the estimate, not a model tokenizer.
 */

/** One-line purpose statements, curated per block (the only hand-written part). */
const SUMMARIES: Record<string, string> = {
  'auth.email': 'Email sign-in / sign-up screen with validation and a mock auth service.',
  'onboarding.quiz': 'Multi-step question flow that collects answers and emits them on completion.',
  'paywall.basic': 'Subscription paywall with product cards and a mock billing service.',
  'home.list': 'Scrollable item list; tapping an item emits the selected item.',
  'content.detail': 'Detail screen that renders an item routed from a list.',
  'stats.overview': 'Row or grid of stat cards (label, value, optional delta).',
  'profile.card': 'Profile header with name, handle, bio, and stats.',
  'settings.list': 'Grouped settings sections with toggle and link rows.',
};

export interface BlockCard {
  block: string;
  markdown: string;
  /** Estimated tokens (chars/4, rounded up). */
  estimatedTokens: number;
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function schemaSummary(schema: Record<string, unknown>, depth = 0): string {
  if (depth > 2 || schema === null || typeof schema !== 'object') return '';
  const s = schema as Record<string, unknown>;
  if (s['type'] === 'object' && s['properties'] && typeof s['properties'] === 'object') {
    const required = Array.isArray(s['required']) ? (s['required'] as string[]) : [];
    const props = Object.entries(s['properties'] as Record<string, unknown>).map(([k, v]) => {
      const vv = v as Record<string, unknown>;
      const t = typeof vv['type'] === 'string' ? (vv['type'] as string) : 'any';
      const req = required.includes(k) ? '*' : '';
      const en = Array.isArray(vv['enum']) ? ` (${(vv['enum'] as unknown[]).join('|')})` : '';
      return `${k}${req}:${t}${en}`;
    });
    return `{${props.join(', ')}}`;
  }
  if (s['type'] === 'array') {
    const items = schemaSummary((s['items'] ?? {}) as Record<string, unknown>, depth + 1);
    return items ? `array<${items}>` : 'array';
  }
  return typeof s['type'] === 'string' ? (s['type'] as string) : 'any';
}

function portLines(manifest: BlockManifest): { emits: string; consumes: string } {
  const ports = manifest.ports as unknown as {
    emits?: Array<string | { event: string; payload?: unknown }>;
    consumes?: Array<string | { port: string }>;
  };
  const emits = (ports.emits ?? []).map((e) =>
    typeof e === 'string'
      ? e
      : `${e.event} ${schemaSummary((e.payload ?? {}) as Record<string, unknown>)}`,
  );
  const consumes = (ports.consumes ?? []).map((c) => (typeof c === 'string' ? c : c.port));
  return {
    emits: emits.length > 0 ? emits.join('; ') : '—',
    consumes: consumes.length > 0 ? consumes.join(', ') : '—',
  };
}

export function generateCard(manifest: BlockManifest): BlockCard {
  const id = `${manifest.id}@${manifest.version}`;
  const summary = SUMMARIES[manifest.id] ?? `${manifest.category} block.`;
  const variants = manifest.variants.map((v) =>
    v === manifest.defaultVariant ? `${v} (default)` : v,
  );
  const config = schemaSummary(manifest.config as unknown as Record<string, unknown>);
  const { emits, consumes } = portLines(manifest);
  const editSurface = (manifest.editSurface ?? []).join(', ') || '—';
  const locked = (manifest.locked ?? []).join(', ') || '—';

  const markdown = [
    `# ${id}`,
    `${summary}`,
    ``,
    `- Variants: ${variants.join(', ')}`,
    `- Config: ${config}`,
    `- Emits: ${emits}`,
    `- Consumes: ${consumes}`,
    `- Edit surface: ${editSurface}`,
    `- Locked: ${locked}`,
  ].join('\n');

  return { block: id, markdown, estimatedTokens: estimateTokens(markdown) };
}

/** Generate cards for every block in the default registry, sorted by block id. */
export function generateAllCards(): BlockCard[] {
  const registry = loadDefaultRegistry();
  return registry
    .entries()
    .map((e) => generateCard(e.manifest))
    .sort((a, b) => (a.block < b.block ? -1 : 1));
}

/** Assert every card is within the token budget. Throws listing offenders. */
export function assertCardsWithinBudget(cards: BlockCard[], budget = 300): void {
  const over = cards.filter((c) => c.estimatedTokens > budget);
  if (over.length > 0) {
    throw new Error(
      `Block cards over the ${budget}-token budget: ${over.map((c) => `${c.block} (${c.estimatedTokens})`).join(', ')}`,
    );
  }
}
