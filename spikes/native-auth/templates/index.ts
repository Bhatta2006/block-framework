import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { serve } from '@hono/node-server';
import { createApi } from './api.ts';
const state = resolve(import.meta.dirname, '../../.state');
mkdirSync(state, { recursive: true });
const keyPath = resolve(state, 'session-secret');
if (!existsSync(keyPath)) writeFileSync(keyPath, randomBytes(32).toString('hex'), { mode: 0o600 });
const baseURL = process.env.BLOCKFW_SPIKE_API_URL || 'http://127.0.0.1:8788';
const { app } = await createApi({
  databasePath: resolve(state, 'auth.sqlite'),
  baseURL,
  secret: readFileSync(keyPath, 'utf8'),
});
serve({ fetch: app.fetch, port: 8788, hostname: '127.0.0.1' });
console.log('Native-auth evaluation API ready on ' + baseURL);
