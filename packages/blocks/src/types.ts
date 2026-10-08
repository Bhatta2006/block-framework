/**
 * Context handed to every block template.
 * Templates are pure functions: same context in, byte-identical file out.
 */
export interface BlockTheme {
  primaryColor: string;
  backgroundColor: string;
  textColor: string;
}

export interface RenderContext {
  /** Block instance id, e.g. "b1". */
  instanceId: string;
  /** Sanitized React component name, e.g. "B1Block". */
  componentName: string;
  /** Screen this instance is placed on, e.g. "s1". */
  screenId: string;
  /** Chosen variant (always a member of the manifest's variants). */
  variant: string;
  /** Instance config, already validated against the manifest's config schema. */
  config: Record<string, unknown>;
  theme: BlockTheme;
  /**
   * Screen id the block should navigate to when it completes, or null when
   * the block's completion events are terminal in the current flow.
   */
  onCompleteTarget: string | null;
  /**
   * TypeScript type literal for the component's `input` prop, derived from
   * the incoming wire's payload schema. Null when no incoming wire carries
   * a payload. Templates interpolate this into the prop type.
   */
  inputType: string | null;
  /** Event name of the incoming wire, if any. */
  inputEvent: string | null;
  /** A composed page owns scrolling; list blocks render inline in that context. */
  composed?: boolean;
}

export interface RenderedBlock {
  /** File name relative to the emitted project's src/blocks/ dir. */
  fileName: string;
  /** Full file content. */
  content: string;
  /** Whether the generated component accepts an optional onComplete prop. */
  acceptsOnComplete: boolean;
  /** Whether the generated component accepts an optional input prop. */
  acceptsInput: boolean;
}

export type BlockTemplate = (ctx: RenderContext) => RenderedBlock;

/** Sanitize an instance id into a valid, unique-ish React component name. */
export function componentNameFor(instanceId: string): string {
  const clean = instanceId.replace(/[^A-Za-z0-9]/g, '');
  const base = clean.length > 0 ? clean.charAt(0).toUpperCase() + clean.slice(1) : 'Block';
  return `${base}Block`;
}

/** Sanitize a screen id into a valid React component name for its wrapper. */
export function screenComponentNameFor(screenId: string): string {
  const clean = screenId.replace(/[^A-Za-z0-9]/g, '');
  const base = clean.length > 0 ? clean.charAt(0).toUpperCase() + clean.slice(1) : 'Screen';
  return `${base}Screen`;
}
