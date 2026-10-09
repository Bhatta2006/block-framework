import { describe, it, expect } from 'vitest';
import { shouldExclude, auditFileContent, EXCLUDE_PATTERNS } from '../src/export-audit.js';

describe('export audit', () => {
  it('excludes node_modules', () => {
    expect(shouldExclude('node_modules/react/index.js')).toBe(true);
    expect(shouldExclude('node_modules')).toBe(true);
  });

  it('excludes .git', () => {
    expect(shouldExclude('.git/config')).toBe(true);
    expect(shouldExclude('.gitignore')).toBe(false);
  });

  it('excludes secrets', () => {
    expect(shouldExclude('.env')).toBe(true);
    expect(shouldExclude('.env.local')).toBe(true);
    expect(shouldExclude('cert.pem')).toBe(true);
  });

  it('audits nested workspace paths and rejects traversal without excluding blank templates', () => {
    for (const path of [
      'apps/web/.env',
      'apps/mobile/node_modules/react/index.js',
      'apps/web/dist/index.js',
      'apps/mobile/cert.key',
      'apps\\mobile\\.env.local',
      '../package.json',
      '/absolute/file.ts',
      'C:/project/file.ts',
    ])
      expect(shouldExclude(path), path).toBe(true);
    expect(shouldExclude('apps/web/.env.example')).toBe(false);
    expect(shouldExclude('apps/mobile/src/theme.ts')).toBe(false);
    expect(
      auditFileContent('apps/web/.env.example', 'KEY=ghp_012345678901234567890123'),
    ).not.toEqual([]);
  });

  it('ships a blank server environment template but rejects credentials hidden in it', () => {
    expect(shouldExclude('.env.example')).toBe(false);
    expect(auditFileContent('.env.example', 'SUPABASE_SERVICE_ROLE_KEY=\n')).toEqual([]);
    expect(
      auditFileContent('.env.example', 'SUPABASE_SERVICE_ROLE_KEY=sb_secret_examplekey123456789'),
    ).not.toEqual([]);
  });

  it('excludes build artifacts', () => {
    expect(shouldExclude('dist/index.js')).toBe(true);
    expect(shouldExclude('.builder-cache/preview.cjs')).toBe(true);
  });

  it('includes source files', () => {
    expect(shouldExclude('App.tsx')).toBe(false);
    expect(shouldExclude('src/blocks/auth.tsx')).toBe(false);
    expect(shouldExclude('package.json')).toBe(false);
    expect(shouldExclude('README.md')).toBe(false);
  });

  it('detects OpenRouter keys', () => {
    const v = auditFileContent('src/config.ts', 'const key = "sk-or-v1-abc123def456";');
    expect(v.length).toBeGreaterThan(0);
    expect(v[0]).toMatch(/secret/i);
  });

  it('detects GitHub PATs', () => {
    const v = auditFileContent('src/config.ts', 'token = "github_pat_abc123_xyz789_1234567890"');
    expect(v.length).toBeGreaterThan(0);
    expect(
      auditFileContent('.github/workflows/verify.yml', 'TOKEN: ghp_012345678901234567890123'),
    ).not.toEqual([]);
    expect(
      auditFileContent('pnpm-workspace.yaml', 'TOKEN: ghp_012345678901234567890123'),
    ).not.toEqual([]);
  });

  it('detects absolute paths', () => {
    const v = auditFileContent('src/config.ts', 'const p = "/home/hatch/project";');
    expect(v.length).toBeGreaterThan(0);
    expect(v[0]).toMatch(/absolute path/i);
  });

  it('passes clean files', () => {
    const v = auditFileContent(
      'App.tsx',
      'import React from "react";\nexport default function App() { return null; }',
    );
    expect(v).toHaveLength(0);
  });

  it('has exclusion patterns defined', () => {
    expect(EXCLUDE_PATTERNS.length).toBeGreaterThan(0);
  });
});
