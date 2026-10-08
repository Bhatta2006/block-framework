/**
 * TypeScript mirrors of the v0 JSON Schemas.
 * The schemas are authoritative; these types must stay in sync with them.
 */

export interface PortProvides {
  entity: string;
  type?: string;
}

export interface PortRequires {
  entity: string;
  optional?: boolean;
}

/** Minimal JSON Schema shape for event payloads. */
export interface JsonSchema {
  type?: 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean' | 'null';
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  additionalProperties?: boolean;
  [key: string]: unknown;
}

/**
 * An event a block emits. String form is the M0 shorthand (payload unknown).
 * Object form declares the payload shape so the wiring engine can check
 * compatibility with consumers.
 */
export type EmitDecl = string | { event: string; payload?: JsonSchema };

/**
 * An event a block consumes. String form is the M0 shorthand.
 * Object form declares the accepted shape for payload checking.
 */
export type ConsumeDecl = string | { port: string; accepts?: JsonSchema };

export interface EventPort {
  event: string;
  payload?: JsonSchema;
}

export interface ConsumePort {
  port: string;
  accepts?: JsonSchema;
}

export interface BlockPorts {
  emits: EmitDecl[];
  consumes: ConsumeDecl[];
  provides?: PortProvides[];
  requires?: PortRequires[];
}

/** Normalize an emits declaration to object form. */
export function normalizeEmits(emits: EmitDecl[]): EventPort[] {
  return emits.map((e) => (typeof e === 'string' ? { event: e } : e));
}

/** Normalize a consumes declaration to object form. */
export function normalizeConsumes(consumes: ConsumeDecl[]): ConsumePort[] {
  return consumes.map((c) => (typeof c === 'string' ? { port: c } : c));
}

export interface BlockManifest {
  id: string;
  version: string;
  category: string;
  variants: string[];
  defaultVariant?: string;
  /** JSON Schema for the block's user-editable config. */
  config: Record<string, unknown>;
  defaultConfig?: Record<string, unknown>;
  ports: BlockPorts;
  slots?: Record<string, unknown>;
  backend?: { tables?: unknown[]; routes?: unknown[] };
  editSurface: string[];
  locked: string[];
}

export interface AppTheme {
  primaryColor?: string;
  backgroundColor?: string;
  textColor?: string;
}

export interface AppMeta {
  /** Public service connection only; credentials belong to the exported backend environment. */
  cloud?: { provider: 'supabase'; backendUrl?: string };
  dataId?: string;
  layout?: 'standard' | 'notes';
  name: string;
  slug: string;
  version: string;
  theme?: AppTheme;
}

export interface GraphScreen {
  navigation?: boolean;
  id: string;
  /** Block instance id rendered on this screen. */
  block: string;
  /** Ordered page composition. Omitted for legacy single-block pages. */
  blocks?: string[];
  layout?: 'stack' | 'grid' | 'split';
  /** Incoming layout guides cut by the user; blocks still render in page order. */
  disconnectedLayout?: string[];
  position?: { x: number; y: number };
  title: string;
  /**
   * Flow lane. Screens in the default "main" lane are reached via event
   * wires; screens in other lanes (e.g. "tabs") are reachable outside the
   * event flow and are excluded from reachability warnings.
   */
  lane?: string;
}

export interface GraphBlock {
  design?: import('./design.js').BlockDesign;
  id: string;
  /** Block type reference as `id@semver`, e.g. `onboarding.quiz@1.0.0`. */
  type: string;
  variant?: string;
  config?: Record<string, unknown>;
  /** Position on the page's workflow canvas; independent of rendered layout. */
  position?: { x: number; y: number };
}

export function pageBlockIds(screen: GraphScreen): string[] {
  return screen.blocks ?? [screen.block];
}

export interface GraphWire {
  from: { instance: string; event: string };
  to: {
    screen: string;
    /** Semantic consumer: the block instance that handles the event. */
    instance?: string;
    /** The consumer's port (defaults to the event name). */
    port?: string;
  };
}

export interface ProjectGraph {
  schemaVersion: '0';
  app: AppMeta;
  screens: GraphScreen[];
  blocks: GraphBlock[];
  wires?: GraphWire[];
}

/** Parse an `id@semver` block type reference. */
export function parseBlockType(ref: string): { id: string; version: string } {
  const at = ref.lastIndexOf('@');
  if (at <= 0) throw new Error(`Invalid block type reference: ${ref}`);
  return { id: ref.slice(0, at), version: ref.slice(at + 1) };
}
