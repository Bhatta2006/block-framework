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

export interface BlockPorts {
  emits: string[];
  consumes: string[];
  provides?: PortProvides[];
  requires?: PortRequires[];
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
  name: string;
  slug: string;
  version: string;
  theme?: AppTheme;
}

export interface GraphScreen {
  id: string;
  /** Block instance id rendered on this screen. */
  block: string;
  title: string;
}

export interface GraphBlock {
  id: string;
  /** Block type reference as `id@semver`, e.g. `onboarding.quiz@1.0.0`. */
  type: string;
  variant?: string;
  config?: Record<string, unknown>;
}

export interface GraphWire {
  from: { instance: string; event: string };
  to: { screen: string };
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
