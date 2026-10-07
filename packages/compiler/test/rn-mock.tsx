import React from 'react';

/**
 * Minimal react-native → DOM mapping for headless render tests.
 * Implements just enough of the RN API for our block templates:
 * View, Text, Pressable, ScrollView, FlatList, ActivityIndicator, StyleSheet.
 *
 * Style props (including RN's array form and Pressable's
 * `style={({ pressed }) => ...}` function form) are resolved to plain
 * DOM style objects. This is test infrastructure, not a renderer.
 */

type StyleInput = unknown;

function resolveStyle(style: StyleInput): Record<string, unknown> {
  if (typeof style === 'function') {
    return resolveStyle((style as (state: { pressed: boolean }) => unknown)({ pressed: false }));
  }
  if (Array.isArray(style)) {
    const out: Record<string, unknown> = {};
    for (const part of style) {
      if (part) Object.assign(out, resolveStyle(part));
    }
    return out;
  }
  if (style !== null && typeof style === 'object') {
    return style as Record<string, unknown>;
  }
  return {};
}

interface AnyProps {
  [key: string]: unknown;
  children?: React.ReactNode;
}

function domProps(props: AnyProps): AnyProps {
  const { style, contentContainerStyle, ...rest } = props;
  void contentContainerStyle;
  return { ...rest, style: resolveStyle(style) };
}

export function View(props: AnyProps): React.ReactElement {
  return React.createElement('div', domProps(props), props.children);
}

export function Text(props: AnyProps): React.ReactElement {
  return React.createElement('span', domProps(props), props.children);
}

export function ScrollView(props: AnyProps): React.ReactElement {
  return React.createElement(
    'div',
    { ...domProps(props), style: { ...(domProps(props).style as object), overflowY: 'auto' } },
    props.children,
  );
}

export function Pressable(
  props: AnyProps & { onPress?: () => void; disabled?: boolean },
): React.ReactElement {
  const { onPress, disabled, children, ...rest } = props;
  const content =
    typeof children === 'function'
      ? (children as (state: { pressed: boolean }) => React.ReactNode)({ pressed: false })
      : children;
  return React.createElement(
    'button',
    { ...domProps(rest), onClick: disabled ? undefined : onPress, disabled: disabled ?? undefined },
    content,
  );
}

export function FlatList(
  props: AnyProps & {
    data?: Array<unknown>;
    renderItem?: (info: { item: unknown; index: number }) => React.ReactNode;
    keyExtractor?: (item: unknown, index: number) => string;
    numColumns?: number;
  },
): React.ReactElement {
  const { data, renderItem, keyExtractor } = props;
  return React.createElement(
    'div',
    null,
    (data ?? []).map((item, index) =>
      React.createElement(
        'div',
        { key: keyExtractor ? keyExtractor(item, index) : String(index) },
        renderItem ? renderItem({ item, index }) : null,
      ),
    ),
  );
}

export function ActivityIndicator(): React.ReactElement {
  return React.createElement('div', { 'data-testid': 'activity-indicator' }, 'Loading…');
}

export function TextInput(
  props: AnyProps & {
    value?: string;
    onChangeText?: (text: string) => void;
    placeholder?: string;
    secureTextEntry?: boolean;
    editable?: boolean;
  },
): React.ReactElement {
  const { value, onChangeText, placeholder, secureTextEntry, editable } = props;
  return React.createElement('input', {
    ...domProps(props),
    value: value ?? '',
    placeholder,
    type: secureTextEntry ? 'password' : 'text',
    disabled: editable === false,
    onChange: onChangeText
      ? (e: React.ChangeEvent<HTMLInputElement>) => onChangeText(e.target.value)
      : undefined,
  });
}

export function Switch(
  props: AnyProps & { value?: boolean; onValueChange?: (v: boolean) => void; disabled?: boolean },
): React.ReactElement {
  const { value, onValueChange, disabled } = props;
  return React.createElement('input', {
    ...domProps(props),
    type: 'checkbox',
    role: 'switch',
    checked: value ?? false,
    disabled: disabled ?? undefined,
    onChange: onValueChange
      ? (e: React.ChangeEvent<HTMLInputElement>) => onValueChange(e.target.checked)
      : undefined,
  });
}

export const StyleSheet = {
  create<T extends Record<string, unknown>>(styles: T): T {
    return styles;
  },
};
