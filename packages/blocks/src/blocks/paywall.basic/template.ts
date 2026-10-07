import { canonicalJson } from '../../canonical.js';
import type { RenderContext, RenderedBlock } from '../../types.js';

const HEADER = `import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '../theme';
import { purchaseProduct, restorePurchases } from '../services/billing.mock';

export interface PaywallProduct {
  id: string;
  title: string;
  price: string;
  period: string;
}

export interface PaywallConfig {
  headline: string;
  subheadline?: string;
  products: PaywallProduct[];
  ctaText?: string;
}

export interface PaywallResult {
  productId?: string;
  restored?: boolean;
  mocked: boolean;
}
`;

const STYLES = `
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
    padding: 24,
    justifyContent: 'center',
  },
  headline: {
    fontSize: 26,
    fontWeight: '800',
    color: theme.colors.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  subheadline: {
    fontSize: 15,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 24,
  },
  productCard: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  productCardSelected: {
    borderColor: theme.colors.primary,
    backgroundColor: '#F5F3FF',
    borderWidth: 2,
  },
  productTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
  },
  productPeriod: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
  productPrice: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.primary,
  },
  primaryButton: {
    marginTop: 12,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    backgroundColor: theme.colors.primary,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  restoreText: {
    marginTop: 16,
    textAlign: 'center',
    fontSize: 14,
    color: '#6B7280',
    textDecorationLine: 'underline',
  },
  mockBadge: {
    marginTop: 24,
    alignSelf: 'center',
    backgroundColor: '#FEF3C7',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  mockBadgeText: {
    fontSize: 11,
    color: '#92400E',
    fontWeight: '600',
  },
});
`;

function logicBody(selectedProductId: string): string {
  return `  const [busy, setBusy] = useState(false);
  const cta = CONFIG.ctaText ?? 'Subscribe';

  async function subscribe() {
    if (busy) return;
    setBusy(true);
    try {
      const receipt = await purchaseProduct(${selectedProductId});
      onComplete?.({ productId: receipt.productId, mocked: true });
    } finally {
      setBusy(false);
    }
  }

  async function restore() {
    if (busy) return;
    setBusy(true);
    try {
      await restorePurchases();
      onComplete?.({ restored: true, mocked: true });
    } finally {
      setBusy(false);
    }
  }
`;
}

function renderCards(ctx: RenderContext, configJson: string): string {
  const name = ctx.componentName;
  return `${HEADER}
const CONFIG: PaywallConfig = ${configJson};

interface ${name}Props {
  onComplete?: (result: PaywallResult) => void;
}

export function ${name}({ onComplete }: ${name}Props) {
  const [selectedId, setSelectedId] = useState<string>(CONFIG.products[0]?.id ?? '');
${logicBody('selectedId')}
  return (
    <View style={styles.container}>
      <Text style={styles.headline}>{CONFIG.headline}</Text>
      {CONFIG.subheadline ? <Text style={styles.subheadline}>{CONFIG.subheadline}</Text> : null}
      {CONFIG.products.map((product) => {
        const isSelected = product.id === selectedId;
        return (
          <Pressable
            key={product.id}
            onPress={() => setSelectedId(product.id)}
            style={[styles.productCard, isSelected && styles.productCardSelected]}
          >
            <View>
              <Text style={styles.productTitle}>{product.title}</Text>
              <Text style={styles.productPeriod}>per {product.period}</Text>
            </View>
            <Text style={styles.productPrice}>{product.price}</Text>
          </Pressable>
        );
      })}
      <Pressable
        onPress={subscribe}
        disabled={busy}
        style={[styles.primaryButton, busy && styles.buttonDisabled]}
      >
        {busy ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.primaryButtonText}>{cta}</Text>
        )}
      </Pressable>
      <Pressable onPress={restore} disabled={busy}>
        <Text style={styles.restoreText}>Restore purchases</Text>
      </Pressable>
      <View style={styles.mockBadge}>
        <Text style={styles.mockBadgeText}>MOCK CHECKOUT — wire up RevenueCat before shipping</Text>
      </View>
    </View>
  );
}
${STYLES}`;
}

function renderCompact(ctx: RenderContext, configJson: string): string {
  const name = ctx.componentName;
  return `${HEADER}
const CONFIG: PaywallConfig = ${configJson};

interface ${name}Props {
  onComplete?: (result: PaywallResult) => void;
}

export function ${name}({ onComplete }: ${name}Props) {
  const featured = CONFIG.products[0];
${logicBody('featured?.id ?? ""')}
  if (!featured) {
    return (
      <View style={styles.container}>
        <Text style={styles.headline}>No products configured.</Text>
      </View>
    );
  }
  return (
    <View style={styles.container}>
      <Text style={styles.headline}>{CONFIG.headline}</Text>
      {CONFIG.subheadline ? <Text style={styles.subheadline}>{CONFIG.subheadline}</Text> : null}
      <View style={[styles.productCard, styles.productCardSelected]}>
        <View>
          <Text style={styles.productTitle}>{featured.title}</Text>
          <Text style={styles.productPeriod}>per {featured.period}</Text>
        </View>
        <Text style={styles.productPrice}>{featured.price}</Text>
      </View>
      <Pressable
        onPress={subscribe}
        disabled={busy}
        style={[styles.primaryButton, busy && styles.buttonDisabled]}
      >
        {busy ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.primaryButtonText}>{cta}</Text>
        )}
      </Pressable>
      <Pressable onPress={restore} disabled={busy}>
        <Text style={styles.restoreText}>Restore purchases</Text>
      </Pressable>
      <View style={styles.mockBadge}>
        <Text style={styles.mockBadgeText}>MOCK CHECKOUT — wire up RevenueCat before shipping</Text>
      </View>
    </View>
  );
}
${STYLES}`;
}

export function render(ctx: RenderContext): RenderedBlock {
  const configJson = canonicalJson(ctx.config);
  const variant = ctx.variant === 'compact' ? 'compact' : 'cards';
  return {
    fileName: `${ctx.instanceId}.tsx`,
    content: variant === 'compact' ? renderCompact(ctx, configJson) : renderCards(ctx, configJson),
    acceptsOnComplete: true,
    acceptsInput: false,
  };
}
