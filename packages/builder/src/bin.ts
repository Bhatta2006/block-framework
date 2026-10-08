#!/usr/bin/env node
import { startCanvasServer } from './server.js';

const args = process.argv.slice(2);
let port = 5174;
let projectPath = '.builder-cache/project.blockfw.json';
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--port' && args[i + 1]) port = Number(args[i + 1]);
  if (args[i] === '--project' && args[i + 1]) projectPath = args[i + 1]!;
}

const url = await startCanvasServer({ port, projectPath });
console.log(`Block Framework canvas running at ${url}`);
console.log('Press Ctrl+C to stop.');
