# ADR-0009: Incremental workspace exports

Date: 2026-10-09. Status: accepted for the first Phase 1 increment.

## Decision and scope

Add an explicit `workspace` export target that follows the graph's declared targets. A graph requiring both web and native emits `apps/web` and `apps/mobile`, with pnpm workspaces and Turborepo. A single executable target retains its existing small standalone layout. iOS and Android share one Expo application. Unsupported combinations, including native cloud, fail before writing output.

Reuse the validated IR and existing target emitters. This increment changes packaging and build orchestration, not application behavior, routing or the UI stack. Existing web/mobile entry points, ZIPs and Phase 0 golden hashes remain unchanged. The multi-target entry point is available through the compiler, CLI and Studio. Do not generate empty API/database/shared packages: these arrive when graph capabilities can actually compile them.

The scope reaches compiler dispatch and hashing, CLI validation, audited ZIP exports, Studio API/download controls, and their tests. Every nested package has a unique name and its own executable build/typecheck scripts. Native builds produce JavaScript bundles; they are not signed binaries or a substitute for device testing. Generated setup/architecture documentation explains these limits and first-install lockfile creation.

## Reuse and license checks

Searched npm, GitHub and [awesome-monorepo](https://github.com/korfuri/awesome-monorepo) / [awesome-turborepo](https://github.com/petermekhaeil/awesome-turborepo). Adopt pnpm 12.10.1 (released October 6) and turbo 2.11.7 (October 2), both MIT under the allowlist. Reuse existing TypeScript, Vite and Expo builds. No package manager/build scheduler is implemented in Studio. Compiler composition and export quality gates are core IP.

The GitHub closed issue/PR feeds show activity on October 9 for both projects; this is a maintenance signal, not a support SLA. pnpm has a dominant contributor (zkochan, 10,613 contributions versus 374/348 for the next two); Turborepo has multiple major contributors (anthonyshew 2,347 and sokra 1,196). Both tools run outside generated React/RN application code. Their actual compatibility is verified by installing and building an exported workspace, including Metro, rather than inferred from TypeScript support.

Sources: [pnpm license](https://github.com/pnpm/pnpm/blob/main/LICENSE), [Turborepo license](https://github.com/vercel/turborepo/blob/main/LICENSE), [workspace configuration](https://pnpm.io/settings), [Turbo task configuration](https://turborepo.dev/docs/reference/configuration), [Expo monorepos and isolated installs](https://docs.expo.dev/guides/monorepos/).

## Alternatives and remaining Phase 1 work

An npm workspace would reduce initial package-manager differences but diverges from plan §17. Nx is unnecessary for two existing emitter outputs; copying a complete create-turbo template adds unused applications and packages. Retaining separate ZIPs alone would not deliver the requested multi-target layout.

Biome/Vitest generated gates, CI generation, feature/page decomposition, shared token packages, router migration, the SaaS golden example, the new Studio shell and the 80-block library remain later Phase 1 increments. This first increment establishes a runnable packaging boundary without implying those requirements are complete. The production repository continues using npm and its existing lint/test suite.

## Verification

Check exact standalone equivalence for single-target graphs, deterministic workspace and nested hashes, unique package identities, declared native platforms, audited repeatable ZIPs, CLI and Studio downloads, native-cloud rejection and nested secret exclusions. Install the generated Notes workspace using pinned pnpm, run root typecheck/build, and inspect Turbo's task graph. Run the repository typecheck/lint/unit/browser gates sequentially before committing.

The generated Notes workspace installed 491 packages with pnpm 12.10.1; a subsequent frozen-lockfile install passed. Both app typechecks passed. A forced Turbo build produced Vite web output (236.60 kB JavaScript / 73.76 kB gzip, 17.06 kB CSS) and Android/iOS Hermes bundles (about 1.9 MB each), with no debugging-only bytecode override. Turbo's dry run reports exactly the two expected app build tasks. Verification uses an isolated Git boundary inside the ignored export directory so the parent repository's scratch-file exclusions do not hide Turbo inputs. No physical-device or signed-binary test is claimed.
