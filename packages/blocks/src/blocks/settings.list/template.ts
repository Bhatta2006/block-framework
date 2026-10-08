import { canonicalJson } from '../../canonical.js';
import type { RenderContext, RenderedBlock } from '../../types.js';

const HEADER = `import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { theme } from '../theme';

export interface SettingsRow {
  id: string;
  label: string;
  kind: 'toggle' | 'link';
  value?: boolean;
  detail?: string;
}

export interface SettingsSection {
  title?: string;
  rows: SettingsRow[];
}

export interface SettingsConfig {
  title: string;
  sections: SettingsSection[];
}
`;

const STYLES = `
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    fontSize: 32,
    fontWeight: '800',
    color: theme.colors.text,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 12,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 24,
    marginBottom: 8,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    marginHorizontal: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  rowLabel: {
    fontSize: 16,
    color: theme.colors.text,
  },
  rowDetail: {
    fontSize: 14,
    color: '#9CA3AF',
    marginLeft: 8,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  chevron: {
    fontSize: 16,
    color: '#9CA3AF',
    marginLeft: 8,
  },
});
`;

function renderVariant(ctx: RenderContext, configJson: string, grouped: boolean): string {
  const name = ctx.componentName;
  return `${HEADER}
const CONFIG: SettingsConfig = ${configJson};

export function ${name}() {
  const [toggles, setToggles] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const section of CONFIG.sections) {
      for (const row of section.rows) {
        if (row.kind === 'toggle') initial[row.id] = row.value ?? false;
      }
    }
    return initial;
  });

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.header}>{CONFIG.title}</Text>
      {CONFIG.sections.map((section, si) => (
        <View key={section.title ?? si} style={styles.section}>
          {section.title ? <Text style={styles.sectionTitle}>{section.title}</Text> : null}
          <View style={${grouped ? 'styles.card' : '{ paddingHorizontal: 8 }'}}>
            {section.rows.map((row, ri) => (
              <View
                key={row.id}
                style={[styles.row, ri < section.rows.length - 1 ? styles.rowBorder : null]}
              >
                <View style={styles.rowLeft}>
                  <Text style={styles.rowLabel}>{row.label}</Text>
                  {row.detail ? <Text style={styles.rowDetail}>{row.detail}</Text> : null}
                </View>
                {row.kind === 'toggle' ? (
                  <Switch
                    value={toggles[row.id] ?? false}
                    onValueChange={(v) => setToggles((t) => ({ ...t, [row.id]: v }))}
                    trackColor={{ false: '#E5E7EB', true: theme.colors.primary }}
                  />
                ) : (
                  <Text style={styles.chevron}>Not connected</Text>
                )}
              </View>
            ))}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}
${STYLES}`;
}

export function render(ctx: RenderContext): RenderedBlock {
  const configJson = canonicalJson(ctx.config);
  const grouped = ctx.variant === 'grouped';
  return {
    fileName: `${ctx.instanceId}.tsx`,
    content: renderVariant(ctx, configJson, grouped),
    acceptsOnComplete: false,
    acceptsInput: false,
  };
}
