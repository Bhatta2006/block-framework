/**
 * Block SDK: the way block authors define, validate, and register blocks.
 *
 * A block is a directory with three files:
 *   manifest.json      — the block's contract (validated against
 *                        block-manifest-v0.json)
 *   template.ts        — a pure function (variant, config) => file content
 *   sample-config.json — a valid config used by `sdk test` / `sdk validate`
 *                        to render every variant
 *
 * `sdk test` is the fast contract check (render every variant, determinism).
 * `sdk validate` is the quality gate: test + manifest schema + sample config
 * + template conventions. Every block in the registry must pass validate.
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateManifest, validateBlockConfig, type BlockManifest } from '@blockfw/manifest';
import type { BlockTemplate, RenderContext, BlockTheme } from './types.js';
import { componentNameFor } from './types.js';

export interface SdkIssue {
  /** JSON path or check name, e.g. "config.questions" or "render[quiz-cards]". */
  path: string;
  message: string;
}

export interface SdkResult {
  block: string;
  ok: boolean;
  issues: SdkIssue[];
}

const SDK_THEME: BlockTheme = {
  primaryColor: '#4F46E5',
  backgroundColor: '#FFFFFF',
  textColor: '#111827',
};

/**
 * Sample configs are wrapped: `{ variant?, config }`.
 * Unwrap to the raw config for validation and rendering.
 */
export function unwrapSampleConfig(sampleConfig: unknown): Record<string, unknown> {
  if (
    sampleConfig !== null &&
    typeof sampleConfig === 'object' &&
    'config' in sampleConfig &&
    (sampleConfig as Record<string, unknown>)['config'] !== null &&
    typeof (sampleConfig as Record<string, unknown>)['config'] === 'object'
  ) {
    return (sampleConfig as { config: Record<string, unknown> }).config;
  }
  return (sampleConfig ?? {}) as Record<string, unknown>;
}

function baseContext(
  manifest: BlockManifest,
  variant: string,
  config: Record<string, unknown>,
): RenderContext {
  return {
    instanceId: 'sdk-check',
    componentName: componentNameFor('sdk-check'),
    screenId: 'sdk-screen',
    variant,
    config,
    theme: SDK_THEME,
    onCompleteTarget: null,
    inputType: null,
    inputEvent: null,
  };
}

/**
 * Fast contract check: every variant renders with the sample config, and
 * rendering is deterministic. Used by `blockc sdk test`.
 */
export function testBlock(
  manifestJson: unknown,
  render: BlockTemplate,
  sampleConfig: unknown,
): SdkResult {
  const issues: SdkIssue[] = [];
  let manifest: BlockManifest;
  try {
    validateManifest(manifestJson);
    manifest = manifestJson as BlockManifest;
  } catch (e) {
    return {
      block: '(unknown)',
      ok: false,
      issues: [{ path: 'manifest', message: (e as Error).message }],
    };
  }

  const config = unwrapSampleConfig(sampleConfig);
  const configIssues = validateBlockConfig(manifest, config);
  for (const i of configIssues) {
    issues.push({ path: `sample-config.${i.path}`, message: i.message });
  }

  for (const variant of manifest.variants) {
    const label = `render[${variant}]`;
    let first: string;
    try {
      first = render(baseContext(manifest, variant, config)).content;
    } catch (e) {
      issues.push({ path: label, message: `threw: ${(e as Error).message}` });
      continue;
    }
    if (!first.includes('export function')) {
      issues.push({ path: label, message: 'output has no exported component' });
    }
    try {
      const second = render(baseContext(manifest, variant, config)).content;
      if (second !== first) {
        issues.push({ path: label, message: 'render is not deterministic' });
      }
    } catch (e) {
      issues.push({ path: label, message: `second render threw: ${(e as Error).message}` });
    }
  }

  return { block: `${manifest.id}@${manifest.version}`, ok: issues.length === 0, issues };
}

/**
 * Full quality gate: `test` plus manifest/schema conventions.
 * Used by `blockc sdk validate`. Every registry block must pass.
 */
export function validateBlock(
  manifestJson: unknown,
  render: BlockTemplate,
  sampleConfig: unknown,
): SdkResult {
  const result = testBlock(manifestJson, render, sampleConfig);
  if (!result.ok) return result;

  const manifest = manifestJson as BlockManifest;
  const issues = [...result.issues];

  // Conventions the SDK enforces on every block.
  if (manifest.variants.length === 0) {
    issues.push({ path: 'variants', message: 'block must declare at least one variant' });
  }
  if (manifest.defaultVariant && !manifest.variants.includes(manifest.defaultVariant)) {
    issues.push({
      path: 'defaultVariant',
      message: `"${manifest.defaultVariant}" is not in variants`,
    });
  }
  if (!Array.isArray(manifest.editSurface)) {
    issues.push({
      path: 'editSurface',
      message: 'block must declare a editSurface (what the AI may change)',
    });
  }
  if (!Array.isArray(manifest.locked)) {
    issues.push({ path: 'locked', message: 'block must declare locked (may be empty)' });
  }
  // Every variant must actually change the output (a variant that renders
  // identically to another is a copy-paste bug).
  if (manifest.variants.length > 1) {
    const config = unwrapSampleConfig(sampleConfig);
    const outputs = new Map<string, string>();
    for (const variant of manifest.variants) {
      try {
        const out = render(baseContext(manifest, variant, config)).content;
        for (const [otherVariant, otherOut] of outputs) {
          if (otherOut === out) {
            issues.push({
              path: `render[${variant}]`,
              message: `renders byte-identically to variant "${otherVariant}" — variants must differ`,
            });
          }
        }
        outputs.set(variant, out);
      } catch {
        // Already reported by testBlock.
      }
    }
  }

  return { block: `${manifest.id}@${manifest.version}`, ok: issues.length === 0, issues };
}

/** Starter manifest for `blockc sdk scaffold`. */
export function scaffoldManifest(id: string, category: string): string {
  return JSON.stringify(
    {
      id,
      version: '1.0.0',
      category,
      variants: ['default', 'compact'],
      defaultVariant: 'default',
      config: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          subtitle: { type: 'string' },
        },
        required: ['title'],
        additionalProperties: false,
      },
      defaultConfig: { subtitle: '' },
      ports: { emits: [], consumes: ['app.launched'], provides: [] },
      editSurface: ['config.title', 'config.subtitle'],
      locked: ['ports', 'variants'],
    },
    null,
    2,
  );
}

/** Starter template for `blockc sdk scaffold`. Passes `sdk test` unmodified. */
export function scaffoldTemplate(): string {
  return `// Scaffolded block. Edit freely, then run: blockc sdk test
// Keep render() a pure function: same context in, byte-identical file out.
//
// This starter is self-contained so the SDK can load it directly.
// When you register the block in the monorepo, you can import the shared
// types from '../../types.js' instead.
interface RenderContext {
  instanceId: string;
  componentName: string;
  variant: string;
  config: Record<string, unknown>;
}

interface RenderedBlock {
  fileName: string;
  content: string;
  acceptsOnComplete: boolean;
  acceptsInput: boolean;
}

export function render(ctx: RenderContext): RenderedBlock {
  const { instanceId, componentName, variant, config } = ctx;
  const title = JSON.stringify(String(config['title'] ?? 'Hello'));
  const titleSize = variant === 'compact' ? 20 : 28;

  const content = [
    "import React from 'react';",
    "import { StyleSheet, Text, View } from 'react-native';",
    "import { theme } from '../theme';",
    '',
    \`export function \${componentName}() {\`,
    '  return (',
    '    <View style={styles.container}>',
    \`      <Text style={styles.title}>\${title}</Text>\`,
    '    </View>',
    '  );',
    '}',
    '',
    'const styles = StyleSheet.create({',
    '  container: {',
    '    flex: 1,',
    '    backgroundColor: theme.colors.background,',
    "    alignItems: 'center',",
    "    justifyContent: 'center',",
    '    padding: 24,',
    '  },',
    '  title: {',
    \`    fontSize: \${titleSize},\`,
    "    fontWeight: '700',",
    '    color: theme.colors.text,',
    "    textAlign: 'center',",
    '  },',
    '});',
    '',
  ].join('\\n');

  return { fileName: \`\${instanceId}.tsx\`, content, acceptsOnComplete: false, acceptsInput: false };
}
`;
}

/** Starter sample config for `blockc sdk scaffold`. */
export function scaffoldSampleConfig(id: string): string {
  return JSON.stringify(
    {
      variant: 'default',
      config: { title: `Sample ${id}`, subtitle: 'Scaffolded block' },
    },
    null,
    2,
  );
}

// --- disk helpers ------------------------------------------------------------

/**
 * Directory containing block authoring sources (manifest.json, template.ts,
 * sample-config.json per block). Resolved relative to this module so it
 * works from both src/ and dist/.
 */
export function blockSourceDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, '..', 'src', 'blocks');
}

/** Block ids (directory names) in the source tree, sorted. */
export function listBlockIds(): string[] {
  return readdirSync(blockSourceDir(), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
}

/** Load a block's sample-config.json from the source tree. */
export function loadSampleConfig(blockId: string): unknown {
  const raw = readFileSync(join(blockSourceDir(), blockId, 'sample-config.json'), 'utf8');
  return JSON.parse(raw);
}

/** Write a scaffolded block's three files. Returns the created paths. */
export function writeScaffoldedBlock(id: string, category: string): string[] {
  const dir = join(blockSourceDir(), id);
  mkdirSync(dir, { recursive: true });
  const files: [string, string][] = [
    ['manifest.json', scaffoldManifest(id, category)],
    ['template.ts', scaffoldTemplate()],
    ['sample-config.json', scaffoldSampleConfig(id)],
  ];
  const created: string[] = [];
  for (const [name, content] of files) {
    const full = join(dir, name);
    writeFileSync(full, content);
    created.push(full);
  }
  return created;
}
