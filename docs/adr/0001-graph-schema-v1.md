# ADR-0001: Graph schema v1

Date: 2026-10-09. Status: accepted by the user for Phase 0.

## Decision

The persisted graph uses schemaVersion "1", app target declarations, top-level theme tokens, pages, components, data, flows, services, agents, and environment declarations. References use stable existing IDs. Component nodes represent the current flat page composition; arbitrary nesting/slots execute in Phase 1. Data/flow/agent execution stays in later phases. A nonempty unsupported declaration must reject compilation rather than disappear or become a mock.

Keep the current screen/block model as an explicit compatibility view for existing editor and emitter callers. v0 -> v1 -> compatibility view must be lossless, including implicit defaults, array order, canvas positions, navigation, design/actions, cuts, unplaced blocks, cloud declarations, and dataId. There is one source of truth, never two editable copies. Unknown versions reject. Loading migrates a copy, validates it, and only persists after success. Existing files/catalog entries remain recoverable on failure.

The Studio wrapper version remains 1. Profile and touched-path protection are retained; paths continue identifying stable block IDs. Environment declarations contain names, scope and required flags, never secret values. Legacy cloud settings become an explicit Supabase service binding. A block lock pins id/version plus a SHA-256 content digest; resolved dependencies and locks never use timestamps.

## Reuse decision

Adopt existing Ajv 8.20.0 (MIT; published 2026-04-24) and existing JSON Schema draft-07. Do not introduce Zod or a second validator. The application graph/type system and migrator are core IP; no existing generic JSON schema or editor model covers our wiring/storage compatibility. Puck's JSON model is a Design-mode adapter, not the canonical graph.

## Alternatives and consequences

- Extending v0 with optional bags would avoid migration but keep screens as the sole application model: rejected.
- Replacing all editor/render APIs at once would duplicate risk: rejected.
- Full execution of every v1 section now crosses the approved phase boundary: rejected.

## Verification

All five examples migrate deterministically without input mutation, load again without remigration, and compile on supported targets. Paper Cloud remains web-only. Test invalid references, targets, versions, cycles/duplicate placements, env values and unsupported capabilities. Compare existing emitted bytes/hashes before block vending changes.

Sources: [Ajv](https://github.com/ajv-validator/ajv), [npm metadata](https://registry.npmjs.org/ajv/8.20.0).

## Reuse research

Checked GitHub/npm and the [Node.js](https://github.com/sindresorhus/awesome-nodejs), [React Native](https://github.com/jondot/awesome-react-native), and [TypeScript](https://github.com/dzharii/awesome-typescript) curated indexes on 2026-10-09. Package metadata comes from registry.npmjs.org. Only MIT, Apache-2.0, BSD, ISC, MPL-2.0 file-level, 0BSD, and Unlicense code may enter exports; preserve notices for vendored third-party code. Evaluate exact versions again before later-phase adoption.
