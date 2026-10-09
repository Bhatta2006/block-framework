import { describe, expect, it } from 'vitest';
import { formatWorkspace } from '../src/workspace-quality.js';

describe('workspace source quality', () => {
  it('removes unused template bindings, preserves effects and canonical JSON, and is idempotent', () => {
    const files = [
      {
        path: 'src/feature.tsx',
        content:
          "import {unused} from './unused';\nexport function Feature({onComplete}: {onComplete?: (output: {})=>void}) { console.log('retained side effect'); return <p>Ready</p>; }",
      },
      { path: 'src/project.json', content: '{"a":1,"z":2}\n' },
    ];
    const formatted = formatWorkspace(files);
    expect(formatted[0]!.content).not.toContain('./unused');
    expect(formatted[0]!.content).not.toContain('onComplete');
    expect(formatted[0]!.content).toContain("console.log('retained side effect')");
    expect(formatted[1]).toEqual(files[1]);
    expect(formatWorkspace(formatted)).toEqual(formatted);
    formatted[0]!.content = 'mutation';
    expect(formatWorkspace(files)[0]!.content).not.toBe('mutation');
  });

  it('rejects invalid generated syntax instead of returning unchecked output', () => {
    expect(() => formatWorkspace([{ path: 'broken.ts', content: 'export function {' }])).toThrow();
  });
});
