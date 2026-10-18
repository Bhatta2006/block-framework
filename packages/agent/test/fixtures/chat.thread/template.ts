// chat.thread: a message thread with a local composer.
// Self-contained and pure: same context in, byte-identical file out.
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

interface Message {
  author: string;
  text: string;
  mine?: boolean;
}

export function render(ctx: RenderContext): RenderedBlock {
  const { instanceId, componentName, variant, config } = ctx;
  const messages = (Array.isArray(config['messages']) ? config['messages'] : []) as Message[];
  const title = String(config['title'] ?? '');
  const placeholder = JSON.stringify(String(config['placeholder'] ?? 'Write a message'));
  const sendLabel = JSON.stringify(String(config['sendLabel'] ?? 'Send'));
  const compact = variant === 'compact';
  const initial = JSON.stringify(
    messages.map((m) => ({
      author: String(m.author),
      text: String(m.text),
      mine: m.mine === true,
    })),
  );

  const content = [
    "import React, { useState } from 'react';",
    "import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';",
    "import { theme } from '../theme';",
    '',
    'interface Message {',
    '  author: string;',
    '  text: string;',
    '  mine: boolean;',
    '}',
    '',
    `const INITIAL: Message[] = ${initial};`,
    '',
    `export function ${componentName}() {`,
    '  const [messages, setMessages] = useState<Message[]>(INITIAL);',
    "  const [draft, setDraft] = useState('');",
    '  const send = () => {',
    '    const text = draft.trim();',
    '    if (!text) return;',
    "    setMessages([...messages, { author: 'You', text, mine: true }]);",
    "    setDraft('');",
    '  };',
    '  return (',
    '    <View style={styles.container}>',
    ...(title ? [`      <Text style={styles.title}>{${JSON.stringify(title)}}</Text>`] : []),
    '      {messages.map((message, index) => (',
    compact
      ? '        <Text key={index} style={styles.line}>'
      : '        <View key={index} style={[styles.bubble, message.mine ? styles.mine : null]}>',
    compact
      ? '          <Text style={styles.author}>{message.author}: </Text>{message.text}'
      : '          <Text style={styles.author}>{message.author}</Text>',
    ...(compact ? [] : ['          <Text style={styles.text}>{message.text}</Text>']),
    compact ? '        </Text>' : '        </View>',
    '      ))}',
    '      <View style={styles.composer}>',
    `        <TextInput style={styles.input} value={draft} onChangeText={setDraft} placeholder={${placeholder}} />`,
    '        <Pressable style={styles.send} onPress={send}>',
    `          <Text style={styles.sendText}>{${sendLabel}}</Text>`,
    '        </Pressable>',
    '      </View>',
    '    </View>',
    '  );',
    '}',
    '',
    'const styles = StyleSheet.create({',
    `  container: { flex: 1, backgroundColor: theme.colors.background, padding: ${compact ? 12 : 24}, gap: ${compact ? 4 : 12} },`,
    "  title: { fontSize: 22, fontWeight: '700', color: theme.colors.text },",
    "  bubble: { alignSelf: 'flex-start', maxWidth: '80%', padding: 12, borderRadius: 16, backgroundColor: '#F3F4F6' },",
    "  mine: { alignSelf: 'flex-end', backgroundColor: '#E0E7FF' },",
    '  line: { fontSize: 15, color: theme.colors.text },',
    "  author: { fontWeight: '700', color: theme.colors.text },",
    '  text: { fontSize: 15, color: theme.colors.text },',
    "  composer: { flexDirection: 'row', gap: 8, marginTop: 'auto' },",
    "  input: { flex: 1, borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 12, padding: 10 },",
    "  send: { backgroundColor: theme.colors.primary, borderRadius: 12, paddingHorizontal: 16, justifyContent: 'center' },",
    "  sendText: { color: '#FFFFFF', fontWeight: '700' },",
    '});',
    '',
  ].join('\n');

  return { fileName: `${instanceId}.tsx`, content, acceptsOnComplete: false, acceptsInput: false };
}
