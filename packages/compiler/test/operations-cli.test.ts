import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, it } from 'vitest';

it('CLI applies typed operations, writes v1 and its log, and preserves output on invalid edits', () => {
  const dir = mkdtempSync(join(tmpdir(), 'blockc-ops-'));
  try {
    const operations = join(dir, 'input-ops.json');
    const out = join(dir, 'graph.json');
    const args = [
      resolve('packages/compiler/dist/cli.js'),
      'ops',
      'apply',
      resolve('examples/notes/graph.json'),
      operations,
      '--out',
      out,
    ];
    writeFileSync(
      operations,
      JSON.stringify([
        { type: 'setTheme', theme: { primary: { $type: 'color', $value: '#123456' } } },
      ]),
    );
    execFileSync(process.execPath, args, { stdio: 'pipe' });
    const saved = JSON.parse(readFileSync(out, 'utf8'));
    expect(saved.schemaVersion).toBe('1');
    expect(saved.theme.primary.$value).toBe('#123456');
    const log = JSON.parse(readFileSync(out + '.operations.json', 'utf8'));
    expect(log.entries[0].source).toBe('cli');
    expect(log.entries[0].inverse.length).toBeGreaterThan(0);
    const before = readFileSync(out, 'utf8');
    writeFileSync(
      operations,
      JSON.stringify([{ type: 'removeComponent', id: saved.pages[0].primaryComponent }]),
    );
    expect(() => execFileSync(process.execPath, args, { stdio: 'pipe' })).toThrow();
    expect(readFileSync(out, 'utf8')).toBe(before);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
