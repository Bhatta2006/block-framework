import { canonicalJson } from '../../canonical.js';
import type { RenderContext, RenderedBlock } from '../../types.js';

const HEADER = `import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { theme } from '../theme';
import { signIn, signUp, type MockUser } from '../services/auth.mock';

export interface AuthConfig {
  headline: string;
  subheadline?: string;
  ctaText?: string;
}

export interface AuthCompleted {
  user: MockUser;
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
    fontSize: 28,
    fontWeight: '800',
    color: theme.colors.text,
    marginBottom: 8,
  },
  subheadline: {
    fontSize: 16,
    color: '#6B7280',
    marginBottom: 32,
    lineHeight: 24,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: 16,
    color: theme.colors.text,
    backgroundColor: '#FFFFFF',
    marginBottom: 16,
  },
  button: {
    backgroundColor: theme.colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  error: {
    color: '#DC2626',
    fontSize: 14,
    marginBottom: 16,
    textAlign: 'center',
  },
  mockNote: {
    marginTop: 24,
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'center',
  },
});
`;

function renderVariant(ctx: RenderContext, configJson: string, signup: boolean): string {
  const name = ctx.componentName;
  const action = signup ? 'signUp' : 'signIn';
  return `${HEADER}
const CONFIG: AuthConfig = ${configJson};

export function ${name}({ onComplete }: { onComplete?: (output: AuthCompleted) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const valid = email.includes('@') && password.length >= 6;

  async function submit(): Promise<void> {
    if (!valid || busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await ${action}(email.trim(), password);
      onComplete?.({ user: result.user, mocked: result.mocked });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.headline}>{CONFIG.headline}</Text>
      {CONFIG.subheadline ? <Text style={styles.subheadline}>{CONFIG.subheadline}</Text> : null}
      <Text style={styles.label}>Email</Text>
      <TextInput
        style={styles.input}
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        placeholder="you@example.com"
        placeholderTextColor="#9CA3AF"
      />
      <Text style={styles.label}>Password</Text>
      <TextInput
        style={styles.input}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="password"
        placeholder="At least 6 characters"
        placeholderTextColor="#9CA3AF"
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable
        style={[styles.button, (!valid || busy) && styles.buttonDisabled]}
        onPress={submit}
        disabled={!valid || busy}
      >
        {busy ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.buttonText}>{CONFIG.ctaText ?? 'Continue'}</Text>
        )}
      </Pressable>
      <Text style={styles.mockNote}>Demo build — auth is simulated locally.</Text>
    </View>
  );
}
${STYLES}`;
}

export function render(ctx: RenderContext): RenderedBlock {
  const configJson = canonicalJson(ctx.config);
  const signup = ctx.variant === 'signup';
  return {
    fileName: `${ctx.instanceId}.tsx`,
    content: renderVariant(ctx, configJson, signup),
    acceptsOnComplete: true,
    acceptsInput: false,
  };
}
