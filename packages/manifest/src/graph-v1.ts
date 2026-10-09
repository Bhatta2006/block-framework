import type {
  AppMeta,
  GraphBlock,
  GraphScreen,
  GraphWire,
  JsonSchema,
  ProjectGraph,
} from './types.js';

export type AppTarget = 'web' | 'ios' | 'android';
export interface DesignToken {
  $type: 'color' | 'dimension' | 'number' | 'fontFamily' | 'fontWeight' | 'duration' | 'shadow';
  $value: string | number | string[] | Record<string, unknown>;
}
export interface DesignTokens {
  [name: string]: DesignToken | DesignTokens;
}
export interface Page extends Omit<GraphScreen, 'block' | 'blocks'> {
  primaryComponent: string;
  components: string[];
  route?: string;
  params?: Record<string, JsonSchema>;
  guards?: string[];
  redirect?: string;
  parent?: string;
}
export type ComponentNode =
  | (GraphBlock & {
      kind: 'block';
      slots?: Record<string, string[]>;
      bindings?: Record<string, { bind: string; map?: Record<string, string> } | { expr: string }>;
    })
  | {
      id: string;
      kind: 'layout';
      layout: 'Stack' | 'Grid' | 'Split' | 'Tabs' | 'Sheet' | 'Modal' | 'ScrollView';
      children: string[];
    };
export interface EntityDef {
  id: string;
  fields: Record<string, JsonSchema>;
  indexes?: string[][];
}
export interface DataModel {
  entities: EntityDef[];
  relations: {
    id: string;
    from: string;
    to: string;
    cardinality: 'one-one' | 'one-many' | 'many-many';
  }[];
  policies: {
    id: string;
    entity: string;
    action: 'read' | 'create' | 'update' | 'delete';
    expression: string;
  }[];
  seeds: { entity: string; records: Record<string, unknown>[] }[];
}
export interface Flow {
  id: string;
  trigger: { type: string; source?: string };
  steps: { id: string; type: string; config?: Record<string, unknown> }[];
  edges: { from: string; to: string }[];
}
export interface ServiceBinding {
  id: string;
  provider: string;
  publicUrl?: string;
  env?: Record<string, string>;
}
export interface AgentDef {
  id: string;
  service: string;
  model: string;
  tools: string[];
}
export interface EnvVarDecl {
  name: string;
  scope: 'server' | 'public';
  required: boolean;
}
export interface AppGraphV1 {
  schemaVersion: '1';
  app: Omit<AppMeta, 'theme' | 'cloud'> & { targets: AppTarget[] };
  theme: DesignTokens;
  pages: Page[];
  components: ComponentNode[];
  data: DataModel;
  flows: Flow[];
  services: ServiceBinding[];
  agents: AgentDef[];
  env: EnvVarDecl[];
  wires?: GraphWire[];
  i18n?: {
    defaultLocale: string;
    locales: string[];
    messages: Record<string, Record<string, string>>;
  };
  extensions?: Record<string, unknown>;
}
export type GraphInput = ProjectGraph | AppGraphV1;

/** Presence flags preserve omitted v0 defaults without saving a second editable graph. */
export interface CompatibilityFlags {
  composedPages: string[];
  themePresent: boolean;
}
