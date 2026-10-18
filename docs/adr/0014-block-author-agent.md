# ADR-0014: Block-author agent turns a missing capability into an experimental block

Date: 2026-10-18. Status: accepted; first increment implemented.

## Context

The builder agent (ADR-0013) reports capabilities no library block covers as `missing: [{capability, proposedBlock, reason}]` instead of improvising them. Plan §0 asks that each new capability become a reusable, tested block so it is paid for once. Plan §16.3 describes the block-author agent that does this. This ADR records the first increment.

## Decision

`BlockAuthor` (`packages/agent/src/block-author.ts`) turns one missing entry into a block in four steps:

1. **Contract first.** The model writes only the contract: manifest (ports, config schema, `editSurface`, variants, `locked`), a sample config and a one-line card summary. It is checked against the manifest schema and SDK conventions. The id must be new, `editSurface` may name only config properties, `locked` must include `ports` and `variants`, no `backend` is allowed, the sample config must validate, and the card must fit the 300-token budget. Rejections are fed back to the model. Nothing is written to disk. The user reviews the contract and the block card the builder will read.
2. **Scaffold and fill.** After approval, `writeScaffoldedBlock` (`sdk scaffold`) writes the three block files. The approved manifest and sample config replace the starters. The model receives the scaffolded `template.ts` and returns a filled template.
3. **Verify automatically.** The gates run in order: manifest and contract checks, `testBlock` (`sdk test`), `validateBlock` (`sdk validate`, which also rejects variants that render identically), and a compile of a graph that places the block once per variant. Studio's compile gate runs both web and native compilation against a cloned candidate registry. Failing checks go back to the model, up to `maxAttempts`.
4. **Register as experimental.** A block that passes every gate goes into the live registry through `BlockRegistry.registerExperimental` and into `experimental.json`. Its card is labelled "Experimental (agent-authored)". On the next build, the builder catalog includes the card and blueprints can place the block, with sample content taken from the experimental sample config. When Studio restarts, `loadExperimental` re-runs `sdk validate` on each block before registering it again.

Authored blocks are saved for future work. Studio stores them in a workspace block registry folder: `blocksDir` when given, otherwise `<project>.blocks/`. With the default launch that is `.builder-cache/project.blockfw.json.blocks/`, and it is shared by every app in that workspace's app library. Only programmatic starts with neither a project file nor `blocksDir` use a temporary directory. Every Studio start loads the folder into the one live registry. That registry is used by the builder, the scoped edit agent (`AgentGateway` now takes a `registry` option, which is passed to `planPrompt` and `checkScope`), compile, preview and ZIP export (`exportZip` now takes an optional registry). So an app that places an authored block can be edited and exported in later sessions.

The agent is not limited to one kind of block. Within the manifest and SDK contract, the model picks the category (any of the twelve), the ports, the config schema and the variants that the capability needs, such as a UI section, form, list, chat or media block. The fixed parts are the contract checks and the template shape: a pure function that returns one React Native component file. Endpoints: `POST /api/agent/blocks/draft`, `POST /api/agent/blocks/implement` (by `contractId`, single use, dropped when the AI connection changes) and `GET /api/agent/blocks`. `/api/blocks` and `/api/cards` now list registry contents, so experimental blocks appear there with `experimental: true`. In the UI, each "Needs a new block" warning in Build with blocks has a **Create block** action. It opens the contract review (variants, builder-editable fields, ports, card) with **Approve contract** and then shows each gate's result.

## Reuse

No new infrastructure. The step reuses the `LlmProvider` interface and the gateway's retry-with-rejection-feedback loop (same shape as `AppBuilder`), `scaffoldManifest`, `writeScaffoldedBlock` (which gained an optional `root` so it no longer writes only into the library tree), `testBlock`, `validateBlock`, `validateManifest`, `validateBlockConfig`, `generateCard` (which gained an optional summary), the compiler entry points, and the recorded provider. Plan §16.3 step 2 (search the marketplace and shadcn registries for a component to wrap) is deferred along with the marketplace.

## Execution model and deferred sandboxing

Generated templates are **not** imported into the Studio process. `loadTemplate` strips TypeScript types with Node's built-in `stripTypeScriptTypes`, so TypeScript is not needed at runtime (Node 22.13+; Node prints one ExperimentalWarning). It then evaluates the template in a `node:vm` context. That context has a null-prototype global, so no host `Object` or `Function` is reachable through it. It has no `require`, `process` or other Node globals, string code generation (`eval`, `new Function`) is disabled, import statements are rejected, input and output cross the boundary as JSON only, and every load and render has a timeout (default 1 s).

`node:vm` is **not a security boundary.** It contains honest mistakes and runaway loops. It does not contain hostile code. That is acceptable for this increment only because:

- authoring endpoints refuse non-local Studio hosts (403), and they use the same origin and JSON checks as other `/api/agent/` routes,
- the model is the user's own configured provider, and the contract is reviewed before any code is generated,
- the generated template only returns source text, which goes through the same compile gates as library blocks.

**Deferred:** running the implement and verify steps in an isolated sandbox (E2B or Docker, plan §16.3 step 3). That must happen before authoring is offered on hosted or multi-user Studios, or with shared, untrusted model output. Also deferred: the marketplace and public promotion (§16.3 steps 2 and 7). Experimental blocks stay private to their project. Moving one into `packages/blocks/src/blocks` is still a manual review and registration step.

## Limits

- Versions are `1.0.0` with an `experimental` registry flag, not `0.1.0-experimental`. The manifest schema accepts only plain semver, and changing it would affect every block contract.
- Gates are SDK and compile checks only. Typecheck and lint of the generated component, Storybook rendering, Playwright screenshots, axe, Semgrep and bundle size (§16.3 step 4) and the visual self-check (step 5) are not run yet.
- The web runtime renders experimental blocks with its generic "Custom block" placeholder. Only the native target uses the generated template. A web renderer contract for blocks is a separate decision.
- The `blockc` CLI (`compile`, `export`, `sdk`) still uses the library registry only. A graph that uses an experimental block compiles and exports from Studio, not from the CLI.
- The user can approve or discard a contract but cannot edit it in the UI. There is no endpoint to remove an experimental block; delete its folder and its `experimental.json` entry.
- Without a live model, only the recorded `chat.thread` example (from the "A book club app" demo build) can be authored. The recorded build still lists it as missing after it is registered, because recorded responses are fixed.

## Verification

Unit tests use recorded responses. They cover contract drafting with rejection feedback (duplicate id, invalid `editSurface`, missing `locked`), sample-config rejection, failure after `maxAttempts` with nothing written, and scaffold, fill and retry when variants are identical. They check that all four gates pass and the block is registered, that a block cannot be authored twice, that a failing template leaves nothing registered, that blocks reload from disk, and that vm isolation holds (no `process`/`require`/`eval`, timeouts, imports rejected). They also check that the builder's next build prompt contains the experimental card and that a blueprint can place the block, with the result compiled for web and native. The recorded Studio demo responses replay end to end. A server test drafts a contract, checks that nothing is registered before approval, implements it with all checks passing, rejects reuse of the `contractId`, and finds the block in `/api/blocks`, `/api/cards` and `/api/agent/blocks`. It then exports an app that uses the block through Studio, and checks that a second Studio started on the same `blocksDir` loads it again. A unit test checks that the scoped edit agent can edit an authored block's fields when given the registry that has it, and that ZIP export works with that registry and fails with the library-only one. A Playwright test runs the UI flow from the "Needs a new block" warning through contract review to passing checks.
