import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { compileProject } from '../../packages/compiler/dist/index.js';
import { loadDefaultRegistry } from '../../packages/blocks/dist/index.js';
import { migrateGraph, canonicalJson } from '../../packages/manifest/dist/index.js';

// Isolated evaluation generator; it does not enable a production server/native-auth target.
const graph = migrateGraph(JSON.parse(readFileSync('../../examples/notes/graph.json', 'utf8')));
const result = compileProject(graph, loadDefaultRegistry());
const files = new Map(result.files.map((file) => [file.path, file.content]));
const packageJson = JSON.parse(files.get('package.json'));
Object.assign(packageJson.dependencies, {
  // Match Expo Go's SDK 57 native module ABI in this isolated fixture.
  'react-native-safe-area-context': '5.7.0',
  'react-native-screens': '4.26.0',
  'better-auth': '1.7.7',
  '@better-auth/expo': '1.7.7',
  '@better-auth/core': '1.7.7',
  hono: '4.13.13',
  '@hono/node-server': '2.1.4',
  'better-sqlite3': '13.0.3',
  'expo-secure-store': '57.0.4',
  'expo-network': '57.0.2',
  'expo-linking': '57.0.12',
  'expo-constants': '57.0.21',
  'expo-web-browser': '57.0.3',
});
Object.assign(packageJson.devDependencies, {
  '@types/better-sqlite3': '9.6.0',
  '@types/node': '26.6.4',
});
packageJson.scripts = {
  start: 'expo start --go --host localhost',
  typecheck: 'tsc --noEmit',
  api: 'node --experimental-strip-types server/index.ts',
};
packageJson.engines = { node: '>=24' };
files.set('package.json', canonicalJson(packageJson) + '\n');
files.set('server/package.json', '{"type":"module"}\n');
const app = JSON.parse(files.get('app.json'));
app.expo.name = graph.app.name + ' — native auth evaluation';
app.expo.slug = 'blockfw-native-auth-spike';
app.expo.scheme = 'blockfw-spike';
app.expo.extra = { apiURL: process.env.BLOCKFW_SPIKE_API_URL || 'http://127.0.0.1:8788' };
files.set('app.json', canonicalJson(app) + '\n');
const tsconfig = JSON.parse(files.get('tsconfig.json'));
tsconfig.exclude = ['server', 'node_modules'];
files.set('tsconfig.json', canonicalJson(tsconfig) + '\n');
for (const [source, target] of [
  ['App.tsx', 'App.tsx'],
  ['api.ts', 'server/api.ts'],
  ['index.ts', 'server/index.ts'],
  ['tsconfig.json', 'server/tsconfig.json'],
]) {
  files.set(target, readFileSync('templates/' + source, 'utf8').replace(/\r\n/g, '\n'));
}
for (const [path, content] of files) {
  const destination = '.generated/' + path;
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, content);
}
console.log(
  'Generated an independent Expo 57 fixture and Hono API. Runtime state/secrets are excluded.',
);
