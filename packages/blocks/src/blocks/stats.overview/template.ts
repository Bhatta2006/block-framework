import { canonicalJson } from '../../canonical.js';
import type { RenderContext, RenderedBlock } from '../../types.js';

const HEADER = `import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { theme } from '../theme';

export interface Stat {
  label: string;
  value: string;
  delta?: string;
}

export interface StatsConfig {
  title?: string;
  stats: Stat[];
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
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  card: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    minWidth: 100,
  },
  gridCard: {
    flexBasis: '47%',
    flexGrow: 1,
  },
  value: {
    fontSize: 30,
    fontWeight: '800',
    color: theme.colors.text,
  },
  label: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 4,
  },
  delta: {
    fontSize: 12,
    fontWeight: '600',
    color: '#059669',
    marginTop: 8,
  },
});
`;

function renderVariant(ctx: RenderContext, configJson: string, grid: boolean): string {
  const name = ctx.componentName;
  return `${HEADER}
const CONFIG: StatsConfig = ${configJson};

export function ${name}() {
  return (
    <View style={styles.container}>
      {CONFIG.title ? <Text style={styles.title}>{CONFIG.title}</Text> : null}
      <View style={${grid ? 'styles.grid' : 'styles.row'}}>
        {CONFIG.stats.map((s) => (
          <View key={s.label} style={[styles.card, ${grid ? 'styles.gridCard' : 'null'}]}>
            <Text style={styles.value}>{s.value}</Text>
            <Text style={styles.label}>{s.label}</Text>
            {s.delta ? <Text style={styles.delta}>{s.delta}</Text> : null}
          </View>
        ))}
      </View>
    </View>
  );
}
${STYLES}`;
}

export function render(ctx: RenderContext): RenderedBlock {
  const configJson = canonicalJson(ctx.config);
  const grid = ctx.variant === 'grid';
  return {
    fileName: `${ctx.instanceId}.tsx`,
    content: renderVariant(ctx, configJson, grid),
    acceptsOnComplete: false,
    acceptsInput: false,
  };
}
