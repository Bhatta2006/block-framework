import type { ProjectGraph, GraphOperation } from '../../packages/manifest/dist/index.js';

export const referenceGraph: ProjectGraph = {
  schemaVersion: '0',
  app: {
    name: 'Design evaluation',
    slug: 'design-evaluation',
    version: '1.0.0',
    cloud: { provider: 'supabase' },
  },
  screens: [
    { id: 'design', title: 'Design', block: 'hero', blocks: ['hero', 'collection', 'account'] },
  ],
  blocks: [
    {
      id: 'hero',
      type: 'content.hero@1.0.0',
      config: {
        title: 'Hero evaluation',
        body: 'The actual vendored component',
        ctaText: 'Continue',
        eyebrow: 'BLOCK STUDIO',
      },
    },
    {
      id: 'collection',
      type: 'data.collection@1.0.0',
      config: { title: 'Collection evaluation', subtitle: 'Transient preview records' },
    },
    {
      id: 'account',
      type: 'auth.account@1.0.0',
      config: { title: 'Account evaluation', subtitle: 'Design preview only' },
    },
  ],
};
export const fields = {
  Hero: ['title', 'body', 'ctaText', 'eyebrow'],
  Collection: ['title', 'subtitle'],
  Account: ['title', 'subtitle'],
} as const;
const types = {
  Hero: 'content.hero@1.0.0',
  Collection: 'data.collection@1.0.0',
  Account: 'auth.account@1.0.0',
};
export type DesignData = {
  content: { type: string; props: { id: string; [key: string]: unknown } }[];
  root: { props?: unknown };
};

export function graphToDesign(graph: ProjectGraph): DesignData {
  return {
    root: {},
    content: graph.screens[0]!.blocks!.map((id) => {
      const block = graph.blocks.find((block) => block.id === id)!;
      const type = Object.keys(types).find(
        (type) => types[type as keyof typeof types] === block.type,
      )!;
      return { type, props: { ...block.config, id } };
    }),
  };
}

export function designToOperations(data: DesignData, graph = referenceGraph): GraphOperation[] {
  if (
    data.content.length !== graph.blocks.length ||
    new Set(data.content.map((item) => item.props.id)).size !== graph.blocks.length
  )
    throw new Error('Spike requires the three existing instances');
  const operations: GraphOperation[] = [];
  for (const item of data.content) {
    const block = graph.blocks.find((block) => block.id === item.props.id);
    const type = item.type as keyof typeof types;
    if (!block || !Object.hasOwn(types, type) || block.type !== types[type])
      throw new Error('Locked identity/type changed');
    for (const [field, value] of Object.entries(item.props)) {
      if (field === 'id') continue;
      if (!(fields[type] as readonly string[]).includes(field) || typeof value !== 'string')
        throw new Error(`Locked field: ${field}`);
      if (value !== block.config?.[field])
        operations.push({ type: 'setBlockField', id: block.id, path: ['config', field], value });
    }
  }
  const ids = data.content.map((item) => item.props.id);
  if (JSON.stringify(ids) !== JSON.stringify(graph.screens[0]!.blocks)) {
    operations.push({
      type: 'setPage',
      page: { id: 'design', title: 'Design', primaryComponent: ids[0]!, components: ids },
    });
  }
  return operations;
}
