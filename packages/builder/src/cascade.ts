import { legacyGraph, type GraphInput, type ProjectGraph } from '@blockfw/manifest';

/**
 * Profile Cascade (M2).
 *
 * Six questions produce a BuilderProfile. Derivation rules map the profile
 * onto the project graph (app fields, block configs, theme). Every rule
 * writes to a tracked path; when the user edits a path in the builder UI,
 * that path is marked "touched" and the cascade will never overwrite it
 * again. User edits always win over derived values.
 */

/** The six profile questions. */
export interface BuilderProfile {
  /** e.g. "HabitFlow" */
  appName: string;
  /** e.g. "busy professionals" */
  audience: string;
  /** "playful" | "professional" | "minimal" (free text allowed, matched loosely) */
  tone: string;
  /** hex, e.g. "#4F46E5" */
  brandColor: string;
  /** e.g. "4.99" */
  price: string;
  /** ISO code, e.g. "USD" */
  currency: string;
}

export const PROFILE_QUESTIONS: Array<{
  key: keyof BuilderProfile;
  label: string;
  placeholder: string;
  kind: 'text' | 'color' | 'select';
  options?: string[];
}> = [
  { key: 'appName', label: 'What is your app called?', placeholder: 'HabitFlow', kind: 'text' },
  { key: 'audience', label: 'Who is it for?', placeholder: 'busy professionals', kind: 'text' },
  {
    key: 'tone',
    label: 'What tone should the copy use?',
    placeholder: 'playful',
    kind: 'select',
    options: ['playful', 'professional', 'minimal'],
  },
  { key: 'brandColor', label: 'Pick a brand color', placeholder: '#4F46E5', kind: 'color' },
  { key: 'price', label: 'Monthly price (numbers only)', placeholder: '4.99', kind: 'text' },
  {
    key: 'currency',
    label: 'Currency',
    placeholder: 'USD',
    kind: 'select',
    options: ['USD', 'EUR', 'GBP', 'INR'],
  },
];

/** A builder project: the graph plus profile state. Saved as one local file. */
export interface BuilderProject {
  version: 1;
  profile: BuilderProfile | null;
  /** Paths the user edited by hand; the cascade never overwrites these. Sorted. */
  touched: string[];
  graph: ProjectGraph;
}

export function emptyProject(graph: GraphInput): BuilderProject {
  return {
    version: 1,
    profile: null,
    touched: [],
    graph: legacyGraph(graph),
  };
}

/** Path grammar: `app.name`, `app.theme.primaryColor`, `block:<id>.config.a.b.0.c`, `block:<id>.variant`. */
export type CascadePath = string;

interface DerivationRule {
  path: CascadePath;
  derive: (profile: BuilderProfile, graph: ProjectGraph) => unknown;
  /** Which block types this rule applies to (for block: paths). Undefined = all. */
  blockTypes?: string[];
}

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'my-app'
  );
}

const CURRENCY_SYMBOLS: Record<string, string> = { USD: '$', EUR: '€', GBP: '£', INR: '₹' };

function formatPrice(price: string, currency: string): string {
  const symbol = CURRENCY_SYMBOLS[currency.toUpperCase()] ?? `${currency.toUpperCase()} `;
  const amount = price.trim() || '0';
  return `${symbol}${amount}`;
}

function toneKey(tone: string): 'playful' | 'professional' | 'minimal' {
  const t = tone.toLowerCase();
  if (t.includes('play')) return 'playful';
  if (t.includes('prof') || t.includes('formal') || t.includes('business')) return 'professional';
  return 'minimal';
}

const TONE_COPY = {
  playful: { headline: 'Supercharge your {app}', cta: "Let's go!" },
  professional: { headline: '{app} Premium', cta: 'Subscribe now' },
  minimal: { headline: 'Premium', cta: 'Continue' },
} as const;

function fill(template: string, profile: BuilderProfile): string {
  return template.replaceAll('{app}', profile.appName);
}

/** All derivation rules, in deterministic order. */
const RULES: DerivationRule[] = [
  { path: 'app.name', derive: (p) => p.appName },
  { path: 'app.slug', derive: (p) => slugify(p.appName) },
  { path: 'app.theme.primaryColor', derive: (p) => p.brandColor },
  {
    path: 'block:*.config.headline',
    blockTypes: ['paywall.basic'],
    derive: (p) => fill(TONE_COPY[toneKey(p.tone)].headline, p),
  },
  {
    path: 'block:*.config.subheadline',
    blockTypes: ['paywall.basic'],
    derive: (p) => `Built for ${p.audience}. Cancel anytime.`,
  },
  {
    path: 'block:*.config.ctaText',
    blockTypes: ['paywall.basic'],
    derive: (p) => TONE_COPY[toneKey(p.tone)].cta,
  },
  {
    path: 'block:*.config.products.0.price',
    blockTypes: ['paywall.basic'],
    derive: (p) => formatPrice(p.price, p.currency),
  },
  {
    path: 'block:*.config.headline',
    blockTypes: ['auth.email'],
    derive: (p) => `Welcome to ${p.appName}`,
  },
  {
    path: 'block:*.config.subheadline',
    blockTypes: ['auth.email'],
    derive: (p) => `Sign in to continue as ${p.audience}.`,
  },
];

/** Set a value at a dot path, creating intermediate objects/arrays. */
function setPath(root: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.');
  let node: Record<string, unknown> = root;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i] as string;
    const next = parts[i + 1] as string;
    const wantArray = /^\d+$/.test(next);
    if (node[part] === undefined || node[part] === null || typeof node[part] !== 'object') {
      node[part] = wantArray ? [] : {};
    }
    node = node[part] as Record<string, unknown>;
  }
  node[parts[parts.length - 1] as string] = value;
}

function baseType(typeRef: string): string {
  return typeRef.split('@')[0] as string;
}

export interface CascadeResult {
  applied: string[];
  skippedTouched: string[];
}

/**
 * Apply the profile derivation rules to the project. Paths in
 * `project.touched` are never overwritten. Returns what changed.
 * Deterministic: rules run in fixed order, touched stays sorted.
 */
export function applyCascade(project: BuilderProject): CascadeResult {
  const profile = project.profile;
  if (!profile) throw new Error('Cannot apply cascade: no profile set.');
  const touched = new Set(project.touched);
  const applied: string[] = [];
  const skippedTouched: string[] = [];

  for (const rule of RULES) {
    if (rule.path.startsWith('block:*.')) {
      const suffix = rule.path.slice('block:*.'.length);
      for (const block of project.graph.blocks) {
        if (rule.blockTypes && !rule.blockTypes.includes(baseType(block.type))) continue;
        const path = `block:${block.id}.${suffix}`;
        if (
          [...touched].some(
            (t) => path === t || path.startsWith(t + '.') || t.startsWith(path + '.'),
          )
        ) {
          skippedTouched.push(path);
          continue;
        }
        setPath(
          block as unknown as Record<string, unknown>,
          suffix,
          rule.derive(profile, project.graph),
        );
        applied.push(path);
      }
    } else {
      if (
        [...touched].some(
          (t) => rule.path === t || rule.path.startsWith(t + '.') || t.startsWith(rule.path + '.'),
        )
      ) {
        skippedTouched.push(rule.path);
        continue;
      }
      setPath(
        project.graph as unknown as Record<string, unknown>,
        rule.path,
        rule.derive(profile, project.graph),
      );
      applied.push(rule.path);
    }
  }
  return { applied, skippedTouched };
}

/** Mark a path as user-edited. Idempotent; keeps the list sorted. */
export function markTouched(project: BuilderProject, path: CascadePath): void {
  if (!project.touched.includes(path)) {
    project.touched.push(path);
    project.touched.sort();
  }
}

/** Validate a profile; returns human-readable errors (empty = valid). */
export function validateProfile(profile: Partial<BuilderProfile>): string[] {
  const errors: string[] = [];
  if (!profile.appName?.trim()) errors.push('App name is required.');
  if (!profile.audience?.trim()) errors.push('Audience is required.');
  if (!profile.brandColor?.trim()) {
    errors.push('Brand color is required.');
  } else if (!/^#[0-9a-fA-F]{6}$/.test(profile.brandColor.trim())) {
    errors.push('Brand color must be a hex like #4F46E5.');
  }
  if (!profile.price?.trim()) {
    errors.push('Price is required.');
  } else if (!/^\d+(\.\d{1,2})?$/.test(profile.price.trim())) {
    errors.push('Price must be a number like 4.99.');
  }
  if (!profile.currency?.trim()) errors.push('Currency is required.');
  return errors;
}
