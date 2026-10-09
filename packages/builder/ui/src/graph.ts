import type { BlockSummary, BuilderProject } from './api';

type Screen = BuilderProject['graph']['screens'][number];
type Block = BuilderProject['graph']['blocks'][number];

/** Ordered block instances on a page; legacy pages only name their primary block. */
export const pageIds = (s: Screen) => s.blocks ?? [s.block];

/** Events a block instance can emit: manifest ports plus its custom element buttons. */
export const eventNames = (info?: BlockSummary, block?: Block) => [
  ...(info?.ports.emits.map((p) => (typeof p === 'string' ? p : p.event)) ?? []),
  ...[
    ...new Set([
      ...(block?.design?.content ?? []).filter((e) => e.type === 'button').map((e) => e.id),
      ...Object.keys(block?.design?.actions ?? {}),
    ]),
  ].map((id) => 'element.' + id + '.pressed'),
];

/** Input ports shown on block nodes; platform lifecycle inputs are satisfied by convention. */
export const consumeNames = (info?: BlockSummary) =>
  info?.ports.consumes
    .map((p) => (typeof p === 'string' ? p : p.port))
    .filter((p) => !['app.launched', 'paywall.show'].includes(p)) ?? [];
