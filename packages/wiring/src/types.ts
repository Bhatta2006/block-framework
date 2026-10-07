export type WireOrigin = 'auto' | 'user';

export interface Wire {
  id: string;
  from: { instance: string; event: string };
  to: {
    screen: string;
    /** Semantic consumer instance, when the wire targets a specific block. */
    instance?: string;
    /** The consumer's port that handles the event. */
    port?: string;
  };
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

export interface FlowModel {
  /** First screen in graph order — the app's entry point. */
  entry: string;
  screens: { id: string; title: string; block: string }[];
  /** Screens reachable from the entry by following wires. */
  reachable: string[];
  /** Screens no wire path reaches (warning, not error — flows can branch). */
  unreachable: string[];
  /** Distinct lanes present in the graph (only set when non-main lanes exist). */
  lanes?: string[];
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
  /** Flow Lanes: the screen flow modeled as data for the canvas (M2). */
  flow: FlowModel;
}

export interface WiringResult {
  wires: Wire[];
  report: WiringReport;
}

/** Entities the platform provides without any block. */
export const PLATFORM_ENTITIES = ['Navigation', 'Theme', 'AppLifecycle'] as const;

/**
 * Consumed ports satisfied by convention, without wires.
 * `app.launched` fires for every screen in the flow; other lifecycle ports
 * are satisfied by screen navigation. Named event ports (matched by the
 * semantic router) are NOT in this table — they need real consumers.
 */
export const CONVENTION_CONSUMES: Record<string, string> = {
  'app.launched': 'satisfied: screen participates in the app flow',
  'paywall.show': 'satisfied by screen navigation',
};
