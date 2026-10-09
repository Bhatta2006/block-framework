# Phase 0 foundations — implementation and handoff

Date: 2026-10-09. Scope: Phase 0 only. The foundation implementation is complete; physical-device auth verification is deferred by the user's explicit request. This is not a claim that Block Studio is already a complete publishable full-stack compiler.

## Delivered

| Deliverable              | Implementation and evidence                                                                                                                                                                                                       |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Architecture decisions   | [ADRs](adr/) cover graph v1, UI stacks, compiler IR, routers, durable jobs, auth, codegen and graph operations. Each records reuse/license decisions and limitations.                                                             |
| Graph schema v1          | [Schema documentation](graph-schema-v1.md), strict validation and automatic `packages/manifest/src/migrations/0-to-1.ts`. All five original examples migrate and compile for their supported targets.                             |
| Typed writes and history | UI mutations, agent apply and CLI use typed operations, with a shared server operation log for undo/redo, revision checks and atomic validation/persistence. Existing UI recipe and agent paths were extended.                    |
| Compiler split           | [Immutable resolved IR](compiler-ir.md) separates validation/type/wiring resolution from web/native emission. Existing public compiler entry points remain available.                                                             |
| Block format v2          | [Package contract](block-package-v2.md), registry metadata, declared sources/dependencies/capabilities and source validation. Hero, Collection and Account migrated. Web exports vendor actual TSX and compose it using ts-morph. |
| Deterministic exports    | Canonical JSON, SHA-256, source/dependency locks and audited deterministic ZIPs. Nine supported target/example outputs are checked; unsupported native Paper Cloud remains a rejection.                                           |

The existing native adapters remain explicit compatibility implementations. Auth Account supports web only. Graph v1 can describe future capabilities, but the compiler rejects unsupported populated capabilities rather than silently ignoring or mocking them. Generated application code has no Studio runtime dependency. Runtime secrets remain outside graph/export source.

## Validation

The closing checks passed typecheck, lint, the Studio production build, 251 unit tests (up from the original 206), and all 68 browser tests. Five legacy examples are covered by migration/export tests; nine supported exports are checked at file, aggregate and ZIP hash levels. Original and vendored Notes/Paper Cloud web exports were independently installed, typechecked and built.

Running the unit suite concurrently with the Studio build initially caused six five-second compiler-startup timeouts and one dependent server assertion failure. The unchanged default unit command then passed all 251 tests alone in 9.7 seconds; browser checks passed in 3.8 minutes. No timeout was increased. Run these heavyweight gates sequentially on this machine. The auth fixture's client/server typechecks and integration assertions also passed again during closeout.

The original baseline overview remains a historical snapshot: [project-overview.md](project-overview.md). Read this document and the linked capability documents for Phase 0 additions.

## Evaluation results

| Spike                                | Result                                                                                                                                                                                                               | Outstanding evidence                                                                                                              |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| ts-morph composition, three-hour box | Real Hero/Collection sources and composition integrated; Account migrated too. Independent web builds and render/event tests passed. [ADR-0007](adr/0007-codegen-tooling.md).                                        | Wider block migration and professional UI stack adoption belong to Phase 1.                                                       |
| Puck Design, three-hour box          | Isolated harness renders three real blocks. Chromium/Firefox selection, title edit and typed operation proposal passed; adapter tests cover ordering and locked fields. [ADR-0002](adr/0002-web-native-ui-stack.md). | Keyboard/drag accessibility, slots, arbitrary insertion and shared Studio history; adoption remains undecided.                    |
| Better Auth/Expo/Hono, four-hour box | Generated fixture API verifies real auth/session behavior, client/server typechecks pass, Android JS bundle builds. [ADR-0006](adr/0006-auth-default.md).                                                            | Device login, SecureStore persistence and device networking deferred by the user. Native dependency advisories remain unresolved. |

## Deliberate changes and limits

- One intentional export rebaseline occurred when vendoring v2 sources and adding the deterministic lock. The original fixture is preserved. [Exact changed files and bundle measurements](phase0-export-rebaseline.md) explain the change; migration and IR extraction matched the original hashes beforehand.
- Existing CSS/native templates were retained. The ADR selects later UI libraries; Phase 0 does not install an entirely new visual system or Studio shell. Storybook and all-block migration remain later work.
- Undo/redo history is bounded to 50 entries and session-local; it is not a durable event store. The canonical graph is persisted.
- IR is an owned, immutable in-process contract. Serialized or forged IR must be prepared/validated again, rather than trusted as compiler input.
- No root project license exists. Authored sources use `LicenseRef-Project`; public distribution needs an explicit license decision. Third-party reuse is checked against the plan's allowlist.
- The auth fixture uses SQLite for disposable evaluation. It does not introduce a production server emitter, replace existing Supabase accounts, or enable native Paper Cloud.
- Physical auth verification was deferred after a development-server connection failure, at the user's request to simulate or skip and continue. API tests and bundle generation are partial evidence, not a simulated native pass.

## Open decisions and recommended Phase 1 start

Start Phase 1 with one golden SaaS landing/dashboard export and the professional output layout. Establish its acceptance checks before expanding the block catalog. Introduce shared tokens and selected web/native UI primitives incrementally, with independent export installs/builds and visual/accessibility checks. Preserve existing behavior and native rejection gates during each migration.

Before committing to Puck, decide whether its field/selection benefits justify the adapter and bundle cost, then test keyboard editing, stable graph identity and the shared operation log. Review the public licensing decision before registry publication. Resolve compatible Expo dependency fixes and resume the native auth checklist before any claim of publishable mobile auth support. Plan the remaining block migrations against reuse sources; no Phase 1 implementation has started in this change.

## Commit sequence

1. `d10f310`: ADRs and original export baseline.
2. `4ea9280`: graph v1 and automatic migration.
3. `28671ac`: typed graph operations across Studio, agent and CLI.
4. `49dbfae`: compiler front-end/back-end split.
5. `69b4a54`: three v2 reference packages, source composition and deliberate rebaseline.
6. Closing evaluation commit: isolated Puck/auth harnesses, findings and this handoff.
