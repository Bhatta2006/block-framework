import assert from 'node:assert/strict';
import { referenceGraph, graphToDesign, designToOperations } from './adapter.ts';
import { applyGraphOperations } from '../../packages/manifest/dist/index.js';
const original = graphToDesign(referenceGraph);
assert.deepEqual(designToOperations(original), []);
const edited = structuredClone(original);
edited.content[0]!.props.title = 'Edited in Design';
edited.content.reverse();
const graph = applyGraphOperations(referenceGraph, designToOperations(edited));
assert.deepEqual(
  designToOperations(graphToDesign(graph as typeof referenceGraph), graph as typeof referenceGraph),
  [],
);
assert.equal(
  (graph as typeof referenceGraph).blocks.find((block) => block.id === 'hero')!.config!.title,
  'Edited in Design',
);
assert.equal((graph as typeof referenceGraph).screens[0]!.blocks![0], 'account');
for (const malicious of [
  { ...original.content[0]!, type: 'Account' },
  { type: 'Hero', props: { ...original.content[0]!.props, ports: 'changed' } },
]) {
  assert.throws(() =>
    designToOperations({ ...original, content: [malicious, ...original.content.slice(1)] }),
  );
}
console.log('Puck adapter round-trip, config/order and locked-field assertions passed');
