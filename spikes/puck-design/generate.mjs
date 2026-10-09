import { mkdirSync, writeFileSync } from 'node:fs';
import { compileWebProject } from '../../packages/compiler/dist/index.js';
import { loadDefaultRegistry } from '../../packages/blocks/dist/index.js';
import { referenceGraph } from './adapter.ts';
const result = compileWebProject(referenceGraph, loadDefaultRegistry());
mkdirSync('.generated', { recursive: true });
writeFileSync(
  '.generated/styles.css',
  result.files.find((file) => file.path === 'src/styles.css').content,
);
