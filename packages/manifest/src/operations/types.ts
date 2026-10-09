import type { AppGraphV1, ComponentNode, EntityDef, Flow, GraphInput, Page } from '../graph-v1.js';
import type { GraphWire, JsonSchema } from '../types.js';

export type GraphOperation =
  | {
      type: 'setApp';
      app: Omit<AppGraphV1['app'], 'targets'> & { targets?: AppGraphV1['app']['targets'] };
    }
  | { type: 'setTheme'; theme: AppGraphV1['theme'] }
  | { type: 'addPage' | 'setPage'; page: Page }
  | { type: 'removePage'; id: string }
  | { type: 'insertBlock'; component: ComponentNode; pageId?: string; index?: number }
  | { type: 'setComponent'; component: ComponentNode }
  | { type: 'removeComponent'; id: string }
  | { type: 'orderPages' | 'orderComponents'; ids: string[] }
  | { type: 'setBlockField'; id: string; path: string[]; value: unknown }
  | { type: 'wire'; wire: GraphWire }
  | { type: 'unwire'; instance: string; event: string }
  | { type: 'setWires'; wires?: GraphWire[] }
  | { type: 'createEntity'; entity: EntityDef }
  | { type: 'addField'; entityId: string; name: string; schema: JsonSchema }
  | { type: 'createFlow'; flow: Flow }
  | {
      type: 'setBinding';
      id: string;
      field: string;
      binding: NonNullable<Extract<ComponentNode, { kind: 'block' }>['bindings']>[string];
    }
  | { type: 'setData'; data: AppGraphV1['data'] }
  | { type: 'setFlows'; flows: AppGraphV1['flows'] }
  | { type: 'setServices'; services: AppGraphV1['services'] }
  | { type: 'setAgents'; agents: AppGraphV1['agents'] }
  | { type: 'setEnv'; env: AppGraphV1['env'] }
  | { type: 'setLocales'; i18n?: AppGraphV1['i18n'] }
  | { type: 'setExtensions'; extensions?: AppGraphV1['extensions'] };

export interface GraphDocument {
  version: 1;
  graph: GraphInput;
  profile: unknown;
  touched: string[];
}
export type ProjectOperation =
  | GraphOperation
  | { type: 'setProfile'; profile: unknown }
  | { type: 'setTouched'; touched: string[] };
export type OperationSource = 'ui' | 'agent' | 'cli' | 'profile' | 'import';
export interface OperationEntry {
  revision: number;
  source: OperationSource;
  forward: ProjectOperation[];
  inverse: ProjectOperation[];
}
