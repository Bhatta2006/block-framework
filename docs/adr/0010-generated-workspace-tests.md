# ADR-0010: Generated workspace tests and CI

Date: 2026-10-09. Status: accepted Phase 1 increment.

## Decision

Reuse Vitest 5.0.3, React Testing Library 16.3.3, DOM Testing Library 10.4.2 and jsdom 30.1.2 for generated web page smoke tests. These are already familiar repository tools; no custom test runner is needed. Generate tests for every page's real runtime composition and visible navigation. Use real local storage/provider behavior; clean up between cases. DOM tests do not establish visual quality, accessibility compliance or native-device behavior.

Add a GitHub Actions workflow to multi-target workspaces. Reuse checkout and setup-node at reviewed commit hashes, use read-only repository permissions, disable checkout credential persistence, install pinned pnpm, require the user's committed lockfile, then typecheck, test and build. Place the executable workflow in `.github/workflows/`, which GitHub actually discovers, rather than the illustrative `infra/github/workflows/` path in plan §17. No deploy credentials or publishing step is generated.

Single-target compatibility exports keep their existing bytes in this increment. A new SaaS example establishes the landing/dashboard acceptance fixture using existing blocks and explicit local data. The compiler's generated test source, configuration and workflow are core codegen IP. Existing block source/runtime files are reused without mock renderers. Test generation does not mark every later Phase 1 quality rule complete.

## Reuse checks

Checked npm metadata, installed license texts, official APIs, GitHub activity and the existing [awesome-typescript](https://github.com/dzharii/awesome-typescript) research index. All four test dependencies are MIT and meet the plan's license allowlist. Latest release dates checked October 9: Vitest September 30, jsdom October 4, React Testing Library August 27 and DOM Testing Library September 13, 2026. React Testing Library declares React 18/19 peers and requires DOM Testing Library explicitly; include it in isolated pnpm installs. jsdom requires Node ^24.15.0 on the chosen Node 24 line, so generated workspace engines/setup instructions must reflect that.

Use checkout v7.0.1 (`3d3c42e5aac5ba805825da76410c181273ba90b1`) and setup-node v7.1.0 (`949feb2413d6458794dcd2491c4babbbce0c15c1`), both MIT. Hosted runners provide the action runtime; a self-hosted runner must satisfy each action's documented runtime requirement. Recheck pins during dependency maintenance. No vendored third-party implementation is copied.

Sources: [Vitest environment](https://main.vitest.dev/guide/environment), [Vitest license](https://github.com/vitest-dev/vitest/blob/main/LICENSE.md), [Testing Library API](https://testing-library.com/docs/react-testing-library/api/), [React Testing Library license](https://github.com/testing-library/react-testing-library/blob/main/LICENSE), [DOM Testing Library license](https://github.com/testing-library/dom-testing-library/blob/main/LICENSE), [jsdom license](https://github.com/jsdom/jsdom/blob/main/LICENSE.txt), [checkout](https://github.com/actions/checkout), [setup-node](https://github.com/actions/setup-node).

## Verification and limits

The independently installed SaaS workspace passed both application typechecks, all five generated DOM tests, Vite production build and Android/iOS Hermes bundle builds. Chromium and Firefox passed landing → dashboard → record edit/reload, with no page errors or horizontal overflow at phone width. Injecting a throw into the disposable export's Hero component made the generated tests fail; restoring the file returned all five tests to green. These checks use real local providers, not mocked components.

The initial `phase1-saas.json` fixture records all emitted file SHA-256 values, the project hash and audited ZIP hash. This is a new example baseline; existing Phase 0 fixtures remain unchanged. YAML now receives the same export secret-content audit as source files. Repository tests also check dependency/script/config/CI coherence. GitHub-hosted CI itself has not been run; its commands were exercised locally.

The regenerated Notes workspace also passed both typechecks and all nine generated DOM tests. Its previous lockfile needed updating for the four added test dependencies; subsequent CI uses the committed updated lockfile.

Final repository checks passed: typecheck, lint, 260 unit tests, Studio build and 68 browser tests. The SaaS acceptance script also passed against the built production web app in both browsers.

Independent typechecking caught an invalid Testing Library query option in the first test template. The corrected header check uses visible page order, also handling duplicate page titles without ambiguous name queries. New dependencies raise the generated workspace's Node minimum on the 24.x line to 24.15.0. Existing standalone exports retain their compatibility behavior.

Generated Biome/lint/format gates, feature decomposition, the full UI stack, Lighthouse and independent human review remain subsequent Phase 1 work. The workflow initially runs typecheck, DOM tests and builds only. No native test command is invented: native is typechecked and bundled, with device execution still deferred by the user. First install resolves transitive dependencies; CI requires the resulting lockfile to be committed.
