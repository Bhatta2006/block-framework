import { canonicalJson } from './canonical.js';
import type { RenderContext, RenderedBlock } from './types.js';

function renderPrimitive(ctx: RenderContext, kind: 'hero' | 'text' | 'button'): RenderedBlock {
  const config = canonicalJson(ctx.config);
  const content = [
    "import React from 'react';",
    "import { Pressable, StyleSheet, Text, View } from 'react-native';",
    "import { theme } from '../theme';",
    'const CONFIG: Record<string, unknown> = ' + config + ';',
    'export function ' +
      ctx.componentName +
      '({ onComplete }: { onComplete?: (output: Record<string, never>) => void }) {',
    'return <View style={styles.section}>',
    kind === 'hero'
      ? '<Text style={styles.eyebrow}>{String(CONFIG.eyebrow ?? "YOUR NEXT CHAPTER")}</Text>'
      : '',
    kind !== 'button'
      ? '<Text style={styles.title}>{String(CONFIG.title ?? "")}</Text><Text style={styles.body}>{String(CONFIG.body ?? "")}</Text>'
      : '',
    kind !== 'text'
      ? '<Pressable accessibilityRole="button" onPress={() => onComplete?.({})} style={styles.button}><Text style={styles.buttonText}>{String(CONFIG.ctaText ?? "Continue")} →</Text></Pressable>'
      : '',
    '</View>;',
    '}',
    'const styles = StyleSheet.create({',
    'section: { padding: ' +
      (ctx.variant === 'compact' ? 16 : 28) +
      ', backgroundColor: theme.colors.background, gap: 16 },',
    "eyebrow: { fontSize: 11, letterSpacing: 2, fontWeight: '700', color: theme.colors.primary },",
    'title: { fontSize: ' +
      (kind === 'hero' ? 38 : 24) +
      ", fontWeight: '800', letterSpacing: -1, color: theme.colors.text },",
    "body: { fontSize: 16, lineHeight: 26, color: '#6b7280' },",
    "button: { backgroundColor: theme.colors.primary, padding: 18, borderRadius: 16, alignItems: 'center' },",
    "buttonText: { color: '#fff', fontWeight: '700', fontSize: 15 }",
    '});',
  ].join('\n');
  return {
    fileName: ctx.instanceId + '.tsx',
    content,
    acceptsOnComplete: kind !== 'text',
    acceptsInput: false,
  };
}

export const renderHero = (ctx: RenderContext) => renderPrimitive(ctx, 'hero');
export const renderText = (ctx: RenderContext) => renderPrimitive(ctx, 'text');
export const renderButton = (ctx: RenderContext) => renderPrimitive(ctx, 'button');
