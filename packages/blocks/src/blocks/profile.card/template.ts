import { canonicalJson } from '../../canonical.js';
import type { RenderContext, RenderedBlock } from '../../types.js';

const HEADER = `import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { theme } from '../theme';

export interface ProfileStat {
  label: string;
  value: string;
}

export interface ProfileConfig {
  name: string;
  handle?: string;
  bio?: string;
  stats?: ProfileStat[];
}
`;

const STYLES = `
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    padding: 24,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  avatarText: {
    fontSize: 32,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  name: {
    fontSize: 24,
    fontWeight: '800',
    color: theme.colors.text,
  },
  handle: {
    fontSize: 15,
    color: '#6B7280',
    marginTop: 4,
  },
  bio: {
    fontSize: 15,
    color: '#4B5563',
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 22,
  },
  statsRow: {
    flexDirection: 'row',
    marginTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    paddingTop: 16,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: '800',
    color: theme.colors.text,
  },
  statLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
  },
  compactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  compactAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  compactAvatarText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
`;

function renderCard(ctx: RenderContext, configJson: string): string {
  const name = ctx.componentName;
  return `${HEADER}
const CONFIG: ProfileConfig = ${configJson};

function initials(displayName: string): string {
  return displayName
    .split(/\\s+/)
    .map((p) => p.charAt(0))
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export function ${name}() {
  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials(CONFIG.name)}</Text>
        </View>
        <Text style={styles.name}>{CONFIG.name}</Text>
        {CONFIG.handle ? <Text style={styles.handle}>{CONFIG.handle}</Text> : null}
        {CONFIG.bio ? <Text style={styles.bio}>{CONFIG.bio}</Text> : null}
        {CONFIG.stats && CONFIG.stats.length > 0 ? (
          <View style={styles.statsRow}>
            {CONFIG.stats.map((s) => (
              <View key={s.label} style={styles.stat}>
                <Text style={styles.statValue}>{s.value}</Text>
                <Text style={styles.statLabel}>{s.label}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}
${STYLES}`;
}

function renderCompact(ctx: RenderContext, configJson: string): string {
  const name = ctx.componentName;
  return `${HEADER}
const CONFIG: ProfileConfig = ${configJson};

function initials(displayName: string): string {
  return displayName
    .split(/\\s+/)
    .map((p) => p.charAt(0))
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export function ${name}() {
  return (
    <View style={styles.container}>
      <View style={styles.compactRow}>
        <View style={styles.compactAvatar}>
          <Text style={styles.compactAvatarText}>{initials(CONFIG.name)}</Text>
        </View>
        <View>
          <Text style={styles.name}>{CONFIG.name}</Text>
          {CONFIG.handle ? <Text style={styles.handle}>{CONFIG.handle}</Text> : null}
        </View>
      </View>
      {CONFIG.bio ? <Text style={styles.bio}>{CONFIG.bio}</Text> : null}
    </View>
  );
}
${STYLES}`;
}

export function render(ctx: RenderContext): RenderedBlock {
  const configJson = canonicalJson(ctx.config);
  const compact = ctx.variant === 'compact';
  return {
    fileName: `${ctx.instanceId}.tsx`,
    content: compact ? renderCompact(ctx, configJson) : renderCard(ctx, configJson),
    acceptsOnComplete: false,
    acceptsInput: false,
  };
}
