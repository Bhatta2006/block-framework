/** Portable style properties understood by both web and React Native exports. */
export interface ElementDesign {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  padding?: number;
  marginTop?: number;
  marginBottom?: number;
  borderRadius?: number;
  fontSize?: number;
  fontWeight?: '400' | '500' | '600' | '700' | '800';
  color?: string;
  backgroundColor?: string;
  opacity?: number;
  textAlign?: 'left' | 'center' | 'right';
  alignSelf?: 'flex-start' | 'center' | 'flex-end' | 'stretch';
  hidden?: boolean;
}
export interface BlockDesign {
  elements?: Record<string, ElementDesign>;
  content?: BlockElement[];
  actions?: Record<string, ElementAction>;
  /** Explicitly cut event routes, including automatic connections. */
  disconnectedEvents?: string[];
}
export type ElementAction =
  | { type: 'none' }
  | { type: 'navigate'; screen: string }
  | { type: 'back' }
  | { type: 'url'; url: string }
  | { type: 'message'; message: string };
export interface BlockElement {
  id: string;
  type: 'button' | 'text' | 'divider';
  text?: string;
  /** Insert before a built-in or added element; otherwise append inside the block. */
  before?: string;
}
export const elementEvent = (id: string) => 'element.' + id + '.pressed';
export const elementActionSchema = {
  oneOf: [
    {
      type: 'object',
      additionalProperties: false,
      required: ['type'],
      properties: { type: { enum: ['none', 'back'] } },
    },
    ...(['navigate', 'url', 'message'] as const).map((type) => {
      const key = type === 'navigate' ? 'screen' : type;
      return {
        type: 'object',
        additionalProperties: false,
        required: ['type', key],
        properties: {
          type: { const: type },
          [key]: {
            type: 'string',
            minLength: 1,
            ...(type === 'url' ? { pattern: '^https?://' } : {}),
          },
        },
      };
    }),
  ],
};

export const elementDesignSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    ...Object.fromEntries(
      ['x', 'y'].map((k) => [k, { type: 'number', minimum: -2000, maximum: 2000 }]),
    ),
    ...Object.fromEntries(
      ['width', 'height', 'padding', 'marginTop', 'marginBottom', 'borderRadius'].map((k) => [
        k,
        { type: 'number', minimum: 0, maximum: 2000 },
      ]),
    ),
    fontSize: { type: 'number', minimum: 8, maximum: 200 },
    fontWeight: { enum: ['400', '500', '600', '700', '800'] },
    color: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
    backgroundColor: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
    opacity: { type: 'number', minimum: 0, maximum: 1 },
    textAlign: { enum: ['left', 'center', 'right'] },
    alignSelf: { enum: ['flex-start', 'center', 'flex-end', 'stretch'] },
    hidden: { type: 'boolean' },
  },
} as const;
export const blockDesignSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    content: {
      type: 'array',
      maxItems: 100,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'type'],
        properties: {
          id: { type: 'string', pattern: '^custom-[a-zA-Z0-9-]+$' },
          type: { enum: ['button', 'text', 'divider'] },
          text: { type: 'string', maxLength: 4000 },
          before: { type: 'string' },
        },
      },
    },
    actions: {
      type: 'object',
      propertyNames: { pattern: '^[a-zA-Z][a-zA-Z0-9-]*$' },
      additionalProperties: elementActionSchema,
    },
    disconnectedEvents: { type: 'array', uniqueItems: true, items: { type: 'string' } },
    elements: {
      type: 'object',
      propertyNames: { pattern: '^[a-zA-Z][a-zA-Z0-9-]*$' },
      additionalProperties: elementDesignSchema,
    },
  },
} as const;
