# Phase 1: professional exports and core library

Started 2026-10-09, after publishing Phase 0 commit `ad9802d` to GitHub branch `refined-p0`. Implementation branch: `codex/phase-1-professional-exports`.

## First increment: executable multi-target workspace

The compiler now exposes `compileWorkspace(graph, registry)`, and CLI compile/export accept `--target workspace`. Studio's Export dialog offers **All project platforms**. The graph's target declarations choose the output: combined web/native produces `apps/web` and `apps/mobile`; web-only or native-only retains the corresponding small standalone export. Unsupported targets fail instead of silently producing only the successful half.

The workspace uses pinned pnpm 12.10.1 and Turbo 2.11.7, unique app package names, root build/typecheck/development commands, setup/architecture documents, and independent app source locks. The native bundle command respects the declared native platforms. Both applications still use the Phase 0 runtimes/routes; this does not add native cloud authentication or cross-platform data synchronization.

Root and nested application hashes cover their emitted files. ZIP auditing now handles nested secrets, caches, dependencies and output directories, and rejects traversal/absolute paths. Existing web/mobile defaults and Phase 0 golden hashes are preserved. The first install creates pnpm-lock.yaml; commit it before using frozen-lockfile installs. The compiler remains offline and deterministic rather than resolving registry state during emission.

```powershell
npm run build
node packages/compiler/dist/cli.js compile examples/notes/graph.json --target workspace --out .audit-work/phase1/notes-workspace
node packages/compiler/dist/cli.js export examples/notes/graph.json --target workspace --out .audit-work/phase1/notes-workspace.zip
```

Follow the exported README to install, typecheck and build outside Studio. See [ADR-0009](adr/0009-workspace-exports.md) for reuse/license evidence, architecture decisions and the verification scope.

Verification of the generated Notes workspace passed its first install, frozen-lockfile reinstall, both application typechecks, Vite web build, and Android/iOS Hermes bundle builds. Turbo's dry-run graph contains exactly the two app build tasks. The compiler/API tests cover standalone equivalence, nested/root hashes, repeated audited ZIPs, rejected targets and CLI generation; the Studio browser test also downloads the workspace through the actual export dialog.

Final repository gates passed: typecheck, lint, 258 unit tests, Studio build and all 68 browser tests (Firefox and Chromium). Existing Phase 0 output hashes and ZIP baselines passed without rebaselining.

When using the ignored output directory in the example above, run `git init` inside that generated workspace before editing/building. Otherwise Turbo can inherit the parent repository's ignore rules and miss changed inputs. The standalone verification initialized that boundary and forced an uncached build. Restart a running Studio server after upgrading to load the new export API as well as the new UI.

## Second increment: generated tests, CI and SaaS fixture

Multi-target workspaces now include Vitest/Testing Library page and navigation smoke tests, a root `pnpm test` command, and a GitHub Actions workflow with pinned actions, read-only permissions and frozen-lockfile installation. Tests and configuration participate in nested/root hashes and ZIP audits. YAML secret scanning covers the workflow. Single-target output stays unchanged. See [ADR-0010](adr/0010-generated-workspace-tests.md) for licenses and limits.

The [Launchpad example](../examples/saas/README.md) composes six existing blocks into a landing page, project dashboard and editor. Sample metrics are labeled; project briefs persist locally. Its initial golden fixture covers every emitted source file and audited ZIP without replacing any Phase 0 baseline.

Independent SaaS verification passed both app typechecks, five generated DOM tests, Vite production build, and Android/iOS Hermes bundle builds. The browser acceptance script passed against development and production builds in Chromium and Firefox, including edit/reload persistence and phone-width overflow checking. A deliberately broken Hero renderer made the generated tests fail; restoring it returned them to green. The regenerated Notes workspace passed both typechecks and nine generated DOM tests. The GitHub-hosted workflow has not run. Native bundles do not establish device behavior.

Final repository gates for this increment passed: typecheck, lint, 260 unit tests, Studio build and all 68 browser tests. Formatting checks passed for every changed file. Phase 0 hashes and ZIP baselines remain unchanged.

## Source quality and module decomposition

Generated ESLint/Prettier gates now pass on the independent SaaS and Notes workspaces and run in generated CI. Repository verification passed 262 unit tests and 68 browser tests plus typecheck, lint and Studio build. ADR-0011 records source normalization and the deliberate workspace fixture revision. The user chose to extend the existing designer, retaining graph operations and undo/redo, rather than adopt Puck.

The runtime decomposition is complete for the current golden workspace: web runtime, web/native data runtime and web CSS are split into named feature files using ts-morph and PostCSS. The SaaS fixture checks every emitted TS/TSX/CSS file against the 300-line limit. Production CSS matches the previous build; browser acceptance passes in Chromium and Firefox. The new `phase1-saas-modules.json` records this deliberate source-layout revision and retains earlier fixtures.

## Shared-theme checkpoint (2026-10-10)

Multi-target exports now include a consumed `@app/theme` package with portable tokens, light/dark semantic colors, brand-derived palettes, typography, spacing, radius, shadow, motion and elevation. Web CSS and native colors use those shared values. The exported build tool regenerates CSS/native values from `tokens.json` without Studio; Turbo schedules it before both application builds. ADR-0012 records licenses, the compatible color-library pin and limitations. `phase1-saas-theme.json` is the intentional workspace fixture revision; earlier baselines are retained.

This checkpoint stops before adopting the new UI primitives. Existing block styles are partly fixed, and canonical token editing is still deferred. The user requested committing and pushing at a valid checkpoint on October 10; completing this increment does not complete Phase 1.

Final checkpoint verification passed repository typecheck, lint, 264 unit tests, Studio build and all 68 Firefox/Chromium browser tests. Independent SaaS and Notes exports passed all three package typechecks, lint, formatting, respectively five and nine generated DOM tests, web production builds and Android/iOS Hermes bundle builds. SaaS production acceptance passed in both browsers, including shared-theme switching, reduced motion and edit/reload persistence. Both exports reproduced their emitted theme files byte for byte; editing a token updated web/native values, and a broken reference failed without replacing existing outputs. Physical-device behavior and GitHub-hosted CI remain unverified.

## Studio shell v2 (2026-10-10)

Remaining increment 4 has started; [studio-shell-v2.md](studio-shell-v2.md) records the market research and decisions. Studio now has a dark-first token system with a full light theme and a System/Dark/Light toggle, self-hosted Inter and JetBrains Mono, a top bar with Flow/Design/Ship modes, a tool rail, a pages-and-layers navigator, a grouped block library with honest Demo/Cloud labels, and a floating canvas bar. It also adds a docked inspector, a floating AI composer that opens the existing scoped agent as a side panel, a ⌘K command palette (`cmdk`, MIT, lazy-loaded), a shortcut sheet, toasts with Undo, and a status bar with a problem count. Data, Logic, and Agents appear only as disabled "Soon" modes. The Ship view replaces the export modal with a readiness checklist derived from the compiler's wiring report, the unchanged export targets, and planned capabilities labelled by phase. Canvas nodes use category tiles and diamond event ports, and fall back to compact cards below 35% zoom. Workspace.tsx went from 1,272 to about 550 lines.

Two browser tests changed with the UX: the rail's **New app** replaces **New starter app**, and template selection uses radio cards instead of a select. A toast's Undo action carries a descriptive accessible name so it never collides with the top-bar Undo.

Verification on this machine: repository typecheck, lint, Studio build, and all 68 Firefox/Chromium browser tests passed. Unit tests passed 262 of 264. The two failures are environmental and reproduce without this change. `paper-cloud/web` baseline hashing fails because `core.autocrlf=true` checks out `packages/compiler/assets/*` with CRLF; with LF content, all 10 baseline tests pass. The operations CLI test exceeds its 5-second limit under full-suite load and passes alone. The initial baseline browser run on this machine had two Firefox timing failures that did not recur. Shell gzip size: main chunk 150 kB, palette 18 kB on demand.

## Ordered remaining increments

1. Extend the functional SaaS fixture as the new UI stack lands; measure file size again as capabilities grow.
2. Build on shared tokens with selected web/native primitives, adopting the approved libraries after checking the actual pinned Expo toolchain. Add independent export and accessibility checks with each migration.
3. Nested component trees and slots across schema, operations, compiler and preview. Extend the existing designer as selected by the user, preserving graph identity and shared history.
4. Studio Flow/Design shell per the UI/UX specification, preserving existing editing, export and undo behavior. Do not expose unimplemented Data/Logic/Agents/Ship capabilities as working controls.
5. Remaining v2 block migrations and the 80-block catalog, with reuse sources, stories and tests. Validate the golden export with Lighthouse and an independent engineering review.

Each increment is a logical commit with its tests. Run typecheck, lint, unit tests, Studio build and browser tests sequentially on this machine. Verify generated applications independently of the repository. Phase 1 is in progress; the first workspace increment does not satisfy the whole phase's acceptance criteria.

## Carry-forward constraints

Physical-device auth verification remains deferred by the user. The Expo dependency advisories and public project licensing decision remain open. A successful JavaScript bundle is not signed mobile distribution or device verification. No Phase 2 service/API/database package is scaffolded merely to fill the directory tree.
