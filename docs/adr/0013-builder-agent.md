# ADR-0013: Builder agent assembles apps from library blocks

Date: 2026-10-18. Status: accepted; first increment implemented.

## Decision and reuse

Implement plan §16.2: a plain-language request becomes an app assembled only from registered blocks. The model never writes code. It returns a compact **blueprint** (pages, block types, edit-surface content, explicit event wires, and a `missing` coverage list). The blueprint is checked against block contracts and assembled into a graph deterministically. The same blueprint always produces the same graph.

Nothing in the pipeline is new infrastructure. It reuses:

- **Block cards** (`generateCard`, moved from `@blockfw/builder` to `@blockfw/blocks` so the agent can read them without a package cycle; builder re-exports them). Cards for the eight data/cloud blocks gained curated summaries.
- **Contracts**: registry lookup, variants, `editSurface`, config JSON Schema (Ajv, as in scoped edits), sample configs for unspecified fields, port declarations for wires.
- **Graph validation and wiring**: `validateProjectGraph` and `resolveWiring`. Ambiguous routes are rejected; unmet routes and unreachable pages become warnings.
- **Dry-run compile**: Studio passes its existing compile gate (`verifyGraph`, now shared by the operation log, app creation and the builder) as the verifier.
- **Typed operations**: `diffProjectOperations` derives the operations; extensions apply through `AgentGateway.applyOperations`, so one agent undo reverts the whole build. New apps go through `AppLibrary.create`, like Create app, and leave the current app untouched.
- **Providers and review flow**: the existing `LlmProvider` (recorded, OpenAI-compatible, ChatGPT connection), the retry-with-rejection-feedback loop, plan fingerprints and stale-plan 409s.

No external library was adopted. The work is core IP under plan §3 (graph operations and the AI operation layer). Orchestration frameworks were not needed: the loop is the same few dozen lines as the scoped-edit gateway.

## Repeatability: recipes

Users approve builds. An approved blueprint is stored in a recipe book keyed by the normalized request, the mode and the registry contents (plus the starting graph for extensions). Studio persists it beside the app library as `<project>.recipes.json`. The same request replays at zero model tokens and is re-validated and recompiled first; if the library changed and the recipe no longer validates, the model is asked again. This is the plan §0 bet in its simplest form: pay for a plan once, then reuse it.

## Coverage and the block-author path

Requested capabilities with no suitable block are reported, not improvised: "Needs a new block: Live discussion chat (proposed chat.thread)". The block-author agent (§16.3: contract review, `sdk scaffold`, sandboxed verification, private registry) consumes this list. It is **not** implemented in this increment.

## Limits

- Catalog retrieval sends every card (19 blocks ≈ 3k tokens). Semantic retrieval (§16.2) is needed once the library grows.
- Blueprints set content fields, variants and wires. Design overrides, data entities, flows and services are left to the scoped edit agent and future Data/Logic modes.
- Cloud blocks work only in cloud apps; new apps start without a cloud backend.
- Without a live model, only the labelled recorded example ("A book club app") builds. Live-model build quality has not been benchmarked; extending `@blockfw/benchmark` with build tasks is the next measurement step.
- No canvas ghost-node preview yet; review is a page/block table and the coverage report.

## Verification

Unit tests cover contract rejection with retry feedback, invalid wires, sample-config merging, recipe replay without model calls, extension id collisions, and gateway apply/undo of a whole build, with a real web compile as the verifier. A server test plans, applies (creating a library app), compiles the result and replays the same request as a zero-token recipe. A manual Studio check built the recorded example into a new four-page wired app.
