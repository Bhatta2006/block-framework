export type WireOrigin = 'auto' | 'user';

export interface Wire {
  id: string;
  from: { instance: string; event: string };
  to: { screen: string };
  origin: WireOrigin;
  /** Human-readable explanation of why this wire exists. */
  reason: string;
}

export interface UnmetWire {
  instance: string;
  event: string;
  reason: string;
}

export interface AmbiguousWire {
  instance: string;
  event: string;
  candidates: string[];
}

export interface UnmetRequirement {
  instance: string;
  entity: string;
}

export interface WiringReport {
  resolved: Wire[];
  unmet: UnmetWire[];
  ambiguous: AmbiguousWire[];
  unmetRequirements: UnmetRequirement[];
  /** Non-fatal observations (e.g. optional services falling back to mocks). */
  warnings: string[];
  /** Informational notes (e.g. terminal events that intentionally go nowhere). */
  notes: string[];
}

export interface WiringResult {
  wires: Wire[];
  report: WiringReport;
}

/** Entities the M0 platform provides without any block. */
export const PLATFORM_ENTITIES = ['Navigation', 'Theme', 'AppLifecycle'] as const;

/**
 * Consumed ports the M0 engine satisfies by convention, without wires.
 * Full consumer-driven event routing arrives in M1.
 */
export const CONVENTION_CONSUMES: Record<string, string> = {
  'app.launched': 'satisfied: screen participates in the app flow',
  'paywall.show': 'satisfied by screen navigation',
};
