# ADR-0003: One resolved, target-neutral compiler IR

Date: 2026-10-09. Status: accepted by the user.

## Decision

The compiler front-end validates/migrates input and resolves versions, config defaults, variants, placement, wire destinations, payload schemas and capability requirements into an immutable JSON-serializable IR. Keep source node IDs and authored order. Store payload schemas rather than web/native TypeScript snippets. Shared theme/default decisions are resolved once. Emitter-specific naming/import/style decisions remain in back-ends.

The IR includes the lossless compatibility graph needed to retain current emission, plus resolved instances, wiring and capability declarations. It has its own version. Freeze owned IR objects deeply; never freeze registry-owned shared objects. No functions, Maps, Sets, AST nodes, secrets, timestamps or providers live in the serialized IR. An emitter only accepts a front-end-validated IR and explicitly checks its target capabilities.

Public compileProject/compileWebProject signatures remain wrappers. ZIP, CLI, Studio preview and benchmark callers retain their contracts. Extract existing type/wiring resolution rather than inventing a second resolver. Unsupported binding/nesting/flow execution fails before emission.

## Reuse decision

Reuse existing Ajv, wiring engine, canonical JSON, SHA-256 and TypeScript schema conversion. TypeScript/ts-morph ASTs are emission tooling, not application IR. Babel AST is similarly syntax-specific. Generic compiler frameworks do not replace our application block/wiring semantics; the IR/compiler is core IP.

## Alternatives

Target-specific resolved IRs duplicate validation and risk different routing between web and mobile. A TS AST as IR cannot naturally represent SQL, infrastructure or native runtime capabilities. Both are rejected for Phase 0.

## Verification and hash policy

Capture existing per-file and project hashes for five examples (web), four native examples, and native cloud rejection. The compiler extraction must match every byte/hash and repeatable audited ZIP. Changing JSON schema serialization internally must not change legacy emitted project.json: emit the documented compatibility projection.

Reserve the one deliberate output rebaseline for actual v2 source vending at the end of Phase 0. Keep the original baseline fixture and add a separate final fixture; record changed paths/reasons, never overwrite unexplained mismatches.

Sources: [TypeScript compiler API](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API), [ts-morph](https://ts-morph.com/setup/).

## Reuse research

Checked GitHub/npm and the [Node.js](https://github.com/sindresorhus/awesome-nodejs), [React Native](https://github.com/jondot/awesome-react-native), and [TypeScript](https://github.com/dzharii/awesome-typescript) curated indexes on 2026-10-09. Package metadata comes from registry.npmjs.org. Only MIT, Apache-2.0, BSD, ISC, MPL-2.0 file-level, 0BSD, and Unlicense code may enter exports; preserve notices for vendored third-party code. Evaluate exact versions again before later-phase adoption.
