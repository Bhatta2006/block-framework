import type { BlockTemplate } from './types.js';

/** Cloud contracts are web-first. The compiler refuses a native cloud export. */
export const renderCloud: BlockTemplate = (ctx) => ({
  fileName: ctx.componentName + '.tsx',
  acceptsInput: false,
  acceptsOnComplete: false,
  content: `import React from 'react';
import { View, Text } from 'react-native';
export function ${ctx.componentName}() {
  return <View><Text>This cloud integration requires the web application target.</Text></View>;
}
`,
});
