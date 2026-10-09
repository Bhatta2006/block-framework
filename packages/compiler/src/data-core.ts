import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const sourceDir = import.meta.dirname ?? dirname(fileURLToPath(import.meta.url));
export const DATA_CORE = readFileSync(
  resolve(sourceDir, '../../blocks/src/blocks/data.collection/shared/data-core.ts'),
  'utf8',
).replace(/\r\n/g, '\n');
