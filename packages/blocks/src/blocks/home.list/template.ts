import { canonicalJson } from '../../canonical.js';
import type { RenderContext, RenderedBlock } from '../../types.js';

const HEADER = `import React from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { theme } from '../theme';

export interface HomeItem {
  id: string;
  title: string;
  subtitle?: string;
}

export interface HomeConfig {
  title: string;
  subtitle?: string;
  items: HomeItem[];
}
`;

const STYLES = `
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    padding: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: theme.colors.text,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 15,
    color: '#6B7280',
    marginBottom: 16,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  gridCard: {
    flex: 1,
    margin: 6,
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
  },
  itemSubtitle: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 4,
  },
});
`;

function renderList(ctx: RenderContext, configJson: string): string {
  const name = ctx.componentName;
  return `${HEADER}
const CONFIG: HomeConfig = ${configJson};

export function ${name}() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{CONFIG.title}</Text>
      {CONFIG.subtitle ? <Text style={styles.subtitle}>{CONFIG.subtitle}</Text> : null}
      <FlatList
        data={CONFIG.items}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.itemTitle}>{item.title}</Text>
            {item.subtitle ? <Text style={styles.itemSubtitle}>{item.subtitle}</Text> : null}
          </View>
        )}
      />
    </View>
  );
}
${STYLES}`;
}

function renderGrid(ctx: RenderContext, configJson: string): string {
  const name = ctx.componentName;
  return `${HEADER}
const CONFIG: HomeConfig = ${configJson};

export function ${name}() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{CONFIG.title}</Text>
      {CONFIG.subtitle ? <Text style={styles.subtitle}>{CONFIG.subtitle}</Text> : null}
      <FlatList
        data={CONFIG.items}
        numColumns={2}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={[styles.card, styles.gridCard]}>
            <Text style={styles.itemTitle}>{item.title}</Text>
            {item.subtitle ? <Text style={styles.itemSubtitle}>{item.subtitle}</Text> : null}
          </View>
        )}
      />
    </View>
  );
}
${STYLES}`;
}

export function render(ctx: RenderContext): RenderedBlock {
  const configJson = canonicalJson(ctx.config);
  const variant = ctx.variant === 'grid' ? 'grid' : 'list';
  return {
    fileName: `${ctx.instanceId}.tsx`,
    content: variant === 'grid' ? renderGrid(ctx, configJson) : renderList(ctx, configJson),
    acceptsOnComplete: false,
  };
}
