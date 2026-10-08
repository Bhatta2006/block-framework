import ts from 'typescript';
import type { BlockDesign, ElementDesign } from '@blockfw/manifest';

const names: Record<string, string> = {
  container: 'container',
  section: 'container',
  headline: 'title',
  title: 'title',
  prompt: 'title',
  name: 'title',
  header: 'title',
  subheadline: 'subtitle',
  subtitle: 'subtitle',
  bio: 'subtitle',
  body: 'subtitle',
  button: 'button',
  primaryButton: 'button',
  cta: 'button',
  buttonText: 'buttonText',
  primaryButtonText: 'buttonText',
  ctaText: 'buttonText',
  input: 'input',
  image: 'image',
  imagePlaceholder: 'image',
  heroImage: 'image',
  eyebrow: 'eyebrow',
  kicker: 'eyebrow',
  hero: 'image',
  skip: 'secondaryButton',
  skipText: 'secondaryButton',
  restore: 'secondaryButton',
  restoreText: 'secondaryButton',
  textButton: 'secondaryButton',
  label: 'label',
  option: 'choice',
  optionText: 'choice-text',
  progressTrack: 'progress',
  progressFill: 'progress-fill',
  counter: 'fine-print',
  avatar: 'avatar',
  compactAvatar: 'avatar',
  avatarText: 'avatar-text',
  compactAvatarText: 'avatar-text',
  handle: 'handle',
  statsRow: 'profile-stats',
  stat: 'stat',
  statValue: 'stat-value',
  statLabel: 'stat-label',
  value: 'stat-value',
  delta: 'delta',
  productCard: 'product-option',
  productTitle: 'product-title',
  productPeriod: 'product-period',
  productPrice: 'product-price',
  sectionTitle: 'section-title',
  rowLabel: 'setting-label',
  rowDetail: 'setting-detail',
  rowLeft: 'setting-copy',
  itemTitle: 'item-title',
  itemSubtitle: 'item-subtitle',
  card: 'item',
  gridCard: 'item',
};
function nativeStyle(value: ElementDesign, text: boolean): Record<string, unknown> {
  const { x, y, hidden, color, fontSize, fontWeight, textAlign, ...viewStyle } = value;
  const typography = Object.fromEntries(
    Object.entries({ color, fontSize, fontWeight, textAlign }).filter(([, v]) => v !== undefined),
  );
  const style = {
    ...viewStyle,
    ...(text ? typography : {}),
    ...(text && textAlign && !value.alignSelf
      ? { width: value.width ?? '100%', alignSelf: 'stretch' }
      : {}),
  };
  return {
    ...style,
    ...(hidden ? { display: 'none' } : {}),
    ...(x !== undefined || y !== undefined
      ? { transform: [{ translateX: x ?? 0 }, { translateY: y ?? 0 }] }
      : {}),
  };
}
function literal(value: unknown): ts.Expression {
  if (typeof value === 'number')
    return value < 0
      ? ts.factory.createPrefixUnaryExpression(
          ts.SyntaxKind.MinusToken,
          ts.factory.createNumericLiteral(-value),
        )
      : ts.factory.createNumericLiteral(value);
  if (typeof value === 'string') return ts.factory.createStringLiteral(value);
  if (Array.isArray(value)) return ts.factory.createArrayLiteralExpression(value.map(literal));
  return ts.factory.createObjectLiteralExpression(
    Object.entries(value as Record<string, unknown>).map(([key, child]) =>
      ts.factory.createPropertyAssignment(key, literal(child)),
    ),
  );
}

/** Transform JSX styles structurally; generated logic and event handlers stay intact. */
export function customizeNativeStyles(source: string, design?: BlockDesign): string {
  if (!design?.elements || !Object.keys(design.elements).length) return source;
  const file = ts.createSourceFile(
    'block.tsx',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const counts: Record<string, number> = {};
  const result = ts.transform(file, [
    (context) => {
      const visitor: ts.Visitor = (node) => {
        if (
          ts.isJsxAttribute(node) &&
          node.name.getText(file) === 'style' &&
          node.initializer &&
          ts.isJsxExpression(node.initializer) &&
          node.initializer.expression
        ) {
          const old = node.initializer.expression;
          const matches = [...old.getText(file).matchAll(/styles\.([A-Za-z]+)/g)];
          const nativeKey = matches[0]?.[1] ?? '';
          const key =
            names[nativeKey] ?? nativeKey.replace(/[A-Z]/g, (letter) => '-' + letter.toLowerCase());
          if (key) {
            const count = (counts[key] ?? 0) + 1;
            counts[key] = count;
            const id = count === 1 ? key : key + '-' + count;
            let value = design.elements?.[id] ?? design.elements?.[key];
            if (key === 'buttonText' && !value && design.elements?.button) {
              const { color, fontSize, fontWeight, textAlign } = design.elements.button;
              value = Object.fromEntries(
                Object.entries({ color, fontSize, fontWeight, textAlign }).filter(
                  ([, v]) => v !== undefined,
                ),
              );
            }
            if (value) {
              const tag = (node.parent.parent as ts.JsxOpeningElement).tagName.getText(file);
              const override = literal(nativeStyle(value, tag === 'Text' || tag === 'TextInput'));
              const styled =
                ts.isArrowFunction(old) && !ts.isBlock(old.body)
                  ? ts.factory.updateArrowFunction(
                      old,
                      old.modifiers,
                      old.typeParameters,
                      old.parameters,
                      old.type,
                      old.equalsGreaterThanToken,
                      ts.factory.createArrayLiteralExpression([old.body, override]),
                    )
                  : ts.factory.createArrayLiteralExpression([old, override]);
              return ts.factory.updateJsxAttribute(
                node,
                node.name,
                ts.factory.createJsxExpression(undefined, styled),
              );
            }
          }
        }
        return ts.visitEachChild(node, visitor, context);
      };
      return (root) => ts.visitNode(root, visitor) as ts.SourceFile;
    },
  ]);
  const output = ts.createPrinter().printFile(result.transformed[0]!);
  result.dispose();
  return output;
}

/** Added elements and optional per-element actions are compiled into native JSX too. */
export function customizeNative(
  source: string,
  design?: BlockDesign,
  routes: Record<string, string> = {},
): string {
  source = customizeNativeStyles(source, design);
  if (!design?.content?.length && !Object.keys(design?.actions ?? {}).length) return source;
  const actions = design?.actions ?? {};
  const cases = Object.entries(actions)
    .map(([id, action]) => {
      let body = '';
      if (action.type === 'navigate') {
        const event = 'element.' + id + '.pressed';
        const target = design?.disconnectedEvents?.includes(event) ? undefined : routes[event];
        if (target) body = 'studioNavigation.navigate(' + JSON.stringify(target) + ' as never);';
      }
      if (action.type === 'back')
        body = 'if (studioNavigation.canGoBack()) studioNavigation.goBack();';
      if (action.type === 'url')
        body =
          'void StudioLinking.openURL(' +
          JSON.stringify(action.url) +
          ').catch(() => StudioAlert.alert("Unable to open link"));';
      if (action.type === 'message')
        body = 'StudioAlert.alert(' + JSON.stringify(action.message) + ');';
      return 'case ' + JSON.stringify(id) + ': ' + body + ' return;';
    })
    .join('\n');
  const helperSource =
    'const studioNavigation = studioUseNavigation(); const studioAction = (id: string) => { switch(id) { ' +
    cases +
    ' } };';
  // Reparse generated JSX together with its host so all AST text ranges share a source file.
  const added = (design?.content ?? []).map((item) => {
    const style = design?.elements?.[item.id] ?? {};
    const view = JSON.stringify(nativeStyle(style, false));
    const textStyle =
      item.type === 'button'
        ? Object.fromEntries(
            Object.entries(style).filter(([key]) =>
              ['color', 'fontSize', 'fontWeight', 'textAlign'].includes(key),
            ),
          )
        : style;
    const text = JSON.stringify(nativeStyle(textStyle, true));
    const label = JSON.stringify(
      item.text ?? (item.type === 'button' ? 'New button' : 'Your text'),
    );
    if (item.type === 'divider')
      return (
        '<StudioView key={' +
        JSON.stringify(item.id) +
        '} style={[{ height: 1, backgroundColor: "#d7ded8", width: "100%", marginVertical: 12 }, ' +
        view +
        ']} />'
      );
    if (item.type === 'text')
      return (
        '<StudioText key={' +
        JSON.stringify(item.id) +
        '} style={[{ fontSize: 16, marginVertical: 8 }, ' +
        text +
        ']}>{' +
        label +
        '}</StudioText>'
      );
    return (
      '<StudioPressable key={' +
      JSON.stringify(item.id) +
      '} accessibilityRole="button" onPress={() => studioAction(' +
      JSON.stringify(item.id) +
      ')} style={[{ backgroundColor: theme.colors.primary, padding: 16, borderRadius: 12, marginVertical: 8 }, ' +
      view +
      ']}><StudioText style={[{ color: "#ffffff", fontWeight: "700", textAlign: "center" }, ' +
      text +
      ']}>{' +
      label +
      '}</StudioText></StudioPressable>'
    );
  });
  const file = ts.createSourceFile(
    'block.tsx',
    source + '\n' + helperSource + '\nconst studioAdded = <>' + added.join('') + '</>;',
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const extra = file.statements[file.statements.length - 1] as ts.VariableStatement;
  const helperStatements = file.statements.slice(-3, -1);
  const fragment = extra.declarationList.declarations[0]!.initializer as ts.JsxFragment;
  const counts: Record<string, number> = {};
  const inserted = new Set<number>();
  let inComponent = false;
  let rootAdded = false;
  const result = ts.transform(file, [
    (context) => {
      const visitor: ts.Visitor = (node) => {
        if (node === extra || helperStatements.includes(node as ts.Statement)) return undefined;
        if (
          ts.isFunctionDeclaration(node) &&
          node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) &&
          node.body
        ) {
          inComponent = true;
          const body = ts.visitEachChild(node.body, visitor, context) as ts.Block;
          inComponent = false;
          return ts.factory.updateFunctionDeclaration(
            node,
            node.modifiers,
            node.asteriskToken,
            node.name,
            node.typeParameters,
            node.parameters,
            node.type,
            ts.factory.updateBlock(body, [...helperStatements, ...body.statements]),
          );
        }
        if (inComponent && ts.isJsxElement(node)) {
          const opening = node.openingElement;
          const style = opening.attributes.properties.find(
            (a) => ts.isJsxAttribute(a) && a.name.getText(file) === 'style',
          ) as ts.JsxAttribute | undefined;
          const nativeKey = style?.getText(file).match(/styles\.([A-Za-z]+)/)?.[1] ?? '';
          const base =
            names[nativeKey] ?? nativeKey.replace(/[A-Z]/g, (v) => '-' + v.toLowerCase());
          const count = (counts[base] ?? 0) + 1;
          counts[base] = count;
          const key = count === 1 ? base : base + '-' + count;
          const isRoot = base === 'container' && !rootAdded;
          if (isRoot) rootAdded = true;
          let updated = ts.visitEachChild(node, visitor, context) as ts.JsxElement;
          if (actions[key] && opening.tagName.getText(file) !== 'Text') {
            const handler = ts.factory.createJsxAttribute(
              ts.factory.createIdentifier('onPress'),
              ts.factory.createJsxExpression(
                undefined,
                ts.factory.createArrowFunction(
                  undefined,
                  undefined,
                  [],
                  undefined,
                  ts.factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
                  ts.factory.createCallExpression(
                    ts.factory.createIdentifier('studioAction'),
                    undefined,
                    [ts.factory.createStringLiteral(key)],
                  ),
                ),
              ),
            );
            updated = ts.factory.updateJsxElement(
              updated,
              ts.factory.updateJsxOpeningElement(
                updated.openingElement,
                updated.openingElement.tagName,
                updated.openingElement.typeArguments,
                ts.factory.updateJsxAttributes(updated.openingElement.attributes, [
                  ...updated.openingElement.attributes.properties.filter(
                    (a) => !ts.isJsxAttribute(a) || a.name.getText(file) !== 'onPress',
                  ),
                  handler,
                ]),
              ),
              updated.children,
              updated.closingElement,
            );
          }
          if (isRoot)
            updated = ts.factory.updateJsxElement(
              updated,
              updated.openingElement,
              [...updated.children, ...fragment.children.filter((_, i) => !inserted.has(i))],
              updated.closingElement,
            );
          const before = (design?.content ?? []).flatMap((item, i) =>
            item.before === key && !inserted.has(i)
              ? (inserted.add(i), [fragment.children[i]!])
              : [],
          );
          if (before.length)
            return ts.factory.createJsxFragment(
              ts.factory.createJsxOpeningFragment(),
              [...before, updated],
              ts.factory.createJsxJsxClosingFragment(),
            );
          return updated;
        }
        return ts.visitEachChild(node, visitor, context);
      };
      return (root) => ts.visitNode(root, visitor) as ts.SourceFile;
    },
  ]);
  const output = ts.createPrinter().printFile(result.transformed[0]!);
  result.dispose();
  return (
    "import { View as StudioView, Text as StudioText, Pressable as StudioPressable, Linking as StudioLinking, Alert as StudioAlert } from 'react-native';\nimport { useNavigation as studioUseNavigation } from '@react-navigation/native';\n" +
    output
  );
}
