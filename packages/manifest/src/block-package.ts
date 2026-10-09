import type { BlockManifest, JsonSchema } from './types.js';

export type BlockTarget = 'web' | 'ios' | 'android' | 'server';
export interface BlockPackage extends Omit<BlockManifest, 'slots'> {
  formatVersion: 2;
  targets: BlockTarget[];
  license: string;
  stability: 'experimental' | 'beta' | 'stable';
  requires: {
    services: string[];
    entities: Record<string, JsonSchema>;
    blocks: string[];
    env: string[];
  };
  provides: {
    entities: string[];
    routes: string[];
    flowSteps: string[];
    events: string[];
    slots: string[];
  };
  slots: Record<string, { categories: string[] }>;
  bindings: string[];
  designTokens: string[];
  permissions: { reads: string[]; writes: string[] };
  dependencies: Record<string, string>;
  implementations: Partial<
    Record<BlockTarget, { entry: string; export: string } | { adapter: 'legacy-template' }>
  >;
  files: { path: string; target: string; platforms: BlockTarget[] }[];
}
