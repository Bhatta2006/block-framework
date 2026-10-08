import type { BlockTemplate } from './types.js';
import { canonicalJson } from './canonical.js';

function renderer(kind: 'Collection' | 'Editor' | 'Summary'): BlockTemplate {
  return (ctx) => {
    const inputType = ctx.inputType ?? '{ collection: string; recordId: string }';
    return {
      fileName: `${ctx.instanceId}.tsx`,
      acceptsOnComplete: kind !== 'Summary',
      acceptsInput: kind === 'Editor',
      content: `import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Data${kind} } from '../data-runtime';
import { theme } from '../theme';
export function ${ctx.componentName}({ onComplete${kind === 'Editor' ? ', input' : ''} }: { onComplete?: (output: ${kind === 'Collection' ? '{ collection: string; recordId: string }' : '{}'}) => void; ${kind === 'Editor' ? 'input?: ' + inputType + ';' : ''} }) {
  return <View style={styles.container}><Data${kind} config={${canonicalJson(ctx.config)}} ${kind === 'Editor' ? 'input={input}' : ''} onComplete={onComplete} /></View>;
}
const styles = StyleSheet.create({ container: { flex: 1, backgroundColor: theme.colors.background, padding: 16 } });
`,
    };
  };
}
export const renderCollection = renderer('Collection');
export const renderEditor = renderer('Editor');
export const renderSummary = renderer('Summary');
