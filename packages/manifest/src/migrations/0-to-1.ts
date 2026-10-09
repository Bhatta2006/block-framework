import type { ProjectGraph } from '../types.js';
import type { AppGraphV1 } from '../graph-v1.js';
import { validateProjectGraph, validateAppGraphV1 } from '../validate.js';
import { projectGraphToV1 } from './projection.js';
export { LEGACY_THEME_KEYS } from './projection.js';

/** Validate at the trust boundary; share the pure projection with the client diff adapter. */
export function migrate0To1(input: ProjectGraph): AppGraphV1 {
  validateProjectGraph(input);
  const migrated = projectGraphToV1(input);
  validateAppGraphV1(migrated);
  return migrated;
}
