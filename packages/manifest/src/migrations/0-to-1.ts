import { pageBlockIds, type ProjectGraph } from '../types.js';
import type { AppGraphV1, DesignTokens } from '../graph-v1.js';
import { validateProjectGraph, validateAppGraphV1 } from '../validate.js';

export const LEGACY_THEME_KEYS = {
  primaryColor: 'primary',
  backgroundColor: 'background',
  textColor: 'text',
} as const;

/** Copy first: unsuccessful migrations never alter a user's saved project. */
export function migrate0To1(input: ProjectGraph): AppGraphV1 {
  validateProjectGraph(input);
  const graph = structuredClone(input);
  const { theme: oldTheme, cloud, ...app } = graph.app;
  const theme: DesignTokens = {};
  for (const [key, name] of Object.entries(LEGACY_THEME_KEYS)) {
    const value = oldTheme?.[key as keyof typeof LEGACY_THEME_KEYS];
    if (value !== undefined) theme[name] = { $type: 'color', $value: value };
  }
  const migrated: AppGraphV1 = {
    schemaVersion: '1',
    app: { ...app, targets: cloud ? ['web'] : ['web', 'ios', 'android'] },
    theme,
    pages: graph.screens.map(({ block, blocks: _blocks, ...screen }) => ({
      ...screen,
      primaryComponent: block,
      components: [...pageBlockIds({ ...screen, block, ...(_blocks ? { blocks: _blocks } : {}) })],
    })),
    components: graph.blocks.map((block) => ({ ...block, kind: 'block' })),
    data: { entities: [], relations: [], policies: [], seeds: [] },
    flows: [],
    services: cloud
      ? [
          {
            id: 'cloud',
            provider: cloud.provider,
            ...(cloud.backendUrl !== undefined ? { publicUrl: cloud.backendUrl } : {}),
          },
        ]
      : [],
    agents: [],
    env: [],
    ...(graph.wires !== undefined ? { wires: graph.wires } : {}),
    extensions: {
      'blockfw.compatibility': {
        composedPages: graph.screens
          .filter((screen) => screen.blocks !== undefined)
          .map((screen) => screen.id),
        themePresent: oldTheme !== undefined,
      },
    },
  };
  validateAppGraphV1(migrated);
  return migrated;
}
