import { canonicalJson } from '../../canonical.js';
import type { RenderContext, RenderedBlock } from '../../types.js';

const HEADER = `import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { theme } from '../theme';

export interface DetailItem {
  id: string;
  title: string;
  subtitle?: string;
}

export interface DetailConfig {
  showImage?: boolean;
  ctaText?: string;
}
`;

const STYLES = `
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  hero: {
    height: 220,
    backgroundColor: '#E0E7FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroText: {
    fontSize: 48,
  },
  body: {
    padding: 24,
  },
  kicker: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: theme.colors.text,
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    color: '#4B5563',
    lineHeight: 24,
    marginBottom: 24,
  },
  meta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingTop: 16,
    marginBottom: 24,
  },
  metaItem: {
    alignItems: 'center',
  },
  metaValue: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text,
  },
  metaLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
  },
  cta: {
    backgroundColor: theme.colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  ctaText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  emptyText: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
  },
});
`;

/**
 * The input prop type comes from the wiring: it is the TypeScript form of
 * the consumed event's accepted payload. When the SDK renders without a
 * graph (no incoming wire), inputType is null and we fall back to unknown
 * with sample content so the block still renders.
 */
function renderVariant(ctx: RenderContext, configJson: string, product: boolean): string {
  const name = ctx.componentName;
  const inputType = ctx.inputType ?? 'unknown';
  const fallbackItem = `{ id: 'sample', title: 'Sample item', subtitle: 'Open this screen from the list to see real content.' }`;
  return `${HEADER}
const CONFIG: DetailConfig = ${configJson};

const FALLBACK_ITEM: DetailItem = ${fallbackItem};

export function ${name}({ input }: { input?: ${inputType} }) {
  const item = (input as { item?: DetailItem } | undefined)?.item ?? FALLBACK_ITEM;
  return (
    <ScrollView style={styles.container}>
      {CONFIG.showImage !== false ? (
        <View style={styles.hero}>
          <Text style={styles.heroText}>${product ? '📦' : '📄'}</Text>
        </View>
      ) : null}
      <View style={styles.body}>
        <Text style={styles.kicker}>${product ? 'Product' : 'Details'}</Text>
        <Text style={styles.title}>{item.title}</Text>
        {item.subtitle ? <Text style={styles.subtitle}>{item.subtitle}</Text> : null}
        <View style={styles.meta}>
          <View style={styles.metaItem}>
            <Text style={styles.metaValue}>${product ? '$4.99' : '12'}</Text>
            <Text style={styles.metaLabel}>${product ? 'Price' : 'Day streak'}</Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={styles.metaValue}>${product ? '4.9★' : '8'}</Text>
            <Text style={styles.metaLabel}>${product ? 'Rating' : 'Habits'}</Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={styles.metaValue}>${product ? '2k' : '96%'}</Text>
            <Text style={styles.metaLabel}>${product ? 'Sold' : 'Complete'}</Text>
          </View>
        </View>
        <Pressable style={styles.cta} onPress={() => undefined}>
          <Text style={styles.ctaText}>{CONFIG.ctaText ?? 'Get started'}</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
${STYLES}`;
}

export function render(ctx: RenderContext): RenderedBlock {
  const configJson = canonicalJson(ctx.config);
  const product = ctx.variant === 'product';
  return {
    fileName: `${ctx.instanceId}.tsx`,
    content: renderVariant(ctx, configJson, product),
    acceptsOnComplete: false,
    acceptsInput: true,
  };
}
