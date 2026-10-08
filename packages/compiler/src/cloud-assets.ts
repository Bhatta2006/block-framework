import { readFileSync } from 'node:fs';
const asset = (name: string) => readFileSync(new URL('../assets/' + name, import.meta.url), 'utf8');
export const CLOUD_RUNTIME = asset('cloud-runtime.tsx');
export const CLOUD_STYLES = asset('cloud-styles.css');
export const CLOUD_SERVER = asset('cloud-server.mjs');
export const CLOUD_SCHEMA = asset('cloud-schema.sql');
