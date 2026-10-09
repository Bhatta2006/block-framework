import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const sourceDir = import.meta.dirname ?? dirname(fileURLToPath(import.meta.url));
const asset = (name: string) => readFileSync(resolve(sourceDir, '../assets/' + name), 'utf8');
export const CLOUD_RUNTIME = readFileSync(
  resolve(sourceDir, '../../blocks/src/blocks/auth.account/web/CloudRuntime.tsx'),
  'utf8',
).replace(/\r\n/g, '\n');
export const CLOUD_STYLES = asset('cloud-styles.css');
export const CLOUD_SERVER = asset('cloud-server.mjs');
export const CLOUD_SCHEMA = asset('cloud-schema.sql');
